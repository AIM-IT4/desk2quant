// Entitlement for paid Gauntlet projects.
//
// Verified against Razorpay directly rather than the purchases table, because
// purchases has no product_id column (it stores a free-text product_name) and
// is writable with the public anon key. The Razorpay API is the only source a
// buyer cannot forge. Same approach api/grant-access.js already relies on.
//
// Not a route: filename is underscore-prefixed so Vercel does not count it
// against the 12-function Hobby cap.

// project slug -> the Supabase product id that unlocks it
export const PROJECT_PRODUCTS = {
    '01-sofr-curve': 'eb4ee16b-8a1f-475c-9dbf-e03993528ac9'
};

// Extra product ids that also unlock a project. Used for the internal 1-rupee
// payment test; the TEST row is deleted once the flow is verified.
export const EXTRA_UNLOCKS = {
    '01-sofr-curve': ['8e685a6c-670d-42f6-bf36-c3da7e0ed788']
};

const norm = (v) => String(v || '').trim().toLowerCase();

/**
 * Resolve whether `paymentId` (owned by `email`) unlocks `slug`.
 * Returns { ok: true } or { ok: false, status, error }.
 */
export async function verifyProjectEntitlement(slug, paymentId, email) {
    const wantProductId = PROJECT_PRODUCTS[slug];
    if (!wantProductId) {
        return { ok: false, status: 404, error: 'Unknown paid project.' };
    }
    if (!paymentId || !email || !String(email).includes('@')) {
        return { ok: false, status: 400, error: 'payment_id and a valid email are required.' };
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        return { ok: false, status: 503, error: 'Entitlement check unavailable.' };
    }

    const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    let payment;
    try {
        const resp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: auth }
        });
        if (!resp.ok) return { ok: false, status: 404, error: 'Payment not found.' };
        payment = await resp.json();
    } catch (err) {
        console.error('Razorpay lookup failed:', err.message);
        return { ok: false, status: 503, error: 'Could not verify your purchase. Try again shortly.' };
    }

    if (payment.status !== 'captured') {
        return { ok: false, status: 402, error: `Payment not captured (status: ${payment.status}).` };
    }

    // The email must match the payment, so a leaked payment_id cannot be
    // reused by someone else.
    const known = [payment.email, payment.notes?.customer_email].filter(Boolean).map(norm);
    if (known.length && !known.includes(norm(email))) {
        return { ok: false, status: 403, error: 'That email does not match the payment record.' };
    }

    // Razorpay does not copy order notes onto the payment, so recover them.
    let notes = payment.notes || {};
    if (!notes.product_id && !notes.cart_items && payment.order_id) {
        try {
            const oResp = await fetch(`https://api.razorpay.com/v1/orders/${payment.order_id}`, {
                headers: { Authorization: auth }
            });
            if (oResp.ok) {
                const order = await oResp.json();
                notes = { ...(order.notes || {}), ...notes };
            }
        } catch (_) { /* fall through to the checks below */ }
    }

    const allowed = [wantProductId].concat(EXTRA_UNLOCKS[slug] || []).map(norm);
    if (allowed.includes(norm(notes.product_id))) return { ok: true };

    // Cart checkouts store "productId:qty:coupon" triples instead.
    const cart = String(notes.cart_items || '');
    if (cart) {
        const ids = cart.split(',').map((part) => norm(part.split(':')[0]));
        if (ids.some((id) => allowed.includes(id))) return { ok: true };
    }

    return { ok: false, status: 403, error: 'That payment is not for this project.' };
}
