// Single-Buyer Re-engagement Campaign
// Finds customers who bought exactly 1 product and sends them
// 3 similar product recommendations with exclusive 20% discount codes.
//
// Trigger modes:
//   dry_run:    GET /api/send-single-buyer-offers?secret=SECRET&dry_run=true
//   test:       GET /api/send-single-buyer-offers?secret=SECRET&test_email=someone@example.com
//   bulk send:  GET /api/send-single-buyer-offers?secret=SECRET

import { authorizeCronRequest } from '../lib/cronAuth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    // Fails closed if CRON_SECRET is unset (see lib/cronAuth.js)
    const auth = authorizeCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
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

    // ── Coupon expiry: 7 days from now ──────────────────────────────────────
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiryStr = expiryDate.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const results = {
        mode: isDryRun ? 'dry_run' : (testEmail ? 'test' : 'bulk'),
        totalCustomers: 0,
        singleBuyerCount: 0,
        sent: 0,
        skipped: 0,
        errors: 0,
        excludedCompleteBundleOnlyBuyers: 0,
        couponExpiryDate: expiryStr,
        details: []
    };

    try {
        // ── 1. Fetch ALL purchases ──────────────────────────────────────────
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

        // ── 2. Group by customer email ──────────────────────────────────────
        const customerMap = {};
        for (const p of allPurchases) {
            const email = (p.customer_email || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            if (!customerMap[email]) customerMap[email] = new Set();
            customerMap[email].add((p.product_name || '').toLowerCase().trim());
        }

        const allCustomers = Object.entries(customerMap);
        results.totalCustomers = allCustomers.length;

        // ── 3. Filter: only customers who bought EXACTLY 1 unique product ───
        const singleBuyers = allCustomers.filter(([, products]) => products.size === 1);
        const eligibleSingleBuyers = singleBuyers.filter(([, products]) => {
            const onlyProductName = [...products][0] || '';
            return !isCompleteBundleProduct(onlyProductName);
        });
        results.excludedCompleteBundleOnlyBuyers = singleBuyers.length - eligibleSingleBuyers.length;
        results.singleBuyerCount = eligibleSingleBuyers.length;
        console.log(`🎯 Found ${eligibleSingleBuyers.length} eligible single-product buyers out of ${allCustomers.length} total customers (${results.excludedCompleteBundleOnlyBuyers} complete-bundle-only buyers excluded)`);

        // ── 4. Fetch all paid products ──────────────────────────────────────
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

        // Exclude the Complete Bundle from recommendations
        const recommendableProducts = allProducts.filter(p => {
            return !isCompleteBundleProduct(p.name);
        });

        console.log(`📦 ${recommendableProducts.length} recommendable products (bundle excluded)`);

        // ── 5. For each single-buyer, build recommendations & send ──────────
        for (const [email, purchasedSet] of eligibleSingleBuyers) {
            try {
                const purchasedProductName = [...purchasedSet][0]; // The one product they bought

                // Find the full product object that matches
                const purchasedProduct = allProducts.find(p =>
                    (p.name || '').toLowerCase().trim() === purchasedProductName
                );

                const purchasedDisplayName = purchasedProduct?.name || purchasedProductName;

                // Get category of what they bought
                const purchasedCategory = getProductCategory(purchasedProductName);

                // Pick 3 similar products they haven't bought
                const recommendations = getRecommendations(
                    purchasedProductName,
                    purchasedCategory,
                    recommendableProducts,
                    purchasedSet
                );

                if (recommendations.length < 1) {
                    console.log(`⏭️ ${email}: no recommendations available, skipping`);
                    results.skipped++;
                    results.details.push({ email, purchasedProduct: purchasedDisplayName, status: 'skipped', reason: 'no recommendations' });
                    continue;
                }

                // Build recommendation details with 20% codes
                const recDetails = recommendations.map(p => ({
                    name: p.name,
                    price: p.price,
                    discountedPrice: Math.round(p.price * 0.8),
                    couponCode: getCouponCode20(p.name),
                    id: p.id,
                    coverImage: p.cover_image_url
                }));

                if (isDryRun) {
                    results.details.push({
                        email,
                        purchasedProduct: purchasedDisplayName,
                        purchasedCategory,
                        status: 'would_send',
                        recommendations: recDetails.map(r => ({
                            name: r.name,
                            originalPrice: `₹${r.price}`,
                            discountedPrice: `₹${r.discountedPrice}`,
                            couponCode: r.couponCode
                        }))
                    });
                    results.sent++;
                    continue;
                }

                // ── Test mode: skip if email doesn't match ──────────────────
                if (testEmail && email !== testEmail.toLowerCase().trim()) {
                    continue;
                }

                // Build & send the email
                const emailHtml = buildCampaignEmail(purchasedDisplayName, recDetails, expiryStr);
                const emailText = buildCampaignText(purchasedDisplayName, recDetails, expiryStr);

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
                        subject: `🎁 Exclusive 20% Off — Handpicked Quant Resources Just for You`,
                        htmlContent: emailHtml,
                        textContent: emailText
                    })
                });

                if (emailResponse.ok) {
                    console.log(`✅ Sent to ${email} — purchased: ${purchasedDisplayName}, recommended: ${recDetails.map(r => r.name).join(', ')}`);
                    results.sent++;
                    results.details.push({
                        email,
                        purchasedProduct: purchasedDisplayName,
                        status: 'sent',
                        recommendations: recDetails.map(r => r.name)
                    });
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

        // If test mode, handle case where the test email wasn't a single-buyer
        if (testEmail && results.sent === 0 && results.errors === 0) {
            // Send a demo email with the first single-buyer's data, or generate a sample
            const sampleBuyer = eligibleSingleBuyers[0];
            if (sampleBuyer) {
                const [, purchasedSet] = sampleBuyer;
                const purchasedProductName = [...purchasedSet][0];
                const purchasedProduct = allProducts.find(p =>
                    (p.name || '').toLowerCase().trim() === purchasedProductName
                );
                const purchasedDisplayName = purchasedProduct?.name || purchasedProductName;
                const purchasedCategory = getProductCategory(purchasedProductName);
                const recommendations = getRecommendations(
                    purchasedProductName,
                    purchasedCategory,
                    recommendableProducts,
                    purchasedSet
                );
                const recDetails = recommendations.map(p => ({
                    name: p.name,
                    price: p.price,
                    discountedPrice: Math.round(p.price * 0.8),
                    couponCode: getCouponCode20(p.name),
                    id: p.id,
                    coverImage: p.cover_image_url
                }));

                const emailHtml = buildCampaignEmail(purchasedDisplayName, recDetails, expiryStr);
                const emailText = buildCampaignText(purchasedDisplayName, recDetails, expiryStr);

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
                        subject: `🎁 Exclusive 20% Off — Handpicked Quant Resources Just for You`,
                        htmlContent: emailHtml,
                        textContent: emailText
                    })
                });

                if (emailResponse.ok) {
                    results.sent = 1;
                    results.details.push({
                        email: testEmail,
                        status: 'test_sent',
                        note: `Test email sent using sample data from: ${purchasedDisplayName}`,
                        recommendations: recDetails.map(r => r.name)
                    });
                } else {
                    results.errors = 1;
                    results.details.push({ email: testEmail, status: 'error', error: await emailResponse.text() });
                }
            }
        }

        console.log(`📧 Campaign complete: mode=${results.mode}, sent=${results.sent}, skipped=${results.skipped}, errors=${results.errors}`);

        // ── Reminder about coupon codes ─────────────────────────────────────
        if (!isDryRun) {
            results.reminder = '⚠️ Make sure all 20% coupon codes (XXXX20) are configured in your checkout/Razorpay system before customers try to use them!';
        }

        return res.status(200).json(results);

    } catch (error) {
        console.error('Campaign error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT CATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const PRODUCT_CATEGORIES = {
    // Beginner / Foundations
    'quantitative finance for absolute beginners': 'foundations',
    'probability theory for quants': 'foundations',
    'linear algebra & differential equations for quants': 'foundations',

    // Derivatives & Pricing
    'derivatives products & pricing master pack': 'derivatives',
    'exotic options pricing guide': 'derivatives',
    'greeks,vols,ycurves,numerical meth./mc & xva guide': 'derivatives',
    'greek explainer lab': 'derivatives',

    // Asset-Class Models
    'quant models for each asset class master pack': 'models',
    'interest rate models': 'models',
    'fx models': 'models',
    'equity models': 'models',
    'credit models': 'models',

    // Interview Prep
    'common mistakes in quant interviews': 'interview',
    'quant interview problem book': 'interview',
    'mental math & market intuition for quants': 'interview',

    // Programming
    'python for quants': 'programming',
    'c++ for quants': 'programming',
    'sql for quant interviews': 'programming',
    'r for risk quants': 'programming',

    // Stochastic / Math
    'stochastic calculus for quants': 'stochastic',
    'the stochastic calculus visual lab': 'stochastic',

    // Risk & PnL
    'regulatory & risk frameworks for quants': 'risk',
    'pnl attribution & desk diagnostics for quants': 'risk',
    'statistics & econometrics for quants': 'risk',

    // Projects & Career
    'ultimate industry grade quant project pack': 'projects',
    'complete quant ats friendly resume': 'career',

    // Fixed Income
    'fixed income math & bond pricing': 'fixed_income',

    // Machine Learning
    'machine learning for quants': 'ml',
};

// Related category affinities (ordered by relevance)
const CATEGORY_AFFINITIES = {
    'foundations':   ['interview', 'stochastic', 'programming', 'foundations', 'models', 'derivatives'],
    'derivatives':   ['models', 'stochastic', 'risk', 'derivatives', 'interview', 'fixed_income'],
    'models':        ['derivatives', 'stochastic', 'risk', 'models', 'interview', 'fixed_income'],
    'interview':     ['foundations', 'programming', 'stochastic', 'interview', 'models', 'derivatives'],
    'programming':   ['interview', 'foundations', 'ml', 'programming', 'projects', 'risk'],
    'stochastic':    ['derivatives', 'models', 'foundations', 'stochastic', 'risk', 'interview'],
    'risk':          ['derivatives', 'models', 'fixed_income', 'risk', 'stochastic', 'interview'],
    'projects':      ['programming', 'interview', 'career', 'projects', 'foundations'],
    'career':        ['interview', 'projects', 'programming', 'career', 'foundations'],
    'fixed_income':  ['derivatives', 'models', 'risk', 'fixed_income', 'stochastic'],
    'ml':            ['programming', 'risk', 'interview', 'ml', 'stochastic'],
};

function isCompleteBundleProduct(productName) {
    const name = (productName || '').toLowerCase();
    return name.includes('complete') && (name.includes('bundle') || name.includes('professional'));
}

function getProductCategory(productNameLower) {
    for (const [key, category] of Object.entries(PRODUCT_CATEGORIES)) {
        if (productNameLower.includes(key) || key.includes(productNameLower)) {
            return category;
        }
    }
    // Fuzzy match: check if any significant words match
    const words = productNameLower.split(/\s+/).filter(w => w.length > 4);
    for (const [key, category] of Object.entries(PRODUCT_CATEGORIES)) {
        for (const word of words) {
            if (key.includes(word)) return category;
        }
    }
    return 'foundations'; // Default fallback
}

function getRecommendations(purchasedNameLower, purchasedCategory, recommendableProducts, purchasedSet) {
    const affinities = CATEGORY_AFFINITIES[purchasedCategory] || Object.keys(CATEGORY_AFFINITIES);
    const recommendations = [];
    const usedIds = new Set();

    // Go through affinity categories in order and pick products
    for (const targetCategory of affinities) {
        if (recommendations.length >= 3) break;

        const categoryProducts = recommendableProducts.filter(p => {
            const pName = (p.name || '').toLowerCase().trim();
            const pCategory = getProductCategory(pName);
            return pCategory === targetCategory &&
                   !purchasedSet.has(pName) &&
                   !usedIds.has(p.id);
        });

        // Sort by price descending (higher-value first)
        categoryProducts.sort((a, b) => (b.price || 0) - (a.price || 0));

        for (const p of categoryProducts) {
            if (recommendations.length >= 3) break;
            recommendations.push(p);
            usedIds.add(p.id);
        }
    }

    // If we still have fewer than 3, fill from remaining products
    if (recommendations.length < 3) {
        const remaining = recommendableProducts.filter(p => {
            const pName = (p.name || '').toLowerCase().trim();
            return !purchasedSet.has(pName) && !usedIds.has(p.id);
        });
        remaining.sort((a, b) => (b.price || 0) - (a.price || 0));
        for (const p of remaining) {
            if (recommendations.length >= 3) break;
            recommendations.push(p);
            usedIds.add(p.id);
        }
    }

    return recommendations.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 20% COUPON CODE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const COUPON_CODE_MAP = {
    'quantitative finance for absolute beginners': 'BEGINNER20',
    'common mistakes in quant interviews': 'MISTAKES20',
    'quant interview problem book': 'PROBLEMS20',
    'greek explainer lab': 'GLAB20',
    'quant models for each asset class master pack': 'MODELS20',
    'the stochastic calculus visual lab': 'STOCHLAB20',
    'complete quant ats friendly resume': 'RESUME20',
    'mental math & market intuition for quants': 'MENTALMATH20',
    'python for quants': 'PYTHON20',
    'derivatives products & pricing master pack': 'DERIVATIVE20',
    'statistics & econometrics for quants': 'STATS20',
    'pnl attribution & desk diagnostics for quants': 'PNL20',
    'equity models': 'EQUITIES20',
    'interest rate models': 'RATES20',
    'machine learning for quants': 'ML20',
    'stochastic calculus for quants': 'STOCHASTIC20',
    'linear algebra & differential equations for quants': 'LADE20',
    'ultimate industry grade quant project pack': 'PROJECT20',
    'greeks,vols,ycurves,numerical meth./mc & xva guide': 'DESK20',
    'credit models': 'CREDITS20',
    'sql for quant interviews': 'SQL20',
    'regulatory & risk frameworks for quants': 'RISK20',
    'probability theory for quants': 'PROBABILITY20',
    'fx models': 'FXD20',
    'c++ for quants': 'CPP20',
    'r for risk quants': 'R20',
    'fixed income math & bond pricing': 'FIXEDINCOME20',
    'exotic options pricing guide': 'EXOTICS20',
};

function getCouponCode20(productName) {
    const nameLower = (productName || '').toLowerCase().trim();
    for (const [key, code] of Object.entries(COUPON_CODE_MAP)) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
            return code;
        }
    }
    // Fuzzy fallback
    const words = nameLower.split(/\s+/).filter(w => w.length > 4);
    for (const [key, code] of Object.entries(COUPON_CODE_MAP)) {
        for (const word of words) {
            if (key.includes(word)) return code;
        }
    }
    return 'QUANT20'; // Generic fallback
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

function buildCampaignEmail(purchasedProductName, recommendations, expiryStr) {
    const productCards = recommendations.map(rec => {
        const coverImg = rec.coverImage
            ? `<img src="${rec.coverImage}" alt="${escapeHtml(rec.name)}" style="width:100%; height:160px; object-fit:contain; border-radius:8px 8px 0 0; background:#f4f1ec;">`
            : '';

        const savings = rec.price - rec.discountedPrice;

        return `
            <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 2px 12px rgba(0,0,0,0.08); border:1px solid #eee;">
                ${coverImg}
                <div style="padding:20px;">
                    <div style="display:inline-block; background:linear-gradient(135deg,#dc2626,#ef4444); color:#fff; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; margin-bottom:10px; letter-spacing:0.5px;">🔥 20% OFF — SAVE ₹${savings}</div>
                    <h3 style="margin:8px 0; font-size:16px; color:#1a1a1a; font-weight:700; line-height:1.4;">${escapeHtml(rec.name)}</h3>
                    <div style="margin:12px 0; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="font-size:14px; color:#999; text-decoration:line-through;">₹${rec.price}</span>
                        <span style="font-size:22px; font-weight:800; color:#dc2626;">₹${rec.discountedPrice}</span>
                    </div>
                    <div style="background:linear-gradient(135deg,#fef3c7,#fde68a); border:2px dashed #f59e0b; border-radius:8px; padding:10px 14px; margin-bottom:14px; text-align:center;">
                        <span style="font-size:12px; color:#92400e; font-weight:600;">Use code at checkout:</span>
                        <div style="font-size:20px; font-weight:800; color:#92400e; letter-spacing:2px; margin-top:2px;">${rec.couponCode}</div>
                    </div>
                    <a href="https://desk2quant.com/product.html?id=${rec.id}" style="display:block; text-align:center; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#ffffff; font-weight:700; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; letter-spacing:0.3px;">View Product →</a>
                </div>
            </div>`;
    }).join('');

    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f4f1ec; padding:0; margin:0;">
        <div style="max-width:620px; margin:0 auto; padding:20px;">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); border-radius:16px 16px 0 0; padding:40px 30px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;"><img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border-radius:11px;"></td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:1px;">Desk2Quant</span></td></tr></table>
                <div style="font-size:13px; color:#a0aec0; letter-spacing:2px; text-transform:uppercase;">Exclusive Offer</div>
            </div>

            <!-- Hero Banner -->
            <div style="background:linear-gradient(135deg,#dc2626,#ef4444,#f97316); padding:30px; text-align:center;">
                <div style="font-size:40px; margin-bottom:8px;">🎁</div>
                <h1 style="color:#ffffff; font-size:26px; font-weight:800; margin:0 0 10px 0; line-height:1.3;">Exclusive 20% Off — Just for You!</h1>
                <p style="color:#fde8e8; font-size:15px; margin:0; line-height:1.5;">As a valued customer, we've handpicked resources<br>that perfectly complement your learning journey.</p>
            </div>

            <!-- Body -->
            <div style="background:#ffffff; padding:30px; border-left:1px solid #eee; border-right:1px solid #eee;">
                <p style="font-size:16px; color:#333; margin:0 0 8px 0;">Hi there 👋</p>
                <p style="font-size:15px; color:#555; margin:0 0 10px 0; line-height:1.6;">
                    Thank you for purchasing <strong style="color:#1a1a1a;">${escapeHtml(purchasedProductName)}</strong>!
                </p>
                <p style="font-size:15px; color:#555; margin:0 0 25px 0; line-height:1.6;">
                    Based on your purchase, we've selected <strong>3 resources</strong> that will accelerate your quant career even further.
                    As a loyal customer, you get an <strong style="color:#dc2626;">exclusive 20% discount</strong> on each — a deal not available to anyone else.
                </p>

                <!-- Product Cards -->
                ${productCards}

                <!-- Expiry Notice -->
                <div style="background:linear-gradient(135deg,#fef3c7,#fffbeb); border:1px solid #f59e0b; border-radius:10px; padding:16px; text-align:center; margin-top:10px; margin-bottom:20px;">
                    <p style="font-size:14px; color:#92400e; font-weight:700; margin:0;">⏰ These exclusive codes expire on <strong>${expiryStr}</strong></p>
                    <p style="font-size:13px; color:#b45309; margin:6px 0 0 0;">Don't miss out — your peers are already leveling up!</p>
                </div>

                <!-- CTA -->
                <div style="text-align:center; margin-top:16px;">
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

function buildCampaignText(purchasedProductName, recommendations, expiryStr) {
    const recList = recommendations.map(r =>
        `• ${r.name}\n  Original: ₹${r.price} → Your price: ₹${r.discountedPrice} (20% OFF)\n  Coupon code: ${r.couponCode}\n  View: https://desk2quant.com/product.html?id=${r.id}`
    ).join('\n\n');

    return `🎁 Exclusive 20% Off — Just for You!

Hi there,

Thank you for purchasing "${purchasedProductName}" from Desk2Quant!

Based on your purchase, here are 3 handpicked resources with an exclusive 20% discount — just for you:

${recList}

⏰ These codes expire on ${expiryStr}. Don't miss out!

Browse all products: https://desk2quant.com/#products

---
Sent by Desk2Quant • desk2quant.com
You're receiving this because you previously purchased from Desk2Quant.`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
