import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
delete process.env.GOOGLE_PRIVATE_KEY;

const { sendWebhookEmailOnce } = await import('../lib/webhookEmailDelivery.js');
const { handleCartPurchase } = await import('../api/razorpay-webhook.js');

const IDEMPOTENCY_KEYS = {
    receipt: '10000000-0000-4000-8000-000000000001',
    admin: '10000000-0000-4000-8000-000000000002'
};

function jsonResponse(body, status = 200) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => raw,
        json: async () => JSON.parse(raw)
    });
}

function installDeliveryFetchStub({ brevoStatus = 201, brevoBody = { messageId: 'message-1' } } = {}) {
    const deliveries = new Map();
    const calls = [];

    global.fetch = async (url, options = {}) => {
        const target = String(url);
        const requestBody = options.body ? JSON.parse(options.body) : null;
        calls.push({ target, requestBody });

        if (target.endsWith('/rpc/claim_webhook_email_delivery')) {
            const key = `${requestBody.p_payment_id}/${requestBody.p_delivery_type}`;
            const existing = deliveries.get(key);
            if (existing) {
                return jsonResponse([{
                    should_send: false,
                    idempotency_key: existing.idempotencyKey,
                    delivery_status: existing.status
                }]);
            }
            const idempotencyKey = IDEMPOTENCY_KEYS.receipt;
            deliveries.set(key, { status: 'sending', idempotencyKey });
            return jsonResponse([{
                should_send: true,
                idempotency_key: idempotencyKey,
                delivery_status: 'sending'
            }]);
        }

        if (target.endsWith('/rpc/complete_webhook_email_delivery')) {
            const key = `${requestBody.p_payment_id}/${requestBody.p_delivery_type}`;
            const delivery = deliveries.get(key);
            delivery.status = requestBody.p_status;
            delivery.error = requestBody.p_error;
            return jsonResponse(true);
        }

        if (target === 'https://api.brevo.com/v3/smtp/email') {
            return jsonResponse(brevoBody, brevoStatus);
        }

        throw new Error(`Unexpected fetch: ${target}`);
    };

    return { deliveries, calls };
}

test('two simultaneous sends produce one Brevo request', async () => {
    const originalFetch = global.fetch;
    const { calls } = installDeliveryFetchStub();
    try {
        const args = {
            paymentId: 'pay_concurrent',
            deliveryType: 'cart_customer_receipt',
            emailPayload: {
                sender: { email: 'hello@desk2quant.com' },
                to: [{ email: 'buyer@example.com' }],
                subject: 'Receipt',
                htmlContent: '<p>Receipt</p>'
            },
            BREVO_API_KEY: 'brevo-test-key',
            SUPABASE_URL: 'https://supabase.test',
            SUPABASE_KEY: 'service-role-test-key'
        };

        const results = await Promise.all([
            sendWebhookEmailOnce(args),
            sendWebhookEmailOnce(args)
        ]);

        const brevoCalls = calls.filter((call) => call.target === 'https://api.brevo.com/v3/smtp/email');
        assert.equal(brevoCalls.length, 1);
        assert.equal(brevoCalls[0].requestBody.headers.idempotencyKey, IDEMPOTENCY_KEYS.receipt);
        assert.equal(results.filter((result) => result.skipped).length, 1);
        assert.equal(results.filter((result) => result.sent && !result.skipped).length, 1);
    } finally {
        global.fetch = originalFetch;
    }
});

test('Brevo duplicate_parameter is treated as an already accepted send', async () => {
    const originalFetch = global.fetch;
    const { deliveries } = installDeliveryFetchStub({
        brevoStatus: 400,
        brevoBody: { code: 'duplicate_parameter', message: 'duplicate idempotency key' }
    });
    try {
        const result = await sendWebhookEmailOnce({
            paymentId: 'pay_provider_duplicate',
            deliveryType: 'cart_customer_receipt',
            emailPayload: {
                sender: { email: 'hello@desk2quant.com' },
                to: [{ email: 'buyer@example.com' }],
                subject: 'Receipt',
                htmlContent: '<p>Receipt</p>'
            },
            BREVO_API_KEY: 'brevo-test-key',
            SUPABASE_URL: 'https://supabase.test',
            SUPABASE_KEY: 'service-role-test-key'
        });

        assert.equal(result.sent, true);
        assert.equal(result.providerDuplicate, true);
        assert.equal(deliveries.get('pay_provider_duplicate/cart_customer_receipt').status, 'sent');
    } finally {
        global.fetch = originalFetch;
    }
});

test('transient Brevo failure is recorded and thrown for webhook retry', async () => {
    const originalFetch = global.fetch;
    const { deliveries } = installDeliveryFetchStub({
        brevoStatus: 503,
        brevoBody: { code: 'unavailable', message: 'try again' }
    });
    try {
        await assert.rejects(
            sendWebhookEmailOnce({
                paymentId: 'pay_transient',
                deliveryType: 'cart_admin_sale',
                emailPayload: {
                    sender: { email: 'hello@desk2quant.com' },
                    to: [{ email: 'admin@example.com' }],
                    subject: 'Sale',
                    htmlContent: '<p>Sale</p>'
                },
                BREVO_API_KEY: 'brevo-test-key',
                SUPABASE_URL: 'https://supabase.test',
                SUPABASE_KEY: 'service-role-test-key'
            }),
            /Brevo 503/
        );
        assert.equal(deliveries.get('pay_transient/cart_admin_sale').status, 'failed');
    } finally {
        global.fetch = originalFetch;
    }
});

test('two simultaneous cart handlers create one batch and one email of each type', async () => {
    const originalFetch = global.fetch;
    const products = {
        'prod-a': {
            id: 'prod-a',
            name: 'Product A',
            price: 500,
            discount_percentage: 0,
            coupon_code: null,
            enable_ppp: false,
            file_url: 'https://downloads.example.com/a.pdf'
        },
        'prod-b': {
            id: 'prod-b',
            name: 'Product B',
            price: 300,
            discount_percentage: 0,
            coupon_code: null,
            enable_ppp: false,
            file_url: 'https://downloads.example.com/b.pdf'
        }
    };
    const emailClaims = new Map();
    const brevoPayloads = [];
    let cartBatchRecorded = false;
    let insertedRows = [];

    global.fetch = async (url, options = {}) => {
        const target = String(url);
        const requestBody = options.body ? JSON.parse(options.body) : null;

        if (target.includes('/rest/v1/products?id=eq.')) {
            const id = decodeURIComponent(target.match(/products\?id=eq\.([^&]+)/)[1]);
            const product = products[id];
            return jsonResponse(product ? [product] : []);
        }

        if (target.endsWith('/rpc/record_cart_purchase_once')) {
            if (cartBatchRecorded) return jsonResponse(false);
            cartBatchRecorded = true;
            insertedRows = requestBody.p_rows;
            return jsonResponse(true);
        }

        if (target.endsWith('/rpc/claim_webhook_email_delivery')) {
            const type = requestBody.p_delivery_type;
            const existing = emailClaims.get(type);
            if (existing) {
                return jsonResponse([{
                    should_send: false,
                    idempotency_key: existing.idempotencyKey,
                    delivery_status: existing.status
                }]);
            }
            const idempotencyKey = type === 'cart_admin_sale'
                ? IDEMPOTENCY_KEYS.admin
                : IDEMPOTENCY_KEYS.receipt;
            emailClaims.set(type, { status: 'sending', idempotencyKey });
            return jsonResponse([{
                should_send: true,
                idempotency_key: idempotencyKey,
                delivery_status: 'sending'
            }]);
        }

        if (target.endsWith('/rpc/complete_webhook_email_delivery')) {
            emailClaims.get(requestBody.p_delivery_type).status = requestBody.p_status;
            return jsonResponse(true);
        }

        if (target === 'https://api.brevo.com/v3/smtp/email') {
            brevoPayloads.push(requestBody);
            return jsonResponse({ messageId: `message-${brevoPayloads.length}` }, 201);
        }

        if (target.includes('/rest/v1/recommendation_emails?')) {
            return jsonResponse([{ id: 'recent-recommendation' }]);
        }

        throw new Error(`Unexpected fetch: ${target}`);
    };

    const cartData = {
        paymentId: 'pay_cart_concurrent',
        amount: 800,
        inrAmount: 800,
        currency: 'INR',
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer',
        customerPhone: '',
        customerCountry: 'IN',
        cartItemsRaw: 'prod-a:1:,prod-b:1:',
        couponCode: null,
        paymentCreatedAt: 1787274000,
        SUPABASE_URL: 'https://supabase.test',
        SUPABASE_KEY: 'service-role-test-key',
        BREVO_API_KEY: 'brevo-test-key',
        ADMIN_EMAIL: 'admin@example.com, ADMIN@example.com',
        SENDER_EMAIL: 'hello@desk2quant.com',
        SENDER_NAME: 'Desk2Quant'
    };

    try {
        await Promise.all([
            handleCartPurchase(cartData),
            handleCartPurchase(cartData)
        ]);

        assert.equal(insertedRows.length, 2);
        assert.deepEqual(insertedRows.map((row) => row.product_name).sort(), ['Product A', 'Product B']);
        assert.equal(brevoPayloads.length, 2);
        assert.deepEqual(
            brevoPayloads.map((payload) => payload.subject).sort(),
            ['New Cart Sale: 2 item(s)', 'Your Order (2 items): Desk2Quant']
        );
        assert.deepEqual(
            brevoPayloads.map((payload) => payload.headers.idempotencyKey).sort(),
            [IDEMPOTENCY_KEYS.admin, IDEMPOTENCY_KEYS.receipt].sort()
        );
        const adminPayload = brevoPayloads.find((payload) => payload.subject.startsWith('New Cart Sale:'));
        assert.deepEqual(adminPayload.to, [{ email: 'ADMIN@example.com' }]);
    } finally {
        global.fetch = originalFetch;
    }
});
