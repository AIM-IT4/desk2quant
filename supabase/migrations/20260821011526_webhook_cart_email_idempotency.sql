-- Prevent duplicate cart rows and transactional emails when Razorpay delivers
-- the same payment.captured event more than once or two deliveries overlap.
--
-- This migration deliberately leaves historical purchases untouched. It adds:
--   1. A short, transaction-scoped advisory lock around each cart batch insert.
--   2. A service-role-only delivery ledger for customer/admin email claims.
--   3. Atomic claim/complete functions used by the server-side webhook.

begin;

create table if not exists public.webhook_email_deliveries (
  payment_id text not null,
  delivery_type text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  status text not null default 'sending',
  attempt_count integer not null default 1,
  lease_expires_at timestamptz,
  message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (payment_id, delivery_type),
  constraint webhook_email_deliveries_idempotency_key_unique unique (idempotency_key),
  constraint webhook_email_deliveries_status_check
    check (status in ('sending', 'sent', 'failed', 'permanent_failure')),
  constraint webhook_email_deliveries_attempt_count_check check (attempt_count > 0),
  constraint webhook_email_deliveries_payment_id_check check (btrim(payment_id) <> ''),
  constraint webhook_email_deliveries_delivery_type_check check (btrim(delivery_type) <> '')
);

alter table public.webhook_email_deliveries enable row level security;

-- The ledger is an internal server-side object. The webhook uses the service
-- role; browser clients must never be able to inspect or mutate delivery state.
revoke all on table public.webhook_email_deliveries from public, anon, authenticated;
grant select, insert, update on table public.webhook_email_deliveries to service_role;

-- Existing cart payments were handled by the pre-ledger webhook. Seed both
-- logical deliveries as sent so a late Razorpay retry cannot notify the buyer
-- or admin yet again immediately after this deployment.
insert into public.webhook_email_deliveries (
  payment_id,
  delivery_type,
  status,
  lease_expires_at,
  sent_at,
  updated_at
)
select
  existing.payment_id,
  delivery.delivery_type,
  'sent',
  null,
  existing.last_purchase_at,
  now()
from (
  select payment_id, max(created_at) as last_purchase_at
  from public.purchases
  where source = 'webhook_cart'
    and payment_id is not null
    and btrim(payment_id) <> ''
  group by payment_id
) as existing
cross join (
  values ('cart_customer_receipt'), ('cart_admin_sale')
) as delivery(delivery_type)
on conflict (payment_id, delivery_type) do nothing;

create or replace function public.claim_webhook_email_delivery(
  p_payment_id text,
  p_delivery_type text,
  p_lease_seconds integer default 90
)
returns table (
  should_send boolean,
  idempotency_key uuid,
  delivery_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted boolean := false;
  v_row public.webhook_email_deliveries%rowtype;
begin
  if nullif(btrim(p_payment_id), '') is null then
    raise exception 'payment_id is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_delivery_type), '') is null then
    raise exception 'delivery_type is required' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'lease_seconds must be between 30 and 1800' using errcode = '22023';
  end if;

  insert into public.webhook_email_deliveries (
    payment_id,
    delivery_type,
    status,
    lease_expires_at
  )
  values (
    btrim(p_payment_id),
    btrim(p_delivery_type),
    'sending',
    now() + make_interval(secs => p_lease_seconds)
  )
  on conflict (payment_id, delivery_type) do nothing;

  v_inserted := found;

  select *
  into v_row
  from public.webhook_email_deliveries
  where payment_id = btrim(p_payment_id)
    and delivery_type = btrim(p_delivery_type)
  for update;

  if v_inserted then
    return query select true, v_row.idempotency_key, v_row.status;
    return;
  end if;

  if v_row.status in ('sent', 'permanent_failure') then
    return query select false, v_row.idempotency_key, v_row.status;
    return;
  end if;

  if v_row.status = 'sending'
     and v_row.lease_expires_at is not null
     and v_row.lease_expires_at > now() then
    return query select false, v_row.idempotency_key, v_row.status;
    return;
  end if;

  update public.webhook_email_deliveries
  set status = 'sending',
      attempt_count = attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error = null,
      updated_at = now()
  where payment_id = btrim(p_payment_id)
    and delivery_type = btrim(p_delivery_type)
  returning * into v_row;

  return query select true, v_row.idempotency_key, v_row.status;
end;
$$;

create or replace function public.complete_webhook_email_delivery(
  p_payment_id text,
  p_delivery_type text,
  p_idempotency_key uuid,
  p_status text,
  p_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated boolean := false;
  v_current_status text;
begin
  if p_status is null or p_status not in ('sent', 'failed', 'permanent_failure') then
    raise exception 'invalid delivery status: %', p_status using errcode = '22023';
  end if;

  select status
  into v_current_status
  from public.webhook_email_deliveries
  where payment_id = btrim(p_payment_id)
    and delivery_type = btrim(p_delivery_type)
    and idempotency_key = p_idempotency_key
  for update;

  if not found then
    return false;
  end if;

  -- A late failure from an older invocation must never downgrade a delivery
  -- that another retry has already confirmed as sent.
  if v_current_status = 'sent' then
    return true;
  end if;

  update public.webhook_email_deliveries
  set status = p_status,
      message_id = coalesce(p_message_id, message_id),
      last_error = case when p_status = 'sent' then null else left(p_error, 2000) end,
      lease_expires_at = null,
      sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
      updated_at = now()
  where payment_id = btrim(p_payment_id)
    and delivery_type = btrim(p_delivery_type)
    and idempotency_key = p_idempotency_key;

  v_updated := found;
  return v_updated;
end;
$$;

create or replace function public.record_cart_purchase_once(
  p_payment_id text,
  p_rows jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row_count integer;
begin
  if nullif(btrim(p_payment_id), '') is null then
    raise exception 'payment_id is required' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 5 then
    raise exception 'cart row count must be between 1 and 5' using errcode = '22023';
  end if;

  -- Serialize only this payment's very short check-and-insert transaction.
  -- External Drive/Brevo calls remain outside the lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('desk2quant-cart:' || btrim(p_payment_id), 0)
  );

  if exists (
    select 1
    from public.purchases
    where payment_id = btrim(p_payment_id)
      and source in ('webhook_cart', 'webhook_price_mismatch')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as x(
      customer_email text,
      product_name text,
      amount numeric,
      currency text,
      payment_id text,
      source text,
      customer_country text,
      inr_amount numeric,
      download_link text,
      created_at timestamptz
    )
    where x.payment_id is distinct from btrim(p_payment_id)
       or x.source is null
       or x.source not in ('webhook_cart', 'webhook_price_mismatch')
       or nullif(btrim(x.customer_email), '') is null
       or nullif(btrim(x.product_name), '') is null
       or x.amount is null
  ) then
    raise exception 'invalid cart purchase row payload' using errcode = '22023';
  end if;

  insert into public.purchases (
    customer_email,
    product_name,
    amount,
    currency,
    payment_id,
    source,
    customer_country,
    inr_amount,
    download_link,
    created_at
  )
  select
    x.customer_email,
    x.product_name,
    x.amount,
    coalesce(nullif(x.currency, ''), 'INR'),
    btrim(p_payment_id),
    x.source,
    x.customer_country,
    x.inr_amount,
    x.download_link,
    coalesce(x.created_at, now())
  from jsonb_to_recordset(p_rows) as x(
    customer_email text,
    product_name text,
    amount numeric,
    currency text,
    payment_id text,
    source text,
    customer_country text,
    inr_amount numeric,
    download_link text,
    created_at timestamptz
  );

  return true;
end;
$$;

-- Functions in public receive EXECUTE for PUBLIC by default. Restrict all
-- three explicitly because they mutate internal payment state.
revoke all on function public.claim_webhook_email_delivery(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_webhook_email_delivery(text, text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_cart_purchase_once(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_webhook_email_delivery(text, text, integer)
  to service_role;
grant execute on function public.complete_webhook_email_delivery(text, text, uuid, text, text, text)
  to service_role;
grant execute on function public.record_cart_purchase_once(text, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
