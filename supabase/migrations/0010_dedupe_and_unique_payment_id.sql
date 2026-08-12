-- B6: stop duplicate purchase rows.
--
-- Both the webhook and the frontend insert into `purchases`. Neither checks
-- whether the other already wrote the row, so a single payment can land twice.
-- As of writing: 358 rows, 330 distinct payment_ids, 26 ids duplicated,
-- 28 surplus rows. That inflates the sales counter and every revenue total.
--
-- IMPORTANT (cart-safe): cart purchases log ONE row per line item, all sharing
-- the same payment_id (source = 'webhook_cart'). Earlier versions of this
-- migration partitioned the dedup by payment_id without a source filter and
-- added an unfiltered unique index, which would have collapsed multi-item cart
-- orders to a single row and rejected every future cart insert. This version
-- excludes webhook_cart rows from BOTH the dedup and the index.
--
-- Safe to run: the DELETE keeps exactly one row per payment_id, preferring the
-- webhook copy because it is written server-side after signature verification
-- (the frontend copy is written by an anon client and is the less trustworthy
-- of the two). Rows with a NULL payment_id are left completely alone -- they
-- are legacy/manual entries with no duplicate semantics.

begin;

-- 1. Collapse duplicates (webhook rows win; cart line items untouched), keeping
--    the webhook row when one exists.
with ranked as (
    select
        id,
        row_number() over (
            partition by payment_id
            order by
                case when source = 'webhook' then 0 else 1 end,
                created_at asc,
                id asc
        ) as rn
    from public.purchases
    where payment_id is not null
      and payment_id <> ''
      and source <> 'webhook_cart'
)
delete from public.purchases p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- 2. Enforce it from here on. Partial + source-filtered so cart line items
--    (which share a payment_id) and NULL/empty legacy rows don't trip it.
create unique index if not exists purchases_payment_id_unique
    on public.purchases (payment_id)
    where payment_id is not null and payment_id <> '' and source <> 'webhook_cart';

-- 3. Same idempotency for bookings (one row per payment, no cart analogue).
create unique index if not exists bookings_payment_id_unique
    on public.bookings (payment_id)
    where payment_id is not null and payment_id <> '';

commit;

-- Verify:
--   select count(*) total,
--          count(distinct payment_id) distinct_ids
--   from public.purchases
--   where payment_id is not null and payment_id <> '' and source <> 'webhook_cart';
--   -- total must equal distinct_ids
