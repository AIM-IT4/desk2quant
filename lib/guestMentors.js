import crypto from 'node:crypto';
import { SUPABASE_URL, serviceHeaders, getServiceKey } from './supabaseAdmin.js';
import { createJitsiMeetingLink, createSessionJoinUrl } from './jitsi.js';
import { signBookingToken } from './bookingTokens.js';
import { emailShell, escapeHtml } from './emailBranding.js';
import { sendWebhookEmailOnce } from './webhookEmailDelivery.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_MENTOR_FIELDS = 'id,slug,name,headline,bio,photo_url,linkedin_url,specialties,timezone';
const limits = new Map();
const fail = (message, status=400) => Object.assign(new Error(message), { status });
export const validId = value => typeof value === 'string' && UUID.test(value);
const id = value => { if (!validId(value)) throw fail('Invalid ID'); return value; };
const text = (value, max=1000) => String(value ?? '').trim().slice(0,max);
const integer = (value,min,max) => { const n=Number(value); if(!Number.isInteger(n)||n<min||n>max) throw fail(`Enter a whole number between ${min} and ${max}`); return n; };
const array = value => (Array.isArray(value)?value:String(value||'').split('\n')).map(v=>text(v,200)).filter(Boolean).slice(0,12);
function safeUrl(value, linkedIn=false) {
    if(!value) return null;
    let url; try { url=new URL(value); } catch { throw fail('Enter a valid HTTPS URL'); }
    if(url.protocol!=='https:' || url.username || url.password || (linkedIn && !['linkedin.com','www.linkedin.com'].includes(url.hostname))) throw fail(linkedIn?'Use a linkedin.com profile URL':'Use an HTTPS URL');
    return url.href;
}
export function validateMentor(input) {
    const name=text(input.name,100), slug=text(input.slug,100), contact_email=text(input.contact_email,254).toLowerCase();
    if(name.length<2 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !EMAIL.test(contact_email)) throw fail('Name, lowercase URL slug and a valid mentor email are required');
    const timezone=text(input.timezone||'Asia/Kolkata',80);
    try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw fail('Enter a valid timezone, for example Asia/Kolkata');}
    const status=input.status||'draft'; if(!['draft','published','paused'].includes(status))throw fail('Invalid publication status');
    return {name,slug,contact_email,timezone,status,headline:text(input.headline,160),bio:text(input.bio,4000),photo_url:safeUrl(input.photo_url),linkedin_url:safeUrl(input.linkedin_url,true),specialties:array(input.specialties),share_bps:integer(input.share_bps??7500,0,10000)};
}
export function validateOffering(input) {
    const title=text(input.title,160); if(title.length<3)throw fail('A session title is required');
    return {mentor_id:id(input.mentor_id),title,description:text(input.description,4000),prerequisites:text(input.prerequisites,1000),outcomes:array(input.outcomes),duration_minutes:integer(input.duration_minutes,15,180),price_paise:integer(input.price_paise,10000,10000000),is_active:input.is_active!==false};
}
export async function mentorDb(path, options={}) {
    const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:serviceHeaders({'Content-Type':'application/json',Prefer:'return=representation',...options.headers})});
    if(!response.ok){ const detail=await response.text(); console.error('Mentor database request failed',path.split('?')[0],response.status,detail); throw fail('Unable to complete this request. The time may no longer be available. Please refresh and try again.',response.status===409?409:400); }
    const raw=await response.text(); return raw?JSON.parse(raw):null;
}
const rpc=(name,body)=>mentorDb(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)});
function limited(req){
    const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
    const now=Date.now(), hits=(limits.get(ip)||[]).filter(t=>now-t<60000); hits.push(now); limits.set(ip,hits);
    if(limits.size>2000)for(const [key,values] of limits)if(values.at(-1)<now-60000)limits.delete(key);
    return hits.length>12;
}
export async function getMentorCatalog(){
    const [mentors,allSessions,slots]=await Promise.all([
        mentorDb(`mentors?status=eq.published&select=${PUBLIC_MENTOR_FIELDS}&order=name`),
        mentorDb('mentor_sessions?is_active=eq.true&select=id,mentor_id,title,description,prerequisites,outcomes,duration_minutes,price_paise&order=duration_minutes.asc,title.asc'),
        rpc('available_mentor_slots',{})
    ]);
    const ids=new Set(mentors.map(m=>m.id));
    return {mentors,sessions:allSessions.filter(s=>ids.has(s.mentor_id)),slots};
}
export async function handleMentorPublic(req,res){
    res.setHeader('Cache-Control','no-store');
    try {
        if(req.method==='GET' && req.query?.action==='mentors')return res.status(200).json(await getMentorCatalog());
        if(req.method==='POST' && req.body?.action==='mentor-confirm'){
            if(limited(req))throw fail('Too many requests. Please try again shortly.',429);
            const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature}=req.body;
            if(!/^order_[a-zA-Z0-9]+$/.test(orderId||'')||!/^pay_[a-zA-Z0-9]+$/.test(paymentId||'')||!verifyCheckoutSignature(orderId,paymentId,signature))throw fail('Payment verification failed',403);
            const payment=await razorpay(`payments/${paymentId}`);
            if(payment.order_id!==orderId||payment.status!=='captured')throw fail('Payment is still processing. Your confirmation will arrive by email once captured.',409);
            const booking=await fulfillMentorPayment(payment);
            return res.status(200).json({status:booking.status,manageUrl:bookingManageUrl(booking.email)});
        }
        return res.status(405).json({error:'Method not allowed'});
    }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Mentor sessions are temporarily unavailable. Please try again later.'});}
}
export function verifyCheckoutSignature(orderId,paymentId,signature){
    if(!process.env.RAZORPAY_KEY_SECRET||typeof signature!=='string'||!/^\w{64}$/.test(signature))return false;
    const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
async function razorpay(path, body){
    if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw fail('Payments are temporarily unavailable',503);
    const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw fail('Payment service unavailable. Please try again shortly.',502);
    return response.json();
}
export async function handleMentorOrder(req,res){
    res.setHeader('Cache-Control','no-store');
    try{
        if(limited(req))throw fail('Too many checkout attempts. Please wait a minute.',429);
        if(!process.env.RAZORPAY_WEBHOOK_SECRET || !process.env.BREVO_API_KEY)throw fail('Session checkout is not configured yet',503);
        const {slot_id,checkout_key,name,email,message}=req.body;
        const customerEmail=text(email,254).toLowerCase(), customerName=text(name,100);
        if(!EMAIL.test(customerEmail)||customerName.length<2)throw fail('Enter your name and email');
        const reservation=await rpc('reserve_mentor_slot',{p_slot_id:id(slot_id),p_checkout_key:id(checkout_key),p_name:customerName,p_email:customerEmail,p_message:text(message,1500)});
        let orderId=reservation.order_id;
        if(!orderId){
            const order=await razorpay('orders',{amount:reservation.price_paise,currency:'INR',receipt:reservation.id,payment_capture:1,notes:{type:'mentor_session',reservation_id:reservation.id}});
            const changed=await mentorDb(`mentor_reservations?id=eq.${reservation.id}&order_id=is.null`,{method:'PATCH',body:JSON.stringify({order_id:order.id})});
            orderId=changed?.[0]?.order_id;
            if(!orderId){ const rows=await mentorDb(`mentor_reservations?id=eq.${reservation.id}&select=order_id`);orderId=rows[0]?.order_id; }
            if(!orderId)throw fail('Checkout could not be prepared. Please try again.',503);
        }
        return res.status(200).json({order_id:orderId,key:process.env.RAZORPAY_KEY_ID,amount:reservation.price_paise,currency:'INR',expires_at:reservation.expires_at,name:reservation.customer_name,email:reservation.customer_email,description:reservation.session_title});
    }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Could not reserve this session. Please try again.'});}
}
export function bookingManageUrl(email){const token=signBookingToken(email);if(!token)throw new Error('Booking token configuration missing');return `${process.env.PUBLIC_BASE_URL||'https://desk2quant.com'}/my-bookings.html?email=${encodeURIComponent(email)}&tk=${encodeURIComponent(token)}`;}
export async function fulfillMentorPayment(payment){
    if(payment.status!=='captured'||!/^order_[a-zA-Z0-9]+$/.test(payment.order_id||'')||!/^pay_[a-zA-Z0-9]+$/.test(payment.id||'')||!Number.isInteger(payment.amount)||payment.amount<=0)throw fail('Invalid captured payment');
    const reservations=await mentorDb(`mentor_reservations?order_id=eq.${payment.order_id}&select=id,customer_name`);
    if(!reservations?.[0])throw new Error('Mentor reservation order not found');
    const reservation=reservations[0];
    const booking=await rpc('fulfill_mentor_booking',{p_reservation_id:reservation.id,p_payment_id:payment.id,p_order_id:payment.order_id,p_amount:payment.amount,p_currency:payment.currency,p_meet_link:createJitsiMeetingLink(payment.id,reservation.customer_name,process.env.RAZORPAY_WEBHOOK_SECRET)});
    await notifyMentorBooking(booking);
    return booking;
}
async function notifyMentorBooking(b){
    const confirmed=b.status!=='pending', when=`${b.booking_date} at ${b.booking_time} IST (Asia/Kolkata)`;
    const details=`<p><strong>${escapeHtml(b.service_name)}</strong></p><p>Mentor: ${escapeHtml(b.mentor_name)}<br>${escapeHtml(when)}<br>${b.service_duration} minutes</p>`;
    const attendeeUrl=confirmed?createSessionJoinUrl(b.id,'attendee'):null;
    const hostUrl=confirmed?createSessionJoinUrl(b.id,'host'):null;
    const customerBody=confirmed
        ? `${details}<p><a href="${escapeHtml(attendeeUrl)}">Join your session</a></p><p>Your link opens a waiting room until the mentor has entered the meeting.</p>`
        : `${details}<p>Your payment was received, but this booking needs manual review. Desk2Quant will contact you to arrange a suitable time or refund.</p>`;
    const hostBody=confirmed
        ? `${details}<p><a href="${escapeHtml(hostUrl)}">Start as host</a></p><p>Open this host link first. Learners remain in the Desk2Quant waiting room until you have actually joined Jitsi.</p>`
        : customerBody;
    const sender={email:process.env.SENDER_EMAIL||'hello@desk2quant.com',name:process.env.SENDER_NAME||'Desk2Quant'};
    const common={paymentId:b.payment_id,BREVO_API_KEY:process.env.BREVO_API_KEY,SUPABASE_URL,SUPABASE_KEY:getServiceKey()};
    const adminEmails=String(process.env.ADMIN_NOTIFICATION_EMAIL||process.env.ADMIN_EMAIL||'hello@desk2quant.com').split(',').map(x=>x.trim()).filter(Boolean);
    const messages=[{type:'guest_customer',to:[{email:b.email,name:b.name}],html:customerBody+`<p><a href="${escapeHtml(bookingManageUrl(b.email))}">Manage booking</a></p>`}];
    if(confirmed)messages.push({type:'guest_mentor',to:[{email:b.mentor_email,name:b.mentor_name}],html:hostBody+`<p>Learner: ${escapeHtml(b.name)}</p><p>Preparation notes: ${escapeHtml(b.message||'None')}</p>`});
    messages.push({type:'guest_admin',to:[...new Set(adminEmails)].map(email=>({email})),html:(confirmed?hostBody:customerBody)+`<p>Booking: ${escapeHtml(b.id)}</p><p>Learner: ${escapeHtml(b.name)} (${escapeHtml(b.email)})</p>`});
    for(const msg of messages)await sendWebhookEmailOnce({...common,deliveryType:msg.type,emailPayload:{sender,to:msg.to,subject:`${confirmed?'Session confirmed':'Booking needs review'}: ${b.service_name}`,htmlContent:emailShell({body:msg.html})}});
}

export async function handleMentorAdmin(req,res){
    res.setHeader('Cache-Control','no-store');
    try{
        const {action,data={}}=req.body;
        if(action==='mentors-list'){
            const [mentors,sessions,slots,bookings]=await Promise.all([
                mentorDb('mentors?select=*&order=created_at.desc'),mentorDb('mentor_sessions?select=*&order=created_at.desc'),
                mentorDb('mentor_slots?select=*&order=starts_at&limit=1000'),
                mentorDb('bookings?mentor_id=not.is.null&select=id,mentor_id,mentor_name,name,email,service_name,starts_at,status,service_price,refund_amount,refund_status,mentor_earnings_paise,mentor_payout_status,mentor_payout_reference&order=created_at.desc&limit=500')
            ]);return res.status(200).json({mentors,sessions,slots,bookings});
        }
        if(action==='mentors-save'||action==='mentors-session-save'){
            const table=action==='mentors-save'?'mentors':'mentor_sessions';
            const values=table==='mentors'?validateMentor(data):validateOffering(data);
            const result=await mentorDb(table+(data.id?`?id=eq.${id(data.id)}`:''),{method:data.id?'PATCH':'POST',body:JSON.stringify(values)});
            return res.status(200).json({success:true,item:result?.[0]});
        }
        if(action==='mentors-slot-save'){
            const starts=text(data.starts_at,50); if(!/(Z|[+-]\d{2}:\d{2})$/.test(starts)||!Number.isFinite(Date.parse(starts))||Date.parse(starts)<Date.now()+3600000)throw fail('Choose a time at least one hour in the future');
            const values={session_id:id(data.session_id),starts_at:new Date(starts).toISOString(),is_active:data.is_active!==false};
            const result=await mentorDb('mentor_slots'+(data.id?`?id=eq.${id(data.id)}`:''),{method:data.id?'PATCH':'POST',body:JSON.stringify(values)});
            return res.status(200).json({success:true,item:result?.[0]});
        }
        if(action==='mentors-slot-pause'){
            await mentorDb(`mentor_slots?id=eq.${id(data.id)}`,{method:'PATCH',body:JSON.stringify({is_active:false})});return res.status(200).json({success:true});
        }
        if(action==='mentors-booking-complete'){
            const rows=await mentorDb(`bookings?id=eq.${id(data.id)}&mentor_id=not.is.null&status=in.(confirmed,upcoming,rescheduled)&ends_at=lt.${encodeURIComponent(new Date().toISOString())}`,{method:'PATCH',body:JSON.stringify({status:'completed'})});
            if(!rows?.length)throw fail('Only a finished, confirmed session can be marked completed');
            return res.status(200).json({success:true});
        }
        if(action==='mentors-payout-record'){
            const reference=text(data.reference,180);if(!reference)throw fail('A payout reference is required');
            const rows=await mentorDb(`bookings?id=eq.${id(data.id)}&mentor_id=not.is.null&status=eq.completed&mentor_payout_status=eq.unpaid`,{method:'PATCH',body:JSON.stringify({mentor_payout_status:'paid',mentor_payout_reference:reference,mentor_paid_at:new Date().toISOString()})});
            if(!rows?.length)throw fail('Complete the session before recording its payout');
            return res.status(200).json({success:true});
        }
        throw fail('Unknown mentor action');
    }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Could not update mentor records. Please try again.'});}
}
