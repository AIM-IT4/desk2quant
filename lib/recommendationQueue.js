// Shared helpers for the post-purchase/post-booking recommendation email queue.
// Used by:
//   - api/razorpay-webhook.js  -> queuePostPurchaseRecommendation() (fast insert)
//   - api/reminders.js         -> processRecommendationQueue() (cron sweep: send + retry)
//
// Design: the webhook only ever does a single fast, awaited Supabase insert
// (a few hundred ms). The actual email send (which can be slow/fail
// transiently) happens later, out-of-band, from the already-running
// reminders.js cron (hit every few minutes by an external scheduler), which
// can safely retry without risking the webhook's response deadline.

import crypto from 'crypto';

/**
 * Insert a queued recommendation-email row. Called from the Razorpay webhook.
 * Fast and awaited — a single REST POST, not the email send itself.
 */
export async function queuePostPurchaseRecommendation({
    customerEmail, customerName, purchasedProductName, trigger,
    SUPABASE_URL, SUPABASE_KEY
}) {
    if (!SUPABASE_URL || !SUPABASE_KEY || !customerEmail) return;

    // SECURITY: the code used to be `${FIRSTNAME}20`, which anyone could guess
    // (AMIT20, RAHUL20, ...) and redeem without ever having bought anything.
    // Keep the name as a friendly prefix, but append random entropy so the full
    // code cannot be derived from the recipient's name.
    const firstName = (customerName || 'Customer').split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase() || 'FRIEND';
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase(); // 32 bits
    const couponCode = `${firstName.slice(0, 10)}20${suffix}`;
    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1hr, after confirmation email

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/recommendation_emails`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
            customer_email: customerEmail,
            customer_name: customerName || 'Customer',
            purchased_product: purchasedProductName || '',
            trigger_type: trigger || 'product_purchase',
            coupon_code: couponCode,
            send_at: sendAt,
            status: 'pending',
            attempts: 0
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Failed to queue recommendation email (${resp.status}): ${errText}`);
    }

    console.log(`📥 Queued recommendation email for ${customerEmail} [coupon ${couponCode}], due ${sendAt}`);
}
