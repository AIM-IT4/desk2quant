import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
process.env.GROQ_API_KEY = 'test-groq-key';

const { default: handler } = await import('../api/interview.js');

const VALID_LINK = 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/sign/resources/sheet.pdf';

function mockRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { return this; }
    };
}

function mockReq(body, ip = '203.0.113.1') {
    return { method: 'POST', body, headers: { 'x-forwarded-for': ip }, socket: {} };
}

/**
 * Stubs the two Supabase calls handleLeadAction makes: the dedupe SELECT and
 * the INSERT. `existing` is what the SELECT returns.
 */
function installSupabaseStub({ existing = [], insertStatus = 201 } = {}) {
    const calls = [];
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        const method = options.method || 'GET';
        calls.push({ target, method, body: options.body ? JSON.parse(options.body) : null });

        if (target.includes('/rest/v1/purchases') && method === 'GET') {
            return { ok: true, status: 200, json: async () => existing, text: async () => JSON.stringify(existing) };
        }
        if (target.includes('/rest/v1/purchases') && method === 'POST') {
            const ok = insertStatus >= 200 && insertStatus < 300;
            return { ok, status: insertStatus, json: async () => ({}), text: async () => '' };
        }
        throw new Error(`unexpected fetch: ${method} ${target}`);
    };
    return calls;
}

let originalFetch;
test.beforeEach(() => { originalFetch = global.fetch; });
test.afterEach(() => { global.fetch = originalFetch; });

test('records a homepage lead with amount 0 and a server-chosen product name', async () => {
    const calls = installSupabaseStub();
    const res = mockRes();

    await handler(mockReq({
        action: 'log-lead',
        email: '  Lead@Example.COM ',
        origin: 'homepage',
        download_link: VALID_LINK
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const insert = calls.find((c) => c.method === 'POST');
    assert.ok(insert, 'expected an insert');
    // Email is normalized, so the dedupe check and My Access agree on casing.
    assert.equal(insert.body.customer_email, 'lead@example.com');
    // product_name comes from LEAD_ORIGINS, never from the request.
    assert.equal(insert.body.product_name, 'Quant Formula Sheet (Lead Capture)');
    assert.equal(insert.body.amount, 0);
    assert.equal(insert.body.currency, 'INR');
    assert.equal(insert.body.source, 'lead_capture');
    assert.equal(insert.body.download_link, VALID_LINK);
    assert.match(insert.body.payment_id, /^LEAD_\d+_[0-9a-f]{8}$/);
});

test('the desk simulator origin gets its own distinguishable product name', async () => {
    const calls = installSupabaseStub();
    const res = mockRes();

    await handler(mockReq({ action: 'log-lead', email: 'sim@example.com', origin: 'desk-simulator' }), res);

    assert.equal(res.statusCode, 200);
    const insert = calls.find((c) => c.method === 'POST');
    assert.equal(insert.body.product_name, 'Quant Formula Sheet (Lead Capture - Desk Simulator)');
});

test('payment_id is unique across leads recorded in the same millisecond', async () => {
    // Migration 0010 puts a unique index on purchases(payment_id) for non-cart
    // rows, so a bare timestamp would collide on a double submit.
    const calls = installSupabaseStub();
    const fixedNow = Date.now();
    const realNow = Date.now;
    Date.now = () => fixedNow;
    try {
        await handler(mockReq({ action: 'log-lead', email: 'a@example.com', origin: 'homepage' }), mockRes());
        await handler(mockReq({ action: 'log-lead', email: 'b@example.com', origin: 'homepage' }), mockRes());
    } finally {
        Date.now = realNow;
    }

    const ids = calls.filter((c) => c.method === 'POST').map((c) => c.body.payment_id);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
});

test('an already-recorded lead is deduped instead of inserted twice', async () => {
    const calls = installSupabaseStub({ existing: [{ id: 'existing-row' }] });
    const res = mockRes();

    await handler(mockReq({ action: 'log-lead', email: 'repeat@example.com', origin: 'homepage' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deduped, true);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'must not insert a duplicate');
});

test('a lead is still recorded when the dedupe check itself fails', async () => {
    // A duplicate row is cheaper than a lost lead.
    const calls = [];
    global.fetch = async (url, options = {}) => {
        const method = options.method || 'GET';
        calls.push({ method, body: options.body ? JSON.parse(options.body) : null });
        if (method === 'GET') throw new Error('supabase unreachable');
        return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
    };

    const res = mockRes();
    await handler(mockReq({ action: 'log-lead', email: 'resilient@example.com', origin: 'homepage' }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
});

test('rejects an unknown origin so arbitrary product names cannot be written', async () => {
    const calls = installSupabaseStub();
    const res = mockRes();

    await handler(mockReq({
        action: 'log-lead',
        email: 'x@example.com',
        origin: 'Enterprise Bundle — ₹99999'
    }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('rejects a missing or malformed email', async () => {
    for (const email of [undefined, '', 'not-an-email', '   ']) {
        const calls = installSupabaseStub();
        const res = mockRes();
        await handler(mockReq({ action: 'log-lead', email, origin: 'homepage' }), res);
        assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(email)}`);
        assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
    }
});

test('an off-domain download_link is dropped rather than stored', async () => {
    const calls = installSupabaseStub();
    const res = mockRes();

    await handler(mockReq({
        action: 'log-lead',
        email: 'attacker@example.com',
        origin: 'homepage',
        download_link: 'https://evil.example.com/phish.pdf'
    }), res);

    assert.equal(res.statusCode, 200);
    const insert = calls.find((c) => c.method === 'POST');
    assert.equal(insert.body.download_link, null);
});

test('surfaces a 502 when Supabase rejects the insert', async () => {
    // The old client-side insert swallowed this, which is why the breakage went
    // unnoticed for so long. The caller must be able to see a failure.
    installSupabaseStub({ insertStatus: 401 });
    const res = mockRes();

    await handler(mockReq({ action: 'log-lead', email: 'fail@example.com', origin: 'homepage' }), res);

    assert.equal(res.statusCode, 502);
});

test('log-lead never reaches the Groq interview path', async () => {
    // Regression guard: the lead action must be dispatched before the
    // GROQ_API_KEY gate, so a missing Groq key cannot break lead capture.
    const savedKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
        installSupabaseStub();
        const res = mockRes();
        await handler(mockReq({ action: 'log-lead', email: 'nogroq@example.com', origin: 'homepage' }), res);
        assert.equal(res.statusCode, 200);
    } finally {
        process.env.GROQ_API_KEY = savedKey;
    }
});
