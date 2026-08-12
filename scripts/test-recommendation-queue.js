// Tests api/reminders.js's recommendation-queue sweep against mocked
// Supabase/Brevo. Covers: send success (marks sent), transient failure with
// retry (stays pending, attempts++), and permanent failure past MAX_ATTEMPTS
// (marks failed). No real network calls.
// Run: node scripts/test-recommendation-queue.js

process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_KEY = 'mock-supabase-key';
process.env.BREVO_API_KEY = 'mock-brevo-key';
process.env.CRON_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.SENDER_EMAIL = 'sender@test.com';
process.env.SENDER_NAME = 'Desk2Quant';

const patches = [];
const queueRows = [
    { id: 1, customer_email: 'ok@test.com', customer_name: 'Ok Customer', purchased_product: 'XVA Calculus Lab: Master Counterparty Credit Risk', trigger_type: 'product_purchase', coupon_code: 'OK20', attempts: 0 },
    { id: 2, customer_email: 'transient@test.com', customer_name: 'Transient Customer', purchased_product: 'Python for Quants', trigger_type: 'product_purchase', coupon_code: 'TRANSIENT20', attempts: 1 },
    { id: 3, customer_email: 'permafail@test.com', customer_name: 'Perma Fail', purchased_product: 'Python for Quants', trigger_type: 'product_purchase', coupon_code: 'PERMAFAIL20', attempts: 2 } // one more failure -> hits MAX_ATTEMPTS(3)
];

globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || 'GET';

    if (u.includes('/rest/v1/bookings')) {
        return { ok: true, json: async () => [] }; // no bookings due
    }
    if (u.includes('/rest/v1/recommendation_emails') && method === 'GET') {
        return { ok: true, json: async () => queueRows };
    }
    if (u.includes('/rest/v1/recommendation_emails') && method === 'PATCH') {
        const idMatch = u.match(/id=eq\.(\d+)/);
        patches.push({ id: Number(idMatch[1]), body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({}) };
    }
    if (u.includes('/rest/v1/products')) {
        return {
            ok: true, json: async () => [
                { id: 'a1', name: 'Quant Models for Each Asset Class Master Pack', price: 1999, description: 'pack', cover_image_url: '' },
                { id: 'a2', name: 'Model Validation Quant Case Study Pack', price: 799, description: 'case studies', cover_image_url: '' }
            ]
        };
    }
    if (u.includes('api.brevo.com')) {
        // Simulate: ok@test.com -> success, transient@test.com -> transient failure, permafail@test.com -> failure
        const body = JSON.parse(options.body);
        const to = body.to[0].email;
        if (to === 'ok@test.com') return { ok: true, json: async () => ({ messageId: 'mock-msg-ok' }) };
        return { ok: false, status: 500, text: async () => 'Simulated Brevo transient error' };
    }
    return { ok: true, json: async () => ({}), text: async () => 'OK' };
};

const { default: handler } = await import('../api/reminders.js');

function makeReq() {
    return { method: 'GET', query: { secret: 'test-secret' }, headers: {} };
}
function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = () => {};
    return res;
}

console.log('=== Recommendation queue sweep test ===\n');
const res = makeRes();
await handler(makeReq(), res);

console.log('HTTP status:', res.statusCode);
console.log('recommendationQueue result:', JSON.stringify(res.body.recommendationQueue, null, 2));
console.log('\nPatches applied:');
patches.forEach(p => console.log(`  id=${p.id}:`, JSON.stringify(p.body)));

let failures = 0;
function check(name, cond) {
    console.log(`${cond ? '✅' : '❌'} ${name}`);
    if (!cond) failures++;
}

// Each row is claimed (pending -> sending) before the email send, so
// overlapping cron ticks can't both send the same row. The final status patch
// is the one after the claim.
function finalPatch(id) {
    return patches.filter(p => p.id === id && p.body.status !== 'sending').pop();
}
const p1 = finalPatch(1);
const p2 = finalPatch(2);
const p3 = finalPatch(3);

check('row 1 (success) marked sent', p1 && p1.body.status === 'sent' && p1.body.attempts === 1 && p1.body.brevo_message_id === 'mock-msg-ok');
check('row 2 (transient failure, attempts 1->2) stays pending for retry', p2 && p2.body.status === 'pending' && p2.body.attempts === 2 && !!p2.body.last_error);
check('row 3 (attempts 2->3, hits MAX_ATTEMPTS) marked failed, not retried further', p3 && p3.body.status === 'failed' && p3.body.attempts === 3 && !!p3.body.last_error);
check('every row claimed (sending) before the final patch', [1, 2, 3].every(id => patches.some(p => p.id === id && p.body.status === 'sending')));
check('outcome counts correct (checked=3, sent=1, failed=2)', res.body.recommendationQueue.checked === 3 && res.body.recommendationQueue.sent === 1 && res.body.recommendationQueue.failed === 2);

console.log(failures === 0 ? '\n✨ ALL TESTS PASSED' : `\n💥 ${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
