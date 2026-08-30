import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';

const ONE_OFF_TOKEN = '2R6MsMv5nlMANCY6i8kenW2fQXMMjIeJ';
const CAMPAIGN = 'top_buyer_new_resources_20260830';
const PRODUCT_IDS = [
  '928a14d2-64b4-4a73-951d-dcf191fe72ad',
  'ff04eb72-ff48-4917-b56c-0694fa4f4ee6'
];
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const norm = (s='') => String(s).trim().toLowerCase();
const isBundle = n => /complete.*bundle|bundle.*complete/i.test(n || '');
const isNoise = p => {
  const n = norm(p.product_name);
  const src = norm(p.source);
  return !p.customer_email || Number(p.amount || 0) <= 0 || ['e2e_test','lead_capture'].includes(src) || /test|sandbox/.test(n) || n === 'resources map' || n === 'sql';
};

async function sb(url, key, path, options={}) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  if (req.query?.token !== ONE_OFF_TOKEN) return res.status(401).json({error:'Unauthorized'});
  if (blockIfUnconfigured(res, 'oneoff-top-buyers')) return;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const SUPABASE_KEY = getServiceKey();
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
  const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';
  if (!BREVO_API_KEY) return res.status(500).json({error:'BREVO_API_KEY not configured'});

  try {
    const [purchases, products] = await Promise.all([
      sb(SUPABASE_URL, SUPABASE_KEY, 'purchases?select=customer_email,product_name,amount,source,created_at&order=created_at.desc'),
      sb(SUPABASE_URL, SUPABASE_KEY, `products?id=in.(${PRODUCT_IDS.join(',')})&select=id,name,description,price,original_price,discount_percentage,coupon_code`)
    ]);
    if (!Array.isArray(products) || products.length !== 2) throw new Error('Expected two campaign products');

    const byEmail = new Map();
    for (const p of purchases || []) {
      if (isNoise(p)) continue;
      const email = norm(p.customer_email);
      if (!email.includes('@')) continue;
      if (!byEmail.has(email)) byEmail.set(email, { products:new Set(), last:null, hasBundle:false });
      const x = byEmail.get(email);
      x.products.add(p.product_name);
      x.hasBundle ||= isBundle(p.product_name);
      if (!x.last || new Date(p.created_at) > new Date(x.last)) x.last = p.created_at;
    }

    const productNames = new Set(products.map(p => p.name));
    const candidates = [...byEmail.entries()].filter(([,x]) => !x.hasBundle && ![...x.products].some(n => productNames.has(n)))
      .map(([email,x]) => ({email, count:x.products.size, last:x.last}))
      .sort((a,b) => b.count-a.count || new Date(b.last)-new Date(a.last));

    const selected = [];
    const cutoff = new Date(Date.now()-COOLDOWN_MS).toISOString();
    for (const c of candidates) {
      if (selected.length >= 10) break;
      const dup = await sb(SUPABASE_URL, SUPABASE_KEY, `recommendation_emails?customer_email=eq.${encodeURIComponent(c.email)}&trigger_type=eq.${CAMPAIGN}&select=id&limit=1`);
      if (dup?.length) continue;
      const recent = await sb(SUPABASE_URL, SUPABASE_KEY, `recommendation_emails?customer_email=eq.${encodeURIComponent(c.email)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`);
      if (recent?.length) continue;
      selected.push(c);
    }

    const ordered = PRODUCT_IDS.map(id => products.find(p => p.id === id));
    const results = [];
    for (const buyer of selected) {
      try {
        const contactResp = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(buyer.email)}`, { headers:{accept:'application/json','api-key':BREVO_API_KEY} });
        if (contactResp.ok) {
          const contact = await contactResp.json();
          if (contact.emailBlacklisted === true) { results.push({...buyer,status:'skipped_blacklisted'}); continue; }
        }
        const cards = ordered.map(p => {
          const desc = String(p.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
          const coupon = p.coupon_code ? `<div style="margin-top:10px;font-weight:800;">Coupon: <span style="background:#fff3b0;padding:4px 8px;border:1px solid #111;">${esc(p.coupon_code)}</span> · ${Number(p.discount_percentage||0)}% off</div>` : '';
          return `<div style="border:1px solid #111;padding:18px;margin:0 0 18px;background:#fff;box-shadow:4px 4px 0 #111;"><h2 style="font-size:18px;margin:0 0 8px;">${esc(p.name)}</h2><p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 12px;">${esc(desc)}</p><div style="font-size:17px;font-weight:800;">₹${Number(p.price)}</div>${coupon}<p style="margin:16px 0 0;"><a href="https://desk2quant.com/product.html?id=${p.id}" style="display:inline-block;background:#ffca3a;color:#111;text-decoration:none;font-weight:800;border:1px solid #111;padding:10px 15px;">View resource →</a></p></div>`;
        }).join('');
        const html = `<!doctype html><html><body style="margin:0;background:#f7f7f3;font-family:Arial,sans-serif;color:#111;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 10px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #111;box-shadow:7px 7px 0 #111;"><tr><td style="background:#ffca3a;border-bottom:1px solid #111;padding:24px 28px;"><strong style="font-size:24px;">Desk2Quant</strong><div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;margin-top:5px;">New resources for returning buyers</div></td></tr><tr><td style="padding:28px;"><p style="font-size:15px;line-height:1.7;margin-top:0;">You’ve built a substantial Desk2Quant library already, so we wanted to surface two newly added resources that may complement what you own.</p>${cards}<p style="font-size:12px;color:#666;line-height:1.6;margin-bottom:0;">This is a one-off recommendation based on your prior Desk2Quant purchases. If you already have what you need, no action is required.</p></td></tr></table></td></tr></table></body></html>`;
        const text = `Desk2Quant — two newly added resources\n\n${ordered.map(p => `${p.name}\n₹${Number(p.price)}${p.coupon_code ? `\nCoupon ${p.coupon_code}: ${Number(p.discount_percentage||0)}% off` : ''}\nhttps://desk2quant.com/product.html?id=${p.id}`).join('\n\n')}\n\nThis is a one-off recommendation based on your prior Desk2Quant purchases.`;
        const er = await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','api-key':BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},replyTo:{email:SENDER_EMAIL,name:SENDER_NAME},to:[{email:buyer.email}],subject:'Two new Desk2Quant resources you may like',htmlContent:html,textContent:text})});
        if (!er.ok) throw new Error(`Brevo ${er.status}: ${await er.text()}`);
        const ed = await er.json();
        await sb(SUPABASE_URL, SUPABASE_KEY, 'recommendation_emails', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({customer_email:buyer.email,customer_name:'Customer',purchased_product:`Top buyer: ${buyer.count} distinct resources`,send_at:new Date().toISOString(),sent:true,sent_at:new Date().toISOString(),trigger_type:CAMPAIGN,status:'sent',attempts:1,brevo_message_id:ed.messageId||null,discount_percent:null,coupon_code:'RESEARCH10 + VOL20'})});
        results.push({...buyer,status:'sent',messageId:ed.messageId||null});
      } catch (e) { results.push({...buyer,status:'error',error:e.message}); }
    }
    return res.status(200).json({campaign:CAMPAIGN,selected:selected.length,sent:results.filter(x=>x.status==='sent').length,results});
  } catch (e) { return res.status(500).json({error:e.message}); }
}
