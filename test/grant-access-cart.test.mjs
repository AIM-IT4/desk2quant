// Covers the cart branch of /api/grant-access -- the fallback that runs when
// the Razorpay webhook is slow or fails. Before this branch existed, a cart
// payment hit the single-product path, found no product_id/download_link in
// the order notes (carts store `cart_items` instead) and 404'd, so the buyer
// got nothing while the frontend still showed the success modal.
//
// All network calls are stubbed: Razorpay payment/order lookups, the Supabase
// product reads made by lib/pricing.js, and the product reads made by the
// cart branch itself. Google Drive credentials are left unset, so no Drive
// call is attempted.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
process.env.SUPABASE_KEY = 'test-anon-key';
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
delete process.env.GOOGLE_PRIVATE_KEY;

const { default: handler } = await import('../api/grant-access.js');

const PRODUCTS = {
    'prod-aaa': { id: 'prod-aaa', name: 'Python for Quants', price: 500, file_url: 'https://drive.google.com/file/d/FILE_AAA/view' },
    'prod-bbb': { id: 'prod-bbb', name: 'Equity Models', price: 300, file_url: 'https://drive.google.com/drive/folders/FOLDER_BBB' }
};

function jsonResponse(body, ok = true, status = 200) {
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
}

// paise total for the given product ids at full price
function paiseTotal(ids) {
    return ids.reduce((sum, id) => sum + PRODUCTS[id].price, 0) * 100;
}

function installFetchStub({ payment, order, calls }) {
    global.fetch = (url) => {
        const target = String(url);
        calls.push(target);

        if (target.includes('/v1/payments/')) return jsonResponse(payment);
        if (target.includes('/v1/orders/')) return jsonResponse(order);

        // Supabase product read -- serves both lib/pricing.js (which selects
        // price/coupon columns) and the cart branch (name/file_url).
        const idMatch = target.match(/products\?id=eq\.([^&]+)/);
        if (idMatch) {
            const product = PRODUCTS[decodeURIComponent(idMatch[1])];
            return jsonResponse(product ? [product] : []);
        }
        if (target.includes('/rest/v1/products')) return jsonResponse(Object.values(PRODUCTS));

        throw new Error(`Unexpected fetch in test: ${target}`);
    };
}

function mockRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { return this; }
    };
}

function cartPayment(overrides = {}) {
    return {
        id: 'pay_CART1',
        status: 'captured',
        currency: 'INR',
        amount: paiseTotal(['prod-aaa', 'prod-bbb']),
        email: 'buyer@example.com',
        order_id: 'order_CART1',
        notes: {},
        ...overrides
    };
}

function cartOrder(cartItems = 'prod-aaa:1:,prod-bbb:1:') {
    return { id: 'order_CART1', notes: { type: 'cart', cart_items: cartItems, customer_email: 'buyer@example.com' } };
}

async function run({ payment, order, body }) {
    const calls = [];
    installFetchStub({ payment, order, calls });
    const res = mockRes();
    await handler({ method: 'POST', body, headers: {} }, res);
    return { res, calls };
}

test('cart payment resolves every line item instead of 404ing', async () => {
    const { res } = await run({
        payment: cartPayment(),
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    // The cart response is flagged with `cart: true`; my-access.html branches on
    // exactly this field to decide between the multi-item and single-item shape.
    assert.equal(res.body.cart, true);
    assert.equal(res.body.items.length, 2);
    assert.deepEqual(res.body.items.map(i => i.product), ['Python for Quants', 'Equity Models']);
    // Drive creds are unset in this test, so links stay raw and nothing is granted.
    assert.equal(res.body.items.every(i => i.download_link), true);
    assert.equal(res.body.items.some(i => i.drive_access_granted), false);
});

// Quantity is not echoed back in the response, so assert on the behaviour it
// drives instead: the expected cart total. Paying for 3x+1x is accepted only if
// the quantities were parsed out of the note; charging the 1x+1x total for the
// same order must still be refused as an underpayment.
test('cart line quantities are parsed from the cart_items note', async () => {
    const { res } = await run({
        payment: cartPayment({ amount: (500 * 3 + 300) * 100 }),
        order: cartOrder('prod-aaa:3:,prod-bbb:1:'),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 2);
});

test('a quantity-3 cart paid at the quantity-1 total is refused', async () => {
    const { res } = await run({
        payment: cartPayment({ amount: (500 + 300) * 100 }),
        order: cartOrder('prod-aaa:3:,prod-bbb:1:'),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 402);
});

test('cart underpayment is refused', async () => {
    const { res } = await run({
        payment: cartPayment({ amount: 100 }), // ₹1 for an ₹800 cart
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 402);
    assert.match(res.body.error, /does not match the cart total/);
});

test('cart grant is refused when the email does not match the payment', async () => {
    const { res } = await run({
        payment: cartPayment(),
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'attacker@example.com' }
    });

    assert.equal(res.statusCode, 403);
});

test('uncaptured cart payment is refused', async () => {
    const { res } = await run({
        payment: cartPayment({ status: 'authorized' }),
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 402);
    assert.match(res.body.error, /not captured/);
});

test('cart note with no parsable items 404s rather than silently succeeding', async () => {
    const { res } = await run({
        payment: cartPayment(),
        order: { id: 'order_CART1', notes: { type: 'cart', cart_items: '' } },
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /No cart items/);
});

test('single-product checkout still uses the single-product path', async () => {
    const payment = {
        id: 'pay_SINGLE1',
        status: 'captured',
        currency: 'INR',
        amount: 500 * 100,
        email: 'buyer@example.com',
        order_id: 'order_SINGLE1',
        notes: {
            type: 'product',
            product_id: 'prod-aaa',
            product_name: 'Python for Quants',
            download_link: 'https://drive.google.com/file/d/FILE_AAA/view'
        }
    };
    const { res } = await run({
        payment,
        order: { id: 'order_SINGLE1', notes: payment.notes },
        body: { payment_id: 'pay_SINGLE1', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.type, undefined); // no cart envelope
    assert.equal(res.body.items, undefined);
    assert.equal(res.body.product, 'Python for Quants');
});

test('single-product underpayment is still refused', async () => {
    const payment = {
        id: 'pay_SINGLE2',
        status: 'captured',
        currency: 'INR',
        amount: 100,
        email: 'buyer@example.com',
        order_id: 'order_SINGLE2',
        notes: { type: 'product', product_id: 'prod-aaa', product_name: 'Python for Quants', download_link: 'https://drive.google.com/file/d/FILE_AAA/view' }
    };
    const { res } = await run({
        payment,
        order: { id: 'order_SINGLE2', notes: payment.notes },
        body: { payment_id: 'pay_SINGLE2', email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 402);
});

test('missing payment_id or email is rejected', async () => {
    const { res } = await run({
        payment: cartPayment(),
        order: cartOrder(),
        body: { email: 'buyer@example.com' }
    });

    assert.equal(res.statusCode, 400);
});

test('refunded payment is refused', async () => {
    const { res: resAmount } = await run({
        payment: cartPayment({ amount_refunded: 80000, refund_status: 'full' }),
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(resAmount.statusCode, 402);
    assert.deepEqual(resAmount.body, { error: 'Payment has been refunded' });

    const { res: resPartial } = await run({
        payment: cartPayment({ amount_refunded: 1000, refund_status: 'partial' }),
        order: cartOrder(),
        body: { payment_id: 'pay_CART1', email: 'buyer@example.com' }
    });

    assert.equal(resPartial.statusCode, 402);
    assert.deepEqual(resPartial.body, { error: 'Payment has been refunded' });
});

