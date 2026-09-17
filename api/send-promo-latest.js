import { getServiceKey } from '../lib/supabaseAdmin.js';

const PRODUCT_ID = 'bb311f7a-cc59-4aed-9054-402a18b045fa';
const CAMPAIGN = 'launch_microstructure_20260917';
const COUPON = 'MICRO10';
const BATCH_SIZE = 12;

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function strip(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
async function supa(base, key, path, init = {}) {
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
}

function buildEmail(product) {
  const productUrl = `https://desk2quant.com/product.html?id=${product.id}`;
  const sampleUrl = 'https://desk2quant.com/api/products?sample=market-microstructure';
  const cover = product.cover_image_url
    ? `<img src="${esc(product.cover_image_url)}" alt="${esc(product.name)}" style="display:block;width:100%;max-height:320px;object-fit:contain;background:#f7f7f3;border:1px solid #111;margin:0 0 22px">`
    : '';
  const desc = esc(strip(product.description).slice(0, 240));
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f3;font-family:Arial,Helvetica,sans-serif;color:#111"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 10px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #111;box-shadow:7px 7px 0 #111"><tr><td style="background:#ffca3a;border-bottom:1px solid #111;padding:25px 28px"><div style="font-size:26px;font-weight:800">Desk2Quant</div><div style="margin-top:5px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">New launch · Quant Research / Trading</div></td></tr><tr><td style="padding:30px 28px;line-height:1.65;font-size:15px"><h1 style="font-size:25px;line-height:1.25;margin:0 0 15px">Market Microstructure &amp; Market Making for Quants</h1><p style="margin:0 0 18px">If you are preparing for <strong>quant research, systematic trading, execution, market-making or trading-side quant roles</strong>, this is the part of preparation that standard derivatives/model notes usually do not cover deeply.</p>${cover}<p style="margin:0 0 18px">${desc}</p><p style="margin:0 0 8px"><strong>Inside the 100-page playbook:</strong></p><p style="margin:0 0 20px">Limit order books and queue priority · spreads and transaction costs · order-flow imbalance and microprice · inventory-aware market making · Avellaneda–Stoikov · adverse selection and markouts · fill probability · market impact and execution · Hawkes processes · causal microstructure research · backtesting failure modes · quant-trader interview games.</p><div style="border:1px solid #111;background:#f7f7f3;padding:18px;margin:22px 0"><div style="font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:700">Launch offer</div><div style="font-size:28px;font-weight:800;margin:4px 0">₹${esc(product.price)}</div><div>Use code <strong>${COUPON}</strong> for an additional <strong>10% off</strong>.</div></div><p style="margin:24px 0"><a href="${productUrl}" style="display:inline-block;background:#0b7f79;color:#fff;text-decoration:none;font-weight:800;border:1px solid #111;box-shadow:3px 3px 0 #111;padding:13px 20px">View the new launch →</a> &nbsp; <a href="${sampleUrl}" style="color:#111;font-weight:700">Preview sample pages</a></p><p style="color:#555;font-size:13px">The package includes the 100-page PDF plus the executable Python lab.</p></td></tr><tr><td style="border-top:1px solid #ddd;padding:18px 28px;color:#666;font-size:11px;line-height:1.6">You received this product update because you previously purchased from Desk2Quant. To stop future product recommendations, reply with <strong>unsubscribe</strong> or email hello@desk2quant.com.<br>Desk2Quant · <a href="https://desk2quant.com" style="color:#111">desk2quant.com</a></td></tr></table></td></tr></table></body></html>`;
  const text = `New Desk2Quant launch: ${product.name}\n\nIf you are preparing for quant research, systematic trading, execution, market-making or trading-side quant roles, this 100-page playbook covers limit order books, queue priority, OFI and microprice, inventory-aware market making, Avellaneda-Stoikov, adverse selection, fill models, impact/execution, Hawkes processes, causal research, backtesting and quant-trader interview games.\n\nLaunch price: ₹${product.price}\nCoupon: ${COUPON} (10% off)\n\nProduct: ${productUrl}\nSample pages: ${sampleUrl}\n\nYou received this because you previously purchased from Desk2Quant. To opt out of future product recommendations, reply with unsubscribe or email hello@desk2quant.com.`;
  return { html, text };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.query?.campaign !== 'microstructure-20260917') return res.status(404).json({ error: 'Not found' });

  const base = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const key = getServiceKey();
  const brevo = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
  const senderName = process.env.SENDER_NAME || 'Desk2Quant';
  if (!key || !brevo) return res.status(500).json({ error: 'Server email configuration missing' });

  try {
    const pResp = await supa(base, key, `products?id=eq.${PRODUCT_ID}&select=id,name,description,price,cover_image_url&limit=1`);
    const products = pResp.ok ? await pResp.json() : [];
    if (!products.length) return res.status(404).json({ error: 'Target product not found' });
    const product = products[0];
    const target = String(product.name || '').toLowerCase().trim();

    const purResp = await supa(base, key, 'purchases?select=customer_email,product_name&order=created_at.desc');
    if (!purResp.ok) return res.status(500).json({ error: 'Could not load purchases' });
    const purchases = await purResp.json();
    const buyers = new Map();
    for (const row of purchases) {
      const email = String(row.customer_email || '').toLowerCase().trim();
      if (!email || !email.includes('@')) continue;
      if (!buyers.has(email)) buyers.set(email, new Set());
      buyers.get(email).add(String(row.product_name || '').toLowerCase().trim());
    }

    const priorResp = await supa(base, key, `recommendation_emails?trigger_type=eq.${CAMPAIGN}&select=customer_email,status`);
    const prior = priorResp.ok ? await priorResp.json() : [];
    const processed = new Set((prior || []).map(r => String(r.customer_email || '').toLowerCase()));
    const eligible = [...buyers.entries()]
      .filter(([email, bought]) => !bought.has(target) && !processed.has(email))
      .map(([email]) => email)
      .sort();

    const batch = eligible.slice(0, BATCH_SIZE);
    const content = buildEmail(product);
    let sent = 0, skipped = 0, errors = 0;

    for (const email of batch) {
      let blacklisted = false;
      try {
        const c = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, { headers: { accept: 'application/json', 'api-key': brevo } });
        if (c.ok) blacklisted = (await c.json())?.emailBlacklisted === true;
      } catch (_) {}

      const claim = await supa(base, key, 'recommendation_emails', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          customer_email: email,
          customer_name: 'Desk2Quant customer',
          purchased_product: 'Market Microstructure & Market Making for Quants launch',
          send_at: new Date().toISOString(),
          sent: false,
          trigger_type: CAMPAIGN,
          coupon_code: COUPON,
          status: blacklisted ? 'failed' : 'sending',
          attempts: 1,
          last_error: blacklisted ? 'Brevo email blacklist / opt-out' : null
        })
      });
      if (!claim.ok) { errors++; continue; }
      const rows = await claim.json();
      const rowId = rows?.[0]?.id;
      if (blacklisted) { skipped++; continue; }

      try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { accept: 'application/json', 'api-key': brevo, 'content-type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            replyTo: { name: senderName, email: process.env.REPLY_TO_EMAIL || senderEmail },
            to: [{ email }],
            subject: 'New: Market Microstructure & Market Making for Quant Research / Trading Roles',
            htmlContent: content.html,
            textContent: content.text
          })
        });
        const ok = r.ok;
        if (ok) sent++; else errors++;
        if (rowId) await supa(base, key, `recommendation_emails?id=eq.${rowId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: ok ? 'sent' : 'failed', sent: ok, last_error: ok ? null : `Brevo ${r.status}` })
        });
      } catch (err) {
        errors++;
        if (rowId) await supa(base, key, `recommendation_emails?id=eq.${rowId}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', sent: false, last_error: String(err?.message || err).slice(0, 250) })
        });
      }
    }

    return res.status(200).json({
      campaign: CAMPAIGN,
      totalPreviousBuyers: buyers.size,
      batchAttempted: batch.length,
      sent,
      skipped,
      errors,
      remainingEligible: Math.max(0, eligible.length - batch.length)
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
