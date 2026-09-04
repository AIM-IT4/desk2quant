import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    DEFAULT_HOST,
    DEFAULT_KEY,
    DEFAULT_KEY_FILE,
    DEFAULT_KEY_LOCATION,
    DEFAULT_ENDPOINT,
    extractUrlsFromSitemap,
    buildIndexNowPayload,
    submitIndexNowPayload,
    runSelfTests
} from '../scripts/submit-indexnow.mjs';

test('IndexNow key file exists at repository root and matches DEFAULT_KEY', async () => {
    const keyPath = path.resolve(DEFAULT_KEY_FILE);
    const content = await fs.readFile(keyPath, 'utf8');
    assert.equal(content.trim(), DEFAULT_KEY);
    assert.match(DEFAULT_KEY, /^[a-f0-9]{32}$/, 'IndexNow key should be a 32-character hex string');
});

test('extractUrlsFromSitemap extracts all valid URLs from XML', () => {
    const xml = `
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://desk2quant.com/</loc><priority>1.0</priority></url>
      <url><loc>https://desk2quant.com/products/</loc><priority>0.9</priority></url>
      <url><loc>https://desk2quant.com/blog.html</loc><priority>0.8</priority></url>
    </urlset>`;
    const urls = extractUrlsFromSitemap(xml);
    assert.deepEqual(urls, [
        'https://desk2quant.com/',
        'https://desk2quant.com/products/',
        'https://desk2quant.com/blog.html'
    ]);
});

test('buildIndexNowPayload creates well-formed payload for valid URLs', () => {
    const urls = [
        'https://desk2quant.com/',
        'https://desk2quant.com/desk-simulator.html'
    ];
    const payload = buildIndexNowPayload({
        host: DEFAULT_HOST,
        key: DEFAULT_KEY,
        keyLocation: DEFAULT_KEY_LOCATION,
        urlList: urls
    });

    assert.equal(payload.host, 'desk2quant.com');
    assert.equal(payload.key, DEFAULT_KEY);
    assert.equal(payload.keyLocation, DEFAULT_KEY_LOCATION);
    assert.deepEqual(payload.urlList, urls);
});

test('buildIndexNowPayload rejects URLs from foreign hosts', () => {
    assert.throws(() => {
        buildIndexNowPayload({
            host: 'desk2quant.com',
            key: DEFAULT_KEY,
            urlList: ['https://notdesk2quant.com/phishing']
        });
    }, /does not match host/);
});

test('submitIndexNowPayload handles success (200) and accepted (202) responses', async () => {
    const mock200 = async () => ({
        status: 200,
        text: async () => 'OK'
    });

    const res200 = await submitIndexNowPayload({
        payload: { host: 'desk2quant.com', key: DEFAULT_KEY, urlList: ['https://desk2quant.com/'] },
        fetchFn: mock200
    });
    assert.equal(res200.status, 200);
    assert.equal(res200.ok, true);

    const mock202 = async () => ({
        status: 202,
        text: async () => 'Accepted'
    });

    const res202 = await submitIndexNowPayload({
        payload: { host: 'desk2quant.com', key: DEFAULT_KEY, urlList: ['https://desk2quant.com/'] },
        fetchFn: mock202
    });
    assert.equal(res202.status, 202);
    assert.equal(res202.ok, true);
});

test('submitIndexNowPayload handles error responses gracefully', async () => {
    const mock403 = async () => ({
        status: 403,
        text: async () => 'Key not found'
    });

    const res403 = await submitIndexNowPayload({
        payload: { host: 'desk2quant.com', key: DEFAULT_KEY, urlList: ['https://desk2quant.com/'] },
        fetchFn: mock403
    });
    assert.equal(res403.status, 403);
    assert.equal(res403.ok, false);
    assert.match(res403.message, /Key not valid/);
});

test('submit-indexnow self-test passes completely', async () => {
    await assert.doesNotReject(async () => {
        await runSelfTests();
    });
});
