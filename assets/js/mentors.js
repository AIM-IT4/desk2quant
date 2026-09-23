(() => {
'use strict';
const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(p/100);
let catalog={mentors:[],sessions:[],slots:[]}, specialty='All', checkoutKey=null, paying=false;
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata';
const dateLabel=iso=>new Intl.DateTimeFormat('en-IN',{timeZone:zone,weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(iso));
const timeLabel=iso=>new Intl.DateTimeFormat('en-IN',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(iso));
const tags=m=>m.specialties.map(t=>`<span class="tag">${esc(t)}</span>`).join('');
function avatar(m){return m.photo_url&&/^https:\/\//.test(m.photo_url)?`<img class="avatar" src="${esc(m.photo_url)}" alt="${esc(m.name)}" referrerpolicy="no-referrer">`:`<span class="avatar" aria-hidden="true">${esc(m.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</span>`;}
function track(name,data){try{window.Statsig?.logEvent?.(name,undefined,data);}catch{}window.dispatchEvent(new CustomEvent('desk2quant:mentor-event',{detail:{name,...data}}));}
async function request(url,body){const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error||'Please try again');return data;}
function switchView(view){['directory','profile','booking'].forEach(v=>$(v+'-view').hidden=v!==view);window.scrollTo(0,0);}
function renderDirectory(){
 const query=$('mentor-search').value.toLowerCase().trim();
 const matches=catalog.mentors.filter(m=>(specialty==='All'||m.specialties.includes(specialty))&&(`${m.name} ${m.headline} ${m.specialties.join(' ')} ${catalog.sessions.filter(s=>s.mentor_id===m.id).map(s=>s.title).join(' ')}`).toLowerCase().includes(query));
 $('mentor-grid').innerHTML=matches.map(m=>{const sessions=catalog.sessions.filter(s=>s.mentor_id===m.id), min=sessions.length?Math.min(...sessions.map(s=>s.price_paise)):null;return `<article class="mentor-card">${avatar(m)}<h2>${esc(m.name)}</h2><p>${esc(m.headline)}</p><div>${tags(m)}</div><p class="price">${min!==null?'Sessions from '+money(min):'Sessions coming soon'}</p><a class="button" href="?mentor=${encodeURIComponent(m.slug)}">View profile →</a></article>`;}).join('');
 $('catalog-status').hidden=matches.length>0;
 $('catalog-status').innerHTML=catalog.mentors.length?'<p>No mentors match these filters. Try another topic.</p>':'<h2>Guest mentors are coming soon.</h2><p>We’re preparing specialist sessions. You can book with Amit below, or get in touch about teaching on Desk2Quant.</p>';
}
function renderProfile(m){
 const sessions=catalog.sessions.filter(s=>s.mentor_id===m.id);
 $('profile-view').innerHTML=`<a class="back-link" href="/mentors.html">← All mentors</a><div class="profile-header">${avatar(m)}<div><p class="eyebrow">GUEST MENTOR</p><h1>${esc(m.name)}</h1><p>${esc(m.headline)}</p><div>${tags(m)}</div></div></div><div class="profile-layout"><aside class="panel"><h2>Meet your mentor</h2><p class="prose">${esc(m.bio)}</p><p class="muted">Mentor timezone: ${esc(m.timezone)}</p>${m.linkedin_url?`<a href="${esc(m.linkedin_url)}" rel="noopener noreferrer" target="_blank">View LinkedIn profile ↗</a>`:''}</aside><div class="session-list">${sessions.length?sessions.map(s=>{const available=catalog.slots.some(t=>t.session_id===s.id);return `<article class="panel"><p class="eyebrow">ONE-TO-ONE SESSION</p><h2>${esc(s.title)}</h2><p class="prose">${esc(s.description)}</p>${s.outcomes.length?`<h3>What you will cover</h3><ul>${s.outcomes.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}${s.prerequisites?`<p><strong>Before you book:</strong> ${esc(s.prerequisites)}</p>`:''}<div class="session-footer"><p><strong>${money(s.price_paise)}</strong> · ${s.duration_minutes} minutes</p>${available?`<a class="button" href="?mentor=${encodeURIComponent(m.slug)}&session=${s.id}">Choose a time →</a>`:'<span class="muted">New times coming soon</span>'}</div></article>`;}).join(''):'<div class="notice">This mentor’s sessions are being prepared.</div>'}</div>`;
 switchView('profile');track('mentor_profile_view',{mentor_id:m.id});
}
function renderBooking(m,s){
 const slots=catalog.slots.filter(t=>t.session_id===s.id), days=[...new Set(slots.map(t=>dateLabel(t.starts_at)))];
 $('booking-view').innerHTML=`<a class="back-link" href="?mentor=${encodeURIComponent(m.slug)}">← Back to ${esc(m.name)}</a><p class="steps">CHOOSE A MENTOR / EXPLORE A SESSION / BOOK</p><h1 class="booking-title">Book your session</h1><div class="booking-layout"><aside class="panel">${avatar(m)}<p class="eyebrow">YOUR SESSION</p><h2>${esc(s.title)}</h2><p>With <strong>${esc(m.name)}</strong></p><p>${s.duration_minutes} minutes · Online, one-to-one</p><p class="prose">${esc(s.description)}</p><div class="summary-details">Total<br><strong>${money(s.price_paise)}</strong><p class="muted">Charged in INR. Your bank may apply currency-conversion fees.</p></div></aside><form id="mentor-booking-form" class="panel booking-form"><h2>Choose a date and time</h2><p class="muted">Times shown in <strong>${esc(zone)}</strong>.</p><div class="form-row"><label>Date<select id="booking-day" required>${days.map((d,i)=>`<option value="${i}">${esc(d)}</option>`).join('')}</select></label><label>Time<select id="booking-slot" required></select></label></div><div class="form-row"><label>Your name<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label><label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label></div><label>What would you like help with?<textarea name="message" rows="3" maxlength="1500" placeholder="Share your goal or project context"></textarea></label><label class="consent"><input type="checkbox" required><span>I have checked the session prerequisites and agree to the <a href="/refund.html" target="_blank" rel="noopener">refund policy</a>.</span></label><button id="mentor-pay" class="button" type="submit" ${slots.length?'':'disabled'}>Pay ${money(s.price_paise)} & book</button><p class="muted">Your slot is reserved for 10 minutes while you complete payment.</p><div id="booking-feedback" role="status" aria-live="polite"></div></form></div>`;
 const updateTimes=()=>{const day=days[Number($('booking-day').value)];$('booking-slot').innerHTML=slots.filter(t=>dateLabel(t.starts_at)===day).map(t=>`<option value="${t.id}">${esc(timeLabel(t.starts_at))}</option>`).join('');checkoutKey=null;};
 $('booking-day').addEventListener('change',updateTimes);$('booking-slot').addEventListener('change',()=>checkoutKey=null);updateTimes();
 $('mentor-booking-form').addEventListener('submit',async event=>{
   event.preventDefault();if(paying)return;paying=true;const button=$('mentor-pay'), feedback=$('booking-feedback');button.disabled=true;feedback.className='';feedback.textContent='Reserving your time…';
   const form=new FormData(event.target);checkoutKey=checkoutKey||crypto.randomUUID();track('mentor_checkout_start',{mentor_id:m.id,session_id:s.id});
   try{
     if(!window.Razorpay)throw Error('Payment checkout could not load. Refresh and try again.');
     const order=await request('/api/create-order',{notes:{type:'mentor_session'},slot_id:$('booking-slot').value,checkout_key:checkoutKey,name:form.get('name'),email:form.get('email'),message:form.get('message')});
     feedback.textContent='Complete payment in the secure checkout window.';
     const checkout=new window.Razorpay({key:order.key,order_id:order.order_id,amount:order.amount,currency:order.currency,name:'Desk2Quant',description:order.description,prefill:{name:order.name,email:order.email},theme:{color:'#087f80'},modal:{ondismiss:()=>{paying=false;button.disabled=false;feedback.textContent='Checkout closed. Your reservation expires after 10 minutes.';}},handler:async payment=>{
       feedback.textContent='Payment received. Verifying your booking…';
       try{const result=await request('/api/products',{action:'mentor-confirm',...payment});track('mentor_payment_verified',{mentor_id:m.id,session_id:s.id});feedback.className='notice booking-result';feedback.innerHTML=`<strong>${result.status==='pending'?'Payment received — booking under review':'Your session is confirmed.'}</strong><p>${result.status==='pending'?'We will contact you about a suitable time or refund.':'Check your email for the meeting link and session details.'}</p><a class="button" href="${esc(result.manageUrl)}">View my booking</a>`;button.hidden=true;}
       catch(error){feedback.textContent='Payment received. '+error.message+' Please check your confirmation email before trying to pay again.';button.hidden=true;}
     }});checkout.on('payment.failed',()=>{feedback.textContent='Payment did not complete. You can retry within the checkout window.';});checkout.open();
   }catch(error){feedback.className='error';feedback.textContent=error.message;button.disabled=false;paying=false;checkoutKey=null;}
 });
 switchView('booking');track('mentor_session_view',{mentor_id:m.id,session_id:s.id});
}
async function start(){
 try{catalog=await request('/api/products?action=mentors');const filters=['All',...new Set(catalog.mentors.flatMap(m=>m.specialties))];$('mentor-filters').innerHTML=filters.map(f=>`<button class="chip" type="button" data-specialty="${esc(f)}" aria-pressed="${f==='All'}">${esc(f)}</button>`).join('');$('mentor-filters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;specialty=b.dataset.specialty;document.querySelectorAll('[data-specialty]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderDirectory();});$('mentor-search').addEventListener('input',renderDirectory);renderDirectory();
 const params=new URLSearchParams(location.search),slug=params.get('mentor'),sid=params.get('session');if(slug){const m=catalog.mentors.find(m=>m.slug===slug);if(!m)throw Error('This mentor profile is not currently available.');const s=catalog.sessions.find(s=>s.id===sid&&s.mentor_id===m.id);if(s)renderBooking(m,s);else renderProfile(m);}
 }catch(error){$('catalog-status').hidden=false;$('catalog-status').textContent=error.message;}
}
start();
})();
