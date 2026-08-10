// Bulk email sender: Latest 3 products to customers who haven't bought them
// Trigger: GET /api/send-latest-products?secret=YOUR_CRON_SECRET
// Test mode: GET /api/send-latest-products?secret=YOUR_CRON_SECRET&test_email=someone@example.com
// Sends the 3 most recently added products to every customer who hasn't purchased them

import { authorizeCronRequest } from '../lib/cronAuth.js';
import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth check — fails closed if CRON_SECRET is unset (see lib/cronAuth.js)
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    // Service role: RLS denies `anon` on products/purchases, so the old inline
    // anon-key fallback made this campaign silently mail nobody.
    if (blockIfUnconfigured(res, 'send-latest-products')) return;
    const SUPABASE_KEY = getServiceKey();
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    if (!BREVO_API_KEY) {
        return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
    }

    const results = { totalCustomers: 0, eligible: 0, sent: 0, skipped: 0, errors: 0, latestProducts: [], details: [] };

    try {
        // 1. Fetch latest 3 products (by created_at, excluding free products)
        const productsResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url,created_at&price=gt.0&order=created_at.desc&limit=3`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (!productsResponse.ok) {
            return res.status(500).json({ error: 'Failed to fetch products', detail: await productsResponse.text() });
        }

        const latestProducts = await productsResponse.json();

        if (latestProducts.length < 1) {
            return res.status(200).json({ error: 'No paid products found', sent: 0 });
        }

        results.latestProducts = latestProducts.map(p => p.name);
        const latestProductNames = new Set(latestProducts.map(p => (p.name || '').toLowerCase().trim()));
        console.log(`🆕 Latest ${latestProducts.length} products: ${latestProducts.map(p => p.name).join(', ')}`);

        // ── TEST MODE: send to single email and return ──
        const testEmail = req.query?.test_email;
        if (testEmail) {
            console.log(`🧪 TEST MODE — sending only to: ${testEmail}`);
            const productCardsHtml = buildProductCards(latestProducts);
            const productListText = latestProducts.map(p => `• ${p.name} — ₹${p.price} → https://desk2quant.com/product.html?id=${p.id}`).join('\n');
            const emailHtml = buildEmailHtml(productCardsHtml);
            const emailText = buildEmailText(productListText);

            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: testEmail }],
                    subject: `Update: New resources added to Desk2Quant`,
                    htmlContent: emailHtml,
                    textContent: emailText
                })
            });

            if (emailResponse.ok) {
                return res.status(200).json({ mode: 'test', sent: 1, testEmail, latestProducts: results.latestProducts });
            } else {
                const errData = await emailResponse.text();
                return res.status(500).json({ mode: 'test', sent: 0, testEmail, error: errData });
            }
        }

        // ── BULK MODE ──

        // 2. Fetch ALL purchases to find unique customers and what they've bought
        const purchasesResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases?select=customer_email,product_name&order=created_at.desc`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (!purchasesResponse.ok) {
            return res.status(500).json({ error: 'Failed to fetch purchases', detail: await purchasesResponse.text() });
        }

        const allPurchases = await purchasesResponse.json();

        // 3. Group purchases by customer email
        const customerMap = {};
        for (const p of allPurchases) {
            const email = (p.customer_email || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            if (!customerMap[email]) customerMap[email] = new Set();
            customerMap[email].add((p.product_name || '').toLowerCase().trim());
        }

        const uniqueCustomers = Object.entries(customerMap);
        results.totalCustomers = uniqueCustomers.length;
        console.log(`📧 Found ${uniqueCustomers.length} unique customers`);

        // 4. Filter: only customers who have NOT purchased ANY of the latest 3 products
        const eligibleCustomers = uniqueCustomers.filter(([email, purchasedSet]) => {
            for (const productName of latestProductNames) {
                if (purchasedSet.has(productName)) return false;
            }
            return true;
        });

        results.eligible = eligibleCustomers.length;
        console.log(`🎯 ${eligibleCustomers.length} customers haven't purchased any of the latest 3 products`);

        // 5. Build the product cards HTML (same for all emails)
        const productCardsHtml = buildProductCards(latestProducts);
        const productListText = latestProducts.map(p => `• ${p.name} — ₹${p.price} → https://desk2quant.com/product.html?id=${p.id}`).join('\n');

        // 6. Send to each eligible customer
        for (const [email] of eligibleCustomers) {
            try {
                const emailHtml = buildEmailHtml(productCardsHtml);
                const emailText = buildEmailText(productListText);

                const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': BREVO_API_KEY,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                        to: [{ email: email }],
                        subject: `Update: New resources added to Desk2Quant`,
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

                // Rate-limit: small delay between sends
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (err) {
                console.error(`❌ Error for ${email}:`, err.message);
                results.errors++;
                results.details.push({ email, status: 'error', error: err.message });
            }
        }

        console.log(`📧 Campaign complete: ${results.sent} sent, ${results.skipped} skipped, ${results.errors} errors`);
        return res.status(200).json(results);

    } catch (error) {
        console.error('Campaign error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ─── Catchy Email Template ─────────────────────────────────────────────────────

function buildEmailHtml(productCardsHtml) {
    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f7f7f3; padding:16px 0; margin:0;">
        <div style="max-width:620px; margin:0 auto; padding:0; border:1px solid #090909; border-radius:0; box-shadow:8px 8px 0 #090909; background:#ffffff;">

            <!-- Header -->
            <div style="background:#ffca3a; border-bottom:1px solid #090909; padding:40px 30px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border:1px solid #090909; border-radius:2px;"></td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#090909; letter-spacing:1px;">Desk2Quant</span></td></tr></table>
                <div style="font-size:13px; color:#4a4a42; letter-spacing:2px; text-transform:uppercase; font-weight:700;">New Arrivals</div>
            </div>

            <!-- Hero Banner -->
            <div style="background:#ffffff; border-bottom:1px solid #090909; padding:30px; text-align:center;">
                <div style="font-size:36px; margin-bottom:8px;">🚀</div>
                <h1 style="color:#090909; font-size:24px; font-weight:800; margin:0 0 10px 0; line-height:1.3;">Fresh Resources Just Dropped!</h1>
                <p style="color:#44453f; font-size:15px; margin:0; line-height:1.5;">We've added 3 powerful new resources to help you<br>crush your quant career. Don't let others get ahead!</p>
            </div>

            <!-- Body -->
            <div style="background:#ffffff; padding:30px;">
                <p style="font-size:16px; color:#090909; margin:0 0 8px 0;">Hi there 👋</p>
                <p style="font-size:15px; color:#44453f; margin:0 0 25px 0; line-height:1.6;">
                    We noticed you haven't checked out our <strong>latest additions</strong> yet.
                    These are flying off the shelves — here's what you're missing:
                </p>

                <!-- Product Cards -->
                ${productCardsHtml}

                <!-- Urgency CTA -->
                <div style="background:#ffca3a; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; text-align:center; margin-top:10px;">
                    <p style="font-size:15px; color:#090909; font-weight:800; margin:0 0 12px 0;">⏰ Don't wait — your peers are already leveling up!</p>
                    <a href="https://desk2quant.com/#products" style="display:inline-block; background:#090909; color:#ffffff; font-weight:800; text-decoration:none; padding:14px 36px; border:1px solid #090909; border-radius:0; font-size:16px; letter-spacing:0.3px; box-shadow:3px 3px 0 #0b7f79;">Browse All Products →</a>
                </div>
            </div>

            <!-- Footer -->
            <div style="background:#f7f7f3; border-top:1px solid #090909; padding:25px; text-align:center;">
                <p style="color:#666761; font-size:12px; margin:0 0 8px 0; line-height:1.6;">
                    You're receiving this because you previously purchased from Desk2Quant.<br>
                    Questions? Simply reply to this email.
                </p>
                <p style="margin:0;">
                    <a href="https://desk2quant.com" style="color:#090909; text-decoration:none; font-size:13px; font-weight:600;">desk2quant.com</a>
                </p>
            </div>

        </div>
    </div>`;
}

function buildEmailText(productListText) {
    return `🚀 Fresh Resources Just Dropped on Desk2Quant!

Hi there,

We noticed you haven't checked out our latest additions yet. These are flying off the shelves — here's what you're missing:

${productListText}

Don't wait — your peers are already leveling up!

Browse all products: https://desk2quant.com/#products

---
Sent by Desk2Quant • desk2quant.com
You're receiving this because you previously purchased from Desk2Quant.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function buildProductCards(products) {
    return products.map((p, idx) => {
        const desc = stripHtml(p.description || '').substring(0, 130);
        const coverImg = p.cover_image_url
            ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" style="width:100%; height:160px; object-fit:contain; border-radius:0; background:#f7f7f3; border-bottom:1px solid #090909;">`
            : '';
        const badges = ['🔥 Hot', '⭐ New', '💎 Premium'];
        return `
            <div style="background:#ffffff; border:1px solid #090909; border-radius:0; overflow:hidden; margin-bottom:20px; box-shadow:4px 4px 0 #090909;">
                ${coverImg}
                <div style="padding:20px;">
                    <div style="display:inline-block; background:#ffca3a; color:#090909; font-size:11px; font-weight:800; padding:3px 10px; border:1px solid #090909; border-radius:0; box-shadow:2px 2px 0 #090909; margin-bottom:10px; letter-spacing:0.5px;">${badges[idx] || '🆕 New'}</div>
                    <h3 style="margin:8px 0; font-size:17px; color:#090909; font-weight:700;">${escapeHtml(p.name)}</h3>
                    <p style="margin:0 0 16px 0; font-size:13px; color:#666761; line-height:1.6;">${desc}...</p>
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                        <span style="font-size:22px; font-weight:800; color:#090909;">₹${p.price}</span>
                        <a href="https://desk2quant.com/product.html?id=${p.id}" style="display:inline-block; background:#0b7f79; color:#ffffff; font-weight:800; text-decoration:none; padding:10px 24px; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; font-size:14px; letter-spacing:0.3px;">View Product →</a>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
