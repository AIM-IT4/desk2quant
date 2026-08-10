// Builds and sends ONE post-purchase/post-booking recommendation email.
// Called by api/reminders.js's queue sweep (processRecommendationQueue), never
// directly by the webhook — the webhook only enqueues (see recommendationQueue.js).
//
// Picks recommendations by category affinity (see PRODUCT_CATEGORY_MAP below,
// mirrored from script.js's grid categorisation) so e.g. an XVA/derivatives
// buyer sees Credit/Rates-adjacent picks first, falling back to
// pack-then-price-desc for anything uncategorised.

import { escapeHtml } from './emailBranding.js';

// Kept in sync with PRODUCT_CATEGORY_MAP in script.js (products grid filter).
// Maps product id -> category, used here only to group "adjacent" products.
const PRODUCT_CATEGORY_MAP = {
    '798495e8-653a-480c-9ea8-3182f43f2b9d': 'code',
    'c3e4c5cc-6616-4728-b979-782bec4d8811': 'code',
    '9ad9f8ac-9872-40c3-82b8-1e6168e65062': 'code',
    '4cd13da8-ab2a-4287-a8f8-5bfca8d37bde': 'code',
    '067381aa-df15-42ad-b27e-2556d141e52f': 'code',
    '6b78550d-e130-41d1-9409-92335ce82a6c': 'code',
    'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7': 'bundle',
    'bdb3c59e-c8c0-430f-8705-b7467514458e': 'bundle',
    '164308cd-e3cd-4026-8fdc-337a5955ffff': 'bundle',
    '75f6118b-c10e-43c6-acc6-ec48cd6a6cbc': 'bundle',
};

// Keyword affinity groups: if the just-bought product's NAME matches a group,
// prioritise recommendable products whose name matches the same group before
// falling back to generic pack/price ordering.
const AFFINITY_GROUPS = [
    { test: /xva|counterparty|credit risk/i, prefer: /credit|xva|counterparty|risk/i },
    { test: /rates|ir |interest rate|fixed income/i, prefer: /rates|ir |interest rate|fixed income/i },
    { test: /fx|foreign exchange/i, prefer: /fx|foreign exchange/i },
    { test: /equity|equities/i, prefer: /equity|equities/i },
    { test: /stochastic|numerical methods|calculus/i, prefer: /stochastic|numerical|calculus|python|c\+\+|r for/i },
    { test: /interview|mistake/i, prefer: /interview|mistake/i },
];

function pickRecommendations(allProducts, purchasedProductName) {
    const normPurchased = (purchasedProductName || '').toLowerCase().trim();

    const recommendable = allProducts.filter(p => {
        const n = (p.name || '').toLowerCase();
        const isCompleteBundle = n.includes('complete') && n.includes('bundle');
        const isJustBought = n === normPurchased;
        return !isCompleteBundle && !isJustBought;
    });

    if (recommendable.length === 0) return [];

    // Find an affinity group matching what they bought
    const matchedGroup = AFFINITY_GROUPS.find(g => g.test.test(purchasedProductName || ''));
    const affinityPicks = matchedGroup
        ? recommendable.filter(p => matchedGroup.prefer.test(p.name || ''))
        : [];

    const packs = recommendable.filter(p => !affinityPicks.includes(p) && ((p.name || '').toLowerCase().includes('pack') || (p.name || '').toLowerCase().includes('bundle')));
    const singles = recommendable.filter(p => !affinityPicks.includes(p) && !packs.includes(p));

    // Affinity-matched products first, then packs/bundles, then everything else
    return [...affinityPicks, ...packs, ...singles].slice(0, 4);
}

/**
 * Builds and sends a single recommendation email. Returns { ok, messageId?, error? }
 * — never throws, so the caller (reminders.js queue sweep) can log/retry cleanly.
 */
export async function sendRecommendationEmail({
    customerEmail, customerName, purchasedProductName, trigger, couponCode,
    SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
}) {
    const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || SENDER_EMAIL;
    const discountPct = 20;

    let allProducts = [];
    try {
        const productsResp = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url&price=gt.0&order=price.desc`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (productsResp.ok) allProducts = await productsResp.json();
        else return { ok: false, error: `Products fetch failed: ${productsResp.status}` };
    } catch (err) {
        return { ok: false, error: `Products fetch threw: ${err.message}` };
    }

    const picks = pickRecommendations(allProducts, purchasedProductName);
    if (picks.length === 0) {
        return { ok: true, skipped: true, reason: 'no products to recommend' };
    }

    const productCards = picks.map(p => {
        const desc = (p.description || '').replace(/<[^>]*>/g, '').substring(0, 110);
        const originalPrice = p.price;
        const discountedPrice = Math.round(originalPrice * (1 - discountPct / 100));
        const coverImg = p.cover_image_url
            ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" style="width:100%; height:140px; object-fit:contain; border-radius:0; margin-bottom:12px; background:#f7f7f3;">`
            : '';
        return `
            <div style="background:#ffffff; border:1px solid #090909; border-radius:0; overflow:hidden; margin-bottom:20px; box-shadow:4px 4px 0 #090909;">
                <div style="background:#f7f7f3; border-bottom:1px solid #090909; padding:12px; text-align:center;">${coverImg}</div>
                <div style="padding:18px;">
                    <h3 style="margin:0 0 6px 0; font-size:15px; color:#090909; font-weight:800; line-height:1.4;">${escapeHtml(p.name)}</h3>
                    <p style="margin:0 0 12px 0; font-size:12px; color:#666761; line-height:1.5;">${escapeHtml(desc)}...</p>
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:14px;">
                        <span style="font-size:13px; color:#666761; text-decoration:line-through;">₹${originalPrice}</span>
                        <span style="font-size:20px; font-weight:800; color:#0b7f79;">₹${discountedPrice}</span>
                        <span style="font-size:11px; color:#0b7f79; font-weight:800; margin-left:auto;">Save ${discountPct}%</span>
                    </div>
                    <a href="https://desk2quant.com/product.html?id=${p.id}" style="display:block; text-align:center; background:#ffca3a; color:#090909; font-weight:800; text-decoration:none; padding:10px 16px; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; font-size:13px;">View &amp; Buy →</a>
                </div>
            </div>`;
    }).join('');

    const triggerText = trigger === 'session_booking'
        ? 'completing a mentorship session with us'
        : `purchasing <strong>${escapeHtml(purchasedProductName)}</strong>`;

    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Space Grotesk','Segoe UI',Arial,sans-serif; background:#f7f7f3; padding:0; margin:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f7f3; padding:32px 10px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px; background:#ffffff; border:1px solid #090909; border-radius:0; overflow:hidden; box-shadow:8px 8px 0 #090909;">
      <tr><td style="background:#ffca3a; border-bottom:1px solid #090909; padding:32px; text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 4px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border:1px solid #090909; border-radius:2px;"></td><td style="vertical-align:middle;"><span style="color:#090909; font-size:26px; font-weight:800;">Desk2Quant</span></td></tr></table>
        <p style="color:#4a4a42; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0; font-weight:700;">Exclusively For You</p>
      </td></tr>
      <tr><td style="padding:32px 28px 16px 28px;">
        <p style="font-size:16px; color:#090909; margin:0 0 10px 0;">Hi <strong>${escapeHtml(customerName)}</strong>,</p>
        <p style="font-size:14px; color:#44453f; line-height:1.7; margin:0 0 14px 0;">
          Thank you for ${triggerText}! To help you go even further, here are resources handpicked to complement your journey — with an exclusive discount just for you.
        </p>
      </td></tr>
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="background:#ffca3a; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:18px; text-align:center;">
          <span style="font-size:12px; color:#090909; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive ${discountPct}% Coupon</span>
          <div style="font-size:26px; font-weight:900; color:#090909; letter-spacing:2px; margin:8px 0; max-width:100%; overflow-wrap:anywhere; word-break:break-all;">${escapeHtml(couponCode)}</div>
          <span style="font-size:11px; color:#090909; font-weight:700;">Apply at checkout on any product below</span>
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 16px 28px; background:#f7f7f3;">
        <h2 style="font-size:16px; color:#090909; font-weight:800; margin:20px 0 14px 0;">Recommended For You:</h2>
        ${productCards}
      </td></tr>
      <tr><td style="padding:20px 28px; text-align:center;">
        <a href="https://desk2quant.com/#products" style="display:inline-block; background:#ffca3a; color:#090909; font-weight:800; text-decoration:none; padding:14px 28px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; font-size:15px;">Browse All Resources</a>
      </td></tr>
      <tr><td style="background:#f7f7f3; border-top:1px solid #090909; padding:20px; text-align:center; color:#666761; font-size:11px;">
        <p style="margin:0 0 4px 0;">Desk2Quant &copy; 2026. All rights reserved.</p>
        <p style="margin:0;"><a href="https://desk2quant.com" style="color:#090909; font-weight:700; text-decoration:underline;">desk2quant.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const recNames = picks.map(p => `• ${p.name} — ₹${Math.round(p.price * 0.8)} (${discountPct}% off with ${couponCode})`).join('\n');
    const textContent = `Hi ${customerName},\n\nThank you for ${trigger === 'session_booking' ? 'booking your mentorship session' : `purchasing "${purchasedProductName}"`}!\n\nHere are some resources handpicked for you — use code ${couponCode} for ${discountPct}% OFF at checkout:\n\n${recNames}\n\nBrowse all: https://desk2quant.com/#products\n\nSent by Desk2Quant`;

    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                to: [{ email: customerEmail, name: customerName }],
                subject: `${customerName}, here's an exclusive 20% off on our top quant resources 🎯`,
                htmlContent,
                textContent
                // No scheduledAt here: this only runs once send_at has already
                // arrived (checked by the queue sweep), so send immediately.
            })
        });

        if (resp.ok) {
            const data = await resp.json();
            return { ok: true, messageId: data.messageId };
        }
        const errText = await resp.text();
        return { ok: false, error: `Brevo ${resp.status}: ${errText}` };
    } catch (err) {
        return { ok: false, error: `Brevo request threw: ${err.message}` };
    }
}
