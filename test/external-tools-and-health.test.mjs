import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('health.json exists and returns valid status ok for uptime monitors', async () => {
    const raw = await fs.readFile('health.json', 'utf8');
    const data = JSON.parse(raw);
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'Desk2Quant');
    assert.ok(data.uptime);
});

test('vercel.json rewrites /api/health to /health.json without consuming serverless function slots', async () => {
    const raw = await fs.readFile('vercel.json', 'utf8');
    const data = JSON.parse(raw);
    const rewrite = data.rewrites?.find(r => r.source === '/api/health');
    assert.ok(rewrite, 'Rewrite for /api/health should exist');
    assert.equal(rewrite.destination, '/health.json');
});

test('site-config.js defines D2Q_CLARITY_CONFIG and D2Q_LIVE_CHAT_CONFIG', async () => {
    const content = await fs.readFile('site-config.js', 'utf8');
    assert.match(content, /window\.D2Q_CLARITY_CONFIG\s*=\s*Object\.freeze\(\{/);
    assert.match(content, /enabled:\s*true/);
    assert.match(content, /projectId:/);

    assert.match(content, /window\.D2Q_LIVE_CHAT_CONFIG\s*=\s*Object\.freeze\(\{/);
    assert.match(content, /enabled:\s*(true|false)/);
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
