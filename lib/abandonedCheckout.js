// Abandoned-checkout recovery: one reminder email for a Razorpay order that
// was opened (buyer entered their email) but never paid.
//
// Runs on the /api/reminders cron tick. Source of truth is Razorpay's own
// order list: every checkout creates an order whose notes carry the buyer's
// email and product (see api/create-order.js). Idempotency comes from
// sendWebhookEmailOnce keyed on the order id, so each order gets at most one
// email even if the cron overlaps.

import { sendWebhookEmailOnce } from './webhookEmailDelivery.js';
import { emailShell, escapeHtml } from './emailBranding.js';

const SITE = process.env.PUBLIC_BASE_URL || 'https://desk2quant.com';
const MIN_AGE_S = 60 * 60;          // give the buyer an hour to finish on their own
const MAX_AGE_S = 24 * 60 * 60;     // older than a day is no longer "just left"
const MAX_SENDS_PER_RUN = 20;

async function razorpayOrders(fromS, toS) {
    const auth = 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const items = [];
    for (let skip = 0; skip < 500; skip += 100) {
        const resp = await fetch(`https://api.razorpay.com/v1/orders?from=${fromS}&to=${toS}&count=100&skip=${skip}`, {
            headers: { Authorization: auth }
        });
        if (!resp.ok) throw new Error(`Razorpay orders list failed (${resp.status})`);
        const page = (await resp.json()).items || [];
        items.push(...page);
        if (page.length < 100) break;
    }
    return items;
}

async function db(SUPABASE_URL, SUPABASE_KEY, path) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!resp.ok) throw new Error(`Supabase ${path.split('?')[0]} failed (${resp.status})`);
    return resp.json();
}

function reminderEmail({ name, productName, productUrl, couponCode, discount }) {
    const offer = couponCode && discount
        ? `<p style="font-size:15px;">If it helps, code <strong style="background:#ffca3a;padding:2px 6px;border:1px solid #090909;">${escapeHtml(couponCode)}</strong> takes <strong>${discount}% off</strong> at checkout.</p>`
        : '';
    const body = `
        <p style="font-size:16px;">Hi ${escapeHtml(name || 'there')},</p>
        <p style="font-size:15px;">You started checking out <strong>${escapeHtml(productName)}</strong> on Desk2Quant but the payment didn't go through. If you were interrupted or a payment method failed, you can pick up where you left off:</p>
        ${offer}
        <p style="text-align:center;margin:28px 0;">
            <a href="${escapeHtml(productUrl)}" style="display:inline-block;background:#ffca3a;color:#090909;font-weight:800;text-decoration:none;padding:14px 30px;border:1px solid #090909;box-shadow:4px 4px 0 #090909;">Complete my purchase</a>
        </p>
        <p style="font-size:14px;color:#666761;">Payment trouble or a question about what's inside? Just reply to this email and Amit will help.</p>
        <p style="font-size:12px;color:#666761;">This is a one-time reminder because you started a checkout on desk2quant.com. You won't get another one for this order.</p>`;
    const text = `Hi ${name || 'there'},\n\nYou started checking out ${productName} on Desk2Quant but the payment didn't go through. Pick up where you left off:\n${productUrl}\n${couponCode && discount ? `\nCode ${couponCode} takes ${discount}% off at checkout.\n` : ''}\nQuestions? Just reply to this email.\n\nThis is a one-time reminder for this checkout.`;
    return { html: emailShell({ body }), text };
}

export async function processAbandonedCheckouts({ SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME }) {
    const summary = { checked: 0, sent: 0, skipped: 0, errors: [] };
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !BREVO_API_KEY) {
        return { ...summary, disabled: 'missing Razorpay or Brevo configuration' };
    }
    const now = Math.floor(Date.now() / 1000);
    const orders = await razorpayOrders(now - MAX_AGE_S, now);

    // Anyone with a paid order in the window already bought (possibly on a retry).
    const paidEmails = new Set(orders
        .filter((o) => o.status === 'paid')
        .map((o) => String(o.notes?.customer_email || '').trim().toLowerCase())
        .filter(Boolean));

    // Latest unpaid order per buyer+product, older than an hour.
    const latest = new Map();
    for (const o of orders) {
        const email = String(o.notes?.customer_email || '').trim().toLowerCase();
        const productId = o.notes?.product_id;
        if (o.status === 'paid' || o.notes?.type !== 'product' || !productId) continue;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || paidEmails.has(email)) continue;
        if (now - o.created_at < MIN_AGE_S) continue;
        const key = `${email}|${productId}`;
        if (!latest.has(key) || latest.get(key).created_at < o.created_at) latest.set(key, o);
    }

    for (const order of latest.values()) {
        if (summary.sent >= MAX_SENDS_PER_RUN) break;
        summary.checked++;
        const email = String(order.notes.customer_email).trim().toLowerCase();
        try {
            // Bought through another route since (webhook-logged purchase)?
            const since = new Date(order.created_at * 1000).toISOString();
            const bought = await db(SUPABASE_URL, SUPABASE_KEY,
                `purchases?customer_email=ilike.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`);
            if (bought.length) { summary.skipped++; continue; }

            const [product] = await db(SUPABASE_URL, SUPABASE_KEY,
                `products?id=eq.${encodeURIComponent(order.notes.product_id)}&select=id,name,price,coupon_code,discount_percentage`);
            if (!product || !(Number(product.price) > 0)) { summary.skipped++; continue; }

            const { html, text } = reminderEmail({
                name: order.notes.customer_name,
                productName: product.name,
                productUrl: `${SITE}/product.html?id=${encodeURIComponent(product.id)}`,
                couponCode: product.coupon_code,
                discount: product.discount_percentage
            });
            const result = await sendWebhookEmailOnce({
                paymentId: order.id,
                deliveryType: 'abandoned_checkout',
                BREVO_API_KEY, SUPABASE_URL, SUPABASE_KEY,
                emailPayload: {
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email, name: order.notes.customer_name || undefined }],
                    subject: `Still interested in ${product.name.split(/[:(—]/)[0].trim()}?`,
                    htmlContent: html,
                    textContent: text
                }
            });
            if (result?.skipped) summary.skipped++; else summary.sent++;
        } catch (err) {
            summary.errors.push(`${order.id}: ${err.message}`);
        }
    }
    return summary;
}
