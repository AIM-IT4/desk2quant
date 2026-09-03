// Grant Drive access after payment - fallback when webhook fails
// POST /api/grant-access  Body: { payment_id, email }
// Verifies payment with Razorpay, resolves product link, grants Drive reader permission.

import crypto from 'crypto';

import {
    buildSignedDownloadUrl,
    signDownloadToken,
    getDriveAccessToken,
    resolveServableDriveFile,
    grantDrivePermissionOrSignedFallback as grantDrivePermission,
    isSupabaseStorageUrl,
    parseSupabaseStorageUrl,
    streamSupabaseStorageObject
} from '../lib/secureDownload.js';
import { SUPABASE_URL, serviceHeaders, blockIfUnconfigured } from '../lib/supabaseAdmin.js';
// Zero-decimal currency handling lives in lib/pricing.js and is imported, not
// re-declared -- a divergent copy makes the price-tamper guard compare a
// 100x-wrong amount and wave through underpayment (see commit 0db1875, where a
// stale copy undercharged Indonesia 100x).
import { isZeroDecimalCurrency } from '../lib/pricing.js';

function normalizeProductName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ');
}

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


async function handleSignedDownload(req, res) {
    const { fileId, email, expires, sig, name, store } = req.query || {};
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

    if (!fileId || !email || !expires || !sig) {
        return res.status(400).json({ error: 'Missing download token parameters' });
    }
    if (!RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: 'Server misconfigured for download proxy (missing RAZORPAY_KEY_SECRET)' });
    }

    const expectedSig = signDownloadToken(RAZORPAY_KEY_SECRET, fileId, email, expires);
    const sigBuf = Buffer.from(String(sig), 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const validSig = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    if (!validSig) {
        return res.status(403).json({ error: 'Invalid or tampered download link' });
    }
    if (Date.now() > Number(expires)) {
        return res.status(410).json({ error: 'This download link has expired. Please contact support for a new one.' });
    }

    // store=sb routes to Supabase Storage; omitting store or any other value goes
    // to the Drive path (backward compatible — all existing signed URLs still work).
    const isSupabaseStorage = String(store).toLowerCase() === 'sb';

    try {
        if (isSupabaseStorage) {
            const { getServiceKey } = await import('../lib/supabaseAdmin.js');
            const serviceKey = getServiceKey();
            if (!serviceKey) {
                console.error('grant-access download proxy: SUPABASE_SERVICE_ROLE_KEY not set, cannot stream storage object');
                return res.status(500).json({ error: 'Server misconfigured for storage downloads' });
            }
            return await streamSupabaseStorageObject({
                supabaseUrl: SUPABASE_URL,
                serviceKey,
                objectKey: fileId,
                res,
                fileName: name,
            });
        }

        // Drive path (existing behavior)
        if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
            return res.status(500).json({ error: 'Server misconfigured for download proxy (missing Drive credentials)' });
        }
        const token = await getDriveAccessToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
        const isFolder = String(req.query?.isFolder) === '1';
        const { fileId: servableFileId, fileName: resolvedName } = await resolveServableDriveFile(token, fileId, isFolder);

        const driveResp = await fetch(`https://www.googleapis.com/drive/v3/files/${servableFileId}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!driveResp.ok) {
            const detail = await driveResp.text();
            console.error('grant-access download proxy: Drive fetch failed:', detail);
            return res.status(502).json({ error: 'Could not fetch file from storage' });
        }

        res.setHeader('Content-Type', driveResp.headers.get('content-type') || 'application/octet-stream');
        const contentLength = driveResp.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const safeName = String(name || resolvedName || `${servableFileId}.zip`).replace(/[^\w.\- ]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

        const reader = driveResp.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        return res.end();
    } catch (err) {
        console.error('grant-access download proxy error:', err.message);
        return res.status(500).json({ error: 'Internal server error while streaming file' });
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Signed download proxy - GET /api/grant-access?action=download&fileId=...&email=...&expires=...&sig=...
    // Used as the secure fallback for buyers whose email has no Google
    // Account, instead of making the file publicly link-shareable.
    if (req.method === 'GET' && req.query?.action === 'download') {
        return handleSignedDownload(req, res);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ error: 'Payment gateway not configured' });
    }
    if (blockIfUnconfigured(res, 'grant-access')) return;

    try {
        const { payment_id: paymentId, email } = req.body || {};
        if (!paymentId || !email || !String(email).includes('@')) {
            return res.status(400).json({ error: 'payment_id and valid email required' });
        }

        // 1. Verify payment is real and captured (server-side, cannot be spoofed)
        const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const payResp = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
            headers: { Authorization: authHeader }
        });
        if (!payResp.ok) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        const payment = await payResp.json();
        if (payment.status !== 'captured') {
            return res.status(402).json({ error: `Payment not captured (status: ${payment.status})` });
        }
        if ((Number(payment.amount_refunded) || 0) > 0 || payment.refund_status === 'full') {
            return res.status(402).json({ error: 'Payment has been refunded' });
        }

        // Email must match the payment's email or the email recorded in notes —
        // prevents third parties with a payment_id from granting themselves access
        const knownEmails = [payment.email, payment.notes?.customer_email]
            .filter(Boolean).map(e => String(e).trim().toLowerCase());
        if (knownEmails.length && !knownEmails.includes(String(email).trim().toLowerCase())) {
            return res.status(403).json({ error: 'Email does not match payment record' });
        }

        // 2. Cart purchases (payment.notes.type === 'cart') store a
        // "productId:qty:couponCode" list in notes.cart_items instead of a
        // single product_name/download_link -- handle as a distinct
        // multi-item path, mirroring handleCartPurchase() in razorpay-webhook.js.
        //
        // Razorpay does NOT copy order notes to payment notes, so a payment
        // that was genuinely a cart checkout can still show up here with an
        // empty payment.notes.type/.cart_items -- fetch the order to recover
        // them before deciding this isn't a cart purchase (mirrors the same
        // fallback razorpay-webhook.js uses for the single-item path).
        let cartType = payment.notes?.type;
        let cartItemsRaw = payment.notes?.cart_items;
        if (!cartType && payment.order_id) {
            try {
                const orderResp = await fetch(`https://api.razorpay.com/v1/orders/${payment.order_id}`, {
                    headers: { Authorization: authHeader }
                });
                if (orderResp.ok) {
                    const order = await orderResp.json();
                    const orderNotes = order.notes || {};
                    cartType = cartType || orderNotes.type;
                    cartItemsRaw = cartItemsRaw || orderNotes.cart_items;
                }
            } catch (err) {
                console.error('grant-access: order notes fallback (cart detection) failed:', err.message);
            }
        }
        // A payment whose order says type=cart is a cart purchase, period. If its
        // items can't be read from the payment or order notes, fail closed with
        // the cart-specific error instead of falling through to the single-item
        // path (which would return a misleading "No download link found").
        if (cartType === 'cart') {
            const parsedItems = String(cartItemsRaw || '')
                .split(',')
                .filter(Boolean)
                .map((triple) => {
                    const [pid, qtyStr, itemCouponCode] = triple.split(':');
                    return { productId: pid, quantity: Math.max(1, parseInt(qtyStr, 10) || 1), couponCode: itemCouponCode || null };
                })
                .filter((item) => item.productId);

            if (parsedItems.length === 0) {
                return res.status(404).json({ error: 'No cart items found on this payment' });
            }

            try {
                const { getExpectedCartOrder, isWithinTolerance } = await import('../lib/pricing.js');
                const capturedMajor = isZeroDecimalCurrency(payment.currency)
                    ? payment.amount
                    : payment.amount / 100;
                const expected = await getExpectedCartOrder(
                    parsedItems.map((i) => ({ product_id: i.productId, quantity: i.quantity, coupon_code: i.couponCode })),
                    payment.currency,
                    payment.notes?.coupon_code || null
                );
                if (expected.ok && !(await isWithinTolerance(capturedMajor, expected.amountMajor ?? expected.amountInr, payment.currency))) {
                    console.error('grant-access (cart): underpayment detected, refusing to grant:', { paymentId, capturedMajor, expected });
                    return res.status(402).json({ error: 'Captured amount does not match the cart total. This purchase has been flagged for review.' });
                }
            } catch (err) {
                console.error('grant-access cart price verification error:', err.message);
            }

            const items = [];
            for (const item of parsedItems) {
                let name = item.productId;
                let fileUrl = '';
                {
                    const prodResp = await fetch(
                        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(item.productId)}&select=name,file_url`,
                        { headers: serviceHeaders() }
                    );
                    if (prodResp.ok) {
                        const rows = await prodResp.json();
                        if (rows && rows[0]) {
                            name = rows[0].name || name;
                            fileUrl = rows[0].file_url || '';
                        }
                    } else {
                        console.error('grant-access (cart): product lookup failed:', prodResp.status, await prodResp.text());
                    }
                }

                let downloadLink = fileUrl || null;
                let granted = false;
                let grantError = null;
                let secureDownloadUrl = null;

                // Supabase-hosted product: the bucket is private, so hand out a
                // signed, expiring proxy URL instead of the raw storage URL.
                const storageRef = parseSupabaseStorageUrl(downloadLink);
                if (storageRef) {
                    const baseUrl = `https://${req.headers.host}`;
                    downloadLink = buildSignedDownloadUrl(
                        baseUrl, RAZORPAY_KEY_SECRET, storageRef.objectKey, email,
                        storageRef.fileName || name, false, 'sb'
                    );
                    granted = true;
                    console.log(`grant-access (cart): issued signed storage URL for ${storageRef.objectKey} to ${email} (payment ${paymentId})`);
                    items.push({ product: name, download_link: downloadLink, drive_access_granted: granted, drive_error: grantError });
                    continue;
                }

                const driveFileId = extractDriveFileId(downloadLink);
                if (driveFileId && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
                    const isFolder = downloadLink.includes('/folders/');
                    try {
                        const grantResult = await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, email);
                        if (grantResult && grantResult.fallback === 'signed_download_url') {
                            const baseUrl = `https://${req.headers.host}`;
                            secureDownloadUrl = buildSignedDownloadUrl(baseUrl, RAZORPAY_KEY_SECRET, driveFileId, email, name, isFolder);
                            console.log(`grant-access (cart): issued signed download URL for ${driveFileId} to ${email} (no Google Account) (payment ${paymentId})`);
                        } else {
                            console.log(`grant-access (cart): shared ${driveFileId} with ${email} (payment ${paymentId})`);
                        }
                        granted = true;
                    } catch (err) {
                        grantError = err.message;
                        console.error(`grant-access (cart) share failed: ${err.message}`);
                    }
                    downloadLink = secureDownloadUrl || (isFolder
                        ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                        : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`);
                }
                items.push({ product: name, download_link: downloadLink, drive_access_granted: granted, drive_error: grantError });
            }

            return res.status(200).json({ success: true, cart: true, items });
        }

        // 3. Single-item (legacy) purchases: Resolve product name + link from payment/order notes
        let productName = payment.notes?.product_name;
        let downloadLink = payment.notes?.download_link || '';
        let productId = payment.notes?.product_id || null;
        let couponCode = payment.notes?.coupon_code || null;
        let orderNotes = null;
        if ((!productName || !downloadLink || !productId) && payment.order_id) {
            const orderResp = await fetch(`https://api.razorpay.com/v1/orders/${payment.order_id}`, {
                headers: { Authorization: authHeader }
            });
            if (orderResp.ok) {
                const order = await orderResp.json();
                orderNotes = order.notes || {};
                productName = productName || orderNotes.product_name;
                downloadLink = downloadLink || orderNotes.download_link || '';
                productId = productId || orderNotes.product_id || null;
                couponCode = couponCode || orderNotes.coupon_code || null;
            }
        }

        // SECURITY: re-verify the captured amount against the real product
        // price before granting access -- this endpoint is a public fallback
        // for when the webhook fails, so it needs the same price-tamper guard
        // razorpay-webhook.js has (see lib/pricing.js).
        const { getExpectedProductOrder, isWithinTolerance, fetchProductByName } = await import('../lib/pricing.js');
        // Resolve product_id from the product name when missing (e.g. a raw
        // Razorpay Checkout call bypassing create-order.js) so the price
        // check below still runs instead of being skipped outright.
        if (!productId && productName) {
            try {
                const resolved = await fetchProductByName(productName);
                if (resolved) {
                    productId = resolved.id;
                    console.warn('⚠️ grant-access: product_id missing from notes; resolved by name to', productId, 'for', productName, '(paymentId:', paymentId, ')');
                }
            } catch (err) {
                console.error('⚠️ grant-access: product name resolution error:', err.message);
            }
        }
        if (!productId) {
            // Fail closed: grant-access is the customer-facing fallback, but a
            // purchase whose product_id cannot be resolved (by id or name) is
            // not one we can verify or fulfil safely. All current checkouts go
            // through create-order.js, which always stamps product_id.
            console.error('🚨 grant-access: no product_id resolvable for:', productName, '(paymentId:', paymentId, ') — refusing to grant');
            return res.status(500).json({ error: 'Could not verify this purchase. Please contact support with your payment id.' });
        }
        let expected;
        try {
            expected = await getExpectedProductOrder(productId, payment.currency, couponCode);
        } catch (err) {
            console.error('grant-access price verification error:', err.message);
            return res.status(500).json({ error: 'Could not verify payment amount. Please try again or contact support.' });
        }
        if (!expected.ok) {
            console.error('🚨 grant-access: product_id does not resolve:', { paymentId, productId });
            return res.status(500).json({ error: 'Could not verify this purchase. Please contact support with your payment id.' });
        }
        const capturedMajor = isZeroDecimalCurrency(payment.currency)
            ? payment.amount
            : payment.amount / 100;
        if (!(await isWithinTolerance(capturedMajor, expected.amountMajor, payment.currency))) {
            console.error('🚨 grant-access: underpayment detected, refusing to grant:', { paymentId, productId, capturedMajor, expected });
            return res.status(402).json({ error: 'Captured amount does not match the product price. This purchase has been flagged for review.' });
        }

        // 3. Fallback: look up link in Supabase products by name
        if (!downloadLink && productName) {
            const prodResp = await fetch(`${SUPABASE_URL}/rest/v1/products?select=name,file_url`, {
                headers: serviceHeaders()
            });
            if (prodResp.ok) {
                const products = await prodResp.json();
                const norm = normalizeProductName(productName);
                const matched = Array.isArray(products)
                    ? products.find(p => normalizeProductName(p.name) === norm && p.file_url)
                    : null;
                if (matched) downloadLink = matched.file_url;
            } else {
                console.error('grant-access: product name fallback failed:', prodResp.status, await prodResp.text());
            }
        }

        if (!downloadLink) {
            return res.status(404).json({ error: 'No download link found for this purchase', product: productName || null });
        }

        // 4. Deliver the file.
        let granted = false;
        let grantError = null;
        let secureDownloadUrl = null;

        // Supabase-hosted product: bucket is private, so issue a signed,
        // expiring proxy URL rather than the raw (now 400-ing) storage URL.
        const storageRef = parseSupabaseStorageUrl(downloadLink);
        if (storageRef) {
            const baseUrl = `https://${req.headers.host}`;
            downloadLink = buildSignedDownloadUrl(
                baseUrl, RAZORPAY_KEY_SECRET, storageRef.objectKey, email,
                storageRef.fileName || productName, false, 'sb'
            );
            console.log(`grant-access: issued signed storage URL for ${storageRef.objectKey} to ${email} (payment ${paymentId})`);
            return res.status(200).json({
                success: true,
                product: productName || null,
                download_link: downloadLink,
                drive_access_granted: true,
                drive_error: null
            });
        }

        const driveFileId = extractDriveFileId(downloadLink);

        if (driveFileId && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
            const isFolder = downloadLink.includes('/folders/');
            try {
                const grantResult = await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, email);
                if (grantResult && grantResult.fallback === 'signed_download_url') {
                    const baseUrl = `https://${req.headers.host}`;
                    secureDownloadUrl = buildSignedDownloadUrl(baseUrl, RAZORPAY_KEY_SECRET, driveFileId, email, productName, isFolder);
                    console.log(`grant-access: issued signed download URL for ${driveFileId} to ${email} (no Google Account) (payment ${paymentId})`);
                } else {
                    console.log(`✅ grant-access: shared ${driveFileId} with ${email} (payment ${paymentId})`);
                }
                granted = true;
            } catch (err) {
                grantError = err.message;
                console.error(`❌ grant-access: ${err.message}`);
            }
            downloadLink = secureDownloadUrl || (isFolder
                ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`);
        }

        // Persist purchase row with service-role privileges if not already recorded.
        // This ensures the buyer appears in My Access and revenue stats even if the webhook was delayed.
        try {
            const checkResp = await fetch(
                `${SUPABASE_URL}/rest/v1/purchases?payment_id=eq.${encodeURIComponent(paymentId)}&select=id`,
                { headers: serviceHeaders() }
            );
            const existing = checkResp.ok ? await checkResp.json() : [];
            if (!existing || existing.length === 0) {
                const capturedAmount = isZeroDecimalCurrency(payment.currency) ? payment.amount : (payment.amount / 100);
                await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
                    method: 'POST',
                    headers: {
                        ...serviceHeaders(),
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        customer_email: email,
                        product_name: productName,
                        amount: capturedAmount,
                        currency: payment.currency || 'INR',
                        payment_id: paymentId,
                        source: 'frontend',
                        download_link: downloadLink,
                        created_at: new Date().toISOString()
                    })
                });
                console.log(`grant-access: logged purchase row for ${paymentId}`);
            }
        } catch (dbErr) {
            console.warn('grant-access: could not persist fallback purchase row:', dbErr.message);
        }

        return res.status(200).json({
            success: true,
            product: productName || null,
            download_link: downloadLink,
            drive_access_granted: granted,
            drive_error: grantError
        });
    } catch (error) {
        console.error('grant-access error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
