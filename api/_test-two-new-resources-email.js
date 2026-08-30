import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';

const TOKEN = 'Lz8Y7dQ0Pq2kTn5eB4mX';
const PRODUCT_IDS = [
  '928a14d2-64b4-4a73-951d-dcf191fe72ad',
  'ff04eb72-ff48-4917-b56c-0694fa4f4ee6'
];
const TARGET = 'hello@desk2quant.com';
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export default async function handler(req, res) {
  if (req.query?.token !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfUnconfigured(res, 'test-two-new-resources-email')) return;

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const SUPABASE_KEY = getServiceKey();
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
  const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';
  if (!BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY not configured' });

  const pr = await fetch(`${SUPABASE_URL}/rest/v1/products?id=in.(${PRODUCT_IDS.join(',')})&select=id,name,description,price,discount_percentage,coupon_code`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!pr.ok) return res.status(500).json({ error: `Product fetch failed: ${pr.status}` });
  const products = await pr.json();
  const ordered = PRODUCT_IDS.map(id => products.find(p => p.id === id)).filter(Boolean);
  if (ordered.length !== 2) return res.status(500).json({ error: 'Expected two products' });

  const cards = ordered.map(p => {
    const desc = String(p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    const coupon = p.coupon_code ? `<div style="margin-top:10px;font-weight:800;">Coupon: <span style="background:#fff3b0;padding:4px 8px;border:1px solid #111;">${esc(p.coupon_code)}</span> · ${Number(p.discount_percentage || 0)}% off</div>` : '';
    return `<div style="border:1px solid #111;padding:18px;margin:0 0 18px;background:#fff;box-shadow:4px 4px 0 #111;"><h2 style="font-size:18px;margin:0 0 8px;">${esc(p.name)}</h2><p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 12px;">${esc(desc)}</p><div style="font-size:17px;font-weight:800;">₹${Number(p.price)}</div>${coupon}<p style="margin:16px 0 0;"><a href="https://desk2quant.com/product.html?id=${p.id}" style="display:inline-block;background:#ffca3a;color:#111;text-decoration:none;font-weight:800;border:1px solid #111;padding:10px 15px;">View resource →</a></p></div>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f3;font-family:Arial,sans-serif;color:#111;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 10px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #111;box-shadow:7px 7px 0 #111;"><tr><td style="background:#ffca3a;border-bottom:1px solid #111;padding:24px 28px;"><strong style="font-size:24px;">Desk2Quant</strong><div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;margin-top:5px;">New resources for returning buyers</div></td></tr><tr><td style="padding:28px;"><p style="font-size:15px;line-height:1.7;margin-top:0;">You’ve built a substantial Desk2Quant library already, so we wanted to surface two newly added resources that may complement what you own.</p>${cards}<p style="font-size:12px;color:#666;line-height:1.6;margin-bottom:0;">This is a one-off recommendation based on your prior Desk2Quant purchases. If you already have what you need, no action is required.</p></td></tr></table></td></tr></table></body></html>`;

  const text = `Desk2Quant — two newly added resources\n\n${ordered.map(p => `${p.name}\n₹${Number(p.price)}${p.coupon_code ? `\nCoupon ${p.coupon_code}: ${Number(p.discount_percentage || 0)}% off` : ''}\nhttps://desk2quant.com/product.html?id=${p.id}`).join('\n\n')}\n\nThis is a one-off recommendation based on your prior Desk2Quant purchases.`;

  const er = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      replyTo: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: TARGET }],
      subject: '[TEST] Two new Desk2Quant resources you may like',
      htmlContent: html,
      textContent: text
    })
  });
  if (!er.ok) return res.status(500).json({ sent: 0, error: await er.text() });
  const data = await er.json();
  return res.status(200).json({ sent: 1, to: TARGET, messageId: data.messageId || null });
}
