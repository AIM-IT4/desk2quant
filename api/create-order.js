// Create Razorpay Order with Instant Capture
// POST /api/create-order
// Body: { currency, notes: { type: 'product'|'session', product_id | session_id, coupon_code? } }
// Returns: { order_id, amount, currency }
//
// SECURITY: the order amount is now ALWAYS computed server-side from the
// real product/session price (see lib/pricing.js) plus any legitimately
// resolved coupon discount. The client no longer gets to dictate the
// charged amount -- it used to (via a raw `amount` field), which let anyone
// pay any amount for any product (proven live via test-payment.html).
// The client's `amount`/`inr_amount` fields, if sent, are only used for
// display/logging in `notes` and are never trusted for pricing.

import { getExpectedProductOrder, getExpectedSessionOrder, getExpectedInterviewOrder, getExpectedCartOrder, getSubunitMultiplier } from '../lib/pricing.js';

export default async function handler(req, res) {
    // CORS headers for frontend calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        console.error('❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured');
        return res.status(500).json({ error: 'Payment gateway not configured on server' });
    }

    try {
        const { currency = 'INR', notes = {} } = req.body || {};
        const type = notes.type;

        let expected;
        if (type === 'product') {
            expected = await getExpectedProductOrder(notes.product_id, currency, notes.coupon_code);
        } else if (type === 'session') {
            expected = await getExpectedSessionOrder(notes.session_id, currency, notes.coupon_code);
        } else if (type === 'interview') {
            expected = await getExpectedInterviewOrder(notes.duration_minutes, currency);
        } else if (type === 'cart') {
            // items are passed outside `notes` (req.body.items) to avoid Razorpay's
            // notes value-size limits; notes only carries the coupon + a summary.
            expected = await getExpectedCartOrder(req.body?.items, currency, notes.coupon_code);
        } else {
            return res.status(400).json({ error: 'notes.type must be "product", "session", "interview", or "cart", with matching id/duration/items fields' });
        }

        if (!expected.ok) {
            console.warn('⚠️ create-order rejected:', expected.error, '| notes:', notes);
            return res.status(400).json({ error: expected.error });
        }

        // Convert the server-computed major-unit amount to the smallest
        // currency unit (paise/cents) Razorpay expects.
        const multiplier = getSubunitMultiplier(expected.currency);
        const amountInSubunits = Math.round(expected.amountMajor * multiplier);

        if (amountInSubunits <= 0) {
            return res.status(400).json({ error: 'Computed amount is invalid' });
        }

        // Create order via Razorpay Orders API
        const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

        // Persist the server-verified pricing basis in notes so the webhook
        // can independently re-check the captured amount later (defense in
        // depth -- see razorpay-webhook.js).
        const orderNotes = {
            ...notes,
            verified_inr_amount: String(expected.amountInr),
            verified_discount_percent: String(expected.discountPercent || 0)
        };

        // For carts, store a compact "id:qty,id:qty" summary (Razorpay note
        // values are capped at 256 chars) instead of full product objects --
        // the webhook re-fetches names/download links from Supabase by ID.
        if (type === 'cart') {
            orderNotes.cart_items = expected.lineItems
                .map((li) => `${li.productId}:${li.quantity}`)
                .join(',');
            orderNotes.cart_item_count = String(expected.lineItems.length);
        }

        const orderPayload = {
            amount: amountInSubunits,
            currency: expected.currency,
            payment_capture: 1, // ✅ INSTANT CAPTURE — payment is captured immediately on authorization
            notes: orderNotes
        };

        console.log('📦 Creating Razorpay order:', {
            type,
            product_id: notes.product_id,
            session_id: notes.session_id,
            cart_items: orderNotes.cart_items || null,
            coupon_code: notes.coupon_code || null,
            serverAmountMajor: expected.amountMajor,
            currency: expected.currency,
            amountInSubunits
        });

        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(orderPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Razorpay order creation failed:', response.status, errorText);
            return res.status(response.status).json({
                error: 'Failed to create order',
                details: errorText
            });
        }

        const order = await response.json();
        console.log('✅ Razorpay order created:', order.id, '| payment_capture:', order.payment_capture);

        return res.status(200).json({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error('❌ Error creating Razorpay order:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
