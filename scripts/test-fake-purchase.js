// Simulate a fake purchase flow end-to-end against the REAL webhook handler.
// Verifies the timing-safe signature check: valid sig accepted, bad/missing sig rejected.
// All external calls (Supabase, Brevo, Razorpay) are mocked — no real emails/DB writes.
// Run: node scripts/test-fake-purchase.js

import crypto from 'crypto';
import { Readable } from 'stream';

// --- Env for the handler (fake secret, mock keys) ---
const WEBHOOK_SECRET = 'test_webhook_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_KEY = 'mock-supabase-key';
process.env.BREVO_API_KEY = 'mock-brevo-key';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.SENDER_EMAIL = 'sender@test.com';
process.env.SENDER_NAME = 'Desk2Quant';

// --- Mock global fetch: log calls, return canned responses ---
const fetchLog = [];
globalThis.fetch = async (url, options = {}) => {
    fetchLog.push({ url: String(url), method: options.method || 'GET' });
    const u = String(url);
    if (u.includes('/rest/v1/purchases') && (options.method || 'GET') === 'GET')
        return { ok: true, json: async () => [] }; // not yet processed (idempotency check)
    if (u.includes('/rest/v1/products'))
        return { ok: true, json: async () => [{ file_url: 'https://cdn.test.com/product.pdf' }] };
    if (u.includes('api.brevo.com'))
        return { ok: true, json: async () => ({ messageId: 'mock-msg-1' }), text: async () => 'OK' };
    return { ok: true, json: async () => ({}), text: async () => 'OK' };
};

// --- Minimal req/res fakes for the Vercel handler ---
function makeReq(bodyString, signature) {
    const req = Readable.from([Buffer.from(bodyString)]);
    req.method = 'POST';
    req.headers = signature !== undefined ? { 'x-razorpay-signature': signature } : {};
    return req;
}
function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

// --- Fake purchase payload ---
const payload = JSON.stringify({
    event: 'payment.captured',
    payload: {
        payment: {
            entity: {
                id: 'pay_FAKE_TEST_001',
                amount: 49900, // paise
                currency: 'INR',
                email: 'amitjmi85@gmail.com',
                notes: {
                    type: 'product',
                    product_name: 'Python for Quants',
                    customer_name: 'Amit Jha',
                    download_link: 'https://cdn.test.com/product.pdf'
                }
            }
        }
    }
});

const sign = (body, secret) =>
    crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

const { default: handler } = await import('../api/razorpay-webhook.js');

let failures = 0;
async function run(name, req, expectStatus, expectOkField) {
    const res = makeRes();
    await handler(req, res);
    const pass = res.statusCode === expectStatus &&
        (expectOkField === undefined || res.body?.success === expectOkField || res.body?.error !== undefined);
    console.log(`${pass ? '✅' : '❌'} ${name} → status ${res.statusCode}`, res.body);
    if (!pass) failures++;
}

console.log('=== Fake purchase flow: customer amitjmi85@gmail.com ===\n');

// 1. Valid signature — full purchase flow should run
await run('valid signature accepted',
    makeReq(payload, sign(payload, WEBHOOK_SECRET)), 200);

// 2. Wrong signature (signed with wrong secret) — must 401
await run('wrong-secret signature rejected',
    makeReq(payload, sign(payload, 'attacker_secret')), 401);

// 3. Missing signature header — must 401 (timingSafeEqual length guard path)
await run('missing signature rejected',
    makeReq(payload, undefined), 401);

// 4. Truncated signature (different length) — must 401, must NOT throw
await run('truncated signature rejected',
    makeReq(payload, sign(payload, WEBHOOK_SECRET).slice(0, 10)), 401);

// 5. Tampered body with original signature — must 401
const tampered = payload.replace('49900', '1');
await run('tampered body rejected',
    makeReq(tampered, sign(payload, WEBHOOK_SECRET)), 401);

console.log(`\n--- External calls made during valid-signature run: ${fetchLog.length} ---`);
fetchLog.forEach(c => console.log(`  ${c.method} ${c.url}`));

console.log(failures === 0 ? '\n✨ ALL TESTS PASSED' : `\n💥 ${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
