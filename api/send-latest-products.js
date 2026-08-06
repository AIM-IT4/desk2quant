// Bulk email sender: Latest 3 products to customers who haven't bought them
// Trigger: GET /api/send-latest-products?secret=YOUR_CRON_SECRET
// Test mode: GET /api/send-latest-products?secret=YOUR_CRON_SECRET&test_email=someone@example.com
// Sends the 3 most recently added products to every customer who hasn't purchased them

import { authorizeCronRequest } from '../lib/cronAuth.js';

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
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';
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
    <div style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f4f1ec; padding:0; margin:0;">
        <div style="max-width:620px; margin:0 auto; padding:20px;">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); border-radius:16px 16px 0 0; padding:40px 30px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border-radius:11px;"></td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:1px;">Desk2Quant</span></td></tr></table>
                <div style="font-size:13px; color:#a0aec0; letter-spacing:2px; text-transform:uppercase;">New Arrivals</div>
            </div>

            <!-- Hero Banner -->
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7); padding:30px; text-align:center;">
                <div style="font-size:36px; margin-bottom:8px;">🚀</div>
                <h1 style="color:#ffffff; font-size:24px; font-weight:800; margin:0 0 10px 0; line-height:1.3;">Fresh Resources Just Dropped!</h1>
                <p style="color:#e0d4ff; font-size:15px; margin:0; line-height:1.5;">We've added 3 powerful new resources to help you<br>crush your quant career. Don't let others get ahead!</p>
            </div>

            <!-- Body -->
            <div style="background:#ffffff; padding:30px; border-left:1px solid #eee; border-right:1px solid #eee;">
                <p style="font-size:16px; color:#333; margin:0 0 8px 0;">Hi there 👋</p>
                <p style="font-size:15px; color:#555; margin:0 0 25px 0; line-height:1.6;">
                    We noticed you haven't checked out our <strong>latest additions</strong> yet.
                    These are flying off the shelves — here's what you're missing:
                </p>

                <!-- Product Cards -->
                ${productCardsHtml}

                <!-- Urgency CTA -->
                <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5); border:2px dashed #f97316; border-radius:12px; padding:20px; text-align:center; margin-top:10px;">
                    <p style="font-size:15px; color:#c2410c; font-weight:700; margin:0 0 12px 0;">⏰ Don't wait — your peers are already leveling up!</p>
                    <a href="https://desk2quant.com/#products" style="display:inline-block; background:linear-gradient(135deg,#ea580c,#f97316); color:#ffffff; font-weight:700; text-decoration:none; padding:14px 36px; border-radius:8px; font-size:16px; letter-spacing:0.3px;">Browse All Products →</a>
                </div>
            </div>

            <!-- Footer -->
            <div style="background:#1a1a2e; border-radius:0 0 16px 16px; padding:25px; text-align:center;">
                <p style="color:#888; font-size:12px; margin:0 0 8px 0; line-height:1.6;">
                    You're receiving this because you previously purchased from Desk2Quant.<br>
                    Questions? Simply reply to this email.
                </p>
                <p style="margin:0;">
                    <a href="https://desk2quant.com" style="color:#818cf8; text-decoration:none; font-size:13px; font-weight:600;">desk2quant.com</a>
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
            ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" style="width:100%; height:160px; object-fit:contain; border-radius:8px 8px 0 0; background:#f4f1ec;">`
            : '';
        const badges = ['🔥 Hot', '⭐ New', '💎 Premium'];
        return `
            <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 2px 12px rgba(0,0,0,0.08); border:1px solid #eee;">
                ${coverImg}
                <div style="padding:20px;">
                    <div style="display:inline-block; background:linear-gradient(135deg,#ff6b35,#f7c948); color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; margin-bottom:10px; letter-spacing:0.5px;">${badges[idx] || '🆕 New'}</div>
                    <h3 style="margin:8px 0; font-size:17px; color:#1a1a1a; font-weight:700;">${escapeHtml(p.name)}</h3>
                    <p style="margin:0 0 16px 0; font-size:13px; color:#666; line-height:1.6;">${desc}...</p>
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                        <span style="font-size:22px; font-weight:800; color:#1a1a1a;">₹${p.price}</span>
                        <a href="https://desk2quant.com/product.html?id=${p.id}" style="display:inline-block; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#ffffff; font-weight:700; text-decoration:none; padding:10px 24px; border-radius:8px; font-size:14px; letter-spacing:0.3px;">View Product →</a>
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
