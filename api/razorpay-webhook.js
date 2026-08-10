// Razorpay Webhook Handler
// This endpoint is called by Razorpay when payment events occur
// Handles product purchases and session bookings

import crypto from 'crypto';
import {
    grantDrivePermissionOrSignedFallback,
    buildSignedDownloadUrl,
    parseSupabaseStorageUrl
} from '../lib/secureDownload.js';
import { createJitsiMeetingLink } from '../lib/jitsi.js';
import { queuePostPurchaseRecommendation } from '../lib/recommendationQueue.js';
import { getExpectedProductOrder, getExpectedSessionOrder, getExpectedCartOrder, isWithinTolerance, isZeroDecimalCurrency } from '../lib/pricing.js';
import { getServiceKey } from '../lib/supabaseAdmin.js';
import { emailShell, escapeHtml } from '../lib/emailBranding.js';
import { signBookingToken } from '../lib/bookingTokens.js';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://desk2quant.com';

// Disable Vercel body parsing so we can read the raw stream for signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper function to read the raw body from the request stream
// Reply-To for every outbound email. Declared at module scope because the
// send blocks live in handleProductPurchase / handleCartPurchase /
// handleSessionBooking, which cannot see the handler's local consts. It was
// previously declared inside handler(), so every one of those sends threw
// "ReferenceError: REPLY_TO_EMAIL is not defined" and silently delivered
// nothing -- the catch blocks only console.error.
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL
    || process.env.SENDER_EMAIL
    || 'hello@desk2quant.com';

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
    // Service-role key: RLS denies `anon` on products/purchases/bookings, so the
    // old inline anon-key fallback here would silently fail every write and every
    // file_url lookup. Fail loudly instead of recording nothing.
    const SUPABASE_KEY = getServiceKey();
    if (!SUPABASE_KEY) {
        console.error('CONFIG: SUPABASE_SERVICE_ROLE_KEY is not set — cannot record purchases or resolve download links.');
    }
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    // Warn loudly rather than silently misrouting. Sale alerts went to the
    // gmail fallback because ADMIN_EMAIL was simply never set, and nothing in
    // the logs said so -- the same silent-fallback shape as the REPLY_TO_EMAIL
    // bug that killed every purchase email.
    if (!process.env.ADMIN_EMAIL) {
        console.warn('CONFIG: ADMIN_EMAIL not set - sale alerts fall back to hello@desk2quant.com');
    }
    if (!process.env.SENDER_EMAIL) {
        console.warn('CONFIG: SENDER_EMAIL not set - sending as hello@desk2quant.com');
    }
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@desk2quant.com';
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
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
            const amount = isZeroDecimalCurrency(currency) ? payment.amount : payment.amount / 100;
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
// Shares a Drive file/folder with customerEmail, with a secure fallback to a
// signed, expiring download URL (never a public link) when the email has no
// Google Account. Shared implementation lives in lib/secureDownload.js so the
// webhook and api/grant-access.js cannot drift apart on the Drive role.
async function grantDrivePermission(clientEmail, privateKey, fileId, customerEmail) {
    if (!clientEmail || !privateKey) {
        console.warn('Google Drive credentials missing in environment; skipping permission grant');
        return null;
    }
    return grantDrivePermissionOrSignedFallback(clientEmail, privateKey, fileId, customerEmail);
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
    // Fail closed: every current checkout goes through create-order.js, which
    // always stamps product_id, so a captured product payment without a
    // resolvable product_id (or a price we cannot verify) must NOT be granted
    // access. Throwing makes the webhook return 500 so Razorpay retries, instead
    // of silently fulfilling an unverifiable payment.
    let underpaymentFlag = null;
    if (!productId) {
        throw new Error(`Refusing to fulfil product purchase without product_id (paymentId: ${paymentId}, product: ${productName})`);
    }
    let expected;
    try {
        expected = await getExpectedProductOrder(productId, currency, couponCode);
    } catch (err) {
        throw new Error(`Product price verification failed (paymentId: ${paymentId}, productId: ${productId}): ${err.message}`);
    }
    if (!expected.ok) {
        throw new Error(`Cannot verify product price — product_id does not resolve (paymentId: ${paymentId}, productId: ${productId}, product: ${productName}): ${expected.error || 'unknown'}`);
    }
    if (!isWithinTolerance(inrAmount, expected.amountInr)) {
        underpaymentFlag = {
            expectedInr: expected.amountInr,
            capturedInr: inrAmount,
            discountPercent: expected.discountPercent
        };
        console.error('🚨 UNDERPAYMENT DETECTED — refusing to grant access:', {
            paymentId, productName, productId, ...underpaymentFlag
        });
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

    // SECURITY (B2): `downloadLink` arrives from payment/order notes, which a
    // client controls -- a raw Razorpay Checkout call can set them freely. So
    // paying for a cheap product while stamping a premium bundle's Drive URL in
    // the notes used to make the service account share the premium file.
    //
    // The price guard above only compares the captured amount against the
    // price of `product_id`, so that attack pays the *correct* cheap price and
    // sails through it. The link itself has to be re-derived server-side.
    //
    // Whenever product_id resolves to a row, that row's file_url wins outright
    // and the client-supplied link is discarded. Falling back to the name match
    // and the static map below keeps the legacy path (no product_id in notes)
    // working exactly as before.
    if (productId) {
        try {
            const byIdResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=name,file_url`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );
            if (byIdResponse.ok) {
                const rows = await byIdResponse.json();
                const authoritative = Array.isArray(rows) ? rows.find((row) => row.file_url) : null;
                if (authoritative) {
                    if (downloadLink && downloadLink !== authoritative.file_url) {
                        console.warn('🚨 Client-supplied download_link did not match the product row; ignoring it.', {
                            paymentId, productId, supplied: downloadLink
                        });
                    }
                    downloadLink = authoritative.file_url;
                    console.log('Resolved download link server-side from product_id:', authoritative.name);
                }
            }
        } catch (err) {
            console.warn('Error resolving product by id, falling back to name match:', err.message);
        }
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

    // Supabase-hosted product: the storage bucket is private, so the raw
    // /object/public/ URL no longer resolves. Issue a signed, expiring,
    // per-buyer proxy link instead. Same underpayment gate as Drive below.
    const storageRef = parseSupabaseStorageUrl(downloadLink);
    if (storageRef && !underpaymentFlag) {
        downloadLink = buildSignedDownloadUrl(
            PUBLIC_BASE_URL, process.env.RAZORPAY_KEY_SECRET, storageRef.objectKey,
            customerEmail, storageRef.fileName || productName, false, 'sb'
        );
        hasSharedSecurely = true;
        console.log(`Issued signed storage URL for ${storageRef.objectKey} to ${customerEmail}`);
    }

    const driveFileId = storageRef ? null : extractDriveFileId(downloadLink);

    // Do NOT grant Drive access or reveal the download link when the
    // captured amount fell short of the verified price (see price-tamper
    // guard above). The purchase is still logged (flagged) so it shows up
    // for manual review instead of silently disappearing.
    if (driveFileId && !underpaymentFlag) {
        const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

        if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
            console.log(`Google Drive Secure Flow: Sharing ID ${driveFileId} with ${customerEmail}...`);
            const isFolder = downloadLink.includes('/folders/') || downloadLink.includes('/drive/folders/');
            try {
                const grantResult = await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, customerEmail);
                if (grantResult && grantResult.fallback === 'signed_download_url') {
                    // The buyer's email has no Google Account. Do NOT fall back to a
                    // public "anyone with the link" share -- that would expose a paid
                    // product to anyone who obtains the URL. Issue a signed, expiring,
                    // per-buyer link that streams the file through our own server.
                    downloadLink = buildSignedDownloadUrl(PUBLIC_BASE_URL, process.env.RAZORPAY_KEY_SECRET, driveFileId, customerEmail, productName, isFolder);
                    console.log(`Issued signed download URL for ${driveFileId} to ${customerEmail} (no Google Account)`);
                } else {
                    console.log(`✅ Successfully shared Drive ID ${driveFileId} with ${customerEmail}`);
                    downloadLink = isFolder
                        ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                        : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
                }
                hasSharedSecurely = true;
            } catch (err) {
                console.error(`❌ Failed to share Google Drive item: ${err.message}`);
                fallbackToManualInfo = true;
                downloadLink = isFolder
                    ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                    : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
            }
        } else {
            console.warn('GCP Google Drive credentials not configured in environment variables. Sharing bypassed.');
        }
    }

    if (!frontendAlreadyProcessed) {
        // Fail closed: the purchases row is the durable record of this sale. If
        // it cannot be written, throw so the webhook 500s and Razorpay retries —
        // a customer must not be charged with no record and no download email.
        let insertResp;
        try {
            insertResp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
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
        } catch (err) {
            console.error('❌ Error logging to Supabase (network):', err.message, '| PaymentId:', paymentId);
            throw new Error(`Failed to record purchase in Supabase (paymentId: ${paymentId}): ${err.message}`);
        }
        if (insertResp.ok) {
            console.log('✅ Purchase logged to Supabase by webhook. PaymentId:', paymentId);
        } else {
            const errBody = await insertResp.text();
            console.error('❌ SUPABASE INSERT FAILED. Status:', insertResp.status, '| Body:', errBody, '| PaymentId:', paymentId);
            throw new Error(`Failed to record purchase in Supabase (${insertResp.status}) (paymentId: ${paymentId}): ${errBody}`);
        }
    }

    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        const customerHtml = emailShell({ body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#ffca3a; color:#090909; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909; margin-right:10px;">New Purchase</span>
                            <span style="display: inline-block; background:#0b7f79; color:#ffffff; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${escapeHtml(customerName)}</strong>, thank you for purchasing from Desk2Quant.</p>
                        
                        ${hasSharedSecurely ? `
                        <div style="background:#dff2ef; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; padding:15px; margin-bottom:25px; font-size:13px; color:#064e4a; line-height:1.5;">
                            <strong>🔒 Secured Resource:</strong> We have shared this resource with your email address <strong>${escapeHtml(customerEmail)}</strong>. Please ensure you are logged into Google Drive with this email address to view it.
                        </div>
                        ` : ''}
                        
                        ${fallbackToManualInfo ? `
                        <div style="background:#fff3c4; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; padding:15px; margin-bottom:25px; font-size:13px; color:#7c4a03; line-height:1.5;">
                            <strong>⚠️ Custom Share Access:</strong> We attempted to automatically share this secure Google Drive resource with <strong>${escapeHtml(customerEmail)}</strong>. If your email is not associated with a Google Account, or if you cannot access the link, please reply to this email with your Google/Gmail address, and we will grant access manually!
                        </div>
                        ` : ''}

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Digital Product</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(productName)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold;">Amount</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>
                        
                        ${gauntletPlaygroundBlock(productId, productName, paymentId)}
                        <center>
                            <a href="${downloadLink}" style="display: inline-block; background:#ffca3a; color:#090909; font-weight:800; text-decoration:none; padding:14px 30px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; font-size:16px; margin-bottom:30px;">Download / View Resource</a>
                        </center>
 
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Direct Link Backup</p>
                            <p style="font-size: 14px; margin: 0 0 8px 0; color: #090909;">If the button does not open in your email app, copy and paste this link into your browser:</p>
                            <p style="font-size: 13px; margin: 0; word-break: break-all;">
                                <a href="${downloadLink}" style="color: #0b7f79; text-decoration: underline; word-break: break-all; overflow-wrap: anywhere;">${downloadLink}</a>
                            </p>
                        </div>

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Purchase Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Name</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerName)}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Email</td><td style="padding: 5px 0; color: #090909; word-break: break-all;"><a href="mailto:${escapeHtml(customerEmail)}" style="color: #0b7f79; text-decoration: none;">${escapeHtml(customerEmail)}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Phone</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerPhone || 'N/A')}</td></tr>
                            </table>
                        </div>

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Payment ID</td><td style="padding: 5px 0; color: #090909; word-break: break-all;">${paymentId}</td></tr>
                            </table>
                        </div>
        ` });

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
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Your Purchase: ${productName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nThank you for your purchase!\n\nProduct: ${productName}\nAmount: ${currency} ${amount}\n\nPlease download your resource using this link:\n${downloadLink}\n\nIf the button does not work, copy and paste the same link into your browser.\n\nPayment ID: ${paymentId}${gauntletPlaygroundText(productId, productName, paymentId)}\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
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
        // B4: Send a clear explanation to the customer so they're not left
        // wondering why they were charged and got nothing.
        const customerHtml = emailShell({ body: `
                        <h2 style="color: #d73f3f; margin: 0 0 20px 0;">Payment received, awaiting review</h2>
                        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${escapeHtml(customerName)}</strong>,</p>
                        <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">We received your payment for <strong>${escapeHtml(productName)}</strong>, but the amount doesn't match our current pricing. This can happen if a discount expired mid-checkout or if there was an unintended mismatch.</p>
                        <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">We're reviewing your order manually and will send your download link or refund within 24 hours. If you have questions, reply to this email with your <strong>Payment ID: ${paymentId}</strong>.</p>
                        <p style="font-size: 14px; line-height: 1.6; margin-bottom: 0;">Thanks for your patience.</p>
        ` });
        try {
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Your order for ${productName} is under review`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nWe received your payment for ${productName}, but the amount doesn't match our current pricing. This can happen if a discount expired mid-checkout.\n\nWe're reviewing your order manually and will send your download link or refund within 24 hours.\n\nPayment ID: ${paymentId}\n\nHave questions? Reply to this email.\n\nSent by Desk2Quant`
                })
            });
        } catch (err) {
            console.error('Error sending underpaid customer email:', err);
        }

        // Distinct admin alert so the underpayment is impossible to miss.
        try {
            const alertHtml = emailShell({ admin: true, body: `
                    <h2 style="color: #d73f3f;">🚨 Underpaid purchase attempt blocked</h2>
                    <p>A payment was captured for <strong>${escapeHtml(productName)}</strong> but the amount fell short of the verified price. Access/download link were <strong>NOT</strong> granted.</p>
                    <table style="border-collapse: collapse;">
                        <tr><td style="padding:4px 10px;color:#666761;">Customer</td><td style="padding:4px 10px;">${escapeHtml(customerName)} (${escapeHtml(customerEmail)})</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Payment ID</td><td style="padding:4px 10px; word-break: break-all;">${paymentId}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Captured (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.capturedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Expected minimum (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.expectedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Coupon used</td><td style="padding:4px 10px;">${escapeHtml(couponCode || 'none')} (${underpaymentFlag.discountPercent}% resolved)</td></tr>
                    </table>
                    <p>If this was a legitimate discount our pricing rules don't know about, grant access manually and consider updating lib/pricing.js.</p>
            ` });
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🚨 Underpayment blocked: ${productName}`,
                    htmlContent: alertHtml,
                    textContent: `Underpaid purchase blocked.\nProduct: ${productName}\nCustomer: ${escapeHtml(customerName)} (${escapeHtml(customerEmail)})\nPaymentId: ${paymentId}\nCaptured INR: ${underpaymentFlag.capturedInr}\nExpected min INR: ${underpaymentFlag.expectedInr}\nCoupon: ${couponCode || 'none'}`
                })
            });
        } catch (err) {
            console.error('Error sending underpayment alert email:', err);
        }
    }

    if (BREVO_API_KEY && !underpaymentFlag) {
        const adminHtml = emailShell({ admin: true, body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#0b7f79; color:#ffffff; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">New Sale Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${escapeHtml(customerName)}</strong> just purchased a digital product.</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Product Sold</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(productName)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #0b7f79;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Name</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerName)}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Email</td><td style="padding: 5px 0; color: #090909; word-break: break-all;"><a href="mailto:${escapeHtml(customerEmail)}" style="color: #0b7f79; text-decoration: none;">${escapeHtml(customerEmail)}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Phone</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerPhone || 'Not provided')}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Download Link</td><td style="padding: 5px 0; color: #090909; word-break: break-all;">${downloadLink}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px; color: #666761;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px; color: #090909; word-break: break-all;">${paymentId} (Webhook)</td></tr>
                            </table>
                        </div>
        ` });

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
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
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
// Gauntlet purchases unlock an in-browser playground with instant grading.
// The buyer's payment id is the access key, so surface it prominently rather
// than leaving it buried in the order-details table at the bottom.
const GAUNTLET_PROJECTS = {
    'eb4ee16b-8a1f-475c-9dbf-e03993528ac9': '01-sofr-curve'
};

function gauntletPlaygroundText(productId, productName, paymentId) {
    let slug = productId ? GAUNTLET_PROJECTS[String(productId).trim()] : null;
    if (!slug && /gauntlet/i.test(String(productName || ''))) slug = '01-sofr-curve';
    if (!slug || !paymentId) return '';
    return '\n\nRun it in your browser: https://desk2quant.com/gauntlet-playground.html?project='
        + slug
        + '\nWrite Python, run the self-checks, and get an instant graded scorecard.'
        + '\nUnlock with the email you paid with plus the payment id above.';
}

function gauntletPlaygroundBlock(productId, productName, paymentId) {
    let slug = productId ? GAUNTLET_PROJECTS[String(productId).trim()] : null;
    // Fall back to the name: cart lines and older orders may not carry an id.
    if (!slug && /gauntlet/i.test(String(productName || ''))) slug = '01-sofr-curve';
    if (!slug || !paymentId) return '';

    const url = 'https://desk2quant.com/gauntlet-playground.html?project=' + slug;
    return `
                        <div style="background:#dff2ef; border:1px solid #090909; padding:22px; border-radius:0; box-shadow:4px 4px 0 #090909; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #0b7f79; text-transform: uppercase; font-weight: bold; margin: 0 0 12px 0; letter-spacing: 0.5px;">Run it in your browser</p>
                            <p style="font-size: 14px; margin: 0 0 14px 0; color: #090909; line-height: 1.55;">
                                You do not have to install anything. Open the playground to write Python in the browser, run the public self-checks, and get an <strong>instant graded scorecard</strong> from the hidden test suite.
                            </p>
                            <center>
                                <a href="${url}" style="display: inline-block; background:#0b7f79; color:#ffffff; font-weight:800; text-decoration:none; padding:13px 26px; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; font-size:15px;">Open the playground</a>
                            </center>
                            <p style="font-size: 13px; margin: 14px 0 0 0; color: #444; line-height: 1.55;">
                                To unlock it, enter the email you paid with and this payment id:<br>
                                <span style="font-family: monospace; font-size: 14px; color: #090909; font-weight: bold; word-break: break-all;">${paymentId}</span>
                            </p>
                        </div>
`;
}

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
        // Fail closed: a cart payment with no readable items must not be
        // acknowledged-and-forgotten (charged customer, no record). Throw so
        // Razorpay retries; grant-access can recover the items from order notes.
        throw new Error(`Cart webhook: no items parsed from cart_items note (paymentId: ${paymentId}): ${cartItemsRaw}`);
    }

    console.log(`Processing cart purchase: ${parsedItems.length} item(s) for ${customerEmail}`);

    // Price-tamper guard (defense in depth, mirrors handleProductPurchase).
    // Fail closed: if the cart total cannot be verified, throw so the webhook
    // 500s and Razorpay retries instead of fulfilling an unverifiable payment.
    let underpaymentFlag = null;
    let expected;
    try {
        expected = await getExpectedCartOrder(
            parsedItems.map((i) => ({ product_id: i.productId, quantity: i.quantity, coupon_code: i.couponCode })),
            currency,
            couponCode
        );
    } catch (err) {
        throw new Error(`Cart price verification failed (paymentId: ${paymentId}): ${err.message}`);
    }
    if (!expected.ok) {
        throw new Error(`Cannot verify cart price (paymentId: ${paymentId}): ${expected.error || 'unknown'}`);
    }
    if (!isWithinTolerance(inrAmount, expected.amountInr)) {
        underpaymentFlag = { expectedInr: expected.amountInr, capturedInr: inrAmount };
        console.error('🚨 UNDERPAYMENT DETECTED (cart) — refusing to grant access:', { paymentId, ...underpaymentFlag });
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

        // Supabase-hosted line item: the bucket is private, so the raw
        // /object/public/ URL no longer resolves. Hand out a signed, expiring,
        // per-buyer proxy link instead. Same underpayment gate as Drive below.
        const storageRef = parseSupabaseStorageUrl(downloadLink);
        if (storageRef && !underpaymentFlag) {
            downloadLink = buildSignedDownloadUrl(
                PUBLIC_BASE_URL, process.env.RAZORPAY_KEY_SECRET, storageRef.objectKey,
                customerEmail, storageRef.fileName || name, false, 'sb'
            );
            hasSharedSecurely = true;
            console.log(`Issued signed storage URL for cart line "${name}" (${storageRef.objectKey}) to ${customerEmail}`);
        }

        const driveFileId = storageRef ? null : extractDriveFileId(downloadLink);

        if (driveFileId && !underpaymentFlag) {
            const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
            if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
                const isFolder = downloadLink.includes('/folders/') || downloadLink.includes('/drive/folders/');
                try {
                    const grantResult = await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, customerEmail);
                    if (grantResult && grantResult.fallback === 'signed_download_url') {
                        // No Google Account for this buyer -- issue a signed, expiring
                        // per-buyer URL rather than making the file publicly linkable.
                        downloadLink = buildSignedDownloadUrl(PUBLIC_BASE_URL, process.env.RAZORPAY_KEY_SECRET, driveFileId, customerEmail, name, isFolder);
                        console.log(`Issued signed download URL for cart line "${name}" to ${customerEmail} (no Google Account)`);
                    } else {
                        downloadLink = isFolder
                            ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                            : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
                    }
                    hasSharedSecurely = true;
                } catch (err) {
                    console.error(`❌ Failed to share Drive item for cart line "${name}": ${err.message}`);
                    downloadLink = isFolder
                        ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                        : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
                }
            }
        }

        lineResults.push({ productId: item.productId, name, quantity: item.quantity, downloadLink, hasSharedSecurely });
    }

    // Log one purchases row per line item, sharing the same payment_id so
    // admin views can group them, but each keeping its own product_name.
    // Fail closed: the purchases rows are the durable record of this cart sale.
    // If they cannot be written, throw so the webhook 500s and Razorpay retries —
    // a customer must not be charged with no record and no order email.
    let insertResp;
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
        insertResp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(rows)
        });
    } catch (err) {
        console.error('❌ Error logging cart purchase to Supabase (network):', err.message, '| PaymentId:', paymentId);
        throw new Error(`Failed to record cart purchase in Supabase (paymentId: ${paymentId}): ${err.message}`);
    }
    if (insertResp.ok) {
        console.log(`✅ Cart purchase logged to Supabase (${lineResults.length} line items). PaymentId:`, paymentId);
    } else {
        const errBody = await insertResp.text();
        console.error('❌ SUPABASE CART INSERT FAILED. Status:', insertResp.status, '| Body:', errBody, '| PaymentId:', paymentId);
        throw new Error(`Failed to record cart purchase in Supabase (${insertResp.status}) (paymentId: ${paymentId}): ${errBody}`);
    }

    // Single combined confirmation email listing every item + its link.
    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        const itemsHtml = lineResults.map((line) => `
                            <tr>
                                <td style="padding:10px 0;border-bottom:1px solid #d8d8d1;">
                                    <strong>${escapeHtml(line.name)}</strong>${line.quantity > 1 ? ` &times; ${line.quantity}` : ''}<br>
                                    <a href="${line.downloadLink}" style="color:#0b7f79;text-decoration:underline;font-size:13px;">Download / View Resource</a>
                                </td>
                            </tr>`).join('');
        const customerHtml = emailShell({ body: `
                        <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${escapeHtml(customerName)}</strong>, thank you for your order of ${lineResults.length} item${lineResults.length > 1 ? 's' : ''} from Desk2Quant.</p>
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0;">Your Order</p>
                            <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
                            <p style="margin-top:16px;font-size:14px;"><strong>Total paid:</strong> ${currency} ${amount}</p>
                        </div>
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Email</td><td style="padding: 5px 0; word-break: break-all;"><a href="mailto:${escapeHtml(customerEmail)}" style="color:#0b7f79;text-decoration:none;">${escapeHtml(customerEmail)}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Payment ID</td><td style="padding: 5px 0; word-break: break-all;">${paymentId}</td></tr>
                            </table>
                        </div>
        ` });
        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
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
            const adminHtml = emailShell({ admin: true, body: `
                    <h2>New Cart Sale (${lineResults.length} items)</h2>
                    <p><strong>${escapeHtml(customerName)}</strong> (${escapeHtml(customerEmail)}) just purchased:</p>
                    <ul>${lineResults.map((l) => `<li>${escapeHtml(l.name)}${l.quantity > 1 ? ` × ${l.quantity}` : ''}</li>`).join('')}</ul>
                    <p>Total: ${currency} ${amount} | Payment ID: ${paymentId}</p>
            ` });
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: ADMIN_EMAIL.split(',').map((email) => ({ email: email.trim() })).filter((item) => item.email),
                    subject: `New Cart Sale: ${lineResults.length} item(s)`,
                    htmlContent: adminHtml,
                    textContent: `New cart sale.\n${escapeHtml(customerName)} (${escapeHtml(customerEmail)})\nItems: ${lineResults.map((l) => l.name).join(', ')}\nTotal: ${currency} ${amount}\nPaymentId: ${paymentId}`
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
    // Fail closed: sessions are booked through create-order.js too, which always
    // stamps session_id, so a captured session payment without a resolvable
    // session_id (or an unverifiable price) must NOT create a booking. Throw so
    // the webhook 500s and Razorpay retries instead of fulfilling an
    // unverifiable payment.
    let underpaymentFlag = null;
    const sessionId = notes.session_id || null;
    const couponCode = notes.coupon_code || null;
    if (!sessionId) {
        throw new Error(`Refusing to create booking without session_id (paymentId: ${paymentId}, session: ${sessionName})`);
    }
    let expected;
    try {
        expected = await getExpectedSessionOrder(sessionId, currency, couponCode);
    } catch (err) {
        throw new Error(`Session price verification failed (paymentId: ${paymentId}, sessionId: ${sessionId}): ${err.message}`);
    }
    if (!expected.ok) {
        throw new Error(`Cannot verify session price — session_id does not resolve (paymentId: ${paymentId}, sessionId: ${sessionId}, session: ${sessionName}): ${expected.error || 'unknown'}`);
    }
    // Use Razorpay's own authoritative INR figure (base_amount/base_currency,
    // computed by the caller) -- NOT notes.inr_amount, which is a
    // client-stamped value at checkout time and must never be trusted for
    // a security check.
    const capturedInr = (typeof inrAmount === 'number' && !Number.isNaN(inrAmount)) ? inrAmount : amount;
    if (!isWithinTolerance(capturedInr, expected.amountInr)) {
        underpaymentFlag = {
            expectedInr: expected.amountInr,
            capturedInr,
            discountPercent: expected.discountPercent
        };
        console.error('🚨 UNDERPAYMENT DETECTED on session booking — flagging for review:', {
            paymentId, sessionName, sessionId, ...underpaymentFlag
        });
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

    // A3: the browser dropdown was the only thing stopping two people paying
    // for the same slot. Re-check server-side, duration-aware: a 60-minute
    // booking must also block the 30-minute slot that starts inside it.
    // A clash is NOT refused -- the customer has already paid -- it is logged
    // as 'pending' so a human reschedules instead of double-booking silently.
    let slotConflict = false;
    if (sessionDate && sessionTime) {
        try {
            const dayResp = await fetch(
                `${SUPABASE_URL}/rest/v1/bookings?booking_date=eq.${encodeURIComponent(sessionDate)}&select=booking_time,service_duration,status,payment_id`,
                { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
            );
            if (dayResp.ok) {
                const sameDay = await dayResp.json();
                // The frontend sends 12-hour "4:00 PM" in notes while the DB
                // normalizes booking_time to 24-hour "16:00:00". Parse both:
                // HH:MM(:SS) with optional AM/PM suffix -> minutes since midnight.
                const toMin = (t) => {
                    const raw = String(t || '').trim().toLowerCase();
                    const m = raw.match(/^(\d{1,2}):(\d{2})/);
                    if (!m) return 0;
                    let h = parseInt(m[1], 10);
                    const min = parseInt(m[2], 10);
                    if (/pm/.test(raw) && h < 12) h += 12;
                    if (/am/.test(raw) && h === 12) h = 0;
                    return h * 60 + min;
                };
                const newStart = toMin(sessionTime);
                const newEnd = newStart + (parseInt(sessionDuration, 10) || 30);
                slotConflict = (Array.isArray(sameDay) ? sameDay : []).some((b) => {
                    if (b.payment_id === paymentId) return false;
                    if (b.status === 'cancelled' || b.status === 'rejected') return false;
                    const s0 = toMin(b.booking_time);
                    const e0 = s0 + (parseInt(b.service_duration, 10) || 30);
                    return newStart < e0 && s0 < newEnd;
                });
                if (slotConflict) {
                    console.error('🚨 SLOT CONFLICT — double booking paid for:', {
                        paymentId, sessionDate, sessionTime, sessionDuration, customerEmail
                    });
                }
            }
        } catch (err) {
            console.warn('Slot conflict check failed (proceeding):', err.message);
        }
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
                status: (underpaymentFlag || slotConflict) ? 'pending' : 'upcoming',
                payment_id: paymentId,
                meet_link: underpaymentFlag ? null : meetLink,
                customer_country: notes.customer_country || notes.country || 'Unknown'
            })
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Supabase booking insert failed:', errorText);
            // A4/A5: Throw so the webhook 500s → Razorpay retries. Without this,
            // the confirmation email below sends for a booking that doesn't exist.
            throw new Error(`Booking insert failed (${insertResponse.status}): ${errorText}`);
        }
        console.log('✅ Booking logged to Supabase');
    } catch (err) {
        // A4/A5: the throw above is only useful if it escapes. This catch used to
        // swallow it, so a failed insert still fell through to the confirmation
        // email -- the customer was told a booking existed that did not. Rethrow
        // so the handler returns 500 and Razorpay retries the webhook.
        console.error('Error logging booking to Supabase:', err);
        throw err;
    }

    // 3. Send confirmation email to customer via Brevo (withheld if the
    // captured amount didn't meet the verified price -- see price-tamper
    // guard above; an admin alert is sent instead, further down).
    if (BREVO_API_KEY && customerEmail && !underpaymentFlag) {
        // Signed manage link: the bookings self-service requires this token, so
        // the customer's only way to view/reschedule/cancel is this link from
        // their confirmation email (a bare email is no longer sufficient).
        const manageToken = signBookingToken(customerEmail) || '';
        const manageUrl = `${PUBLIC_BASE_URL}/my-bookings.html?email=${encodeURIComponent(customerEmail)}&tk=${encodeURIComponent(manageToken)}`;
        const customerHtml = emailShell({ body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#ffca3a; color:#090909; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909; margin-right:10px;">New Booking</span>
                            <span style="display: inline-block; background:#0b7f79; color:#ffffff; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${escapeHtml(customerName)}</strong>, your session is confirmed.</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(sessionName)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} (${sessionDuration} mins)</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px;">Amount Paid</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${meetLink}" style="display: inline-block; background:#ffca3a; color:#090909; font-weight:800; text-decoration:none; padding:14px 30px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; font-size:16px; margin-bottom:30px;">Join Meeting</a>
                        </center>

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Need to Reschedule or Cancel?</p>
                            <p style="font-size: 14px; margin: 0 0 14px 0; color: #090909;">View, reschedule, or cancel your booking anytime:</p>
                            <center>
                                <a href="${manageUrl}" style="display: inline-block; background:#0b7f79; color:#ffffff; font-weight:800; text-decoration:none; padding:12px 26px; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; font-size:14px;">Manage Booking</a>
                            </center>
                        </div>
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Payment ID</td><td style="padding: 5px 0; color: #090909; word-break: break-all;">${paymentId}</td></tr>
                            </table>
                        </div>
        ` });

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
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Booking Confirmed: ${sessionName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nYour session is confirmed!\n\nSession: ${sessionName}\nDate: ${sessionDate}\nTime: ${displayTime} (${sessionDuration} mins)\nAmount Paid: ₹${sessionPrice}\n\nJoin Meeting Link:\n${meetLink}\n\nPayment ID: ${paymentId}\n\nNeed to reschedule or cancel? Open your manage link:\n${manageUrl}\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
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
            const alertHtml = emailShell({ admin: true, body: `
                    <h2 style="color: #d73f3f;">🚨 Underpaid session booking blocked</h2>
                    <p>A payment was captured for <strong>${escapeHtml(sessionName)}</strong> but the amount fell short of the verified price. The booking was logged as <strong>pending</strong> (not auto-confirmed) and no meeting link was sent.</p>
                    <table style="border-collapse: collapse;">
                        <tr><td style="padding:4px 10px;color:#666761;">Customer</td><td style="padding:4px 10px;">${escapeHtml(customerName)} (${escapeHtml(customerEmail)})</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Payment ID</td><td style="padding:4px 10px; word-break: break-all;">${paymentId}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Captured (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.capturedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Expected minimum (INR)</td><td style="padding:4px 10px;">${underpaymentFlag.expectedInr}</td></tr>
                        <tr><td style="padding:4px 10px;color:#666761;">Coupon used</td><td style="padding:4px 10px;">${escapeHtml(couponCode || 'none')} (${underpaymentFlag.discountPercent}% resolved)</td></tr>
                    </table>
            ` });
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🚨 Underpayment blocked: ${sessionName}`,
                    htmlContent: alertHtml,
                    textContent: `Underpaid session booking blocked.\nSession: ${sessionName}\nCustomer: ${escapeHtml(customerName)} (${escapeHtml(customerEmail)})\nPaymentId: ${paymentId}\nCaptured INR: ${underpaymentFlag.capturedInr}\nExpected min INR: ${underpaymentFlag.expectedInr}\nCoupon: ${couponCode || 'none'}`
                })
            });
        } catch (err) {
            console.error('Error sending session underpayment alert email:', err);
        }
    }

    // 4. Send admin notification email
    if (BREVO_API_KEY && !underpaymentFlag) {
        const adminHtml = emailShell({ admin: true, body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#0b7f79; color:#ffffff; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">New Booking Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${escapeHtml(customerName)}</strong> just booked a new session.</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Booked</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(sessionName)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date & Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate} at ${displayTime}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #0b7f79; padding: 5px 0;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="padding: 15px 0 5px 0;">
                                        <a href="${meetLink}" style="color: #0b7f79; font-weight: bold; text-decoration: none; font-size: 14px;">🔗 Join Meeting</a>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666761; width: 30%;">Name</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerName)}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Email</td><td style="padding: 5px 0; color: #090909; word-break: break-all;"><a href="mailto:${escapeHtml(customerEmail)}" style="color: #0b7f79; text-decoration: none;">${escapeHtml(customerEmail)}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666761;">Phone</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerPhone || 'Not provided')}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666761; vertical-align: top;">Message</td><td style="padding: 5px 0; color: #090909;">${escapeHtml(customerMessage || 'None')}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px; color: #666761;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #d8d8d1; margin-top: 5px; color: #090909;">${paymentId}</td></tr>
                            </table>
                        </div>
        ` });

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
                    replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
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
