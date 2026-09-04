import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_HOST = 'desk2quant.com';
export const DEFAULT_KEY = 'd7e68fa79914481bb2bf5efea95764d2';
export const DEFAULT_KEY_FILE = `${DEFAULT_KEY}.txt`;
export const DEFAULT_KEY_LOCATION = `https://${DEFAULT_HOST}/${DEFAULT_KEY_FILE}`;
export const DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_ENDPOINTS = [
    'https://api.indexnow.org/indexnow',
    'https://search.seznam.cz/indexnow',
    'https://yandex.com/indexnow'
];
export const MAX_URLS_PER_BATCH = 10000;

/**
 * Parses <loc> URLs from a sitemap XML string.
 * @param {string} xml
 * @returns {string[]}
 */
export function extractUrlsFromSitemap(xml) {
    if (!xml || typeof xml !== 'string') return [];
    const urls = [];
    const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
        const url = match[1].trim();
        if (url) {
            urls.push(url);
        }
    }
    return urls;
}

/**
 * Validates and formats the IndexNow payload.
 * @param {Object} options
 * @param {string} options.host
 * @param {string} options.key
 * @param {string} [options.keyLocation]
 * @param {string[]} options.urlList
 * @returns {{ host: string, key: string, keyLocation?: string, urlList: string[] }}
 */
export function buildIndexNowPayload({ host, key, keyLocation, urlList }) {
    if (!host || typeof host !== 'string') {
        throw new Error('IndexNow host is required and must be a string.');
    }
    if (!key || typeof key !== 'string' || key.length < 8 || key.length > 128) {
        throw new Error('IndexNow key must be a string between 8 and 128 characters.');
    }
    if (!Array.isArray(urlList) || urlList.length === 0) {
        throw new Error('IndexNow urlList must be a non-empty array of URLs.');
    }

    const cleanHost = host.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const sanitizedUrls = urlList.map(u => u.trim()).filter(Boolean);

    // Filter to ensure all URLs belong to host
    for (const url of sanitizedUrls) {
        try {
            const parsed = new URL(url);
            if (parsed.hostname.toLowerCase() !== cleanHost) {
                throw new Error(`URL "${url}" does not match host "${cleanHost}".`);
            }
        } catch (err) {
            throw new Error(`Invalid URL "${url}": ${err.message}`);
        }
    }

    const payload = {
        host: cleanHost,
        key: key.trim(),
        urlList: sanitizedUrls
    };

    if (keyLocation && typeof keyLocation === 'string') {
        payload.keyLocation = keyLocation.trim();
    }

    return payload;
}

/**
 * Submits payload to an IndexNow endpoint.
 * @param {Object} params
 * @param {Object} params.payload
 * @param {string} [params.endpoint]
 * @param {Function} [params.fetchFn]
 * @returns {Promise<{ status: number, ok: boolean, message: string }>}
 */
export function submitIndexNowPayload({
    payload,
    endpoint = DEFAULT_ENDPOINT,
    fetchFn = globalThis.fetch
}) {
    return fetchFn(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
    }).then(async res => {
        const text = await res.text();
        const ok = res.status === 200 || res.status === 202;
        let message = `IndexNow responded with HTTP ${res.status}`;
        if (res.status === 200) message = 'HTTP 200: URLs successfully submitted.';
        else if (res.status === 202) message = 'HTTP 202: URL received. Key pending validation.';
        else if (res.status === 400) message = `HTTP 400: Invalid format. ${text}`;
        else if (res.status === 403) message = `HTTP 403: Key not valid / key file not found. ${text}`;
        else if (res.status === 422) message = `HTTP 422: URLs don't belong to host. ${text}`;
        else if (res.status === 429) message = 'HTTP 429: Too many requests.';

        return {
            status: res.status,
            ok,
            message,
            raw: text
        };
    });
}

/**
 * Self-test suite verifying logic, regex, payload building, and mocked submissions.
 */
export async function runSelfTests() {
    // 1. Verify key file exists and matches default key
    const keyFilePath = path.join(REPO_ROOT, DEFAULT_KEY_FILE);
    const diskKey = (await readFile(keyFilePath, 'utf8')).trim();
    assert.equal(diskKey, DEFAULT_KEY, `Verification file ${DEFAULT_KEY_FILE} must contain ${DEFAULT_KEY}`);

    // 2. Sitemap XML extraction
    const mockSitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://desk2quant.com/</loc></url>
      <url><loc>https://desk2quant.com/blog.html</loc></url>
      <url><loc>https://desk2quant.com/products/the-vol-surface.html</loc></url>
    </urlset>`;
    const extracted = extractUrlsFromSitemap(mockSitemap);
    assert.deepEqual(extracted, [
        'https://desk2quant.com/',
        'https://desk2quant.com/blog.html',
        'https://desk2quant.com/products/the-vol-surface.html'
    ]);

    // 3. Payload validation
    const payload = buildIndexNowPayload({
        host: DEFAULT_HOST,
        key: DEFAULT_KEY,
        keyLocation: DEFAULT_KEY_LOCATION,
        urlList: extracted
    });
    assert.equal(payload.host, DEFAULT_HOST);
    assert.equal(payload.key, DEFAULT_KEY);
    assert.equal(payload.keyLocation, DEFAULT_KEY_LOCATION);
    assert.equal(payload.urlList.length, 3);

    // 4. Host mismatch error
    assert.throws(() => {
        buildIndexNowPayload({
            host: DEFAULT_HOST,
            key: DEFAULT_KEY,
            urlList: ['https://evil.com/phish']
        });
    }, /does not match host/);

    // 5. Mock HTTP submission testing
    let capturedReq = null;
    const mockFetch = async (url, opts) => {
        capturedReq = { url, opts };
        return {
            status: 200,
            text: async () => 'OK'
        };
    };

    const res = await submitIndexNowPayload({
        payload,
        endpoint: DEFAULT_ENDPOINT,
        fetchFn: mockFetch
    });
    assert.equal(res.status, 200);
    assert.equal(res.ok, true);
    assert.equal(capturedReq.url, DEFAULT_ENDPOINT);
    assert.equal(capturedReq.opts.method, 'POST');
    assert.match(capturedReq.opts.body, /"host":"desk2quant.com"/);

    console.log('[indexnow:self-test] Key file, sitemap extraction, payload builder, and submission tests passed.');
}

/**
 * Main CLI runner.
 */
async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isSelfTest = args.includes('--self-test');

    if (isSelfTest) {
        await runSelfTests();
        return;
    }

    const host = process.env.INDEXNOW_HOST || DEFAULT_HOST;
    const key = process.env.INDEXNOW_KEY || DEFAULT_KEY;
    const keyLocation = process.env.INDEXNOW_KEY_LOCATION || `https://${host}/${key}.txt`;
    const endpoints = process.env.INDEXNOW_ENDPOINT 
        ? [process.env.INDEXNOW_ENDPOINT] 
        : INDEXNOW_ENDPOINTS;

    // Load sitemap.xml
    const sitemapPath = path.join(REPO_ROOT, 'sitemap.xml');
    let xml;
    try {
        xml = await readFile(sitemapPath, 'utf8');
    } catch (e) {
        throw new Error(`Could not read sitemap.xml at ${sitemapPath}: ${e.message}`);
    }

    const urls = extractUrlsFromSitemap(xml);
    if (!urls.length) {
        throw new Error('No URLs found in sitemap.xml to submit to IndexNow.');
    }

    console.log(`[indexnow] Extracted ${urls.length} URLs from sitemap.xml.`);

    // Batch if exceeding MAX_URLS_PER_BATCH
    const batches = [];
    for (let i = 0; i < urls.length; i += MAX_URLS_PER_BATCH) {
        batches.push(urls.slice(i, i + MAX_URLS_PER_BATCH));
    }

    for (let i = 0; i < batches.length; i++) {
        const batchUrls = batches[i];
        const payload = buildIndexNowPayload({
            host,
            key,
            keyLocation,
            urlList: batchUrls
        });

        if (isDryRun) {
            console.log(`[indexnow:dry-run] Batch ${i + 1}/${batches.length}: Prepared payload for ${batchUrls.length} URLs.`);
            console.log(`[indexnow:dry-run] Endpoints: ${endpoints.join(', ')}`);
            console.log(`[indexnow:dry-run] Sample URLs:`, batchUrls.slice(0, 3));
            continue;
        }

        let anySuccess = false;
        const errors = [];

        for (const endpoint of endpoints) {
            console.log(`[indexnow] Submitting batch ${i + 1}/${batches.length} (${batchUrls.length} URLs) to ${endpoint}...`);
            try {
                const result = await submitIndexNowPayload({ payload, endpoint });
                console.log(`[indexnow] [${new URL(endpoint).hostname}] ${result.message}`);
                if (result.ok) {
                    anySuccess = true;
                } else {
                    errors.push(`${new URL(endpoint).hostname}: ${result.message}`);
                }
            } catch (err) {
                console.warn(`[indexnow] [${new URL(endpoint).hostname}] Network error: ${err.message}`);
                errors.push(`${new URL(endpoint).hostname}: ${err.message}`);
            }
        }

        if (!anySuccess) {
            throw new Error(`IndexNow submission failed across all endpoints:\n  ${errors.join('\n  ')}`);
        }
    }

    console.log('[indexnow] All batches submitted and acknowledged by the IndexNow network.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('[indexnow] Error:', err.message);
        process.exitCode = 1;
    });
}
