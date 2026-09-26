-- Hold learners in Desk2Quant until the mentor/admin has actually joined
-- the embedded Jitsi room. The raw provider URL remains server-side.
alter table public.bookings
  add column if not exists host_started_at timestamptz;

comment on column public.bookings.host_started_at is
  'Set only after the mentor/admin has actually joined the embedded Jitsi room; attendee links stay in Desk2Quant waiting room until then.';
