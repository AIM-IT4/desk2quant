// One-time bulk recommendation email sender
// Sends personalized product recommendations to all existing customers
// Trigger: GET /api/send-recommendations?secret=YOUR_CRON_SECRET
// Each customer gets 2 products they haven't bought (excluding complete bundle)

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth check
    const cronSecret = process.env.CRON_SECRET;
    const querySecret = req.query?.secret;
    if (cronSecret && querySecret !== cronSecret) {
        return res.status(401).json({ error: 'Unauthorized — add ?secret=YOUR_CRON_SECRET' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'desk2quant@gmail.com';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    if (!BREVO_API_KEY) {
        return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
    }

    const results = { totalCustomers: 0, sent: 0, skipped: 0, errors: 0, details: [] };

    try {
        // 1. Fetch ALL purchases to build per-customer purchase history
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

        // 2. Group by unique customer email
        const customerMap = {};
        for (const p of allPurchases) {
            const email = (p.customer_email || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            if (!customerMap[email]) customerMap[email] = new Set();
            customerMap[email].add((p.product_name || '').toLowerCase().trim());
        }

        let uniqueCustomers = Object.entries(customerMap);
        const testEmail = req.query?.test_email;
        if (testEmail) {
            uniqueCustomers = uniqueCustomers.filter(([email]) => email === testEmail.toLowerCase().trim());
            if (uniqueCustomers.length === 0) {
                uniqueCustomers = [[testEmail.toLowerCase().trim(), new Set()]];
            }
        }

        results.totalCustomers = uniqueCustomers.length;
        console.log(`📧 Found ${uniqueCustomers.length} unique customers with purchases`);

        // 3. Fetch all paid products (excluding complete bundle)
        const productsResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url&price=gt.0&order=price.desc`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        let allProducts = [];
        if (productsResponse.ok) {
            allProducts = await productsResponse.json();
        }

        // Exclude the complete bundle from recommendations
        const recommendableProducts = allProducts.filter(p => {
            const name = (p.name || '').toLowerCase();
            return !(name.includes('complete') && name.includes('bundle'));
        });

        console.log(`📦 ${recommendableProducts.length} products available for recommendation (bundle excluded)`);

        // 4. For each customer, pick 3 products they haven't bought and send
        for (const [email, purchasedSet] of uniqueCustomers) {
            try {
                // Filter out products the customer already owns
                const available = recommendableProducts.filter(p =>
                    !purchasedSet.has((p.name || '').toLowerCase().trim())
                );

                if (available.length < 2) {
                    console.log(`⏭️ ${email}: only ${available.length} unpurchased products, skipping`);
                    results.skipped++;
                    results.details.push({ email, status: 'skipped', reason: `only ${available.length} products left` });
                    continue;
                }

                // Pick 2: highest-value first
                const recommendations = available.slice(0, 2);

                // Get customer name from most recent purchase
                const nameEntry = allPurchases.find(p => (p.customer_email || '').toLowerCase().trim() === email);
                const customerName = 'there'; // We don't have names in purchases table easily

                // Get the most recent product they bought (for personalization)
                const recentProduct = allPurchases.find(p => (p.customer_email || '').toLowerCase().trim() === email);
                const recentProductName = recentProduct?.product_name || 'a Desk2Quant product';

                // Build email HTML
                const productCards = recommendations.map(p => {
                    const desc = stripHtml(p.description || '').substring(0, 120);
                    const coverImg = p.cover_image_url
                        ? `<img src="${p.cover_image_url}" alt="${escapeHtml(p.name)}" style="width:100%; height:140px; object-fit:contain; border-radius:4px; margin-bottom:12px; background:#f9f8f4;">`
                        : '';
                    return `
                        <div style="background:#ffffff; border:1px solid #e5e5e5; border-radius:8px; padding:20px; margin-bottom:16px;">
                            ${coverImg}
                            <h3 style="margin:0 0 8px 0; font-size:16px; color:#1a1a1a;">${escapeHtml(p.name)}</h3>
                            <p style="margin:0 0 12px 0; font-size:13px; color:#666; line-height:1.5;">${desc}...</p>
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span style="font-size:18px; font-weight:bold; color:#1a1a1a;">₹${p.price}</span>
                                <a href="https://desk2quant.vercel.app/product.html?id=${p.id}" style="display:inline-block; background:#6366f1; color:#ffffff; font-weight:600; text-decoration:none; padding:8px 20px; border-radius:6px; font-size:14px;">View Product</a>
                            </div>
                        </div>`;
                }).join('');

                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                                <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                            </div>
                            <div style="padding: 30px;">
                                <p style="font-size: 16px; margin-bottom: 8px;">Hi ${customerName},</p>
                                <p style="font-size: 15px; color: #444; margin-bottom: 25px; line-height: 1.6;">
                                    You recently purchased <strong>${escapeHtml(recentProductName)}</strong> from Desk2Quant.
                                    Here are 2 more resources that will accelerate your quant career:
                                </p>
                                ${productCards}
                                <div style="text-align:center; margin-top:25px;">
                                    <a href="https://desk2quant.vercel.app/#products" style="display:inline-block; background:#e95836; color:#ffffff; font-weight:bold; text-decoration:none; padding:14px 30px; border-radius:6px; font-size:16px;">Browse All Products</a>
                                </div>
                                <p style="font-size: 13px; color: #999; margin-top: 30px; text-align: center; line-height: 1.5;">
                                    You're receiving this because you previously purchased from Desk2Quant.<br>
                                    If you have any questions, simply reply to this email.
                                </p>
                            </div>
                            <div style="background-color: #1a1a1a; padding: 20px; text-align: center; color: #888; font-size: 12px;">
                                <p style="margin: 0;">Sent by Desk2Quant • <a href="https://desk2quant.vercel.app" style="color:#6366f1; text-decoration:none;">desk2quant.vercel.app</a></p>
                            </div>
                        </div>
                    </div>`;

                const recNames = recommendations.map(p => `• ${p.name} — ₹${p.price}`).join('\n');
                const emailText = `Hi ${customerName},\n\nYou recently purchased "${recentProductName}" from Desk2Quant.\n\nHere are 2 more resources you might like:\n\n${recNames}\n\nBrowse all: https://desk2quant.vercel.app/#products\n\nSent by Desk2Quant`;

                // Send via Brevo
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
                        subject: `Recommended for you: Top quant resources you haven't explored yet`,
                        htmlContent: emailHtml,
                        textContent: emailText
                    })
                });

                if (emailResponse.ok) {
                    console.log(`✅ Sent to ${email} — recommended: ${recommendations.map(r => r.name).join(', ')}`);
                    results.sent++;
                    results.details.push({ email, status: 'sent', products: recommendations.map(r => r.name) });
                } else {
                    const errData = await emailResponse.text();
                    console.error(`❌ Failed for ${email}:`, errData);
                    results.errors++;
                    results.details.push({ email, status: 'error', error: errData });
                }

                // Small delay between sends to respect Brevo rate limits (300/day free tier)
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (err) {
                console.error(`❌ Error for ${email}:`, err.message);
                results.errors++;
                results.details.push({ email, status: 'error', error: err.message });
            }
        }

        console.log(`📧 Bulk send complete: ${results.sent} sent, ${results.skipped} skipped, ${results.errors} errors`);
        return res.status(200).json(results);

    } catch (error) {
        console.error('Bulk send error:', error);
        return res.status(500).json({ error: error.message });
    }
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
