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

