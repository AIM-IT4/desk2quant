import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'crypto';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
process.env.INTERVIEW_SESSION_SECRET = 'interview-test-secret-1234567890';
process.env.CRON_SECRET = 'cron-test-secret-1234567890';
process.env.ADMIN_PASSWORD = 'admin-test-password-12345';

const { default: interviewHandler, calculateBookingRefund } = await import('../api/interview.js');
const { signBookingToken } = await import('../lib/bookingTokens.js');
const { default: adminAuthHandler } = await import('../api/admin-auth.js');
const { default: remindersHandler } = await import('../api/reminders.js');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { return this; }
    };
}

function mockReq({ method = 'POST', body = {}, headers = {}, query = {} } = {}) {
    return {
        method,
        body,
        query,
        headers: { 'x-forwarded-for': '198.51.100.1', ...headers },
        socket: {}
    };
}

// ---------------------------------------------------------------------------
// 1. calculateBookingRefund tests
// ---------------------------------------------------------------------------
test('calculateBookingRefund: >= 24h notice gives 100% refund', () => {
    // 48 hours from now
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const timeStr = '16:00:00';

    const refund = calculateBookingRefund(dateStr, timeStr, 5000);
    assert.equal(refund.percentage, 100);
    assert.equal(refund.amount, 5000);
});

test('calculateBookingRefund: 12-24h notice gives 50% refund', () => {
    // 18 hours from now in IST
    const futureDate = new Date(Date.now() + 18 * 60 * 60 * 1000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(futureDate.getTime() + istOffset);
    const dateStr = istTime.toISOString().slice(0, 10);
    const h = String(istTime.getUTCHours()).padStart(2, '0');
    const m = String(istTime.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}:00`;

    const refund = calculateBookingRefund(dateStr, timeStr, 5000);
    assert.equal(refund.percentage, 50);
    assert.equal(refund.amount, 2500);
});

test('calculateBookingRefund: < 12h notice gives 0% refund', () => {
    // 4 hours from now
    const futureDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(futureDate.getTime() + istOffset);
    const dateStr = istTime.toISOString().slice(0, 10);
    const h = String(istTime.getUTCHours()).padStart(2, '0');
    const m = String(istTime.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}:00`;

    const refund = calculateBookingRefund(dateStr, timeStr, 5000);
    assert.equal(refund.percentage, 0);
    assert.equal(refund.amount, 0);
});

test('calculateBookingRefund: handles 12h AM/PM format with IST suffix', () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const refund = calculateBookingRefund(dateStr, '4:30 PM IST', 8000);
    assert.equal(refund.percentage, 100);
    assert.equal(refund.amount, 8000);
});

test('calculateBookingRefund: handles ISO datetime string for bookingDate', () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const isoDateStr = futureDate.toISOString(); // e.g. 2026-10-15T00:00:00.000Z
    const refund = calculateBookingRefund(isoDateStr, '14:00:00', 5000);
    assert.equal(refund.percentage, 100);
    assert.equal(refund.amount, 5000);
});

test('calculateBookingRefund: normalizes formatted price strings (commas, currency symbols)', () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const refund1 = calculateBookingRefund(dateStr, '14:00:00', '2,999');
    assert.equal(refund1.percentage, 100);
    assert.equal(refund1.amount, 2999);

    const refund2 = calculateBookingRefund(dateStr, '14:00:00', '₹5,000');
    assert.equal(refund2.percentage, 100);
    assert.equal(refund2.amount, 5000);
});

test('calculateBookingRefund: clamps negative price to 0', () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const refund = calculateBookingRefund(dateStr, '14:00:00', -500);
    assert.equal(refund.percentage, 100);
    assert.equal(refund.amount, 0);
});

test('calculateBookingRefund: handles 12h time without minutes and lowercase am/pm', () => {
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const refund = calculateBookingRefund(dateStr, '4 pm', 4000);
    assert.equal(refund.percentage, 100);
    assert.equal(refund.amount, 4000);
});

test('calculateBookingRefund: past session yields 0% refund', () => {
    const refund = calculateBookingRefund('2020-01-01', '14:00:00', 5000);
    assert.equal(refund.percentage, 0);
    assert.equal(refund.amount, 0);
});

// ---------------------------------------------------------------------------
// 2. Booking status guard and server-side refund calculation in interview.js
// ---------------------------------------------------------------------------
test('reschedule-booking rejects if status is not confirmed', async () => {
    const testEmail = 'candidate@example.com';
    const token = signBookingToken(testEmail);
    const bookingId = 'book-123';

    const originalFetch = global.fetch;
    try {
        global.fetch = async (url) => {
            if (url.includes('/rest/v1/bookings')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{ id: bookingId, email: testEmail, status: 'pending' }]
                };
            }
            throw new Error(`Unexpected fetch ${url}`);
        };

        const res = mockRes();
        await interviewHandler(mockReq({
            body: {
                action: 'reschedule-booking',
                bookingId,
                email: testEmail,
                token,
                date: '2026-10-01',
                time: '15:00:00',
                reason: 'Conflict'
            },
            headers: { 'x-forwarded-for': '198.51.100.11' }
        }), res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /confirmed/i);
    } finally {
        global.fetch = originalFetch;
    }
});

test('reschedule-booking succeeds when status is confirmed', async () => {
    const testEmail = 'candidate@example.com';
    const token = signBookingToken(testEmail);
    const bookingId = 'book-123';
    let patchedBody = null;

    const originalFetch = global.fetch;
    try {
        global.fetch = async (url, options = {}) => {
            if (url.includes('/rest/v1/bookings') && (!options.method || options.method === 'GET')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{ id: bookingId, email: testEmail, status: 'confirmed' }]
                };
            }
            if (url.includes('/rest/v1/bookings') && options.method === 'PATCH') {
                patchedBody = JSON.parse(options.body);
                return { ok: true, status: 200, json: async () => ({}) };
            }
            throw new Error(`Unexpected fetch ${url}`);
        };

        const res = mockRes();
        await interviewHandler(mockReq({
            body: {
                action: 'reschedule-booking',
                bookingId,
                email: testEmail,
                token,
                date: '2026-10-01',
                time: '15:00:00',
                reason: 'Schedule change'
            },
            headers: { 'x-forwarded-for': '198.51.100.12' }
        }), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(patchedBody.status, 'reschedule_requested');
        assert.equal(patchedBody.requested_date, '2026-10-01');
    } finally {
        global.fetch = originalFetch;
    }
});

test('cancel-booking rejects if status is not confirmed', async () => {
    const testEmail = 'candidate@example.com';
    const token = signBookingToken(testEmail);
    const bookingId = 'book-456';

    const originalFetch = global.fetch;
    try {
        global.fetch = async (url) => {
            if (url.includes('/rest/v1/bookings')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{
                        id: bookingId,
                        email: testEmail,
                        status: 'upcoming',
                        name: 'Candidate',
                        service_name: 'Mentorship',
                        service_price: 6000,
                        booking_date: '2026-10-15',
                        booking_time: '14:00:00'
                    }]
                };
            }
            throw new Error(`Unexpected fetch ${url}`);
        };

        const res = mockRes();
        await interviewHandler(mockReq({
            body: {
                action: 'cancel-booking',
                bookingId,
                email: testEmail,
                token,
                refundAmount: 6000,
                refundPercentage: 100
            },
            headers: { 'x-forwarded-for': '198.51.100.13' }
        }), res);

        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /confirmed/i);
    } finally {
        global.fetch = originalFetch;
    }
});

test('cancel-booking calculates refund server-side and ignores client-supplied refund fields', async () => {
    const testEmail = 'candidate@example.com';
    const token = signBookingToken(testEmail);
    const bookingId = 'book-789';
    let patchedBody = null;

    // Session is 50 hours in future -> 100% refund
    const futureDate = new Date(Date.now() + 50 * 60 * 60 * 1000);
    const dateStr = futureDate.toISOString().slice(0, 10);

    const originalFetch = global.fetch;
    try {
        global.fetch = async (url, options = {}) => {
            if (url.includes('/rest/v1/bookings') && (!options.method || options.method === 'GET')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{
                        id: bookingId,
                        email: testEmail,
                        status: 'confirmed',
                        name: 'Candidate',
                        service_name: 'Mentorship',
                        service_price: 5000,
                        booking_date: dateStr,
                        booking_time: '14:00:00'
                    }]
                };
            }
            if (url.includes('/rest/v1/bookings') && options.method === 'PATCH') {
                patchedBody = JSON.parse(options.body);
                return { ok: true, status: 200, json: async () => ({}) };
            }
            throw new Error(`Unexpected fetch ${url}`);
        };

        const res = mockRes();
        // Client maliciously supplies refundAmount: 999999 and refundPercentage: 999
        await interviewHandler(mockReq({
            body: {
                action: 'cancel-booking',
                bookingId,
                email: testEmail,
                token,
                refundAmount: 999999,
                refundPercentage: 999
            },
            headers: { 'x-forwarded-for': '198.51.100.14' }
        }), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(patchedBody.status, 'cancellation_requested');
        // Must calculate 100% and 5000, NOT the client-supplied values
        assert.equal(patchedBody.refund_amount, 5000);
        assert.equal(patchedBody.refund_percentage, 100);
    } finally {
        global.fetch = originalFetch;
    }
});

// ---------------------------------------------------------------------------
// 3. Receipt printer and admin sanitization tests
// ---------------------------------------------------------------------------
test('receipt-printer.js contains HTML escaping and strict downloadLink sanitization', async () => {
    const code = await fs.readFile('receipt-printer.js', 'utf8');
    assert.match(code, /function escapeHtml\b/);
    assert.match(code, /function sanitizeDownloadLink\b/);
    assert.match(code, /\$\{escapeHtml\(customerEmail\)\}/);
    assert.match(code, /\$\{escapeHtml\(item\.name\)\}/);
    assert.match(code, /\$\{escapeHtml\(paymentId\)\}/);
    assert.match(code, /\$\{escapeHtml\(paymentId\.toUpperCase\(\)\)\}/);
    assert.match(code, /sanitizeDownloadLink\(data\.downloadLink\)/);
    // Verifies protocol check prohibits non-https schemes
    assert.match(code, /https:/);
});

test('admin.html escapes customer inputs and clamps review ratings', async () => {
    const html = await fs.readFile('admin.html', 'utf8');
    assert.match(html, /\$\{escapeHtml\(booking\.reschedule_reason\)\}/);
    assert.match(html, /\$\{escapeHtml\(booking\.cancellation_reason\)\}/);
    assert.match(html, /\$\{escapeHtml\(booking\.email\)\}/);
    assert.match(html, /\$\{escapeHtml\(t\.name\)\}/);
    assert.match(html, /function escapeJsString\b/);
    assert.match(html, /Math\.max\(0,\s*Math\.min\(5/);
});

// ---------------------------------------------------------------------------
// 4. script.js cleanup tests
// ---------------------------------------------------------------------------
test('script.js does not insert to purchases client-side or auto-launch receipt printer', async () => {
    const script = await fs.readFile('script.js', 'utf8');
    // Ensure the obsolete 401 client-side insert is gone
    assert.doesNotMatch(script, /supabaseClient\.from\(['"]purchases['"]\)\.insert/);
    // Ensure showReceiptPrinter is not called on checkout capture
    assert.doesNotMatch(script, /window\.showReceiptPrinter\(orderMeta\)/);
    assert.doesNotMatch(script, /window\.showReceiptPrinter\(cartMeta\)/);
});

// ---------------------------------------------------------------------------
// 5. admin-auth.js timing-safe comparison and rate limiting
// ---------------------------------------------------------------------------
test('admin-auth timing-safe comparison accepts correct password and rejects incorrect', async () => {
    const resPass = mockRes();
    await adminAuthHandler(mockReq({
        body: { password: process.env.ADMIN_PASSWORD, action: 'login' },
        headers: { 'x-forwarded-for': '198.51.100.20' }
    }), resPass);
    assert.equal(resPass.statusCode, 200);
    assert.equal(resPass.body.success, true);

    const resFail = mockRes();
    await adminAuthHandler(mockReq({
        body: { password: 'wrong-password', action: 'login' },
        headers: { 'x-forwarded-for': '198.51.100.21' }
    }), resFail);
    assert.equal(resFail.statusCode, 401);
    assert.equal(resFail.body.success, false);
});

test('admin-auth rate limiting triggers after 10 requests from same IP', async () => {
    const ip = '198.51.100.22';
    let lastStatus = null;
    for (let i = 0; i < 12; i++) {
        const res = mockRes();
        await adminAuthHandler(mockReq({
            body: { password: 'wrong', action: 'login' },
            headers: { 'x-forwarded-for': ip }
        }), res);
        lastStatus = res.statusCode;
    }
    assert.equal(lastStatus, 429);
});

test('admin-auth rate limiting falls back to socket.remoteAddress when x-forwarded-for is missing', async () => {
    const fallbackIp = '203.0.113.88';
    let lastStatus = null;
    for (let i = 0; i < 12; i++) {
        const res = mockRes();
        const req = {
            method: 'POST',
            body: { password: 'wrong', action: 'login' },
            headers: {},
            socket: { remoteAddress: fallbackIp }
        };
        await adminAuthHandler(req, res);
        lastStatus = res.statusCode;
    }
    assert.equal(lastStatus, 429);
});

// ---------------------------------------------------------------------------
// 6. reminders.js timing-safe comparison and rate limiting
// ---------------------------------------------------------------------------
test('reminders auth rejects invalid secret', async () => {
    const res = mockRes();
    await remindersHandler(mockReq({
        method: 'GET',
        query: { secret: 'bad-secret' },
        headers: { 'x-forwarded-for': '198.51.100.30' }
    }), res);
    assert.equal(res.statusCode, 401);
});

test('reminders rate limiting triggers after exceeding limit from same IP', async () => {
    const ip = '198.51.100.31';
    let lastStatus = null;
    for (let i = 0; i < 35; i++) {
        const res = mockRes();
        await remindersHandler(mockReq({
            method: 'GET',
            query: { secret: process.env.CRON_SECRET },
            headers: { 'x-forwarded-for': ip }
        }), res);
        lastStatus = res.statusCode;
    }
    assert.equal(lastStatus, 429);
});

// ---------------------------------------------------------------------------
// 7. Coupon propagation and pricing resolution
// ---------------------------------------------------------------------------
test('generate-config.js and config.js persist buyBtn.dataset.couponCode on coupon apply', async () => {
    const configContent = await fs.readFile('config.js', 'utf8');
    assert.match(configContent, /buyBtn\.dataset\.couponCode\s*=\s*code;/, 'config.js must set buyBtn.dataset.couponCode');

    const generateConfigContent = await fs.readFile('generate-config.js', 'utf8');
    assert.match(generateConfigContent, /buyBtn\.dataset\.couponCode\s*=\s*code;/, 'generate-config.js must set buyBtn.dataset.couponCode');
});

test('resolveProductDiscountPercent grants 20% discount for PROJECT20 on 45 Projects', async () => {
    const { resolveProductDiscountPercent, getExpectedProductOrder, getSubunitMultiplier } = await import('../lib/pricing.js');
    const product = {
        id: 'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7',
        name: 'Ultimate Industry Grade Quant Project Pack (45 Projects)',
        price: 799,
        coupon_code: 'PROJECT20',
        discount_percentage: 20
    };
    const discount = await resolveProductDiscountPercent(product, 'PROJECT20');
    assert.equal(discount, 20);

    const discountLower = await resolveProductDiscountPercent(product, 'project20');
    assert.equal(discountLower, 20);

    const noCoupon = await resolveProductDiscountPercent(product, null);
    assert.equal(noCoupon, 0);

    // End-to-end getExpectedProductOrder test with mocked fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (String(url).includes('products')) {
            return {
                ok: true,
                status: 200,
                json: async () => [product]
            };
        }
        throw new Error('Unexpected url: ' + url);
    };

    try {
        const orderWithCoupon = await getExpectedProductOrder(product.id, 'INR', 'PROJECT20');
        assert.equal(orderWithCoupon.ok, true);
        assert.equal(orderWithCoupon.discountPercent, 20);
        assert.equal(orderWithCoupon.amountInr, 639.2);
        const multiplier = getSubunitMultiplier(orderWithCoupon.currency);
        const subunitsWithCoupon = Math.round(orderWithCoupon.amountMajor * multiplier);
        assert.equal(subunitsWithCoupon, 63920); // 63920 paise = ₹639.20

        const orderWithoutCoupon = await getExpectedProductOrder(product.id, 'INR', null);
        assert.equal(orderWithoutCoupon.ok, true);
        assert.equal(orderWithoutCoupon.discountPercent, 0);
        assert.equal(orderWithoutCoupon.amountInr, 799);
        const subunitsWithoutCoupon = Math.round(orderWithoutCoupon.amountMajor * multiplier);
        assert.equal(subunitsWithoutCoupon, 79900); // 79900 paise = ₹799.00
    } finally {
        globalThis.fetch = originalFetch;
    }
});


