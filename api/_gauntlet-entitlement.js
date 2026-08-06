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

const norm = (v) => String(v || '').trim().toLowerCase();

// Must stay identical to the list in lib/pricing.js and api/grant-access.js.
const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX'];

/**
 * SECURITY: order notes are attacker-influenceable (a raw Razorpay Checkout
 * call can set them), so matching product_id alone would let someone pay ₹1
 * with the paid project's id in the notes and unlock it. Re-check the captured
 * amount against the real server-side price, exactly as grant-access.js does.
 * Returns null when the payment is acceptable, or a { ok:false, ... } refusal.
 */
async function verifyAmount(payment, productId, couponCode) {
    try {
        const { getExpectedProductOrder, isWithinTolerance } = await import('../lib/pricing.js');
        const expected = await getExpectedProductOrder(productId, payment.currency, couponCode);
        if (!expected.ok) return null; // price unresolvable -- fall back to notes match
        const capturedMajor = ZERO_DECIMAL_CURRENCIES.includes(String(payment.currency).toUpperCase())
            ? payment.amount
            : payment.amount / 100;
        if (!isWithinTolerance(capturedMajor, expected.amountMajor)) {
            console.error('🚨 gauntlet entitlement: underpayment, refusing:', { paymentId: payment.id, productId, capturedMajor, expected: expected.amountMajor });
            return { ok: false, status: 402, error: 'Captured amount does not match the project price. This purchase has been flagged for review.' };
        }
        return null;
    } catch (err) {
        console.error('gauntlet entitlement price verification error:', err.message);
        return { ok: false, status: 500, error: 'Could not verify payment amount. Please try again or contact support.' };
    }
}

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

    if (norm(notes.product_id) === norm(wantProductId)) {
        const refusal = await verifyAmount(payment, wantProductId, notes.coupon_code || null);
        return refusal || { ok: true };
    }

    // Cart checkouts store "productId:qty:coupon" triples instead.
    const cart = String(notes.cart_items || '');
    if (cart) {
        const triples = cart.split(',').map((part) => part.split(':'));
        const mine = triples.find((parts) => norm(parts[0]) === norm(wantProductId));
        if (mine) {
            // The captured amount covers the whole cart, so price the whole
            // cart and compare against that -- checking this one line item
            // against the total would reject every legitimate multi-item order.
            try {
                const { getExpectedCartOrder, isWithinTolerance } = await import('../lib/pricing.js');
                const items = triples
                    .filter((parts) => parts[0])
                    .map((parts) => ({
                        product_id: String(parts[0]).trim(),
                        quantity: Number(parts[1]) > 0 ? Number(parts[1]) : 1,
                        coupon_code: parts[2] ? String(parts[2]).trim() : null
                    }));
                const expected = await getExpectedCartOrder(items, payment.currency, notes.coupon_code || null);
                if (expected.ok) {
                    const capturedMajor = ZERO_DECIMAL_CURRENCIES.includes(String(payment.currency).toUpperCase())
                        ? payment.amount
                        : payment.amount / 100;
                    if (!isWithinTolerance(capturedMajor, expected.amountMajor)) {
                        console.error('🚨 gauntlet entitlement: cart underpayment, refusing:', { paymentId: payment.id, capturedMajor, expected: expected.amountMajor });
                        return { ok: false, status: 402, error: 'Captured amount does not match the cart total. This purchase has been flagged for review.' };
                    }
                }
            } catch (err) {
                console.error('gauntlet entitlement cart price verification error:', err.message);
                return { ok: false, status: 500, error: 'Could not verify payment amount. Please try again or contact support.' };
            }
            return { ok: true };
        }
    }

    return { ok: false, status: 403, error: 'That payment is not for this project.' };
}
