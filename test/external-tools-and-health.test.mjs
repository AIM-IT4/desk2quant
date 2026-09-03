import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import healthHandler from '../api/health.js';

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { return this; }
    };
}

test('api/health.js GET returns 200 with status ok, timestamp, and uptime', async () => {
    const req = { method: 'GET' };
    const res = mockRes();
    await healthHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body, 'Response body should be present');
    assert.equal(res.body.status, 'ok');
    assert.ok(typeof res.body.uptime === 'number' && res.body.uptime >= 0, 'Uptime should be non-negative number');
    assert.ok(typeof res.body.timestamp === 'string', 'Timestamp should be string');
    const parsedDate = new Date(res.body.timestamp);
    assert.ok(!isNaN(parsedDate.getTime()), 'Timestamp should be valid ISO date');
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
});

test('api/health.js OPTIONS and HEAD return 200', async () => {
    const reqOptions = { method: 'OPTIONS' };
    const resOptions = mockRes();
    await healthHandler(reqOptions, resOptions);
    assert.equal(resOptions.statusCode, 200);

    const reqHead = { method: 'HEAD' };
    const resHead = mockRes();
    await healthHandler(reqHead, resHead);
    assert.equal(resHead.statusCode, 200);
});

test('api/health.js rejects unsupported methods with 405', async () => {
    const req = { method: 'POST' };
    const res = mockRes();
    await healthHandler(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body?.error, 'Method not allowed');
});

test('site-config.js defines D2Q_CLARITY_CONFIG and D2Q_LIVE_CHAT_CONFIG', async () => {
    const content = await fs.readFile('site-config.js', 'utf8');
    assert.match(content, /window\.D2Q_CLARITY_CONFIG\s*=\s*Object\.freeze\(\{/);
    assert.match(content, /enabled:\s*true/);
    assert.match(content, /projectId:/);

    assert.match(content, /window\.D2Q_LIVE_CHAT_CONFIG\s*=\s*Object\.freeze\(\{/);
    assert.match(content, /enabled:\s*false/);
    assert.match(content, /propertyId:/);
    assert.match(content, /widgetId:/);
    assert.match(content, /window\.initClarity\s*=\s*initClarity/);
    assert.match(content, /window\.initLiveChat\s*=\s*initLiveChat/);
});

test('script.js includes initialization hooks for Clarity and Live Chat', async () => {
    const content = await fs.readFile('script.js', 'utf8');
    assert.match(content, /initClarity/);
    assert.match(content, /initLiveChat/);
});

test('index.html and key public pages contain Google and Bing verification tags', async () => {
    const pages = [
        'index.html',
        'product.html',
        'blog.html',
        'diagnostic.html',
        'interview.html',
        'testimonials.html',
        'salary-explorer.html',
        'code-playground.html',
        'desk-simulator.html',
        'gauntlet.html',
        'faq.html',
        'privacy.html',
        'terms.html',
        'refund.html',
        'share-salary.html',
        'guides/index.html'
    ];

    for (const page of pages) {
        const html = await fs.readFile(page, 'utf8');
        assert.match(html, /<meta\s+name="google-site-verification"\s+content="[^"]+"/i, `${page} missing google-site-verification`);
        assert.match(html, /<meta\s+name="msvalidate\.01"\s+content="[^"]+"/i, `${page} missing msvalidate.01`);
    }
});

test('contact section retains 2-column layout and booking form', async () => {
    const html = await fs.readFile('index.html', 'utf8');
    assert.match(html, /<section[^>]*id="contact"/);
    assert.match(html, /class="[^"]*contact-wrapper[^"]*"/);
    assert.match(html, /class="[^"]*contact-info[^"]*"/);
    assert.match(html, /class="[^"]*contact-form-wrapper[^"]*"/);
    assert.match(html, /<form[^>]*id="bookingForm"/);
});
