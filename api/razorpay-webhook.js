// Razorpay Webhook Handler
// This endpoint is called by Razorpay when payment events occur
// Handles product purchases and session bookings

import crypto from 'crypto';
import { createJitsiMeetingLink } from '../lib/jitsi.js';
import { queuePostPurchaseRecommendation } from '../lib/recommendationQueue.js';
import { getExpectedProductOrder, getExpectedSessionOrder, getExpectedCartOrder, isWithinTolerance } from '../lib/pricing.js';

// Disable Vercel body parsing so we can read the raw stream for signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper function to read the raw body from the request stream
async function getRawBody(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

function normalizeProductName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ');
}

export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Configuration
    const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    // 1. Capture Raw Body for Signature Verification
    let rawBody;
    try {
        rawBody = await getRawBody(req);
    } catch (err) {
        console.error('Error reading raw body:', err);
        return res.status(500).json({ error: 'Could not read request body' });
    }

    // 2. Verify Webhook Signature (mandatory — reject if secret not configured)
    if (!RAZORPAY_WEBHOOK_SECRET) {
        console.error('CRITICAL: RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    {
        const signature = req.headers['x-razorpay-signature'];

        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        const sigBuf = Buffer.from(signature || '', 'utf8');
        const expBuf = Buffer.from(expectedSignature, 'utf8');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            console.error('CRITICAL: Webhook signature verification failed');
            console.log('Raw body preview (50 chars):', rawBody.toString('utf8').substring(0, 50));
            return res.status(401).json({ error: 'Invalid signature' });
        }
        console.log('✅ Signature verified successfully');
    }

    // 3. Parse JSON body for logic
    let event;
    try {
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
        console.error('Error parsing JSON body:', err);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('Razorpay webhook received:', event.event);

    try {
        // Handle payment.captured event (successful payment)
        if (event.event === 'payment.captured') {
            const payment = event.payload.payment.entity;
            const paymentId = payment.id;
            const currency = payment.currency;
            const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG', 'UGX'];
            const amount = zeroDecimalCurrencies.includes(currency) ? payment.amount : payment.amount / 100;
            const customerEmail = payment.email;
            const customerName = payment.notes?.customer_name || 'Customer';
            const customerPhone = payment.notes?.customer_phone || '';
            const customerCountry = payment.notes?.customer_country || payment.notes?.country || 'Unknown';
            // Ground truth for INR value: Razorpay's own base_amount/base_currency
            // (its real settlement-time FX conversion — matches the Razorpay dashboard
            // exactly). payment.notes.inr_amount is just a catalog-price snapshot the
            // frontend stamped at checkout time (pre-discount, pre-real-FX) and was
            // previously used here by mistake, causing dashboard revenue figures to
            // diverge sharply from the real Razorpay numbers for foreign-currency sales.
            let inrAmount;
            if (payment.base_currency === 'INR' && typeof payment.base_amount === 'number') {
                inrAmount = payment.base_amount / 100;
            } else if (currency === 'INR') {
                inrAmount = amount;
            } else if (payment.notes?.inr_amount) {
                inrAmount = parseFloat(payment.notes.inr_amount); // last-resort fallback
            } else {
                inrAmount = amount;
            }
            let productName = payment.notes?.product_name;
            let productType = payment.notes?.type; // 'product' or 'session'

            // Razorpay does NOT copy order notes to payment notes.
            // Fallback: fetch the order to get the original notes.
            if (!productType && payment.order_id && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
                try {
                    const orderResp = await fetch(
                        `https://api.razorpay.com/v1/orders/${payment.order_id}`,
                        {
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
                            }
                        }
                    );
                    if (orderResp.ok) {
                        const order = await orderResp.json();
                        const orderNotes = order.notes || {};
                        console.log('Fetched order notes as fallback:', orderNotes);
                        // Use order notes as the source of truth
                        productType = orderNotes.type || productType;
                        if (!productName) productName = orderNotes.product_name;
                        // Merge: prefer payment.notes, fall back to order.notes
                        payment.notes = { ...orderNotes, ...payment.notes };
                    } else {
                        console.warn('Could not fetch order for notes fallback:', orderResp.status);
                    }
                } catch (err) {
                    console.error('Error fetching order for notes fallback:', err.message);
                }
            }

            // Default to 'product' if still no type detected
            productType = productType || 'product';

            console.log('Payment captured:', { paymentId, amount, inrAmount, customerEmail, customerCountry, productName, productType });

            if (productType === 'cart') {
                // Handle multi-item cart checkout
                await handleCartPurchase({
                    paymentId,
                    amount,
                    inrAmount,
                    currency,
                    customerEmail,
                    customerName,
                    customerPhone,
                    customerCountry,
                    cartItemsRaw: payment.notes?.cart_items || '',
                    couponCode: payment.notes?.coupon_code || null,
                    paymentCreatedAt: payment.created_at,
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    BREVO_API_KEY,
                    ADMIN_EMAIL,
                    SENDER_EMAIL,
                    SENDER_NAME
                });
            } else if (productType === 'product' && productName) {
                // Handle product purchase
                await handleProductPurchase({
                    paymentId,
                    amount,
                    inrAmount,
                    currency,
                    customerEmail,
                    customerName,
                    customerPhone,
                    customerCountry,
                    productName,
                    productId: payment.notes?.product_id || null,
                    couponCode: payment.notes?.coupon_code || null,
                    // Razorpay's own capture timestamp (epoch seconds) -- used as the
                    // authoritative created_at so the row's date is never dependent on
                    // Supabase/Postgres session timezone quirks.
                    paymentCreatedAt: payment.created_at,
                    downloadLink: payment.notes?.download_link || '',
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    BREVO_API_KEY,
                    ADMIN_EMAIL,
                    SENDER_EMAIL,
                    SENDER_NAME
                });
            } else if (productType === 'session') {
                // Handle session booking (Server-side fulfillment for reliability)
                await handleSessionBooking({
                    paymentId,
                    amount,
                    // Same authoritative INR figure used for product purchases above
                    // (Razorpay's own base_amount/base_currency, not the client-stamped
                    // notes.inr_amount) -- the price-tamper guard inside
                    // handleSessionBooking must check the REAL captured amount, not a
                    // client-controlled note.
                    inrAmount,
                    currency,
                    customerEmail,
                    notes: payment.notes,
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    BREVO_API_KEY,
                    ADMIN_EMAIL,
                    SENDER_EMAIL,
                    SENDER_NAME,
                    RAZORPAY_WEBHOOK_SECRET
                });
            }

            return res.status(200).json({ status: 'success', paymentId });
        }

        // Handle other events
        return res.status(200).json({ status: 'acknowledged', event: event.event });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive API Helpers for Secure Sharing
// ─────────────────────────────────────────────────────────────────────────────

// Helper function to extract File/Folder ID from Google Drive URL
function extractDriveFileId(url) {
    if (!url) return null;
    let match = url.match(/[?&]id=([^&]+)/);
    if (match) return match[1];
    match = url.match(/\/file\/d\/([^/]+)/);
    if (match) return match[1];
    match = url.match(/\/drive\/folders\/([^/?]+)/);
    if (match) return match[1];
    match = url.match(/\/open\?id=([^&]+)/);
    if (match) return match[1];
    return null;
}

// Helper function to authenticate service account and grant reader permission
async function grantDrivePermission(clientEmail, privateKey, fileId, customerEmail) {
    if (!clientEmail || !privateKey) {
        console.warn('Google Drive credentials missing in environment; skipping permission grant');
        return null;
    }

    // 1. Get access token via JWT authentication flow
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const base64Encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const tokenInput = `${base64Encode(header)}.${base64Encode(claimSet)}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.write(tokenInput);
    signer.end();

    // Format newlines if private key is stored as single line string in env
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const signature = signer.sign(formattedKey, 'base64url');

    const jwt = `${tokenInput}.${signature}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Google Drive API auth token creation failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // 2. Add editor permission via Google Drive API
    const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'writer',
            type: 'user',
            emailAddress: customerEmail
        })
    });

    if (!permissionResponse.ok) {
        const errorText = await permissionResponse.text();
        throw new Error(`Google Drive share permissions failed: ${errorText}`);
    }

    return await permissionResponse.json();
}

// Handle product purchase - send email and log to Supabase
export async function handleProductPurchase(data) {
    const {
        paymentId, amount, inrAmount, currency, customerEmail, customerName, customerPhone, customerCountry, productName,
        productId, couponCode,
        paymentCreatedAt,
        downloadLink: checkoutDownloadLink,
        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
    } = data;

    // Prefer Razorpay's own capture timestamp (its epoch seconds are always
    // real UTC) over letting Postgres stamp its own now() default, which has
    // been observed storing purchases.created_at ~5.5h in the past due to a
    // timezone-handling bug on that column/table.
    const isoCreatedAt = (typeof paymentCreatedAt === 'number' && paymentCreatedAt > 0)
        ? new Date(paymentCreatedAt * 1000).toISOString()
        : null;

    console.log(`Processing product purchase: ${productName} for ${customerEmail}`);

    // ── Price-tamper guard ──────────────────────────────────────────────────
    // Defense in depth: create-order.js already computes the charge amount
    // server-side, but a captured payment can technically originate from
    // anywhere (a client can open Razorpay Checkout directly with arbitrary
    // notes/amount, bypassing create-order.js entirely). So independently
    // re-derive the real minimum acceptable INR price here, from productId,
    // and refuse to grant access if what was actually captured falls short.
    let underpaymentFlag = null;
    if (productId) {
        try {
            const expected = await getExpectedProductOrder(productId, currency, couponCode);
            if (expected.ok && !isWithinTolerance(inrAmount, expected.amountInr)) {
                underpaymentFlag = {
                    expectedInr: expected.amountInr,
                    capturedInr: inrAmount,
                    discountPercent: expected.discountPercent
                };
                console.error('🚨 UNDERPAYMENT DETECTED — refusing to grant access:', {
                    paymentId, productName, productId, ...underpaymentFlag
                });
            } else if (!expected.ok) {
                console.warn('⚠️ Could not verify product price (product_id missing/unmatched); proceeding without price check:', productId, expected.error);
            }
        } catch (err) {
            console.error('⚠️ Price verification error (proceeding without hard block):', err.message);
        }
    } else {
        console.warn('⚠️ No product_id on payment notes; cannot verify price for:', productName, '(paymentId:', paymentId, ') — legacy checkout path, review manually if suspicious');
    }

    const PRODUCT_DOWNLOAD_LINKS = {
        'Quant Interview Problem Book (1000+ Problems with solutions)': 'https://drive.google.com/uc?export=download&id=1sp48XJi8VZt5ufw4o6pHgg_EwBA0nkVJ',
        'Quant Interview Problem Book (1000+)': 'https://drive.google.com/uc?export=download&id=1sp48XJi8VZt5ufw4o6pHgg_EwBA0nkVJ',
        'Quant Models for Each Asset Class Master Pack: IR, FX, Credits, Equity': 'https://drive.google.com/uc?export=download&id=1CvriZOEfqiGkSRiKwR33kC3ny1T2oQSs',
        'Quant Models for Each Asset Class Master Pack : IR, FX, CREDITS , EQUITY': 'https://drive.google.com/uc?export=download&id=1CvriZOEfqiGkSRiKwR33kC3ny1T2oQSs',
        'Derivatives Products & Pricing Master Pack (6 PDFs): IR, FX, Equity, Credit, Inflation & Commodities': 'https://drive.google.com/uc?export=download&id=1kf_Qln0AFRi_Z1zvzaRHMojmZ152tY0j',
        'Ultimate Industry Grade Quant Project Pack (45 Projects)': 'https://drive.google.com/uc?export=download&id=1jktrsnX880xtd3RVBw0nwC18beSc-toz',
        'Complete Front Office & Risk Quant Professional Bundle (40+ PDFs & 60+ scripts)': 'https://drive.google.com/uc?export=download&id=1XrgmUHRy-QjCt5IOTWg1e0WTM_4_Kaid',
        'Complete Front Office & Risk Quant Professional Bundle (40+ high quality PDFs & 55 scripts)': 'https://drive.google.com/uc?export=download&id=1XrgmUHRy-QjCt5IOTWg1e0WTM_4_Kaid',
        'Python for Quants: Complete Interview Guide': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Python for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'C++ for Quants: Desk-Ready Notes': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'C++ for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'XVA Derivatives Primer': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Quant Projects Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Interview Bible': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Complete Quant Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing'
    };

    let downloadLink = checkoutDownloadLink || '';
    let frontendAlreadyProcessed = false;

    try {
        const existingResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases?payment_id=eq.${paymentId}&select=id,source,download_link`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (existingResponse.ok) {
            const existing = await existingResponse.json();
            if (existing && existing.length > 0) {
                const sources = existing.map((entry) => entry.source);
                if (sources.includes('webhook')) {
                    console.log('Payment already fully processed by webhook:', paymentId);
                    return;
                }
                if (sources.includes('frontend_legacy') || sources.includes('frontend')) {
                    console.log('Payment logged by frontend, but ensuring webhook email delivery:', paymentId);
                    frontendAlreadyProcessed = true;
                }
                if (!downloadLink) {
                    const loggedLink = existing.map((entry) => entry.download_link).find(Boolean);
                    if (loggedLink) {
                        downloadLink = loggedLink;
                        console.log('Reusing download link from purchase log');
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error checking existing purchase:', err);
    }

    if (!downloadLink) {
        try {
            const productResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/products?select=name,file_url`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

            if (productResponse.ok) {
                const products = await productResponse.json();
                const normalizedProductName = normalizeProductName(productName);
                const matchedProduct = Array.isArray(products)
                    ? products.find((product) => normalizeProductName(product.name) === normalizedProductName && product.file_url)
                    : null;

                if (matchedProduct) {
                    downloadLink = matchedProduct.file_url;
                    console.log('Found product link in Supabase:', matchedProduct.name);
                }
            }
        } catch (err) {
            console.warn('Error fetching product from Supabase, falling back to static link map:', err);
        }
    }

    if (!downloadLink) {
        const normalizedProductName = normalizeProductName(productName);
        const fallbackEntry = Object.entries(PRODUCT_DOWNLOAD_LINKS)
            .find(([name]) => normalizeProductName(name) === normalizedProductName);
        if (fallbackEntry) {
            downloadLink = fallbackEntry[1];
            console.log('Using fallback product link for webhook fulfillment');
        }
    }

    if (!downloadLink) {
        console.error('No download link found for product:', productName);
        downloadLink = '#';
    }

    // Google Drive Secure Sharing Flow
    let hasSharedSecurely = false;
    let fallbackToManualInfo = false;
    const driveFileId = extractDriveFileId(downloadLink);

    // Do NOT grant Drive access or reveal the download link when the
    // captured amount fell short of the verified price (see price-tamper
    // guard above). The purchase is still logged (flagged) so it shows up
    // for manual review instead of silently disappearing.
    if (driveFileId && !underpaymentFlag) {
        const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

        if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
            console.log(`Google Drive Secure Flow: Sharing ID ${driveFileId} with ${customerEmail}...`);
            try {
                await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, customerEmail);
                console.log(`✅ Successfully shared Drive ID ${driveFileId} with ${customerEmail}`);
                hasSharedSecurely = true;
            } catch (err) {
                console.error(`❌ Failed to share Google Drive item: ${err.message}`);
                fallbackToManualInfo = true;
            }

            // Secure viewer URL instead of direct download link
            const isFolder = downloadLink.includes('/folders/') || downloadLink.includes('/drive/folders/');
            downloadLink = isFolder
                ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
        } else {
            console.warn('GCP Google Drive credentials not configured in environment variables. Sharing bypassed.');
        }
    }

    if (!frontendAlreadyProcessed) {
        try {
            const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    customer_email: customerEmail,
                    product_name: productName,
                    amount: Math.round(amount),
                    currency: currency || 'INR',
                    payment_id: paymentId,
                    // Flag underpaid purchases distinctly so they surface for manual
                    // review instead of looking like a normal fulfilled sale.
                    source: underpaymentFlag ? 'webhook_price_mismatch' : 'webhook',
                    customer_country: customerCountry,
                    inr_amount: inrAmount,
                    download_link: underpaymentFlag ? null : downloadLink,
                    ...(isoCreatedAt ? { created_at: isoCreatedAt } : {})
                })
            });
            if (insertResp.ok) {
                console.log('✅ Purchase logged to Supabase by webhook. PaymentId:', paymentId);
            } else {
                const errBody = await insertResp.text();
                console.error('❌ SUPABASE INSERT FAILED. Status:', insertResp.status, '| Body:', errBody, '| PaymentId:', paymentId);
            }
        } catch (err) {
            console.error('❌ Error logging to Supabase (network):', err.message, '| PaymentId:', paymentId);
        }
    }

    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        const customerHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 10px;">New Purchase</span>
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${customerName}</strong>, thank you for purchasing from Desk2Quant.</p>
                        
                        ${hasSharedSecurely ? `
                        <div style="background: #e0f2fe; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin-bottom: 25px; font-size: 13px; color: #0369a1; line-height: 1.5;">
                            <strong>🔒 Secured Resource:</strong> We have shared this resource with your email address <strong>${customerEmail}</strong>. Please ensure you are logged into Google Drive with this email address to view it.
                        </div>
                        ` : ''}
                        
                        ${fallbackToManualInfo ? `
                        <div style="background: #fffbeb; padding: 15px; border-radius: 6px; border-left: 4px solid #d97706; margin-bottom: 25px; font-size: 13px; color: #b45309; line-height: 1.5;">
                            <strong>⚠️ Custom Share Access:</strong> We attempted to automatically share this secure Google Drive resource with <strong>${customerEmail}</strong>. If your email is not associated with a Google Account, or if you cannot access the link, please reply to this email with your Google/Gmail address, and we will grant access manually!
                        </div>
                        ` : ''}

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Digital Product</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${productName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Amount</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${downloadLink}" style="display: inline-block; background: #e95836; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 30px;">Download / View Resource</a>
                        </center>
 
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Direct Link Backup</p>
                            <p style="font-size: 14px; margin: 0 0 8px 0; color: #1a1a1a;">If the button does not open in your email app, copy and paste this link into your browser:</p>
                            <p style="font-size: 13px; margin: 0; word-break: break-all;">
                                <a href="${downloadLink}" style="color: #2563eb; text-decoration: underline;">${downloadLink}</a>
                            </p>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Purchase Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'N/A'}</td></tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;

        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Your Purchase: ${productName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nThank you for your purchase!\n\nProduct: ${productName}\nAmount: ${currency} ${amount}\n\nPlease download your resource using this link:\n${downloadLink}\n\nIf the button does not work, copy and paste the same link into your browser.\n\nPayment ID: ${paymentId}\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
                })
            });

            if (emailResponse.ok) {
                console.log(`Customer purchase email sent to ${customerEmail}`);
            } else {
                const errorData = await emailResponse.text();
                console.error(`Brevo Error (Product Email): ${emailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending customer email:', err);
        }
    }

    if (BREVO_API_KEY && underpaymentFlag) {
        // Distinct alert so the underpayment is impossible to miss/confuse
        // with a normal sale notification.
        try {
            const alertHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1a1a1a;">
                    <h2 style="color: #991b1b;">🚨 Underpaid purchase attempt blocked</h2>
                    <p>A payment was captured for <strong>${productName}</strong> but the amount fell short of the verified price. Access/download link were <strong>NOT</strong> granted.</p>
                    <table style="border-collapse: collapse;">
                        <tr><td style="padding:4px 10px;color:#666;">Customer</td><td style="padding:4px 10px;">${customerName} (${customerEmail})</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Payment ID</td><td style="padding:4px 10px;">${paymentId}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Captured (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.capturedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Expected minimum (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.expectedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Coupon used</td><td style="padding:4px 10px;">${couponCode || 'none'} (${underpaymentFlag.discountPercent}% resolved)</td></tr>
                    </table>
                    <p>If this was a legitimate discount our pricing rules don't know about, grant access manually and consider updating lib/pricing.js.</p>
                </div>
            `;
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🚨 Underpayment blocked: ${productName}`,
                    htmlContent: alertHtml,
                    textContent: `Underpaid purchase blocked.\nProduct: ${productName}\nCustomer: ${customerName} (${customerEmail})\nPaymentId: ${paymentId}\nCaptured INR: ${underpaymentFlag.capturedInr}\nExpected min INR: ${underpaymentFlag.expectedInr}\nCoupon: ${couponCode || 'none'}`
                })
            });
        } catch (err) {
            console.error('Error sending underpayment alert email:', err);
        }
    }

    if (BREVO_API_KEY && !underpaymentFlag) {
        const adminHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant Admin</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">New Sale Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${customerName}</strong> just purchased a digital product.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Product Sold</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${productName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Download Link</td><td style="padding: 5px 0; color: #1a1a1a; word-break: break-all;">${downloadLink}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #666;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #1a1a1a;">${paymentId} (Webhook)</td></tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const adminEmailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `New Sale: ${productName}`,
                    htmlContent: adminHtml,
                    textContent: `New Sale Received!\n\n${customerName} just purchased a digital product.\n\nProduct Sold: ${productName}\nAmount Received: ${currency} ${amount}\nDownload Link: ${downloadLink}\n\nCustomer Details:\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || 'Not provided'}\nPayment ID: ${paymentId} (Webhook)`
                })
            });

            if (adminEmailResponse.ok) {
                console.log('Admin notification sent via webhook');
            } else {
                const errorData = await adminEmailResponse.text();
                console.error(`Brevo Error (Admin Product): ${adminEmailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending admin notification:', err);
        }
    }

    // 📧 Queue a personalised recommendation email to be sent ~1hr after purchase.
    // This is a fast, AWAITED insert into a durable queue table (recommendation_emails)
    // instead of a fire-and-forget Brevo call — the actual send happens out-of-band via
    // api/reminders.js's existing cron sweep, so it survives this function being torn down.
    // Skip if the customer bought the Complete Bundle (nothing more to upsell),
    // and skip entirely for underpaid/blocked purchases -- don't reward a
    // price-tamper attempt with a follow-up discount coupon.
    const isBundle = productName.toLowerCase().includes('complete') && productName.toLowerCase().includes('bundle');
    if (!isBundle && customerEmail && !underpaymentFlag) {
        try {
            await queuePostPurchaseRecommendation({
                customerEmail, customerName, purchasedProductName: productName,
                trigger: 'product_purchase',
                SUPABASE_URL, SUPABASE_KEY
            });
        } catch (err) {
            console.error('Failed to queue post-purchase recommendation:', err);
        }
    } else if (isBundle) {
        console.log('⏭️ Skipping recommendation for bundle purchase');
    }
}

// Handle a multi-item cart checkout: verify total price, fetch each
// product's download link, share Drive access, log one purchases row per
// item, and send a single combined confirmation email (instead of one email
// per product).
async function handleCartPurchase(data) {
    const {
        paymentId, amount, inrAmount, currency, customerEmail, customerName, customerPhone, customerCountry,
        cartItemsRaw, couponCode, paymentCreatedAt,
        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
    } = data;

    const isoCreatedAt = (typeof paymentCreatedAt === 'number' && paymentCreatedAt > 0)
        ? new Date(paymentCreatedAt * 1000).toISOString()
        : null;

    // Format is "productId:qty:couponCode" per item (couponCode may be empty),
    // mirroring the per-item coupon support in the cart drawer.
    const parsedItems = String(cartItemsRaw || '')
        .split(',')
        .filter(Boolean)
        .map((triple) => {
            const [productId, qtyStr, itemCouponCode] = triple.split(':');
            return { productId, quantity: Math.max(1, parseInt(qtyStr, 10) || 1), couponCode: itemCouponCode || null };
        })
        .filter((item) => item.productId);

    if (parsedItems.length === 0) {
        console.error('Cart webhook: no items parsed from cart_items note:', cartItemsRaw);
        return;
    }

    console.log(`Processing cart purchase: ${parsedItems.length} item(s) for ${customerEmail}`);

    // Price-tamper guard (defense in depth, mirrors handleProductPurchase).
    let underpaymentFlag = null;
    try {
        const expected = await getExpectedCartOrder(
            parsedItems.map((i) => ({ product_id: i.productId, quantity: i.quantity, coupon_code: i.couponCode })),
            currency,
            couponCode
        );
        if (expected.ok && !isWithinTolerance(inrAmount, expected.amountInr)) {
            underpaymentFlag = { expectedInr: expected.amountInr, capturedInr: inrAmount };
            console.error('🚨 UNDERPAYMENT DETECTED (cart) — refusing to grant access:', { paymentId, ...underpaymentFlag });
        } else if (!expected.ok) {
            console.warn('⚠️ Could not verify cart price; proceeding without price check:', expected.error);
        }
    } catch (err) {
        console.error('⚠️ Cart price verification error (proceeding without hard block):', err.message);
    }

    // Idempotency: skip if this payment was already fully processed.
    try {
        const existingResp = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases?payment_id=eq.${paymentId}&source=eq.webhook_cart&select=id`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (existingResp.ok) {
            const existing = await existingResp.json();
            if (existing && existing.length > 0) {
                console.log('Cart payment already processed by webhook:', paymentId);
                return;
            }
        }
    } catch (err) {
        console.error('Error checking existing cart purchase:', err);
    }

    // Fetch each product's name + file_url, then share Drive access.
    const lineResults = [];
    for (const item of parsedItems) {
        let name = item.productId;
        let fileUrl = '';
        try {
            const resp = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(item.productId)}&select=name,file_url`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            if (resp.ok) {
                const rows = await resp.json();
                if (rows && rows[0]) {
                    name = rows[0].name || name;
                    fileUrl = rows[0].file_url || '';
                }
            }
        } catch (err) {
            console.error('Error fetching cart product details:', item.productId, err.message);
        }

        let downloadLink = fileUrl || '#';
        let hasSharedSecurely = false;
        const driveFileId = extractDriveFileId(downloadLink);

        if (driveFileId && !underpaymentFlag) {
            const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
            if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
                try {
                    await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, customerEmail);
                    hasSharedSecurely = true;
                } catch (err) {
                    console.error(`❌ Failed to share Drive item for cart line "${name}": ${err.message}`);
                }
                const isFolder = downloadLink.includes('/folders/') || downloadLink.includes('/drive/folders/');
                downloadLink = isFolder
                    ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                    : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
            }
        }

        lineResults.push({ productId: item.productId, name, quantity: item.quantity, downloadLink, hasSharedSecurely });
    }

    // Log one purchases row per line item, sharing the same payment_id so
    // admin views can group them, but each keeping its own product_name.
    try {
        const rows = lineResults.map((line) => ({
            customer_email: customerEmail,
            product_name: line.name,
            amount: Math.round(amount / lineResults.length), // even split for reporting; total is exact
            currency: currency || 'INR',
            payment_id: paymentId,
            source: underpaymentFlag ? 'webhook_price_mismatch' : 'webhook_cart',
            customer_country: customerCountry,
            inr_amount: Math.round(inrAmount / lineResults.length),
            download_link: underpaymentFlag ? null : line.downloadLink,
            ...(isoCreatedAt ? { created_at: isoCreatedAt } : {})
        }));
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(rows)
        });
        if (insertResp.ok) {
            console.log(`✅ Cart purchase logged to Supabase (${rows.length} line items). PaymentId:`, paymentId);
        } else {
            const errBody = await insertResp.text();
            console.error('❌ SUPABASE CART INSERT FAILED. Status:', insertResp.status, '| Body:', errBody, '| PaymentId:', paymentId);
        }
    } catch (err) {
        console.error('❌ Error logging cart purchase to Supabase (network):', err.message, '| PaymentId:', paymentId);
    }

    // Single combined confirmation email listing every item + its link.
    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        const itemsHtml = lineResults.map((line) => `
                            <tr>
                                <td style="padding:10px 0;border-bottom:1px solid #e5e5e5;">
                                    <strong>${line.name}</strong>${line.quantity > 1 ? ` &times; ${line.quantity}` : ''}<br>
                                    <a href="${line.downloadLink}" style="color:#2563eb;text-decoration:underline;font-size:13px;">Download / View Resource</a>
                                </td>
                            </tr>`).join('');
        const customerHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${customerName}</strong>, thank you for your order of ${lineResults.length} item${lineResults.length > 1 ? 's' : ''} from Desk2Quant.</p>
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0;">Your Order</p>
                            <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
                            <p style="margin-top:16px;font-size:14px;"><strong>Total paid:</strong> ${currency} ${amount}</p>
                        </div>
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Email</td><td style="padding: 5px 0;"><a href="mailto:${customerEmail}" style="color:#2563eb;text-decoration:none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Payment ID</td><td style="padding: 5px 0;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;
        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Your Order (${lineResults.length} item${lineResults.length > 1 ? 's' : ''}): Desk2Quant`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nThank you for your order!\n\n${lineResults.map((l) => `${l.name}: ${l.downloadLink}`).join('\n')}\n\nTotal: ${currency} ${amount}\nPayment ID: ${paymentId}\n\nSent by Desk2Quant`
                })
            });
            if (emailResponse.ok) {
                console.log(`Cart confirmation email sent to ${customerEmail}`);
            } else {
                console.error('Brevo Error (Cart Email):', emailResponse.status, await emailResponse.text());
            }
        } catch (err) {
            console.error('Error sending cart confirmation email:', err);
        }
    }

    if (BREVO_API_KEY && !underpaymentFlag) {
        try {
            const adminHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1a1a1a;">
                    <h2>New Cart Sale (${lineResults.length} items)</h2>
                    <p><strong>${customerName}</strong> (${customerEmail}) just purchased:</p>
                    <ul>${lineResults.map((l) => `<li>${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}</li>`).join('')}</ul>
                    <p>Total: ${currency} ${amount} | Payment ID: ${paymentId}</p>
                </div>
            `;
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map((email) => ({ email: email.trim() })).filter((item) => item.email),
                    subject: `New Cart Sale: ${lineResults.length} item(s)`,
                    htmlContent: adminHtml,
                    textContent: `New cart sale.\n${customerName} (${customerEmail})\nItems: ${lineResults.map((l) => l.name).join(', ')}\nTotal: ${currency} ${amount}\nPaymentId: ${paymentId}`
                })
            });
        } catch (err) {
            console.error('Error sending cart admin notification:', err);
        }
    }

    if (customerEmail && !underpaymentFlag && lineResults.length > 0) {
        try {
            await queuePostPurchaseRecommendation({
                customerEmail, customerName, purchasedProductName: lineResults[0].name,
                trigger: 'product_purchase',
                SUPABASE_URL, SUPABASE_KEY
            });
        } catch (err) {
            console.error('Failed to queue post-purchase recommendation (cart):', err);
        }
    }
}

// Handle session booking - send email and log to Supabase
async function handleSessionBooking(data) {
    const {
        paymentId, amount, inrAmount, currency, customerEmail, notes,
        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME,
        RAZORPAY_WEBHOOK_SECRET
    } = data;

    const customerName = notes.customer_name || 'Customer';
    const sessionName = notes.session_name || 'Consultation Session';
    const sessionDate = notes.session_date || 'TBD';
    const sessionTime = notes.session_time || 'TBD';
    const sessionDuration = notes.session_duration || '60';
    const sessionPrice = notes.session_price || amount;
    const customerPhone = notes.customer_phone || '';
    const customerMessage = notes.customer_message || '';
    const meetLink = createJitsiMeetingLink(paymentId, customerName, RAZORPAY_WEBHOOK_SECRET);

    // ── Price-tamper guard (mirrors handleProductPurchase) ──────────────────
    // Session bookings hit the same create-order.js endpoint, so the same
    // client-controlled-amount risk applies. Re-derive the real minimum
    // price from session_id and refuse to auto-confirm/send the meeting
    // link if what was captured falls short.
    let underpaymentFlag = null;
    const sessionId = notes.session_id || null;
    const couponCode = notes.coupon_code || null;
    if (sessionId) {
        try {
            const expected = await getExpectedSessionOrder(sessionId, currency, couponCode);
            // Use Razorpay's own authoritative INR figure (base_amount/base_currency,
            // computed by the caller) -- NOT notes.inr_amount, which is a
            // client-stamped value at checkout time and must never be trusted for
            // a security check.
            const capturedInr = (typeof inrAmount === 'number' && !Number.isNaN(inrAmount)) ? inrAmount : amount;
            if (expected.ok && !isWithinTolerance(capturedInr, expected.amountInr)) {
                underpaymentFlag = {
                    expectedInr: expected.amountInr,
                    capturedInr,
                    discountPercent: expected.discountPercent
                };
                console.error('🚨 UNDERPAYMENT DETECTED on session booking — flagging for review:', {
                    paymentId, sessionName, sessionId, ...underpaymentFlag
                });
            } else if (!expected.ok) {
                console.warn('⚠️ Could not verify session price (session_id missing/unmatched); proceeding without price check:', sessionId, expected.error);
            }
        } catch (err) {
            console.error('⚠️ Session price verification error (proceeding without hard block):', err.message);
        }
    } else {
        console.warn('⚠️ No session_id on payment notes; cannot verify price for booking:', sessionName, '(paymentId:', paymentId, ') — legacy checkout path, review manually if suspicious');
    }

    let displayTime = sessionTime;
    if (displayTime !== 'TBD' && !displayTime.toLowerCase().match(/am|pm/)) {
        const parts = displayTime.split(':');
        if (parts.length >= 2) {
            let hour = parseInt(parts[0], 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12 || 12;
            displayTime = `${hour}:${parts[1]} ${ampm}`;
        }
    }

    console.log('Processing session booking via webhook:', { paymentId, customerEmail, sessionName });

    // 1. Check if already processed (prevent duplicate bookings)
    try {
        const existingResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/bookings?payment_id=eq.${paymentId}&select=id`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (existingResponse.ok) {
            const existing = await existingResponse.json();
            if (existing && existing.length > 0) {
                console.log('Booking already processed:', paymentId);
                return; // Already processed
            }
        }
    } catch (err) {
        console.error('Error checking existing booking:', err);
    }

    // 2. Log to Supabase bookings table
    try {
        const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                email: customerEmail,
                name: customerName,
                phone: customerPhone,
                service_name: sessionName,
                service_price: Math.round(sessionPrice),
                service_duration: parseInt(sessionDuration),
                booking_date: sessionDate,
                booking_time: sessionTime,
                message: customerMessage,
                // Underpaid bookings land as 'pending' (not auto-confirmed 'upcoming')
                // so they surface for manual review instead of silently granting a
                // session at a tampered price; the meet link is withheld too.
                status: underpaymentFlag ? 'pending' : 'upcoming',
                payment_id: paymentId,
                meet_link: underpaymentFlag ? null : meetLink,
                customer_country: notes.customer_country || notes.country || 'Unknown'
            })
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Supabase booking insert failed:', errorText);
        } else {
            console.log('✅ Booking logged to Supabase');
        }
    } catch (err) {
        console.error('Error logging booking to Supabase:', err);
    }

    // 3. Send confirmation email to customer via Brevo (withheld if the
    // captured amount didn't meet the verified price -- see price-tamper
    // guard above; an admin alert is sent instead, further down).
    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        const customerHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 10px;">New Booking</span>
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${customerName}</strong>, your session is confirmed.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${sessionName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} (${sessionDuration} mins)</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px;">Amount Paid</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${meetLink}" style="display: inline-block; background: #e95836; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 30px;">Join Meeting</a>
                        </center>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Need to Reschedule?</p>
                            <p style="font-size: 14px; margin: 0; color: #1a1a1a;">You can view and manage your bookings on our website.</p>
                        </div>
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;

        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Booking Confirmed: ${sessionName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nYour session is confirmed!\n\nSession: ${sessionName}\nDate: ${sessionDate}\nTime: ${displayTime} (${sessionDuration} mins)\nAmount Paid: ₹${sessionPrice}\n\nJoin Meeting Link:\n${meetLink}\n\nPayment ID: ${paymentId}\n\nNeed to reschedule? You can view and manage your bookings on our website.\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
                })
            });

            if (emailResponse.ok) {
                console.log(`✅ Customer booking email sent to ${customerEmail}`);
            } else {
                const errorData = await emailResponse.text();
                console.error(`❌ Brevo Error (Booking Email): ${emailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending customer booking email:', err);
        }
    }

    // 3b. If underpaid, alert the admin distinctly instead of the normal
    // "New Booking Received" email, so it's clear the booking needs review
    // and wasn't auto-confirmed.
    if (BREVO_API_KEY && underpaymentFlag) {
        try {
            const alertHtml = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #1a1a1a;">
                    <h2 style="color: #991b1b;">🚨 Underpaid session booking blocked</h2>
                    <p>A payment was captured for <strong>${sessionName}</strong> but the amount fell short of the verified price. The booking was logged as <strong>pending</strong> (not auto-confirmed) and no meeting link was sent.</p>
                    <table style="border-collapse: collapse;">
                        <tr><td style="padding:4px 10px;color:#666;">Customer</td><td style="padding:4px 10px;">${customerName} (${customerEmail})</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Payment ID</td><td style="padding:4px 10px;">${paymentId}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Captured (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.capturedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Expected minimum (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.expectedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666;">Coupon used</td><td style="padding:4px 10px;">${couponCode || 'none'} (${underpaymentFlag.discountPercent}% resolved)</td></tr>
                    </table>
                </div>
            `;
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🚨 Underpayment blocked: ${sessionName}`,
                    htmlContent: alertHtml,
                    textContent: `Underpaid session booking blocked.\nSession: ${sessionName}\nCustomer: ${customerName} (${customerEmail})\nPaymentId: ${paymentId}\nCaptured INR: ${underpaymentFlag.capturedInr}\nExpected min INR: ${underpaymentFlag.expectedInr}\nCoupon: ${couponCode || 'none'}`
                })
            });
        } catch (err) {
            console.error('Error sending session underpayment alert email:', err);
        }
    }

    // 4. Send admin notification email
    if (BREVO_API_KEY && !underpaymentFlag) {
        const adminHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant Admin</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">New Booking Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${customerName}</strong> just booked a new session.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Booked</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${sessionName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date & Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate} at ${displayTime}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a; padding: 5px 0;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="padding: 15px 0 5px 0;">
                                        <a href="${meetLink}" style="color: #e95836; font-weight: bold; text-decoration: none; font-size: 14px;">🔗 Join Meeting</a>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666; vertical-align: top;">Message</td><td style="padding: 5px 0; color: #1a1a1a;">${customerMessage || 'None'}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #666;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const adminEmailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🆕 New Booking: ${customerName} - ${sessionName}`,
                    htmlContent: adminHtml,
                    textContent: `New Booking Received!\n\n${customerName} just booked a new session.\n\nSession Booked: ${sessionName}\nDate & Time: ${sessionDate} at ${displayTime}\nAmount Received: ₹${sessionPrice}\nLink: ${meetLink}\n\nCustomer Details:\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || 'Not provided'}\nMessage: ${customerMessage || 'None'}\nPayment ID: ${paymentId}`
                })
            });

            if (adminEmailResponse.ok) {
                console.log('✅ Admin booking notification sent');
            } else {
                const errorData = await adminEmailResponse.text();
                console.error(`❌ Brevo Error (Admin Booking): ${adminEmailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending admin booking notification:', err);
        }
    }

    // 📧 Queue a personalised recommendation email after session booking (see comment
    // in handleProductPurchase above — same durable-queue approach). Skipped for
    // underpaid/blocked bookings for the same reason as the product path.
    if (customerEmail && !underpaymentFlag) {
        try {
            await queuePostPurchaseRecommendation({
                customerEmail, customerName, purchasedProductName: sessionName,
                trigger: 'session_booking',
                SUPABASE_URL, SUPABASE_KEY
            });
        } catch (err) {
            console.error('Failed to queue post-session recommendation:', err);
        }
    }
}
