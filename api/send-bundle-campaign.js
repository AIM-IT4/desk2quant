// Bundle Campaign Email: Complete Front Office & Risk Quant Bundle → past
// customers who have NOT bought it yet.
//
// WHY BUNDLE-TARGETED: the Complete Bundle is the highest-margin product
// (₹7,999 → 20% off with COMBINED20 = ₹6,399, ~11x the average order). Past
// customers already trust the site, so converting them to the bundle is the
// cheapest high-revenue campaign available. Buyers who already own the bundle
// are excluded (no point pitching them their own product).
//
// Coupon: COMBINED20 — already valid end-to-end (product coupon_code is
// COMBINED10 and both lib/pricing.js and the frontend cart/modal resolve the
// `<code>10` → `<code>20` campaign pattern, verified server-side 20%).
//
// Trigger modes (all guarded by CRON_SECRET via lib/cronAuth.js — fails closed):
//   dry_run: GET  /api/send-bundle-campaign?secret=SECRET&dry_run=true
//   test:    GET  /api/send-bundle-campaign?secret=SECRET&test_email=someone@example.com
//   bulk:    GET  /api/send-bundle-campaign?secret=SECRET
//
// Anti-spam: shares hasRecentRecommendation suppression with the post-purchase
// queue and the other promo senders, so a customer who just got a
// recommendation email is skipped.

import { authorizeCronRequest } from '../lib/cronAuth.js';
import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';
import { hasRecentRecommendation } from '../lib/recommendationQueue.js';

const BUNDLE_PRODUCT_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';
const CAMPAIGN_CODE = 'COMBINED20';
const CAMPAIGN_PERCENT = 20;

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    if (blockIfUnconfigured(res, 'send-bundle-campaign')) return;
    const SUPABASE_KEY = getServiceKey();
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    const isDryRun = req.query?.dry_run === 'true';
    const testEmail = req.query?.test_email;

    if (!isDryRun && !BREVO_API_KEY) {
        return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
    }

    const results = {
        mode: isDryRun ? 'dry_run' : (testEmail ? 'test' : 'bulk'),
        campaign: { code: CAMPAIGN_CODE, percent: CAMPAIGN_PERCENT },
        product: null,
        totalCustomers: 0,
        bundleOwnersExcluded: 0,
        wouldSend: 0,
        sent: 0,
        skipped: 0,
        errors: 0,
        details: []
    };

    try {
        // ── 1. Load the bundle product (single source of truth for the email) ─
        const productResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/products?id=eq.${BUNDLE_PRODUCT_ID}&select=id,name,description,price,original_price,cover_image_url`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (!productResponse.ok) {
            return res.status(500).json({ error: 'Failed to fetch bundle product', detail: await productResponse.text() });
        }
        const products = await productResponse.json();
        if (!products || products.length === 0) {
            return res.status(200).json({ error: 'Bundle product not found', sent: 0 });
        }
        const product = products[0];
        results.product = { id: product.id, name: product.name, price: product.price };
        console.log(`📦 Bundle campaign: "${product.name}" — ₹${product.price} (${CAMPAIGN_CODE} ${CAMPAIGN_PERCENT}%)`);

        // ── 2. Segment customers: everyone vs. existing bundle owners ────────
        const purchasesResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases?select=customer_email,product_name&order=created_at.desc`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (!purchasesResponse.ok) {
            return res.status(500).json({ error: 'Failed to fetch purchases', detail: await purchasesResponse.text() });
        }
        const allPurchases = await purchasesResponse.json();

        const customerMap = {};
        for (const p of allPurchases) {
            const email = (p.customer_email || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            if (!customerMap[email]) customerMap[email] = { hasBundle: false };
            if (p.product_name && /complete front office|quant pro bundle/i.test(p.product_name)) {
                customerMap[email].hasBundle = true;
            }
        }

        const uniqueEmails = Object.keys(customerMap);
        results.totalCustomers = uniqueEmails.length;
        results.bundleOwnersExcluded = uniqueEmails.filter((e) => customerMap[e].hasBundle).length;
        console.log(`📧 ${uniqueEmails.length} unique customers, ${results.bundleOwnersExcluded} already own the bundle (excluded)`);

        // ── 3. TEST MODE ─────────────────────────────────────────────────────
        if (testEmail) {
            const emailHtml = buildBundleEmail(product, CAMPAIGN_CODE, CAMPAIGN_PERCENT);
            const emailText = buildBundleText(product, CAMPAIGN_CODE, CAMPAIGN_PERCENT);
            const subject = `🎯 Your Desk2Quant Bundle Offer: ${CAMPAIGN_PERCENT}% OFF the Complete Bundle`;

            if (isDryRun) {
                results.details.push({ email: testEmail, status: 'would_send', code: CAMPAIGN_CODE });
                results.wouldSend = 1;
                return res.status(200).json(results);
            }

            console.log(`🧪 TEST MODE — sending only to ${testEmail}`);
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: testEmail }],
                    subject,
                    htmlContent: emailHtml,
                    textContent: emailText
                })
            });
            if (emailResponse.ok) {
                return res.status(200).json({ mode: 'test', sent: 1, testEmail, product: results.product });
            }
            const errData = await emailResponse.text();
            return res.status(500).json({ mode: 'test', sent: 0, testEmail, error: errData });
        }

        // ── 4. DRY RUN ───────────────────────────────────────────────────────
        if (isDryRun) {
            for (const email of uniqueEmails) {
                if (customerMap[email].hasBundle) continue;
                results.details.push({ email, status: 'would_send', code: CAMPAIGN_CODE });
                results.wouldSend++;
            }
            console.log(`🏃 DRY RUN — would email ${results.wouldSend} non-owners`);
            return res.status(200).json(results);
        }

        // ── 5. BULK SEND ─────────────────────────────────────────────────────
        const emailHtml = buildBundleEmail(product, CAMPAIGN_CODE, CAMPAIGN_PERCENT);
        const emailText = buildBundleText(product, CAMPAIGN_CODE, CAMPAIGN_PERCENT);
        const subject = `🎯 Your Desk2Quant Bundle Offer: ${CAMPAIGN_PERCENT}% OFF the Complete Bundle`;

        for (const email of uniqueEmails) {
            if (customerMap[email].hasBundle) continue; // never pitch owners their own product

            try {
                // Anti-spam: shared suppression with the post-purchase queue.
                if (await hasRecentRecommendation({ customerEmail: email, SUPABASE_URL, SUPABASE_KEY })) {
                    results.skipped++;
                    results.details.push({ email, status: 'skipped', reason: 'recent recommendation email already sent' });
                    continue;
                }

                const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                    body: JSON.stringify({
                        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                        to: [{ email }],
                        subject,
                        htmlContent: emailHtml,
                        textContent: emailText
                    })
                });

                if (emailResponse.ok) {
                    console.log(`✅ Sent to ${email}`);
                    results.sent++;
                    results.details.push({ email, status: 'sent' });
                } else {
                    const errData = await emailResponse.text();
                    console.error(`❌ Failed for ${email}:`, errData);
                    results.errors++;
                    results.details.push({ email, status: 'error', error: errData });
                }

                // Rate-limit between sends
                await new Promise((resolve) => setTimeout(resolve, 250));
            } catch (err) {
                console.error(`❌ Error for ${email}:`, err.message);
                results.errors++;
                results.details.push({ email, status: 'error', error: err.message });
            }
        }

        console.log(`📧 Bundle campaign complete: sent=${results.sent}, skipped=${results.skipped}, errors=${results.errors}`);
        return res.status(200).json(results);
    } catch (error) {
        console.error('Bundle campaign error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE — Bundle offer (neobrutalist brand, matches send-promo-latest.js)
// ═══════════════════════════════════════════════════════════════════════════════

function buildBundleEmail(product, code, percent) {
    const coverImg = product.cover_image_url
        ? `<img src="${product.cover_image_url}" alt="${escapeHtml(product.name)}" style="width:100%; max-height:320px; object-fit:contain; border-radius:0; background:#f7f7f3; border:1px solid #090909; margin-bottom:20px;">`
        : '';

    const desc = stripHtml(product.description || '').substring(0, 220);
    const bundleUrl = 'https://desk2quant.com/product.html?id=' + BUNDLE_PRODUCT_ID;
    const original = Number(product.original_price) || 0;
    const price = Number(product.price) || 0;
    const discounted = Math.round(price * (100 - percent) / 100);

    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f7f7f3; padding:16px 0; margin:0;">
        <div style="max-width:620px; margin:0 auto; padding:0; border:1px solid #090909; border-radius:0; box-shadow:8px 8px 0 #090909; background:#ffffff;">

            <div style="background:#ffca3a; border-bottom:1px solid #090909; padding:40px 30px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border:1px solid #090909; border-radius:2px;"></td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#090909; letter-spacing:1px;">Desk2Quant</span></td></tr></table>
                <div style="font-size:13px; color:#4a4a42; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Exclusive Customer Offer 🎯</div>
            </div>

            <div style="background:#ffffff; border-bottom:1px solid #090909; padding:35px 30px; text-align:center;">
                <div style="font-size:44px; margin-bottom:10px;">📚</div>
                <h1 style="color:#090909; font-size:26px; font-weight:800; margin:0 0 10px 0; line-height:1.3;">You asked for the complete library.<br>Here it is — at ${percent}% off.</h1>
                <p style="color:#44453f; font-size:15px; margin:0; line-height:1.5;">Everything you've bought so far is part of a much bigger picture. The Complete Bundle pulls it all together — ${desc}...</p>
            </div>

            <div style="background:#ffffff; padding:30px;">
                <p style="font-size:16px; color:#090909; margin:0 0 8px 0;">Hi there 👋</p>
                <p style="font-size:15px; color:#44453f; margin:0 0 25px 0; line-height:1.6;">
                    As a Desk2Quant customer, you get an exclusive <strong>${percent}% off</strong> our most
                    comprehensive resource — <strong>41+ high-quality PDFs &amp; 60+ scripts</strong> organized
                    into module packs, from derivatives pricing to model validation, interview playbooks,
                    and production-grade code.
                </p>

                <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; overflow:hidden; margin-bottom:25px;">
                    <div style="padding:24px; text-align:center;">
                        ${coverImg}
                        <div style="display:inline-block; background:#ffca3a; color:#090909; font-size:11px; font-weight:800; padding:5px 14px; border:1px solid #090909; border-radius:0; margin-bottom:14px; letter-spacing:1px; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Complete Bundle</div>
                        <h2 style="margin:10px 0; font-size:22px; color:#090909; font-weight:800; line-height:1.3;">${escapeHtml(product.name)}</h2>

                        <div style="margin:16px 0; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
                            ${original > price ? `<span style="font-size:18px; color:#999; text-decoration:line-through; margin-right:10px;">₹${original}</span>` : ''}
                            <span style="font-size:18px; color:#999; text-decoration:line-through; margin-right:10px;">₹${price}</span>
                            <span style="font-size:32px; font-weight:800; color:#d73f3f;">₹${discounted}</span>
                            <span style="display:inline-block; background:#0b7f79; color:#ffffff; font-size:13px; font-weight:800; padding:4px 12px; border:1px solid #090909; border-radius:0; margin-left:10px; box-shadow:2px 2px 0 #090909;">SAVE ${percent}%</span>
                        </div>

                        <a href="${bundleUrl}" style="display:inline-block; background:#0b7f79; color:#ffffff; font-weight:800; text-decoration:none; padding:14px 40px; border:1px solid #090909; border-radius:0; font-size:16px; letter-spacing:0.3px; margin-top:8px; box-shadow:3px 3px 0 #090909;">
                            🛒 Get the Bundle →</a>
                    </div>
                </div>

                <div style="background:#ffca3a; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:24px; text-align:center; margin-bottom:25px; box-sizing:border-box;">
                    <span style="display:inline-block; background:#090909; color:#ffca3a; font-size:11px; font-weight:800; padding:4px 12px; border:1px solid #090909; border-radius:0; margin-bottom:10px; letter-spacing:1px; text-transform:uppercase;">🎟️ Exclusive Customer Coupon</span>
                    <h3 style="margin:0 0 6px 0; font-size:18px; color:#090909; font-weight:800;">Get ${percent}% OFF the Bundle</h3>
                    <p style="margin:0 0 16px 0; font-size:14px; color:#7f1d1d; line-height:1.4;">Enter this code at checkout:</p>
                    <div style="display:inline-block; max-width:100%; background:#ffffff; border:1px solid #090909; color:#090909; font-family:monospace; font-size:22px; font-weight:800; padding:10px 20px; border-radius:0; letter-spacing:1px; box-shadow:2px 2px 0 #090909; overflow-wrap:anywhere; word-break:break-all;">${code}</div>
                </div>

                <div style="background:#fff3c4; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; padding:20px; margin-bottom:20px;">
                    <h3 style="margin:0 0 12px 0; font-size:16px; color:#090909; font-weight:700;">What's inside:</h3>
                    <table style="width:100%; border:none;">
                        <tr><td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top; width:28px;">✅</td><td style="padding:6px 0; font-size:14px; color:#78350f;">41+ high-quality PDFs across pricing, models, risk, and interviews</td></tr>
                        <tr><td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td><td style="padding:6px 0; font-size:14px; color:#78350f;">60+ production-style scripts, notebooks &amp; templates</td></tr>
                        <tr><td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td><td style="padding:6px 0; font-size:14px; color:#78350f;">Module ZIPs — pick a track, study, then convert it to interview answers</td></tr>
                        <tr><td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td><td style="padding:6px 0; font-size:14px; color:#78350f;">Lifetime access with free future updates</td></tr>
                    </table>
                </div>

                <div style="text-align:center; margin-top:20px;">
                    <a href="https://desk2quant.com/#products" style="display:inline-block; background:#090909; color:#ffffff; font-weight:800; text-decoration:none; padding:12px 32px; border:1px solid #090909; border-radius:0; font-size:14px; letter-spacing:0.3px; box-shadow:3px 3px 0 #0b7f79;">Browse All Products →</a>
                </div>
            </div>

            <div style="background:#f7f7f3; border-top:1px solid #090909; padding:25px; text-align:center;">
                <p style="color:#666761; font-size:12px; margin:0 0 8px 0; line-height:1.6;">
                    You're receiving this because you previously purchased from Desk2Quant.<br>
                    Questions? Simply reply to this email.
                </p>
                <p style="margin:0;"><a href="https://desk2quant.com" style="color:#090909; text-decoration:none; font-size:13px; font-weight:600;">desk2quant.com</a></p>
            </div>
        </div>
    </div>`;
}

function buildBundleText(product, code, percent) {
    const original = Number(product.original_price) || 0;
    const price = Number(product.price) || 0;
    const discounted = Math.round(price * (100 - percent) / 100);
    const bundleUrl = 'https://desk2quant.com/product.html?id=' + BUNDLE_PRODUCT_ID;
    const desc = stripHtml(product.description || '').substring(0, 200);

    return `🎯 Your Desk2Quant Bundle Offer: ${percent}% OFF the Complete Bundle

Hi there,

As a Desk2Quant customer, you get an exclusive ${percent}% off our most comprehensive resource:

📚 ${product.name}
💰 ₹${discounted} (was ₹${price}${original > price ? `, value ₹${original}` : ''})
${desc}...

✅ 41+ high-quality PDFs across pricing, models, risk, and interviews
✅ 60+ production-style scripts, notebooks & templates
✅ Module ZIPs — pick a track, study, then convert it to interview answers
✅ Lifetime access with free future updates

🎟️ YOUR EXCLUSIVE COUPON: ${code} (${percent}% OFF at checkout!)

🛒 Get it now: ${bundleUrl}

Browse all products: https://desk2quant.com/#products

---
Sent by Desk2Quant • desk2quant.com
You're receiving this because you previously purchased from Desk2Quant.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
