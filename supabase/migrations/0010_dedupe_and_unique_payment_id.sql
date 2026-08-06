-- B6: stop duplicate purchase rows.
--
-- Both the webhook and the frontend insert into `purchases`. Neither checks
-- whether the other already wrote the row, so a single payment can land twice.
-- As of writing: 358 rows, 330 distinct payment_ids, 26 ids duplicated,
-- 28 surplus rows. That inflates the sales counter and every revenue total.
--
-- Safe to run: the DELETE keeps exactly one row per payment_id, preferring the
-- webhook copy because it is written server-side after signature verification
-- (the frontend copy is written by an anon client and is the less trustworthy
-- of the two). Rows with a NULL payment_id are left completely alone -- they
-- are legacy/manual entries with no duplicate semantics.

begin;

-- 1. Collapse duplicates, keeping the webhook row when one exists.
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
)
delete from public.purchases p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- 2. Enforce it from here on. Partial, so the NULL/empty legacy rows above do
--    not trip the constraint.
create unique index if not exists purchases_payment_id_unique
    on public.purchases (payment_id)
    where payment_id is not null and payment_id <> '';

commit;

-- Verify:
--   select count(*) total,
--          count(distinct payment_id) distinct_ids
--   from public.purchases
--   where payment_id is not null and payment_id <> '';
--   -- total must equal distinct_ids
