export function buildHtml({ name, couponCode, productName, oldPrice, newPrice, productUrl }) {
    return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f1f5f9; padding:0; margin:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9; padding:32px 10px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px -4px rgba(0,0,0,0.1);">
      <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); padding:28px; text-align:center;">
        <h1 style="color:#ffffff; font-size:24px; font-weight:800; margin:0;">Desk2Quant</h1>
      </td></tr>
      <tr><td style="padding:32px 28px 8px 28px;">
        <p style="font-size:16px; color:#334155; margin:0 0 16px 0;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 16px 0;">
          You tried to pick up the <strong>${productName}</strong> a couple of days ago, but your card didn't clear the 3D Secure verification step, so the payment never went through.
        </p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 16px 0;">
          Nothing was charged to you — that step happens before any money moves. It's a common hiccup with international cards, and usually just works on a second attempt or with a different card.
        </p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 8px 0;">
          It's a wasted trip either way, so here's <strong>20% off</strong> for the trouble:
        </p>
      </td></tr>
      <tr><td style="padding:8px 28px 24px 28px;">
        <div style="background:linear-gradient(135deg,#e0f2fe,#bae6fd); border:2px dashed #0284c7; border-radius:12px; padding:20px; text-align:center;">
          <span style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Your 20% Code</span>
          <div style="font-size:28px; font-weight:900; color:#0369a1; letter-spacing:4px; margin:10px 0;">${couponCode}</div>
          <div style="font-size:14px; color:#0c4a6e;">
            <span style="text-decoration:line-through; color:#64748b;">&euro;${oldPrice}</span>
            &nbsp;&rarr;&nbsp; <strong style="font-size:20px;">&euro;${newPrice}</strong>
          </div>
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px; text-align:center;">
        <a href="${productUrl}" style="display:block; background:#e95836; color:#ffffff; font-weight:700; text-decoration:none; padding:15px 28px; border-radius:8px; font-size:15px;">Complete your order &rarr;</a>
        <p style="font-size:12px; color:#94a3b8; margin:14px 0 0 0;">Apply <strong>${couponCode}</strong> at checkout. If the card fails again, trying a different card usually does it — or just reply to this email and I'll sort it out for you personally.</p>
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;">
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0;">
          And if you've changed your mind, no problem at all — just ignore this one.
        </p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:14px 0 0 0;">Amit<br><span style="color:#94a3b8; font-size:13px;">Desk2Quant</span></p>
      </td></tr>
      <tr><td style="background:#0f172a; padding:18px; text-align:center; color:#94a3b8; font-size:11px;">
        <p style="margin:0;"><a href="https://desk2quant.com" style="color:#38bdf8; text-decoration:none;">desk2quant.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function buildText({ name, couponCode, productName, oldPrice, newPrice, productUrl }) {
    return `Hi ${name},

You tried to pick up the ${productName} a couple of days ago, but your card didn't clear the 3D Secure verification step, so the payment never went through.

Nothing was charged to you - that step happens before any money moves. It's a common hiccup with international cards, and usually just works on a second attempt or with a different card.

It's a wasted trip either way, so here's 20% off for the trouble:

  Code: ${couponCode}
  EUR ${oldPrice} -> EUR ${newPrice}

Complete your order: ${productUrl}

If the card fails again, trying a different card usually does it - or just reply to this email and I'll sort it out for you personally.

And if you've changed your mind, no problem at all - just ignore this one.

Amit
Desk2Quant
https://desk2quant.com`;
}
