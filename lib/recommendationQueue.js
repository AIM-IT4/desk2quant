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

// Anti-spam window: at most ONE recommendation email per customer per 14 days,
// regardless of how many purchases, webhook retries, backfills or bulk
// campaigns touch them. Before this existed a single buyer could be emailed
// several times a week (Krunoslav got 5 recommendation emails in 14 days — 3
// from Razorpay webhook retries of one purchase, 2 more from a re-engagement
// backfill), which reads as spam.
export const RECOMMENDATION_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True if this customer already has a recommendation-email row (pending or
 * sent) created within the cooldown window. Single source of truth for
 * suppression, shared by the post-purchase queue AND the bulk campaign
 * senders (send-single-buyer-offers, send-latest-products, send-promo-latest).
 *
 * Fails closed: if the check itself errors we treat the customer as covered
 * and skip, because the cost of one more email is worse than one fewer.
 */
export async function hasRecentRecommendation({
    customerEmail, SUPABASE_URL, SUPABASE_KEY,
    withinMs = RECOMMENDATION_COOLDOWN_MS
}) {
    if (!SUPABASE_URL || !SUPABASE_KEY || !customerEmail) return true;
    const since = new Date(Date.now() - withinMs).toISOString();
    try {
        const resp = await fetch(
            `${SUPABASE_URL}/rest/v1/recommendation_emails?select=id&customer_email=eq.${encodeURIComponent(customerEmail)}&created_at=gte.${since}&order=created_at.desc&limit=1`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!resp.ok) {
            console.warn(`hasRecentRecommendation query failed (${resp.status}) for ${customerEmail} — treating as covered`);
            return true;
        }
        const rows = await resp.json();
        return Array.isArray(rows) && rows.length > 0;
    } catch (err) {
        console.warn(`hasRecentRecommendation threw for ${customerEmail}: ${err.message} — treating as covered`);
        return true;
    }
}

/**
 * Insert a queued recommendation-email row. Called from the Razorpay webhook.
 * Fast and awaited — a single REST POST, not the email send itself.
 *
 * Dedupes: skips if the customer already has a recommendation row inside the
 * cooldown window, so Razorpay webhook retries (which used to enqueue 2-3
 * rows for one payment) and repeat purchases can't stack emails.
 */
export async function queuePostPurchaseRecommendation({
    customerEmail, customerName, purchasedProductName, trigger,
    SUPABASE_URL, SUPABASE_KEY
}) {
    if (!SUPABASE_URL || !SUPABASE_KEY || !customerEmail) return;

    if (await hasRecentRecommendation({ customerEmail, SUPABASE_URL, SUPABASE_KEY })) {
        console.log(`⏸️ Skipped recommendation for ${customerEmail} — recent recommendation already sent within ${RECOMMENDATION_COOLDOWN_MS / 86400000}d cooldown`);
        return;
    }

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
