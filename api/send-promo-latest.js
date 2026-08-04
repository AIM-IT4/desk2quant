// Promotional Email: Latest Digital Product → All Customers
// Fetches the single most recently added paid product from Supabase
// and sends a polished promotional email to EVERY customer.
//
// Trigger modes:
//   dry_run:    GET /api/send-promo-latest?secret=SECRET&dry_run=true
//   test:       GET /api/send-promo-latest?secret=SECRET&test_email=someone@example.com
//   bulk send:  GET /api/send-promo-latest?secret=SECRET

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
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

    const isDryRun = req.query?.dry_run === 'true';
    const testEmail = req.query?.test_email;

    if (!isDryRun && !BREVO_API_KEY) {
        return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
    }

    const results = {
        mode: isDryRun ? 'dry_run' : (testEmail ? 'test' : 'bulk'),
        product: null,
        totalCustomers: 0,
        sent: 0,
        skipped: 0,
        errors: 0,
        details: []
    };

    try {
        // ── 1. Fetch the MOST RECENT paid product ───────────────────────────
        const productResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,original_price,cover_image_url,created_at&price=gt.0&order=created_at.desc&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (!productResponse.ok) {
            return res.status(500).json({ error: 'Failed to fetch products', detail: await productResponse.text() });
        }

        const products = await productResponse.json();
        if (!products || products.length === 0) {
            return res.status(200).json({ error: 'No paid products found', sent: 0 });
        }

        const product = products[0];
        results.product = {
            id: product.id,
            name: product.name,
            price: product.price,
            created_at: product.created_at
        };

        console.log(`🆕 Latest product: "${product.name}" — ₹${product.price}`);

        // ── 2. Fetch ALL unique customer emails from purchases ──────────────
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

        // Map emails to check if they purchased the complete bundle (ID: 164308cd-e3cd-4026-8fdc-337a5955ffff)
        const customerMap = {};
        for (const p of allPurchases) {
            const email = (p.customer_email || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            if (!customerMap[email]) {
                customerMap[email] = { hasBundle: false };
            }
            if (p.product_name && p.product_name.toLowerCase().includes('complete front office')) {
                customerMap[email].hasBundle = true;
            }
        }

        const uniqueEmails = Object.keys(customerMap);
        results.totalCustomers = uniqueEmails.length;
        console.log(`📧 Found ${uniqueEmails.length} unique customers to email`);

        const emailSubject = `🚀 Just Launched: ${product.name} — Get It Before Everyone Else!`;

        // ── 4. Handle TEST MODE ─────────────────────────────────────────────
        if (testEmail) {
            const testHasBundle = req.query?.test_bundle === 'true';
            const testCode = testHasBundle ? 'BUNDLE15' : 'NM10';
            const testPercent = testHasBundle ? 15 : 10;
            
            const emailHtml = buildPromoEmail(product, testCode, testPercent);
            const emailText = buildPromoText(product, testCode, testPercent);

            if (isDryRun) {
                results.details.push({ email: testEmail, status: 'would_send', code: testCode, percent: testPercent });
                results.sent = 1;
                return res.status(200).json(results);
            }

            console.log(`🧪 TEST MODE — sending only to: ${testEmail} (Code: ${testCode}, Percent: ${testPercent})`);
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
                    subject: emailSubject,
                    htmlContent: emailHtml,
                    textContent: emailText
                })
            });

            if (emailResponse.ok) {
                return res.status(200).json({ mode: 'test', sent: 1, testEmail, product: results.product });
            } else {
                const errData = await emailResponse.text();
                return res.status(500).json({ mode: 'test', sent: 0, testEmail, error: errData });
            }
        }

        // ── 5. Handle DRY RUN ───────────────────────────────────────────────
        if (isDryRun) {
            for (const email of uniqueEmails) {
                const hasBundle = customerMap[email].hasBundle;
                const code = hasBundle ? 'BUNDLE15' : 'NM10';
                const percent = hasBundle ? 15 : 10;
                results.details.push({ email, status: 'would_send', code, percent });
            }
            results.sent = uniqueEmails.length;
            console.log(`🏃 DRY RUN complete — would send to ${uniqueEmails.length} customers`);
            return res.status(200).json(results);
        }

        // ── 6. BULK SEND ────────────────────────────────────────────────────
        for (const email of uniqueEmails) {
            try {
                const hasBundle = customerMap[email].hasBundle;
                const discountCode = hasBundle ? 'BUNDLE15' : 'NM10';
                const discountPercent = hasBundle ? 15 : 10;
                
                const emailHtml = buildPromoEmail(product, discountCode, discountPercent);
                const emailText = buildPromoText(product, discountCode, discountPercent);

                const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': BREVO_API_KEY,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                        to: [{ email }],
                        subject: emailSubject,
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
                await new Promise(resolve => setTimeout(resolve, 250));

            } catch (err) {
                console.error(`❌ Error for ${email}:`, err.message);
                results.errors++;
                results.details.push({ email, status: 'error', error: err.message });
            }
        }

        console.log(`📧 Promo campaign complete: sent=${results.sent}, errors=${results.errors}`);
        return res.status(200).json(results);

    } catch (error) {
        console.error('Campaign error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE — Premium Promotional Design
// ═══════════════════════════════════════════════════════════════════════════════

function buildPromoEmail(product, discountCode, discountPercent) {
    const coverImg = product.cover_image_url
        ? `<img src="${product.cover_image_url}" alt="${escapeHtml(product.name)}" style="width:100%; max-height:320px; object-fit:contain; border-radius:12px; background:#f4f1ec; margin-bottom:20px;">`
        : '';

    const desc = stripHtml(product.description || '').substring(0, 200);

    let priceHtml = `<span style="font-size:32px; font-weight:800; color:#1a1a1a;">₹${product.price}</span>`;
    if (product.original_price && product.original_price > product.price) {
        const savings = product.original_price - product.price;
        const discountPct = Math.round((savings / product.original_price) * 100);
        priceHtml = `
            <span style="font-size:18px; color:#999; text-decoration:line-through; margin-right:10px;">₹${product.original_price}</span>
            <span style="font-size:32px; font-weight:800; color:#dc2626;">₹${product.price}</span>
            <span style="display:inline-block; background:#dcfce7; color:#16a34a; font-size:13px; font-weight:700; padding:4px 12px; border-radius:20px; margin-left:10px;">SAVE ${discountPct}%</span>`;
    }

    const productUrl = `https://desk2quant.com/product.html?id=${product.id}`;

    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f4f1ec; padding:0; margin:0;">
        <div style="max-width:620px; margin:0 auto; padding:20px;">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); border-radius:16px 16px 0 0; padding:40px 30px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border-radius:11px;"></td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:1px;">Desk2Quant</span></td></tr></table>
                <div style="font-size:13px; color:#a0aec0; letter-spacing:2px; text-transform:uppercase;">Just Launched 🚀</div>
            </div>

            <!-- Hero Banner -->
            <div style="background:linear-gradient(135deg,#7c3aed,#6366f1,#3b82f6); padding:35px 30px; text-align:center;">
                <div style="font-size:44px; margin-bottom:10px;">✨</div>
                <h1 style="color:#ffffff; font-size:26px; font-weight:800; margin:0 0 10px 0; line-height:1.3;">Brand New Resource Alert!</h1>
                <p style="color:#ddd6fe; font-size:15px; margin:0; line-height:1.5;">We just dropped something incredible.<br>Be one of the first to grab it!</p>
            </div>

            <!-- Body -->
            <div style="background:#ffffff; padding:30px; border-left:1px solid #eee; border-right:1px solid #eee;">
                <p style="font-size:16px; color:#333; margin:0 0 8px 0;">Hi there 👋</p>
                <p style="font-size:15px; color:#555; margin:0 0 25px 0; line-height:1.6;">
                    We're thrilled to announce the launch of our <strong>newest digital resource</strong> — crafted to take your quant skills to the next level.
                </p>

                <!-- Product Showcase Card -->
                <div style="background:linear-gradient(135deg,#fafafa,#f5f3ff); border-radius:16px; overflow:hidden; border:2px solid #e5e7eb; margin-bottom:25px;">
                    <div style="padding:24px; text-align:center;">
                        ${coverImg}
                        <div style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#6366f1); color:#fff; font-size:11px; font-weight:700; padding:5px 14px; border-radius:20px; margin-bottom:14px; letter-spacing:1px; text-transform:uppercase;">✨ Just Launched</div>
                        <h2 style="margin:10px 0; font-size:22px; color:#1a1a1a; font-weight:800; line-height:1.3;">${escapeHtml(product.name)}</h2>
                        <p style="margin:0 0 18px 0; font-size:14px; color:#666; line-height:1.6; max-width:480px; margin-left:auto; margin-right:auto;">${desc}...</p>

                        <!-- Price -->
                        <div style="margin:16px 0; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
                            ${priceHtml}
                        </div>

                        <!-- CTA Button -->
                        <a href="${productUrl}" style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#6366f1); color:#ffffff; font-weight:700; text-decoration:none; padding:14px 40px; border-radius:10px; font-size:16px; letter-spacing:0.3px; margin-top:8px; box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                            🛒 Get It Now →
                        </a>
                    </div>
                </div>

                <!-- Personalised Coupon Box -->
                <div style="background:#fef2f2; border:2px dashed #ef4444; border-radius:16px; padding:24px; text-align:center; margin-bottom:25px; box-sizing:border-box;">
                    <span style="display:inline-block; background:#fee2e2; color:#ef4444; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; margin-bottom:10px; letter-spacing:1px; text-transform:uppercase;">🎟️ Exclusive Offer</span>
                    <h3 style="margin:0 0 6px 0; font-size:18px; color:#991b1b; font-weight:800;">Get ${discountPercent}% OFF</h3>
                    <p style="margin:0 0 16px 0; font-size:14px; color:#7f1d1d; line-height:1.4;">Use your exclusive customer launch coupon at checkout:</p>
                    <div style="display:inline-block; background:#ffffff; border:2px solid #ef4444; color:#ef4444; font-family:monospace; font-size:22px; font-weight:800; padding:10px 32px; border-radius:8px; letter-spacing:2px; box-shadow:0 2px 8px rgba(239,68,68,0.1);">${discountCode}</div>
                </div>

                <!-- Why Buy Section -->
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:20px; margin-bottom:20px;">
                    <h3 style="margin:0 0 12px 0; font-size:16px; color:#92400e; font-weight:700;">Why you'll love this:</h3>
                    <table style="width:100%; border:none;">
                        <tr>
                            <td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top; width:28px;">✅</td>
                            <td style="padding:6px 0; font-size:14px; color:#78350f;">Written by IIT alumni & industry practitioners</td>
                        </tr>
                        <tr>
                            <td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td>
                            <td style="padding:6px 0; font-size:14px; color:#78350f;">Practical, interview-ready content — not just theory</td>
                        </tr>
                        <tr>
                            <td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td>
                            <td style="padding:6px 0; font-size:14px; color:#78350f;">Lifetime access with free future updates</td>
                        </tr>
                        <tr>
                            <td style="padding:6px 0; font-size:14px; color:#78350f; vertical-align:top;">✅</td>
                            <td style="padding:6px 0; font-size:14px; color:#78350f;">Trusted by 500+ aspiring quants worldwide</td>
                        </tr>
                    </table>
                </div>

                <!-- Urgency -->
                <div style="text-align:center; margin-bottom:10px;">
                    <p style="font-size:14px; color:#6b7280; margin:0;">
                        <em>Be among the first to get this resource — early buyers always get the best value!</em>
                    </p>
                </div>

                <!-- Secondary CTA -->
                <div style="text-align:center; margin-top:20px;">
                    <a href="https://desk2quant.com/#products" style="display:inline-block; background:linear-gradient(135deg,#ea580c,#f97316); color:#ffffff; font-weight:700; text-decoration:none; padding:12px 32px; border-radius:8px; font-size:14px; letter-spacing:0.3px;">Browse All Products →</a>
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

function buildPromoText(product, discountCode, discountPercent) {
    const desc = stripHtml(product.description || '').substring(0, 200);
    const productUrl = `https://desk2quant.com/product.html?id=${product.id}`;

    let priceText = `₹${product.price}`;
    if (product.original_price && product.original_price > product.price) {
        priceText = `₹${product.price} (was ₹${product.original_price})`;
    }

    return `🚀 Just Launched: ${product.name}

Hi there,

We're thrilled to announce the launch of our newest digital resource on Desk2Quant!

📘 ${product.name}
💰 Price: ${priceText}

${desc}...

✅ Written by IIT alumni & industry practitioners
✅ Practical, interview-ready content — not just theory
✅ Lifetime access with free future updates
✅ Trusted by 500+ aspiring quants worldwide

🎟️ YOUR LAUNCH DISCOUNT COUPON: ${discountCode} (${discountPercent}% OFF at checkout!)

🛒 Get it now: ${productUrl}

Be among the first to get this resource — early buyers always get the best value!

Browse all products: https://desk2quant.com/#products

---
Sent by Desk2Quant • desk2quant.com
You're receiving this because you previously purchased from Desk2Quant.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
