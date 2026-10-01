import test from 'node:test';
import assert from 'node:assert/strict';

const { sendRecommendationEmail } = await import('../lib/recommendationEmail.js');

function response(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => typeof body === 'string' ? body : JSON.stringify(body)
    };
}

test('bundle upgrade follow-up renders the scoped coupon and effective price', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        calls.push({ target, body: options.body ? JSON.parse(options.body) : null });
        if (target.startsWith('https://api.brevo.com/v3/contacts/')) {
            return response({ emailBlacklisted: false });
        }
        if (target.includes('/rest/v1/products?id=eq.164308cd-e3cd-4026-8fdc-337a5955ffff')) {
            return response([{
                id: '164308cd-e3cd-4026-8fdc-337a5955ffff',
                name: 'Complete Front Office & Risk Quant Professional Bundle (71 PDFs, 72 notebooks & 134 scripts)',
                price: 9999,
                original_price: 12999,
                description: ''
            }]);
        }
        if (target === 'https://api.brevo.com/v3/smtp/email') {
            return response({ messageId: 'bundle-message-1' }, 201);
        }
        throw new Error(`Unexpected fetch: ${target}`);
    };

    try {
        const result = await sendRecommendationEmail({
            customerEmail: 'buyer@example.com',
            customerName: 'Rahul',
            purchasedProductName: 'Product A | Product B',
            trigger: 'bundle_upgrade_extra30_202610',
            couponCode: 'RAHUL30A1B2',
            discountPercent: 37,
            targetProductId: '164308cd-e3cd-4026-8fdc-337a5955ffff',
            SUPABASE_URL: 'https://supabase.test',
            SUPABASE_KEY: 'service-key',
            BREVO_API_KEY: 'brevo-key',
            SENDER_EMAIL: 'hello@desk2quant.com',
            SENDER_NAME: 'Desk2Quant'
        });

        assert.equal(result.ok, true);
        assert.equal(result.messageId, 'bundle-message-1');
        const mail = calls.find((c) => c.target === 'https://api.brevo.com/v3/smtp/email');
        assert.ok(mail);
        assert.match(mail.body.subject, /₹6,299\.37/);
        assert.match(mail.body.htmlContent, /RAHUL30A1B2/);
        assert.match(mail.body.htmlContent, /extra 30%/i);
        assert.match(mail.body.htmlContent, /71 professionally structured PDFs/);
        assert.match(mail.body.htmlContent, /Product A/);
        assert.match(mail.body.htmlContent, /Product B/);
    } finally {
        global.fetch = originalFetch;
    }
});

test('bundle upgrade follow-up skips a Brevo-blacklisted buyer', async () => {
    const originalFetch = global.fetch;
    let smtpCalls = 0;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.startsWith('https://api.brevo.com/v3/contacts/')) {
            return response({ emailBlacklisted: true });
        }
        if (target === 'https://api.brevo.com/v3/smtp/email') smtpCalls++;
        throw new Error(`Unexpected fetch after blacklist: ${target}`);
    };

    try {
        const result = await sendRecommendationEmail({
            customerEmail: 'unsubscribed@example.com',
            customerName: 'No Mail',
            purchasedProductName: 'Product A',
            trigger: 'bundle_upgrade_extra30_202610',
            couponCode: 'NOMAIL30A1B2',
            discountPercent: 37,
            targetProductId: '164308cd-e3cd-4026-8fdc-337a5955ffff',
            SUPABASE_URL: 'https://supabase.test',
            SUPABASE_KEY: 'service-key',
            BREVO_API_KEY: 'brevo-key',
            SENDER_EMAIL: 'hello@desk2quant.com',
            SENDER_NAME: 'Desk2Quant'
        });
        assert.equal(result.ok, true);
        assert.equal(result.skipped, true);
        assert.equal(smtpCalls, 0);
    } finally {
        global.fetch = originalFetch;
    }
});
