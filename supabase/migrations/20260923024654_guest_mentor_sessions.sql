-- Guest mentoring uses an isolated catalog; existing Amit sessions keep their current flow.
-- All reads/writes go through server APIs. No private instructor/customer data is public.
create table public.mentors (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check (length(name) between 2 and 100),
 headline text not null default '', bio text not null default '',
 photo_url text, linkedin_url text, specialties text[] not null default '{}',
 contact_email text not null check (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 timezone text not null default 'Asia/Kolkata',
 status text not null default 'draft' check (status in ('draft','published','paused')),
 share_bps integer not null default 7500 check (share_bps between 0 and 10000),
 created_at timestamptz not null default now()
);
create table public.mentor_sessions (
 id uuid primary key default gen_random_uuid(), mentor_id uuid not null references public.mentors(id),
 title text not null check (length(title) between 3 and 160),
 description text not null default '', prerequisites text not null default '',
 outcomes text[] not null default '{}',
 duration_minutes integer not null check (duration_minutes between 15 and 180),
 price_paise integer not null check (price_paise between 10000 and 10000000),
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create index on public.mentor_sessions(mentor_id);
create table public.mentor_slots (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.mentor_sessions(id),
 starts_at timestamptz not null, is_active boolean not null default true,
 unique(session_id,starts_at)
);
create index on public.mentor_slots(starts_at);
create table public.mentor_reservations (
 id uuid primary key default gen_random_uuid(), slot_id uuid not null references public.mentor_slots(id),
 mentor_id uuid not null references public.mentors(id), session_id uuid not null references public.mentor_sessions(id),
 mentor_name text not null, mentor_email text not null, session_title text not null,
 starts_at timestamptz not null, ends_at timestamptz not null, duration_minutes integer not null,
 price_paise integer not null, share_bps integer not null,
 customer_name text not null, customer_email text not null, customer_message text not null default '',
 checkout_key uuid not null unique, order_id text unique, payment_id text unique,
 status text not null default 'held' check(status in ('held','confirmed','review','released')),
 expires_at timestamptz not null default (now()+interval '10 minutes'), created_at timestamptz not null default now()
);
create index on public.mentor_reservations(mentor_id,starts_at,ends_at);
alter table public.bookings
 add column mentor_id uuid references public.mentors(id),
 add column mentor_name text, add column mentor_email text,
 add column mentor_reservation_id uuid unique references public.mentor_reservations(id),
 add column starts_at timestamptz, add column ends_at timestamptz,
 add column paid_paise integer, add column mentor_share_bps integer,
 add column mentor_earnings_paise integer,
 add column mentor_payout_status text not null default 'unpaid' check(mentor_payout_status in ('unpaid','paid')),
 add column mentor_payout_reference text, add column mentor_paid_at timestamptz;
create index on public.bookings(mentor_id,starts_at,ends_at) where mentor_id is not null;
alter table public.bookings enable row level security;
-- Existing authenticated policies are permissive. Add a restrictive barrier for guest rows.
create policy "Guest bookings are server only" on public.bookings as restrictive for all to authenticated
 using (mentor_id is null) with check (mentor_id is null);
revoke truncate, references, trigger on public.bookings from authenticated;

alter table public.mentors enable row level security;
alter table public.mentor_sessions enable row level security;
alter table public.mentor_slots enable row level security;
alter table public.mentor_reservations enable row level security;
revoke all on public.mentors,public.mentor_sessions,public.mentor_slots,public.mentor_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.mentors,public.mentor_sessions,public.mentor_slots,public.mentor_reservations to service_role;

-- Serialize all changes to one mentor's schedule. Trigger also covers legacy admin reschedules.
create function public.guard_guest_booking() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.mentor_id is null then return new; end if;
 perform 1 from public.mentors where id=new.mentor_id for update;
 new.starts_at := (new.booking_date + new.booking_time) at time zone 'Asia/Kolkata';
 new.ends_at := new.starts_at + make_interval(mins=>new.service_duration);
 new.mentor_earnings_paise := floor(greatest(0,new.paid_paise-coalesce(new.refund_amount,0)*100)::numeric * new.mentor_share_bps / 10000);
 if new.status in ('upcoming','confirmed','rescheduled','reschedule_requested','cancellation_requested','admin_reschedule_pending') then
   if exists(select 1 from public.bookings b where b.mentor_id=new.mentor_id and b.id<>new.id
     and b.status in ('upcoming','confirmed','rescheduled','reschedule_requested','cancellation_requested','admin_reschedule_pending')
     and b.starts_at<new.ends_at and b.ends_at>new.starts_at)
   or exists(select 1 from public.mentor_reservations r where r.mentor_id=new.mentor_id
     and r.id is distinct from new.mentor_reservation_id and r.status='held' and r.expires_at>now()
     and r.starts_at<new.ends_at and r.ends_at>new.starts_at) then
     raise exception 'Mentor already booked at this time' using errcode='23P01';
   end if;
 end if;
 if new.mentor_payout_status='paid' and (tg_op='INSERT' or old.mentor_payout_status is distinct from 'paid') then
   if new.status<>'completed' or coalesce(new.refund_status,'none')='pending' or coalesce(new.mentor_payout_reference,'')='' then
     raise exception 'Complete the session, resolve refunds and record a payout reference first';
   end if;
 end if;
 return new;
end $$;
create trigger guard_guest_booking before insert or update on public.bookings for each row execute function public.guard_guest_booking();
revoke all on function public.guard_guest_booking() from public,anon,authenticated;
grant execute on function public.guard_guest_booking() to service_role;

create function public.reserve_mentor_slot(p_slot_id uuid,p_name text,p_email text,p_message text,p_checkout_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.mentor_slots; o public.mentor_sessions; m public.mentors; r public.mentor_reservations; finish timestamptz;
begin
 select * into s from public.mentor_slots where id=p_slot_id;
 if not found then raise exception 'Slot not found'; end if;
 select * into o from public.mentor_sessions where id=s.session_id;
 select * into m from public.mentors where id=o.mentor_id for update;
 -- Idempotent client retries return the same still-live reservation.
 select * into r from public.mentor_reservations where checkout_key=p_checkout_key;
 if found then
   if r.slot_id<>p_slot_id or r.customer_email<>lower(trim(p_email)) or r.status<>'held' or r.expires_at<=now() then
      raise exception 'Checkout expired; select the slot again';
   end if;
   return to_jsonb(r);
 end if;
 if m.status<>'published' or not o.is_active or not s.is_active or s.starts_at<now()+interval '1 hour' then
   raise exception 'This session is no longer available';
 end if;
 if length(trim(p_name))<2 or length(trim(p_name))>100 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   raise exception 'Enter a valid name and email';
 end if;
 if (select count(*) from public.mentor_reservations where customer_email=lower(trim(p_email)) and status='held' and expires_at>now())>=3 then
   raise exception 'Too many open checkouts; please wait ten minutes';
 end if;
 finish:=s.starts_at+make_interval(mins=>o.duration_minutes);
 if exists(select 1 from public.mentor_reservations where mentor_id=m.id and status='held' and expires_at>now() and starts_at<finish and ends_at>s.starts_at)
 or exists(select 1 from public.bookings where mentor_id=m.id
   and status in ('upcoming','confirmed','rescheduled','reschedule_requested','cancellation_requested','admin_reschedule_pending')
   and starts_at<finish and ends_at>s.starts_at) then
   raise exception 'This slot has just been reserved; choose another time' using errcode='23P01';
 end if;
 insert into public.mentor_reservations(slot_id,mentor_id,session_id,mentor_name,mentor_email,session_title,
 starts_at,ends_at,duration_minutes,price_paise,share_bps,customer_name,customer_email,customer_message,checkout_key)
 values(s.id,m.id,o.id,m.name,m.contact_email,o.title,s.starts_at,finish,o.duration_minutes,o.price_paise,m.share_bps,
 trim(p_name),lower(trim(p_email)),left(coalesce(p_message,''),1500),p_checkout_key) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.reserve_mentor_slot(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_mentor_slot(uuid,text,text,text,uuid) to service_role;

create function public.fulfill_mentor_booking(p_reservation_id uuid,p_payment_id text,p_order_id text,p_amount integer,p_currency text,p_meet_link text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.mentor_reservations; b public.bookings; mid uuid; conflict boolean; valid_amount boolean;
begin
 select mentor_id into mid from public.mentor_reservations where id=p_reservation_id;
 if not found then raise exception 'Reservation not found'; end if;
 perform 1 from public.mentors where id=mid for update;
 select * into r from public.mentor_reservations where id=p_reservation_id for update;
 if r.order_id is null or r.order_id<>p_order_id then raise exception 'Payment order does not match reservation'; end if;
 select * into b from public.bookings where mentor_reservation_id=r.id;
 if found then
   if b.payment_id<>p_payment_id then raise exception 'Reservation already paid'; end if;
   return to_jsonb(b);
 end if;
 valid_amount := p_currency='INR' and p_amount=r.price_paise;
 conflict := r.starts_at<=now() or exists(select 1 from public.mentor_reservations h where h.mentor_id=r.mentor_id
   and h.id<>r.id and h.status='held' and h.expires_at>now() and h.starts_at<r.ends_at and h.ends_at>r.starts_at)
   or exists(select 1 from public.bookings where mentor_id=r.mentor_id
   and status in ('upcoming','confirmed','rescheduled','reschedule_requested','cancellation_requested','admin_reschedule_pending')
   and starts_at<r.ends_at and ends_at>r.starts_at);
 insert into public.bookings(email,name,service_name,service_price,service_duration,booking_date,booking_time,
 message,status,meet_link,payment_id,mentor_id,mentor_name,mentor_email,mentor_reservation_id,paid_paise,mentor_share_bps)
 values(r.customer_email,r.customer_name,r.session_title,round(p_amount::numeric/100),r.duration_minutes,
 (r.starts_at at time zone 'Asia/Kolkata')::date,(r.starts_at at time zone 'Asia/Kolkata')::time,
 r.customer_message,case when valid_amount and not conflict then 'upcoming' else 'pending' end,
 case when valid_amount and not conflict then p_meet_link else null end,p_payment_id,r.mentor_id,r.mentor_name,r.mentor_email,r.id,p_amount,r.share_bps)
 returning * into b;
 update public.mentor_reservations set status=case when b.status='upcoming' then 'confirmed' else 'review' end,payment_id=p_payment_id where id=r.id;
 return to_jsonb(b);
end $$;
revoke all on function public.fulfill_mentor_booking(uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_mentor_booking(uuid,text,text,integer,text,text) to service_role;

-- Public API only receives available times, never customer identities or holds.
create function public.available_mentor_slots() returns table(id uuid,session_id uuid,starts_at timestamptz)
language sql security invoker set search_path='' as $$
 select s.id,s.session_id,s.starts_at from public.mentor_slots s
 join public.mentor_sessions o on o.id=s.session_id join public.mentors m on m.id=o.mentor_id
 where s.is_active and o.is_active and m.status='published' and s.starts_at>now()+interval '1 hour'
 and s.starts_at<now()+interval '180 days'
 and not exists(select 1 from public.mentor_reservations r where r.mentor_id=m.id and r.status='held' and r.expires_at>now()
   and r.starts_at<s.starts_at+make_interval(mins=>o.duration_minutes) and r.ends_at>s.starts_at)
 and not exists(select 1 from public.bookings b where b.mentor_id=m.id
   and b.status in ('upcoming','confirmed','rescheduled','reschedule_requested','cancellation_requested','admin_reschedule_pending')
   and b.starts_at<s.starts_at+make_interval(mins=>o.duration_minutes) and b.ends_at>s.starts_at)
 order by s.starts_at limit 1000;
$$;
revoke all on function public.available_mentor_slots() from public,anon,authenticated;
grant execute on function public.available_mentor_slots() to service_role;
