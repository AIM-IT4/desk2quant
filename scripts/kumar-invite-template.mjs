// Email template for scripts/send-kumar-invite.mjs.
function productCard(p, discountPct) {
    const desc = (p.description || '').replace(/<[^>]*>/g, '').substring(0, 110);
    const discountedPrice = Math.round(p.price * (1 - discountPct / 100));
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
                    <span style="font-size:13px; color:#94a3b8; text-decoration:line-through;">₹${p.price}</span>
                    <span style="font-size:20px; font-weight:800; color:#4f46e5;">₹${discountedPrice}</span>
                    <span style="font-size:11px; color:#10b981; font-weight:700; margin-left:auto;">Save ${discountPct}%</span>
                </div>
                <a href="https://desk2quant.com/product.html?id=${p.id}" style="display:block; text-align:center; background:#4f46e5; color:#ffffff; font-weight:700; text-decoration:none; padding:10px 16px; border-radius:8px; font-size:13px;">View &amp; Buy →</a>
            </div>
        </div>`;
}

export function buildHtml({ customerName, couponCode, discountPct, products }) {
    const productCards = products.map(p => productCard(p, discountPct)).join('');
    return `
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
          Thanks for grabbing the <strong>Quant Finance Starter Pack</strong> and <strong>Statistics for Quants</strong> from us on Topmate! We also run a full library of desk-ready quant resources at Desk2Quant, and picked 5 more that pair well with what you already have — with an exclusive discount just for you.
        </p>
      </td></tr>
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="background:linear-gradient(135deg,#e0f2fe,#bae6fd); border:2px dashed #0284c7; border-radius:12px; padding:18px; text-align:center;">
          <span style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive ${discountPct}% Coupon</span>
          <div style="font-size:26px; font-weight:900; color:#0369a1; letter-spacing:4px; margin:8px 0;">${couponCode}</div>
          <span style="font-size:11px; color:#0284c7;">Apply at checkout on any resource below</span>
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 16px 28px; background:#f8fafc;">
        <h2 style="font-size:16px; color:#0f172a; font-weight:700; margin:20px 0 14px 0;">Handpicked For You:</h2>
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
}

export function buildText({ customerName, couponCode, discountPct, products }) {
    const recNames = products.map(p => `• ${p.name} — ₹${Math.round(p.price * (1 - discountPct / 100))} (${discountPct}% off with ${couponCode})`).join('\n');
    return `Hi ${customerName},\n\nThanks for grabbing the Quant Finance Starter Pack and Statistics for Quants from us on Topmate! We also run a full library of desk-ready quant resources at Desk2Quant, and picked 5 more that pair well with what you already have.\n\nUse code ${couponCode} for ${discountPct}% OFF at checkout:\n\n${recNames}\n\nBrowse all: https://desk2quant.com/#products\n\nSent by Desk2Quant`;
}
