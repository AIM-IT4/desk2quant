-- Run inside a transaction and ROLLBACK. All test rows are synthetic.
do $$
declare m uuid; o uuid; s uuid; overlap_slot uuid; late_slot uuid; h jsonb; b jsonb; again jsonb; h2 jsonb; h3 jsonb; checked boolean;
begin
 insert into public.mentors(slug,name,contact_email,status) values('test-guest-mentor','Test Mentor','mentor@example.invalid','published') returning id into m;
 insert into public.mentor_sessions(mentor_id,title,duration_minutes,price_paise) values(m,'Test pricing session',60,200000) returning id into o;
 insert into public.mentor_slots(session_id,starts_at) values(o,now()+interval '20 days') returning id into s;
 insert into public.mentor_slots(session_id,starts_at) values(o,now()+interval '20 days 30 minutes') returning id into overlap_slot;
 h:=public.reserve_mentor_slot(s,'Test Customer','customer@example.invalid','Test only',gen_random_uuid());
 again:=public.reserve_mentor_slot(s,'Test Customer','customer@example.invalid','Test only',(h->>'checkout_key')::uuid);
 assert h->>'id'=again->>'id','Checkout retry should use one reservation';
 checked:=false;
 begin perform public.reserve_mentor_slot(overlap_slot,'Other Customer','other@example.invalid','',gen_random_uuid()); exception when exclusion_violation then checked:=true; end;
 assert checked,'Overlapping reservation must fail';
 update public.mentor_reservations set order_id='order_testguest' where id=(h->>'id')::uuid;
 b:=public.fulfill_mentor_booking((h->>'id')::uuid,'pay_testguest','order_testguest',200000,'INR','https://meet.jit.si/test-only');
 assert b->>'status'='upcoming','Valid payment must confirm';
 assert (b->>'mentor_earnings_paise')::int=150000,'Share snapshot must be 75 percent';
 again:=public.fulfill_mentor_booking((h->>'id')::uuid,'pay_testguest','order_testguest',200000,'INR','https://meet.jit.si/test-only');
 assert b->>'id'=again->>'id','Webhook retry must not create duplicate booking';
 checked:=false;
 begin perform public.reserve_mentor_slot(overlap_slot,'Other Customer','other@example.invalid','',gen_random_uuid()); exception when exclusion_violation then checked:=true; end;
 assert checked,'Confirmed booking must block overlapping slots';
 checked:=false;
 begin update public.bookings set mentor_payout_status='paid',mentor_payout_reference='test' where id=(b->>'id')::uuid; exception when raise_exception then checked:=true; end;
 assert checked,'Future session payout must be rejected';
 update public.bookings set status='cancelled',refund_amount=500 where id=(b->>'id')::uuid;
 assert (select mentor_earnings_paise=112500 from public.bookings where id=(b->>'id')::uuid),'Refund should reduce share';
 h2:=public.reserve_mentor_slot(s,'New Customer','new@example.invalid','',gen_random_uuid());
 update public.mentor_reservations set expires_at=now()-interval '1 minute',order_id='order_late' where id=(h2->>'id')::uuid;
 h3:=public.reserve_mentor_slot(s,'Next Customer','next@example.invalid','',gen_random_uuid());
 b:=public.fulfill_mentor_booking((h2->>'id')::uuid,'pay_late','order_late',200000,'INR','https://meet.jit.si/test-only');
 assert b->>'status'='pending' and b->>'meet_link' is null,'Late capture with a newer hold must require review';
 update public.mentor_reservations set order_id='order_underpaid' where id=(h3->>'id')::uuid;
 b:=public.fulfill_mentor_booking((h3->>'id')::uuid,'pay_underpaid','order_underpaid',100,'INR','https://meet.jit.si/test-only');
 assert b->>'status'='pending' and b->>'meet_link' is null,'Underpayment cannot confirm';
 assert not has_table_privilege('anon','public.mentors','SELECT'),'Public cannot read private profiles';
 assert not has_table_privilege('authenticated','public.mentor_reservations','SELECT'),'Customers cannot read reservations';
 assert not has_function_privilege('anon','public.reserve_mentor_slot(uuid,text,text,text,uuid)','EXECUTE'),'Public cannot reserve directly';
 assert not has_function_privilege('authenticated','public.fulfill_mentor_booking(uuid,text,text,integer,text,text)','EXECUTE'),'Customers cannot confirm payments';
end $$;
-- A signed-in customer must not see synthetic guest bookings despite historical permissive policies.
set local role authenticated;
do $$ begin
 assert not exists(select 1 from public.bookings where mentor_id is not null),'Guest booking RLS must deny customer reads';
end $$;
reset role;
