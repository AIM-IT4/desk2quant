// Which Drive link /api/grant-access hands out for a single-product payment.
//
// The link must be decided server-side:
//   - earlier buyers keep the folder they bought (recorded purchase link, or
//     the legacy Complete Bundle folder for bundle purchases before the switch);
//   - new buyers get the product's current file_url;
//   - notes.download_link (browser-supplied at checkout) is never trusted.
//
// Network is stubbed; Google Drive credentials are unset so no Drive call runs.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
process.env.SUPABASE_KEY = 'test-anon-key';
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
delete process.env.GOOGLE_PRIVATE_KEY;

const { default: handler } = await import('../api/grant-access.js');
const { COMPLETE_BUNDLE_PRODUCT_ID, LEGACY_BUNDLE_FOLDER_URL, BUNDLE_FOLDER_SWITCH_AT } = await import('../lib/bundleEntitlements.js');

const NEW_BUNDLE_FOLDER = 'https://drive.google.com/drive/folders/NEW_BUNDLE_FOLDER';
const PRODUCTS = {
    [COMPLETE_BUNDLE_PRODUCT_ID]: { id: COMPLETE_BUNDLE_PRODUCT_ID, name: 'Complete Front Office & Risk Quant Professional Bundle', price: 9999, file_url: NEW_BUNDLE_FOLDER },
    'prod-cheap': { id: 'prod-cheap', name: 'Python for Quants', price: 399, file_url: 'https://drive.google.com/file/d/CHEAP_FILE/view' }
};

const jsonResponse = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });

function installFetchStub({ payment, purchases = [] }) {
    global.fetch = (url) => {
        const target = String(url);
        if (target.includes('/v1/payments/')) return jsonResponse(payment);
        if (target.includes('/v1/orders/')) return jsonResponse({ id: payment.order_id, notes: payment.notes });
        if (target.includes('/rest/v1/purchases')) return jsonResponse(purchases);
        const idMatch = target.match(/products\?id=eq\.([^&]+)/);
        if (idMatch) {
            const product = PRODUCTS[decodeURIComponent(idMatch[1])];
            return jsonResponse(product ? [product] : []);
        }
        if (target.includes('/rest/v1/products')) return jsonResponse(Object.values(PRODUCTS));
        return jsonResponse([]);
    };
}

function payment({ productId, paidAtMs, notesLink }) {
    const product = PRODUCTS[productId];
    return {
        id: 'pay_LINK1',
        status: 'captured',
        currency: 'INR',
        amount: product.price * 100,
        email: 'buyer@example.com',
        order_id: 'order_LINK1',
        created_at: Math.floor(paidAtMs / 1000),
        notes: {
            type: 'product',
            product_id: productId,
            product_name: product.name,
            customer_email: 'buyer@example.com',
            ...(notesLink ? { download_link: notesLink } : {})
        }
    };
}

async function grantedLink(opts) {
    installFetchStub(opts);
    const res = {
        statusCode: null, body: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(p) { this.body = p; return this; },
        end() { return this; }
    };
    await handler({ method: 'POST', headers: { host: 'desk2quant.com' }, body: { payment_id: 'pay_LINK1', email: 'buyer@example.com' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    return res.body.download_link;
}

const BEFORE = BUNDLE_FOLDER_SWITCH_AT - 24 * 3600 * 1000;
const AFTER = BUNDLE_FOLDER_SWITCH_AT + 3600 * 1000;

test('bundle bought before the switch with no recorded link keeps the legacy folder', async () => {
    const link = await grantedLink({ payment: payment({ productId: COMPLETE_BUNDLE_PRODUCT_ID, paidAtMs: BEFORE }) });
    assert.equal(link, LEGACY_BUNDLE_FOLDER_URL);
});

test('a recorded purchase link wins over the product link', async () => {
    const recorded = 'https://drive.google.com/drive/folders/RECORDED_FOLDER';
    const link = await grantedLink({
        payment: payment({ productId: COMPLETE_BUNDLE_PRODUCT_ID, paidAtMs: AFTER }),
        purchases: [{ product_name: PRODUCTS[COMPLETE_BUNDLE_PRODUCT_ID].name, download_link: recorded }]
    });
    assert.equal(link, recorded);
});

test('bundle bought after the switch gets the current bundle folder', async () => {
    const link = await grantedLink({ payment: payment({ productId: COMPLETE_BUNDLE_PRODUCT_ID, paidAtMs: AFTER }) });
    assert.equal(link, NEW_BUNDLE_FOLDER);
});

test('a browser-supplied notes.download_link cannot redirect access to another folder', async () => {
    const link = await grantedLink({ payment: payment({ productId: 'prod-cheap', paidAtMs: AFTER, notesLink: NEW_BUNDLE_FOLDER }) });
    assert.equal(link, PRODUCTS['prod-cheap'].file_url);
});
