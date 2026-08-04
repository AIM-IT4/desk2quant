// Shared recommendation set for the 4 customers in missed-recs-data.js.
// Same 4 products the automated sendPostPurchaseRecommendations() would have
// picked for them (packs/bundles first, then price desc, excluding the
// complete bundle and whatever they already bought) — pulled live from
// Supabase on 2026-07-28.

const RECOMMENDATIONS = [
    {
        id: '75f6118b-c10e-43c6-acc6-ec48cd6a6cbc',
        name: 'Quant Models for Each Asset Class Master Pack: IR, FX, Credits, Equity',
        price: 1999,
        cover: 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/quant_models_for_each_asset_class_master_pack___ir__fx__credits___equity__cover_1770558243661.jpg',
        desc: 'A single, organized library of pricing models & implementations across IR, FX, Credit and Equity.'
    },
    {
        id: 'bdb3c59e-c8c0-430f-8705-b7467514458e',
        name: 'Derivatives Products & Pricing Master Pack (6 PDFs)',
        price: 1999,
        cover: 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/derivatives_products___pricing_master_pack__6_pdfs___ir__fx__equity__credit__inflation___commodities_cover_1770437873121.jpg',
        desc: 'Multi-asset derivatives notes bundle covering product coverage and pricing intuition across 6 PDFs.'
    },
    {
        id: 'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7',
        name: 'Ultimate Industry Grade Quant Project Pack (45 Projects)',
        price: 799,
        cover: 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/ultimate_industry_grade_quant_project_pack__45_projects__cover_1770367062769.jpg',
        desc: '45 fully-developed, desk-level projects covering Derivatives Pricing, Risk, XVA and Term-Structure.'
    },
    {
        id: 'a778e6ae-43d1-4cbd-a6a7-6dce693e5f69',
        name: 'Model Validation Quant Case Study Pack',
        price: 799,
        cover: 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/model_validation_quant_case_study_pack__cover_1778296482675.jpg',
        desc: '83 professional case studies for Quant, Risk, Model Validation, Audit & Regulatory Review.'
    }
];

const DISCOUNT_PCT = 20;

function buildEmail({ name, firstName, couponCode, purchasedProduct }) {
    const productCards = RECOMMENDATIONS.map(p => {
        const discounted = Math.round(p.price * (1 - DISCOUNT_PCT / 100));
        return `
            <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 2px 10px rgba(0,0,0,0.06); border:1px solid #eef2f6;">
                <div style="background:#f8fafc; padding:12px; text-align:center;">
                    <img src="${p.cover}" alt="${p.name}" style="width:100%; height:140px; object-fit:contain; border-radius:4px; background:#f8fafc;">
                </div>
                <div style="padding:18px;">
                    <h3 style="margin:0 0 6px 0; font-size:15px; color:#0f172a; font-weight:700; line-height:1.4;">${p.name}</h3>
                    <p style="margin:0 0 12px 0; font-size:12px; color:#64748b; line-height:1.5;">${p.desc}</p>
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:14px;">
                        <span style="font-size:13px; color:#94a3b8; text-decoration:line-through;">₹${p.price}</span>
                        <span style="font-size:20px; font-weight:800; color:#4f46e5;">₹${discounted}</span>
                        <span style="font-size:11px; color:#10b981; font-weight:700; margin-left:auto;">Save ${DISCOUNT_PCT}%</span>
                    </div>
                    <a href="https://desk2quant.com/product.html?id=${p.id}" style="display:block; text-align:center; background:#4f46e5; color:#ffffff; font-weight:700; text-decoration:none; padding:10px 16px; border-radius:8px; font-size:13px;">View &amp; Buy →</a>
                </div>
            </div>`;
    }).join('');

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
        <p style="font-size:16px; color:#334155; margin:0 0 10px 0;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 14px 0;">
          Thank you for purchasing <strong>${purchasedProduct}</strong>! To help you go even further, here are resources handpicked to complement your journey — with an exclusive discount just for you.
        </p>
      </td></tr>
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="background:linear-gradient(135deg,#e0f2fe,#bae6fd); border:2px dashed #0284c7; border-radius:12px; padding:18px; text-align:center;">
          <span style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive ${DISCOUNT_PCT}% Coupon</span>
          <div style="font-size:26px; font-weight:900; color:#0369a1; letter-spacing:4px; margin:8px 0;">${couponCode}</div>
          <span style="font-size:11px; color:#0284c7;">Apply at checkout on any product below</span>
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 16px 28px; background:#f8fafc;">
        <h2 style="font-size:16px; color:#0f172a; font-weight:700; margin:20px 0 14px 0;">Recommended For You:</h2>
        ${productCards}
      </td></tr>
      <tr><td style="padding:20px 28px; text-align:center;">
        <a href="https://desk2quant.com/#products" style="display:inline-block; background:#e95836; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 28px; border-radius:8px; font-size:15px;">Browse All Resources</a>
      </td></tr>
      <tr><td style="background:#0f172a; padding:20px; text-align:center; color:#94a3b8; font-size:11px;">
        <p style="margin:0 0 4px 0;">Desk2Quant &copy; 2026. All rights reserved.</p>
        <p style="margin:0;"><a href="https://desk2quant.com" style="color:#38bdf8; text-decoration:none;">desk2quant.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const recNames = RECOMMENDATIONS.map(p => `• ${p.name} — ₹${Math.round(p.price * (1 - DISCOUNT_PCT / 100))} (${DISCOUNT_PCT}% off with ${couponCode})`).join('\n');
    const textContent = `Hi ${name},\n\nThank you for purchasing "${purchasedProduct}"!\n\nHere are some resources handpicked for you — use code ${couponCode} for ${DISCOUNT_PCT}% OFF at checkout:\n\n${recNames}\n\nBrowse all: https://desk2quant.com/#products\n\nSent by Desk2Quant`;

    return {
        subject: `${firstName}, here's an exclusive 20% off on our top quant resources 🎯`,
        htmlContent,
        textContent
    };
}

module.exports = { buildEmail, RECOMMENDATIONS, DISCOUNT_PCT };
