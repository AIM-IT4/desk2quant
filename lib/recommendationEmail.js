// Builds and sends ONE post-purchase/post-booking recommendation email.
// Called by api/reminders.js's queue sweep (processRecommendationQueue), never
// directly by the webhook — the webhook only enqueues (see recommendationQueue.js).
//
// Picks recommendations by category affinity (see PRODUCT_CATEGORY_MAP below,
// mirrored from script.js's grid categorisation) so e.g. an XVA/derivatives
// buyer sees Credit/Rates-adjacent picks first, falling back to
// pack-then-price-desc for anything uncategorised.

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
            ? `<img src="${p.cover_image_url}" alt="${p.name}" style="width:100%; height:140px; object-fit:contain; border-radius:4px; margin-bottom:12px; background:#f8fafc;">`
            : '';
        return `
            <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 2px 10px rgba(0,0,0,0.06); border:1px solid #eef2f6;">
                <div style="background:#f8fafc; padding:12px; text-align:center;">${coverImg}</div>
                <div style="padding:18px;">
                    <h3 style="margin:0 0 6px 0; font-size:15px; color:#0f172a; font-weight:700; line-height:1.4;">${p.name}</h3>
                    <p style="margin:0 0 12px 0; font-size:12px; color:#64748b; line-height:1.5;">${desc}...</p>
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:14px;">
                        <span style="font-size:13px; color:#94a3b8; text-decoration:line-through;">₹${originalPrice}</span>
                        <span style="font-size:20px; font-weight:800; color:#4f46e5;">₹${discountedPrice}</span>
                        <span style="font-size:11px; color:#10b981; font-weight:700; margin-left:auto;">Save ${discountPct}%</span>
                    </div>
                    <a href="https://desk2quant.vercel.app/product.html?id=${p.id}" style="display:block; text-align:center; background:#4f46e5; color:#ffffff; font-weight:700; text-decoration:none; padding:10px 16px; border-radius:8px; font-size:13px;">View &amp; Buy →</a>
                </div>
            </div>`;
    }).join('');

    const triggerText = trigger === 'session_booking'
        ? 'completing a mentorship session with us'
        : `purchasing <strong>${purchasedProductName}</strong>`;

    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f1f5f9; padding:0; margin:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9; padding:32px 10px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px -4px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); padding:32px; text-align:center;">
        <h1 style="color:#ffffff; font-size:26px; font-weight:800; margin:0 0 4px 0;">Desk2Quant</h1>
        <p style="color:#94a3b8; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0;">Exclusively For You</p>
      </td></tr>
      <tr><td style="padding:32px 28px 16px 28px;">
        <p style="font-size:16px; color:#334155; margin:0 0 10px 0;">Hi <strong>${customerName}</strong>,</p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 14px 0;">
          Thank you for ${triggerText}! To help you go even further, here are resources handpicked to complement your journey — with an exclusive discount just for you.
        </p>
      </td></tr>
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="background:linear-gradient(135deg,#e0f2fe,#bae6fd); border:2px dashed #0284c7; border-radius:12px; padding:18px; text-align:center;">
          <span style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive ${discountPct}% Coupon</span>
          <div style="font-size:26px; font-weight:900; color:#0369a1; letter-spacing:4px; margin:8px 0;">${couponCode}</div>
          <span style="font-size:11px; color:#0284c7;">Apply at checkout on any product below</span>
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 16px 28px; background:#f8fafc;">
        <h2 style="font-size:16px; color:#0f172a; font-weight:700; margin:20px 0 14px 0;">Recommended For You:</h2>
        ${productCards}
      </td></tr>
      <tr><td style="padding:20px 28px; text-align:center;">
        <a href="https://desk2quant.vercel.app/#products" style="display:inline-block; background:#e95836; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 28px; border-radius:8px; font-size:15px;">Browse All Resources</a>
      </td></tr>
      <tr><td style="background:#0f172a; padding:20px; text-align:center; color:#94a3b8; font-size:11px;">
        <p style="margin:0 0 4px 0;">Desk2Quant &copy; 2026. All rights reserved.</p>
        <p style="margin:0;"><a href="https://desk2quant.vercel.app" style="color:#38bdf8; text-decoration:none;">desk2quant.vercel.app</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const recNames = picks.map(p => `• ${p.name} — ₹${Math.round(p.price * 0.8)} (${discountPct}% off with ${couponCode})`).join('\n');
    const textContent = `Hi ${customerName},\n\nThank you for ${trigger === 'session_booking' ? 'booking your mentorship session' : `purchasing "${purchasedProductName}"`}!\n\nHere are some resources handpicked for you — use code ${couponCode} for ${discountPct}% OFF at checkout:\n\n${recNames}\n\nBrowse all: https://desk2quant.vercel.app/#products\n\nSent by Desk2Quant`;

    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
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
