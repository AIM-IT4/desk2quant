import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.SUPABASE_URL='https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
process.env.RAZORPAY_KEY_ID='rzp_test_key';
process.env.RAZORPAY_KEY_SECRET='test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET='webhook_test';
process.env.BREVO_API_KEY='email_test';
process.env.ADMIN_PASSWORD='admin_test';
const {validateMentor,validateOffering,verifyCheckoutSignature,handleMentorOrder,handleMentorPublic,fulfillMentorPayment}=await import('../lib/guestMentors.js');
const {default:admin}=await import('../api/admin-auth.js');
const uuid='10000000-0000-4000-8000-000000000001';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const res=()=>({statusCode:200,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}});
const request=(body,ip='test')=>({method:'POST',body,headers:{'x-forwarded-for':ip},query:{}});

test('profile validation prevents javascript URLs, unrelated LinkedIn URLs and invalid shares',()=>{
 const m={name:'Test Mentor',slug:'test-mentor',contact_email:'mentor@example.invalid',share_bps:7500};
 assert.equal(validateMentor(m).status,'draft');
 for(const patch of [{photo_url:'javascript:alert(1)'},{linkedin_url:'https://attacker.example'},{share_bps:10001},{timezone:'not-a-zone'},{slug:'<script>'}])assert.throws(()=>validateMentor({...m,...patch}));
 assert.throws(()=>validateOffering({mentor_id:uuid,title:'Test',duration_minutes:0,price_paise:200000}));
});
test('checkout signature checks the exact order and payment',()=>{
 const sig=crypto.createHmac('sha256','test_secret').update('order_test|pay_test').digest('hex');
 assert.equal(verifyCheckoutSignature('order_test','pay_test',sig),true);
 assert.equal(verifyCheckoutSignature('order_other','pay_test',sig),false);
 assert.equal(verifyCheckoutSignature('order_test','pay_test','x'),false);
});
test('checkout uses reserved database price and only server-created notes',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);const calls=[];
 global.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
 if(url.endsWith('/rpc/reserve_mentor_slot'))return response({id:uuid,price_paise:200000,expires_at:'2026-12-01T00:00:00Z',customer_name:'Test',customer_email:'test@example.invalid',session_title:'Pricing'});
 if(url==='https://api.razorpay.com/v1/orders')return response({id:'order_server'});
 if(url.includes('/mentor_reservations?'))return response([{order_id:'order_server'}]);
 throw Error('Unexpected '+url);
 };
 const r=res();await handleMentorOrder(request({slot_id:uuid,checkout_key:uuid,name:'Test',email:'test@example.invalid',amount:1,notes:{type:'mentor_session',reservation_id:'forged'}}),r);
 assert.equal(r.statusCode,200);assert.equal(r.body.amount,200000);assert.equal(r.body.order_id,'order_server');
 const order=calls.find(c=>c.url==='https://api.razorpay.com/v1/orders').body;
 assert.equal(order.amount,200000);assert.deepEqual(order.notes,{type:'mentor_session',reservation_id:uuid});
 assert.equal(JSON.stringify(r.body).includes('service-test'),false);
});
test('retry of attached reservation returns its order without creating a second one',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);let calls=0;
 global.fetch=async url=>{calls++;assert.match(url,/reserve_mentor_slot$/);return response({id:uuid,order_id:'order_existing',price_paise:200000});};
 const r=res();await handleMentorOrder(request({slot_id:uuid,checkout_key:uuid,name:'Test',email:'test@example.invalid'},'retry'),r);
 assert.equal(r.body.order_id,'order_existing');assert.equal(calls,1);
});
test('conflicting hold does not create a Razorpay order',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);let calls=0;
 global.fetch=async()=>{calls++;return response({error:'conflict'},409);};
 const r=res();await handleMentorOrder(request({slot_id:uuid,checkout_key:uuid,name:'Test',email:'test@example.invalid'},'conflict'),r);
 assert.equal(r.statusCode,409);assert.equal(calls,1);
});
test('public catalog excludes draft mentor offerings and private profile fields',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);
 global.fetch=async url=>{
 if(url.includes('/mentors?')){assert.match(url,/status=eq.published/);assert.doesNotMatch(url,/contact_email|share_bps|select=\*/);return response([{id:uuid,name:'Public Mentor'}]);}
 if(url.includes('/mentor_sessions?'))return response([{id:'public',mentor_id:uuid},{id:'private',mentor_id:'draft'}]);
 if(url.includes('/rpc/available_mentor_slots'))return response([]);throw Error(url);
 };
 const r=res();await handleMentorPublic({method:'GET',query:{action:'mentors'}},r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.sessions.map(s=>s.id),['public']);
});
test('admin mutation cannot bypass existing password gate',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);global.fetch=async()=>{throw Error('Should not access database');};
 const r=res();await admin(request({password:'wrong',action:'mentors-save',data:{}},'auth'),r);assert.equal(r.statusCode,401);
});
test('unverified browser payment cannot trigger fulfillment',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);global.fetch=async()=>{throw Error('Should not access payment API');};
 const r=res();await handleMentorPublic(request({action:'mentor-confirm',razorpay_order_id:'order_test',razorpay_payment_id:'pay_test',razorpay_signature:'f'.repeat(64)},'signature'),r);assert.equal(r.statusCode,403);
});
test('captured payment fulfills the reservation found by trusted order ID, not supplied notes',async t=>{
 const original=global.fetch,brevo=process.env.BREVO_API_KEY;t.after(()=>{global.fetch=original;process.env.BREVO_API_KEY=brevo;});delete process.env.BREVO_API_KEY;
 global.fetch=async(url,options)=>{
 if(url.includes('/mentor_reservations?')){assert.match(url,/order_id=eq.order_test/);return response([{id:uuid,customer_name:'Test'}]);}
 if(url.endsWith('/rpc/fulfill_mentor_booking')){const body=JSON.parse(options.body);assert.equal(body.p_reservation_id,uuid);assert.equal(body.p_amount,200000);return response({id:uuid,payment_id:'pay_test',status:'upcoming',email:'test@example.invalid',mentor_name:'Test',mentor_email:'mentor@example.invalid',service_name:'Pricing',booking_date:'2026-12-01',booking_time:'12:00',service_duration:60,meet_link:'https://meet.jit.si/private'});}
 throw Error(url);
 };
 const b=await fulfillMentorPayment({id:'pay_test',order_id:'order_test',amount:200000,currency:'INR',status:'captured',notes:{reservation_id:'forged'}});assert.equal(b.status,'upcoming');
});
