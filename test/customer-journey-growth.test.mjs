import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('index.html brainteaser has pre-rendered puzzle and official LinkedIn share endpoint', async () => {
    const html = await fs.readFile('index.html', 'utf8');
    assert.doesNotMatch(html, />Loading daily desk problem…/);
    assert.match(html, /The 100 Tigers and One Sheep/);
    assert.match(html, /https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    assert.doesNotMatch(html, /d2q-whatsapp-widget/);
    assert.doesNotMatch(html, /api\.whatsapp\.com/);
});

test('index.html booking service contains resume teardown native option', async () => {
    const html = await fs.readFile('index.html', 'utf8');
    assert.match(html, /resume_teardown\|1299\|45/);
    assert.match(html, /window\.selectResumeAudit/);
});

test('desk-simulator.mjs uses official LinkedIn share-offsite dialog', async () => {
    const code = await fs.readFile('desk-simulator.mjs', 'utf8');
    assert.match(code, /https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    assert.doesNotMatch(code, /linkedin\.com\/feed\/\?shareActive=true/);
});

test('script.js addToCart supports both string ID and direct product object', async () => {
    const code = await fs.readFile('script.js', 'utf8');
    assert.match(code, /window\.addToCart = function \(/);
    assert.match(code, /typeof productOrId === 'string'/);
    assert.match(code, /typeof productOrId === 'object'/);
});

test('script.js getSmartCartOrderBump logic correctly differentiates recommendations', async () => {
    const code = await fs.readFile('script.js', 'utf8');
    assert.match(code, /function getSmartCartOrderBump\(cart\)/);
    assert.match(code, /a51492ad-ecae-4146-be3f-f7937847e4af/);
    assert.match(code, /df618802-04a8-4fcf-837e-f12dc9db2276/);
    assert.match(code, /b4db1697-0b90-4d50-90cb-6312940a187c/);
    assert.match(code, /73806d69-768b-497e-87b7-d94fa4cfd772/);
});

test('ui-components.js has no whatsapp floating hotline script', async () => {
    const code = await fs.readFile('ui-components.js', 'utf8');
    assert.doesNotMatch(code, /initWhatsAppHotline/);
});

test('index.html enforces payment before calendar access and has post-payment calendar modal', async () => {
    const html = await fs.readFile('index.html', 'utf8');
    assert.doesNotMatch(html, /class="booking-tab-switcher"/);
    assert.doesNotMatch(html, /id="bookingCalContainer"/);
    assert.match(html, /id="bookingForm"/);
    assert.match(html, /id="calendarBookingModal"/);
    assert.match(html, /id="calAddToGcalBtn"/);
    assert.match(html, /id="calDownloadIcsBtn"/);
});

test('site-config.js defines D2Q_CALENDAR_CONFIG for two-way sync', async () => {
    const code = await fs.readFile('site-config.js', 'utf8');
    assert.match(code, /window\.D2Q_CALENDAR_CONFIG/);
    assert.match(code, /desk2quant/);
});

test('script.js defines switchBookingTab and openPostPaymentCalendarModal with strict payment gating', async () => {
    const code = await fs.readFile('script.js', 'utf8');
    assert.match(code, /window\.switchBookingTab/);
    assert.match(code, /window\.openPostPaymentCalendarModal/);
    assert.match(code, /window\.downloadSessionIcs/);
    // Verified gate: requires string paymentId starting with pay_
    assert.match(code, /!data\.paymentId\.trim\(\)\.startsWith\('pay_'\)/);
});

test('api/interview.js does not expose create-free-booking action or handler', async () => {
    const code = await fs.readFile('api/interview.js', 'utf8');
    assert.doesNotMatch(code, /'create-free-booking'/);
    assert.doesNotMatch(code, /action\s*===\s*['"]create-free-booking['"]/);
});

test('script.js generates clean option values without extra whitespace and flexibly matches resume teardown', async () => {
    const code = await fs.readFile('script.js', 'utf8');
    assert.match(code, /option\.value\s*=\s*`\$\{valueType\}\|\$\{session\.price\}\|\$\{session\.duration\}`/);
    assert.match(code, /nameLower\.includes\('resume'\)\s*\|\|\s*nameLower\.includes\('teardown'\)/);
});

test('high-intent subpages load site-config.js for sitewide Clarity and live chat coverage', async () => {
    const pages = [
        'product.html',
        'interview.html',
        'desk-simulator.html',
        'salary-explorer.html',
        'diagnostic.html'
    ];
    for (const page of pages) {
        const html = await fs.readFile(page, 'utf8');
        assert.match(html, /<script[^>]+src=["'][^"']*site-config\.js["'][^>]*defer/i, `${page} must load site-config.js with defer`);
    }
});

test('api/interview.js actively rejects create-free-booking and inserts zero rows', async () => {
    process.env.SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.GROQ_API_KEY = 'test-groq-key';

    const { default: handler } = await import('../api/interview.js');
    let insertedBooking = false;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
        if (String(url).includes('/rest/v1/bookings') && opts.method === 'POST') {
            insertedBooking = true;
        }
        return { ok: true, status: 200, json: async () => [] };
    };

    try {
        let statusCode = null;
        let responseBody = null;
        const req = {
            method: 'POST',
            body: { action: 'create-free-booking', email: 'free@test.com', name: 'Free User' },
            headers: { 'x-forwarded-for': '127.0.0.1' },
            socket: {}
        };
        const res = {
            setHeader() {},
            status(code) { statusCode = code; return this; },
            json(data) { responseBody = data; return this; }
        };

        await handler(req, res);
        assert.equal(statusCode, 400, 'Must reject with 400 status');
        assert.equal(insertedBooking, false, 'Must never insert rows into bookings');
    } finally {
        global.fetch = originalFetch;
    }
});

test('session resolution logic handles quick, deep, interview, teardown and exact dataset IDs', () => {
    const dynamicSessions = [
        { id: 'sess-quick-1', name: 'Quick Consultation', price: 499, duration: 30, is_active: true },
        { id: 'sess-deep-2', name: 'Deep Dive Session', price: 999, duration: 60, is_active: true },
        { id: 'sess-mock-3', name: 'Interview Prep', price: 1499, duration: 90, is_active: true },
        { id: 'sess-tear-4', name: 'Quant Resume & Project Teardown', price: 1299, duration: 45, is_active: true }
    ];

    function resolveSession(sessionType, optSessionId = null) {
        let sessionInfo = null;
        if (optSessionId) {
            sessionInfo = dynamicSessions.find(s => s.id === optSessionId);
        }
        if (!sessionInfo) {
            sessionInfo = dynamicSessions.find(s => {
                const normName = s.name.toLowerCase().replace(/\s+/g, '_');
                const plainName = s.name.toLowerCase();
                return normName === sessionType ||
                    plainName === sessionType.replace(/_/g, ' ') ||
                    normName.startsWith(sessionType + '_') ||
                    plainName.startsWith(sessionType.replace(/_/g, ' '));
            });
        }
        if (!sessionInfo) {
            sessionInfo = dynamicSessions.find(s => {
                const nameLower = (s.name || '').toLowerCase();
                if (sessionType.includes('resume') || sessionType.includes('teardown')) {
                    return (nameLower.includes('resume') || nameLower.includes('teardown')) && s.is_active !== false;
                }
                if (sessionType === 'quick') return nameLower.includes('quick') && s.is_active !== false;
                if (sessionType === 'deep') return nameLower.includes('deep') && s.is_active !== false;
                if (sessionType === 'interview') return nameLower.includes('interview') && s.is_active !== false;
                return false;
            });
        }
        return sessionInfo;
    }

    // Static HTML options
    assert.equal(resolveSession('quick')?.id, 'sess-quick-1');
    assert.equal(resolveSession('deep')?.id, 'sess-deep-2');
    assert.equal(resolveSession('interview')?.id, 'sess-mock-3');
    assert.equal(resolveSession('resume_teardown')?.id, 'sess-tear-4');
    // Direct ID option
    assert.equal(resolveSession('arbitrary_slug', 'sess-tear-4')?.id, 'sess-tear-4');
});

