import { escapeHtml } from './emailBranding.js';

function money(value) {
    return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function ownedItems(value) {
    return String(value || '')
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4);
}

export async function sendBundleUpgradeEmail({
    customerEmail,
    customerName,
    purchasedProductName,
    couponCode,
    discountPercent,
    targetProductId,
    SUPABASE_URL,
    SUPABASE_KEY,
    BREVO_API_KEY,
    SENDER_EMAIL,
    SENDER_NAME
}) {
    if (!customerEmail || !couponCode || !targetProductId) {
        return { ok: false, error: 'Bundle-upgrade email is missing customer/coupon/product context' };
    }

    const pct = Math.max(30, Math.min(90, Number(discountPercent) || 30));

    // Marketing follow-up: respect Brevo's global email blacklist/unsubscribe state.
    try {
        const contactResp = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(customerEmail)}`, {
            headers: { accept: 'application/json', 'api-key': BREVO_API_KEY }
        });
        if (contactResp.status === 404) {
            return { ok: true, skipped: true, reason: 'contact not present in Brevo' };
        }
        if (!contactResp.ok) {
            return { ok: false, error: `Brevo contact check failed: ${contactResp.status}` };
        }
        const contact = await contactResp.json();
        if (contact.emailBlacklisted === true) {
            return { ok: true, skipped: true, reason: 'Brevo email blacklist/unsubscribe' };
        }
    } catch (err) {
        return { ok: false, error: `Brevo contact check threw: ${err.message}` };
    }

    let bundle;
    try {
        const productResp = await fetch(
            `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(targetProductId)}&select=id,name,description,price,original_price,cover_image_url&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (!productResp.ok) return { ok: false, error: `Bundle fetch failed: ${productResp.status}` };
        const rows = await productResp.json();
        bundle = Array.isArray(rows) ? rows[0] : null;
    } catch (err) {
        return { ok: false, error: `Bundle fetch threw: ${err.message}` };
    }

    if (!bundle || !(Number(bundle.price) > 0)) {
        return { ok: false, error: 'Complete Bundle is missing or has an invalid price' };
    }

    const bundlePrice = Number(bundle.price);
    const finalPrice = bundlePrice * (1 - pct / 100);
    const name = String(customerName || 'there').trim() || 'there';
    const items = ownedItems(purchasedProductName);
    const itemHtml = items.length
        ? items.map((item) => `<li style="margin:5px 0;">${escapeHtml(item)}</li>`).join('')
        : '<li>Your previous Desk2Quant purchase(s)</li>';
    const itemText = items.length ? items.map((item) => `- ${item}`).join('\n') : '- Your previous Desk2Quant purchase(s)';
    const productUrl = `https://desk2quant.com/product.html?id=${encodeURIComponent(bundle.id)}&utm_source=brevo&utm_medium=email&utm_campaign=bundle_upgrade_extra30`;

    const subject = `${name}, your Complete Bundle upgrade price is ₹${money(finalPrice)}`;
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f7f3;margin:0;padding:0;color:#090909;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f3;padding:28px 10px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #090909;box-shadow:8px 8px 0 #090909;">
<tr><td style="background:#ffca3a;border-bottom:1px solid #090909;padding:30px;text-align:center;">
<strong style="font-size:27px;">Desk2Quant</strong><div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;margin-top:7px;color:#4a4a42;">Private Complete Bundle Upgrade</div>
</td></tr>
<tr><td style="padding:30px 28px 14px;">
<p style="font-size:16px;margin:0 0 12px;">Hi <strong>${escapeHtml(name)}</strong>,</p>
<h1 style="font-size:25px;line-height:1.3;margin:0 0 14px;">Don’t pay twice for Desk2Quant material you already own.</h1>
<p style="font-size:15px;line-height:1.7;color:#44453f;margin:0 0 14px;">You currently own:</p>
<ul style="font-size:14px;line-height:1.6;color:#44453f;margin:0 0 18px;padding-left:22px;">${itemHtml}</ul>
<p style="font-size:15px;line-height:1.7;color:#44453f;margin:0;">For this upgrade, we credited your previous purchase value against the <strong>₹${money(bundlePrice)}</strong> Complete Bundle, then applied an <strong>extra 30% off the remaining amount</strong>. Your private checkout coupon is calibrated to that upgrade price and rounded in your favour.</p>
</td></tr>
<tr><td style="padding:10px 28px 16px;">
<div style="background:#ffca3a;border:1px solid #090909;box-shadow:4px 4px 0 #090909;padding:22px;text-align:center;">
<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Your private bundle-only code</div>
<div style="font-family:monospace;font-size:28px;font-weight:900;letter-spacing:1px;margin:8px 0;overflow-wrap:anywhere;">${escapeHtml(couponCode)}</div>
<div style="font-size:14px;">Complete Bundle ₹${money(bundlePrice)} → <strong>₹${money(finalPrice)}</strong></div>
<div style="font-size:12px;color:#44453f;margin-top:6px;">Effective checkout discount: ${pct}% · code is scoped to the Complete Bundle.</div>
</div>
</td></tr>
<tr><td style="padding:10px 28px 18px;">
<div style="border:1px solid #090909;box-shadow:4px 4px 0 #090909;background:#fff;padding:20px;">
<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#0b7f79;margin-bottom:10px;">What the Complete Bundle includes</div>
<ul style="padding-left:20px;margin:0;color:#44453f;font-size:14px;line-height:1.75;">
<li><strong>71 professionally structured PDFs</strong></li>
<li><strong>72 Jupyter notebooks + 134 executable scripts</strong></li>
<li>Probability, statistics, stochastic calculus, linear algebra and differential equations</li>
<li>Python, C++, SQL and computational templates</li>
<li>Rates, FX, equity, credit, volatility and cross-asset models</li>
<li>Derivatives pricing: rates, FX, equity, credit, inflation, commodities and exotics</li>
<li>XVA, model validation, P&amp;L attribution, regulatory frameworks and production diagnostics</li>
<li><strong>45 industry-style quant projects</strong> plus graded project material</li>
<li><strong>1000+ interview problems</strong>, desk playbooks, mental-math and research-interview preparation</li>
<li>Vol-surface construction and the Quant Researcher Interview Playbook</li>
</ul>
</div>
</td></tr>
<tr><td style="padding:8px 28px 30px;text-align:center;">
<a href="${productUrl}" style="display:inline-block;background:#090909;color:#fff;text-decoration:none;font-weight:800;border:1px solid #090909;box-shadow:4px 4px 0 #0b7f79;padding:14px 24px;font-size:15px;">Upgrade to the Complete Bundle →</a>
</td></tr>
<tr><td style="background:#f7f7f3;border-top:1px solid #090909;padding:20px 28px;text-align:center;color:#666761;font-size:11px;line-height:1.7;">
You received this because you previously purchased from Desk2Quant.<br>
Questions? Reply to this email. To stop future product recommendations, reply with <strong>unsubscribe</strong>.<br>
<a href="https://desk2quant.com" style="color:#090909;font-weight:700;">desk2quant.com</a>
</td></tr>
</table></td></tr></table></body></html>`;

    const textContent = `Hi ${name},

Don't pay twice for Desk2Quant material you already own.

You currently own:
${itemText}

Upgrade formula:
Complete Bundle ₹${money(bundlePrice)}
- credit for your previous Desk2Quant purchase value
- then an extra 30% off the remaining amount

Your private bundle-only code: ${couponCode}
Your checkout price: ₹${money(finalPrice)}
Effective checkout discount: ${pct}% (rounded in your favour)

The Complete Bundle includes:
- 71 PDFs
- 72 Jupyter notebooks + 134 executable scripts
- Foundations: probability, statistics, stochastic calculus, linear algebra
- Python, C++, SQL
- Rates, FX, equity, credit, volatility and cross-asset models
- Derivatives pricing and exotics
- XVA, model validation, P&L attribution and regulatory frameworks
- 45 industry-style quant projects
- 1000+ interview problems and research-interview preparation
- Vol-surface construction and Quant Researcher Interview Playbook

Upgrade: ${productUrl}

To stop future product recommendations, reply with unsubscribe.
Desk2Quant · https://desk2quant.com`;

    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                replyTo: { name: SENDER_NAME, email: process.env.REPLY_TO_EMAIL || SENDER_EMAIL },
                to: [{ email: customerEmail, name }],
                subject,
                htmlContent,
                textContent
            })
        });
        if (!resp.ok) return { ok: false, error: `Brevo ${resp.status}: ${await resp.text()}` };
        const data = await resp.json();
        return { ok: true, messageId: data.messageId, finalPriceInr: finalPrice };
    } catch (err) {
        return { ok: false, error: `Brevo request threw: ${err.message}` };
    }
}
