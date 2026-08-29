// Builds and sends ONE queued recommendation/nurture email.
// Called by api/reminders.js's queue sweep, never directly by the webhook.

import crypto from 'crypto';
import { escapeHtml } from './emailBranding.js';

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
    const matchedGroup = AFFINITY_GROUPS.find(g => g.test.test(purchasedProductName || ''));
    const affinityPicks = matchedGroup ? recommendable.filter(p => matchedGroup.prefer.test(p.name || '')) : [];
    const packs = recommendable.filter(p => !affinityPicks.includes(p) && ((p.name || '').toLowerCase().includes('pack') || (p.name || '').toLowerCase().includes('bundle')));
    const singles = recommendable.filter(p => !affinityPicks.includes(p) && !packs.includes(p));
    return [...affinityPicks, ...packs, ...singles].slice(0, 4);
}

function fxUnsubscribeToken(email) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return null;
    return crypto.createHmac('sha256', secret)
        .update(`${String(email || '').trim().toLowerCase()}|fx_derivatives_workbook`, 'utf8')
        .digest('hex');
}

function fxNurtureTemplate(step, unsubscribeUrl) {
    const root = 'https://desk2quant.com';
    const templates = {
        1: {
            subject: 'How to use the 50 FX problems effectively',
            kicker: 'Day 1 · Practice method',
            title: 'Don’t read the solutions yet.',
            body: `
                <p>Use the workbook in three passes:</p>
                <ol style="padding-left:20px;line-height:1.75;color:#44453f;">
                    <li><strong>Cold solve:</strong> attempt each problem without notes and write the assumptions you need.</li>
                    <li><strong>Desk explanation:</strong> explain the result aloud — conventions, units, signs and what moves the P&amp;L.</li>
                    <li><strong>Validation pass:</strong> ask what could be implemented incorrectly, mis-calibrated or mis-reported.</li>
                </ol>
                <p>That third pass is what turns a formula exercise into an interview-quality answer.</p>`,
            cta: 'Continue your quant preparation'
        },
        2: {
            subject: 'The FX delta convention trap interviewers use',
            kicker: 'Day 3 · FX interview concept',
            title: '“What is the delta?” is not a complete question in FX.',
            body: `
                <p>In FX options, the answer depends on the convention: spot vs forward delta, premium-adjusted vs unadjusted, and which currency the premium is paid in.</p>
                <p>The practical interview point is not memorising four formulas. It is recognising that a quoted volatility smile is indexed by a <strong>market convention</strong>. Change the delta definition and you change the strike corresponding to a quote.</p>
                <p>A strong answer therefore starts by stating the convention before calculating anything.</p>`,
            cta: 'Explore more desk-ready material'
        },
        3: {
            subject: 'From FX pricing to model validation: what interviewers look for',
            kicker: 'Day 5 · Model-risk perspective',
            title: 'A correct price is only one layer of a good quant answer.',
            body: `
                <p>For pricing or model-validation interviews, take a model through four layers:</p>
                <p><strong>Model → Calibration → Risk → Controls.</strong></p>
                <p>For example, with an FX barrier model: what dynamics are assumed, what smile inputs are calibrated, which Greeks become unstable near the barrier, and what independent checks would catch a bad implementation?</p>
                <p>Desk2Quant’s paid resources are organised around this same practitioner workflow — not isolated textbook derivations.</p>`,
            cta: 'View Desk2Quant resources'
        },
        4: {
            subject: 'Want a focused quant roadmap from here?',
            kicker: 'Day 7 · Next step',
            title: 'If you know where you want to go, the preparation becomes much narrower.',
            body: `
                <p>If you are targeting front-office quant, model validation, market risk or a related quantitative role, the most useful next step is usually identifying the exact gaps between your current background and the role.</p>
                <p>If you want to discuss that directly, you can book a short session from the Desk2Quant homepage and we can focus on your experience, target roles and preparation priorities.</p>`,
            cta: 'Visit Desk2Quant'
        }
    };
    const t = templates[step];
    if (!t) return null;

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f7f3;margin:0;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f3;padding:28px 10px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #090909;box-shadow:7px 7px 0 #090909;">
<tr><td style="background:#ffca3a;border-bottom:1px solid #090909;padding:25px 28px;"><strong style="font-size:24px;color:#090909;">Desk2Quant</strong><div style="font-size:11px;text-transform:uppercase;letter-spacing:1.4px;margin-top:5px;color:#4a4a42;font-weight:700;">${t.kicker}</div></td></tr>
<tr><td style="padding:30px 28px;color:#090909;font-size:15px;line-height:1.7;"><h1 style="font-size:23px;line-height:1.3;margin:0 0 18px;">${t.title}</h1>${t.body}
<p style="margin:28px 0 4px;"><a href="${root}" style="display:inline-block;background:#ffca3a;color:#090909;text-decoration:none;font-weight:800;border:1px solid #090909;box-shadow:3px 3px 0 #090909;padding:12px 18px;">${t.cta}</a></p></td></tr>
<tr><td style="border-top:1px solid #d8d8d1;padding:18px 28px;color:#666761;font-size:11px;line-height:1.6;">You received this because you requested the free FX Derivatives Quant Interview Workbook and opted in to occasional Desk2Quant updates. <a href="${unsubscribeUrl}" style="color:#44453f;text-decoration:underline;">Unsubscribe from FX workbook follow-ups</a>.<br>Desk2Quant · <a href="${root}" style="color:#090909;">desk2quant.com</a></td></tr>
</table></td></tr></table></body></html>`;

    const textContent = `${t.title}\n\n${t.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\n${t.cta}: ${root}\n\nYou received this because you requested the free FX Derivatives Quant Interview Workbook and opted in to occasional Desk2Quant updates.\nUnsubscribe: ${unsubscribeUrl}`;
    return { ...t, htmlContent, textContent };
}

async function sendFxNurtureEmail({ customerEmail, trigger, SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME }) {
    const step = Number(String(trigger || '').replace('fx_nurture_', ''));
    if (![1, 2, 3, 4].includes(step)) return { ok: false, error: 'Unknown FX nurture step' };

    // Duplicate guard: if an equivalent queue row already completed, skip this one.
    try {
        const priorResp = await fetch(
            `${SUPABASE_URL}/rest/v1/recommendation_emails?customer_email=eq.${encodeURIComponent(customerEmail)}`
            + `&trigger_type=eq.${encodeURIComponent(trigger)}&status=eq.sent&select=id&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (priorResp.ok && (await priorResp.json()).length > 0) {
            return { ok: true, skipped: true, reason: 'duplicate nurture step suppressed' };
        }
    } catch (_) {
        // Continue: the queue's own atomic claim still prevents the normal overlap case.
    }

    // Consent is authoritative in Supabase. If withdrawn, do not send.
    let lead;
    try {
        const leadResp = await fetch(
            `${SUPABASE_URL}/rest/v1/lead_captures?email=eq.${encodeURIComponent(customerEmail)}`
            + '&lead_magnet=eq.fx_derivatives_workbook&consent_marketing=eq.true&select=brevo_list_id&limit=1',
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (!leadResp.ok) return { ok: false, error: `Consent lookup failed: ${leadResp.status}` };
        const rows = await leadResp.json();
        lead = Array.isArray(rows) ? rows[0] : null;
        if (!lead) return { ok: true, skipped: true, reason: 'marketing consent withdrawn' };
    } catch (err) {
        return { ok: false, error: `Consent lookup threw: ${err.message}` };
    }

    // Respect Brevo-level unsubscribe/blacklist/list removal as well.
    try {
        const contactResp = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(customerEmail)}`, {
            headers: { accept: 'application/json', 'api-key': BREVO_API_KEY }
        });
        if (contactResp.status === 404) return { ok: true, skipped: true, reason: 'contact no longer exists in Brevo' };
        if (!contactResp.ok) return { ok: false, error: `Brevo contact check failed: ${contactResp.status}` };
        const contact = await contactResp.json();
        if (contact.emailBlacklisted === true) return { ok: true, skipped: true, reason: 'Brevo email blacklist' };
        const listId = Number(lead.brevo_list_id || 0);
        if (listId > 0 && Array.isArray(contact.listIds) && !contact.listIds.map(Number).includes(listId)) {
            return { ok: true, skipped: true, reason: 'contact removed from FX lead list' };
        }
    } catch (err) {
        return { ok: false, error: `Brevo contact check threw: ${err.message}` };
    }

    const token = fxUnsubscribeToken(customerEmail);
    if (!token) return { ok: false, error: 'CRON_SECRET missing; refusing marketing send without unsubscribe token' };
    const unsubscribeUrl = `https://desk2quant.com/api/send-email?action=unsubscribe-fx&email=${encodeURIComponent(customerEmail)}&token=${encodeURIComponent(token)}`;
    const template = fxNurtureTemplate(step, unsubscribeUrl);
    if (!template) return { ok: false, error: 'FX nurture template not found' };

    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                replyTo: { email: process.env.REPLY_TO_EMAIL || SENDER_EMAIL, name: SENDER_NAME },
                to: [{ email: customerEmail }],
                subject: template.subject,
                htmlContent: template.htmlContent,
                textContent: template.textContent
            })
        });
        if (resp.ok) {
            const data = await resp.json();
            return { ok: true, messageId: data.messageId };
        }
        return { ok: false, error: `Brevo ${resp.status}: ${await resp.text()}` };
    } catch (err) {
        return { ok: false, error: `Brevo request threw: ${err.message}` };
    }
}

/**
 * Builds and sends a single queued email. Returns { ok, messageId?, error? }.
 */
export async function sendRecommendationEmail({
    customerEmail, customerName, purchasedProductName, trigger, couponCode,
    SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
}) {
    if (String(trigger || '').startsWith('fx_nurture_')) {
        return sendFxNurtureEmail({
            customerEmail, trigger, SUPABASE_URL, SUPABASE_KEY,
            BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
        });
    }

    const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || SENDER_EMAIL;
    const discountPct = 20;
    let allProducts = [];
    try {
        const productsResp = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url&price=gt.0&order=price.desc`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (productsResp.ok) allProducts = await productsResp.json();
        else return { ok: false, error: `Products fetch failed: ${productsResp.status}` };
    } catch (err) {
        return { ok: false, error: `Products fetch threw: ${err.message}` };
    }

    const picks = pickRecommendations(allProducts, purchasedProductName);
    if (picks.length === 0) return { ok: true, skipped: true, reason: 'no products to recommend' };

    const productCards = picks.map(p => {
        const desc = (p.description || '').replace(/<[^>]*>/g, '').substring(0, 110);
        const originalPrice = p.price;
        const discountedPrice = Math.round(originalPrice * (1 - discountPct / 100));
        const coverImg = p.cover_image_url
            ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" style="width:100%; height:140px; object-fit:contain; border-radius:0; margin-bottom:12px; background:#f7f7f3;">`
            : '';
        return `<div style="background:#ffffff;border:1px solid #090909;overflow:hidden;margin-bottom:20px;box-shadow:4px 4px 0 #090909;"><div style="background:#f7f7f3;border-bottom:1px solid #090909;padding:12px;text-align:center;">${coverImg}</div><div style="padding:18px;"><h3 style="margin:0 0 6px;font-size:15px;color:#090909;font-weight:800;line-height:1.4;">${escapeHtml(p.name)}</h3><p style="margin:0 0 12px;font-size:12px;color:#666761;line-height:1.5;">${escapeHtml(desc)}...</p><div style="margin-bottom:14px;"><span style="font-size:13px;color:#666761;text-decoration:line-through;">₹${originalPrice}</span> <span style="font-size:20px;font-weight:800;color:#0b7f79;">₹${discountedPrice}</span></div><a href="https://desk2quant.com" style="display:block;text-align:center;background:#ffca3a;color:#090909;font-weight:800;text-decoration:none;padding:10px 16px;border:1px solid #090909;box-shadow:3px 3px 0 #090909;font-size:13px;">Visit Desk2Quant →</a></div></div>`;
    }).join('');

    const triggerText = trigger === 'session_booking'
        ? 'completing a mentorship session with us'
        : `purchasing <strong>${escapeHtml(purchasedProductName)}</strong>`;

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f7f3;padding:0;margin:0;"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f7f3;padding:32px 10px;"><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#ffffff;border:1px solid #090909;box-shadow:8px 8px 0 #090909;"><tr><td style="background:#ffca3a;border-bottom:1px solid #090909;padding:32px;text-align:center;"><strong style="color:#090909;font-size:26px;font-weight:800;">Desk2Quant</strong><p style="color:#4a4a42;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;margin:5px 0 0;font-weight:700;">Exclusively For You</p></td></tr><tr><td style="padding:32px 28px 16px;"><p style="font-size:16px;color:#090909;margin:0 0 10px;">Hi <strong>${escapeHtml(customerName)}</strong>,</p><p style="font-size:14px;color:#44453f;line-height:1.7;margin:0 0 14px;">Thank you for ${triggerText}! To help you go further, here are resources selected to complement your journey.</p></td></tr><tr><td style="padding:0 28px 24px;"><div style="background:#ffca3a;border:1px solid #090909;box-shadow:4px 4px 0 #090909;padding:18px;text-align:center;"><span style="font-size:12px;color:#090909;font-weight:800;text-transform:uppercase;">Your Exclusive ${discountPct}% Coupon</span><div style="font-size:26px;font-weight:900;color:#090909;letter-spacing:2px;margin:8px 0;overflow-wrap:anywhere;">${escapeHtml(couponCode)}</div></div></td></tr><tr><td style="padding:0 28px 16px;background:#f7f7f3;"><h2 style="font-size:16px;color:#090909;font-weight:800;margin:20px 0 14px;">Recommended For You:</h2>${productCards}</td></tr><tr><td style="padding:20px 28px;text-align:center;"><a href="https://desk2quant.com" style="display:inline-block;background:#ffca3a;color:#090909;font-weight:800;text-decoration:none;padding:14px 28px;border:1px solid #090909;box-shadow:4px 4px 0 #090909;font-size:15px;">Visit Desk2Quant</a></td></tr><tr><td style="background:#f7f7f3;border-top:1px solid #090909;padding:20px;text-align:center;color:#666761;font-size:11px;">Desk2Quant © 2026 · <a href="https://desk2quant.com" style="color:#090909;font-weight:700;">desk2quant.com</a></td></tr></table></td></tr></table></body></html>`;

    const recNames = picks.map(p => `• ${p.name} — ₹${Math.round(p.price * 0.8)} (${discountPct}% off with ${couponCode})`).join('\n');
    const textContent = `Hi ${customerName},\n\nThank you for ${trigger === 'session_booking' ? 'booking your mentorship session' : `purchasing "${purchasedProductName}"`}!\n\nUse code ${couponCode} for ${discountPct}% OFF:\n\n${recNames}\n\nhttps://desk2quant.com\n\nSent by Desk2Quant`;

    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                to: [{ email: customerEmail, name: customerName }],
                subject: `${customerName}, here's an exclusive 20% off on our top quant resources`,
                htmlContent,
                textContent
            })
        });
        if (resp.ok) {
            const data = await resp.json();
            return { ok: true, messageId: data.messageId };
        }
        return { ok: false, error: `Brevo ${resp.status}: ${await resp.text()}` };
    } catch (err) {
        return { ok: false, error: `Brevo request threw: ${err.message}` };
    }
}
