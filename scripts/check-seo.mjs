// Production technical-SEO smoke test. It intentionally checks only owned
// URLs and never scrapes Google results or depends on Search Console secrets.
const CANONICAL_ORIGIN = 'https://desk2quant.com';
const LEGACY_HOSTS = ['desk2quant.vercel.app', 'quant-mentor.vercel.app'];
const PERMANENT_REDIRECTS = new Set([301, 307, 308]);
const failures = [];
let sitemapLocations = [];

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

function attribute(tag, name) {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function canonicalFrom(html) {
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
        const tag = match[0];
        if ((attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) {
            return attribute(tag, 'href');
        }
    }
    return null;
}

async function fetchChecked(url, options = {}) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const response = await fetch(url, {
                redirect: 'manual',
                ...options,
                headers: {
                    'cache-control': 'no-cache',
                    'user-agent': 'Desk2Quant-SEO-Monitor/1.0',
                    ...options.headers
                },
                signal: AbortSignal.timeout(15_000)
            });
            if (attempt === 1 && [429, 502, 503, 504].includes(response.status)) {
                await response.body?.cancel();
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`${url} could not be fetched after two attempts: ${lastError?.message ?? 'unknown error'}`);
}

async function check(label, work) {
    try {
        await work();
        console.log(`[PASS] ${label}`);
    } catch (error) {
        failures.push({ label, message: error.message });
        console.error(`[FAIL] ${label}: ${error.message}`);
    }
}

function expectedLegacyLocation(requestTarget) {
    const url = new URL(requestTarget, CANONICAL_ORIGIN);
    if (url.pathname === '/index.html') url.pathname = '/';
    if (url.pathname === '/products/quant-interview-problem-book-1000-plus-problems-with-solutions.html') {
        url.pathname = '/products/quant-interview-problem-book.html';
    }
    return url.href;
}

async function assertPermanentRedirect(from, expected, requestTarget) {
    const response = await fetchChecked(from);
    const status = response.status;
    const location = response.headers.get('location');
    await response.body?.cancel();
    invariant(
        PERMANENT_REDIRECTS.has(status),
        `expected 301/307/308, received ${status}`
    );
    invariant(location, 'permanent redirect did not include a Location header');
    const absoluteLocation = new URL(location, from).href;
    if (status === 307 && requestTarget) {
        const expectedAliasLocation = new URL(requestTarget, 'https://desk2quant.vercel.app').href;
        invariant(
            absoluteLocation === expectedAliasLocation || absoluteLocation === expected,
            `expected Location ${expectedAliasLocation} or ${expected}, received ${absoluteLocation}`
        );
        return;
    }
    invariant(absoluteLocation === expected, `expected Location ${expected}, received ${absoluteLocation}`);
}

for (const hostname of LEGACY_HOSTS) {
    for (const requestTarget of [
        '/',
        '/index.html',
        '/products/quant-interview-problem-book-1000-plus-problems-with-solutions.html?seo_monitor=weekly'
    ]) {
        await check(`${hostname}${requestTarget} is a one-hop permanent redirect`, async () => {
            await assertPermanentRedirect(
                `https://${hostname}${requestTarget}`,
                expectedLegacyLocation(requestTarget),
                requestTarget
            );
        });
    }
}

await check('canonical /index.html permanently normalizes to /', async () => {
    await assertPermanentRedirect(`${CANONICAL_ORIGIN}/index.html`, `${CANONICAL_ORIGIN}/`);
});

await check('canonical homepage is indexable and self-canonical', async () => {
    const response = await fetchChecked(`${CANONICAL_ORIGIN}/`);
    invariant(response.status === 200, `expected 200, received ${response.status}`);
    invariant(new URL(response.url).href === `${CANONICAL_ORIGIN}/`, `unexpected response URL ${response.url}`);
    const html = await response.text();
    invariant(/<title\b[^>]*>[\s\S]*Desk2Quant[\s\S]*<\/title>/i.test(html), 'homepage title is missing Desk2Quant');
    invariant(/<h1\b[^>]*>[\s\S]*Build Quant Skills That Survive the[\s\S]*Interview and the Desk[\s\S]*<\/h1>/i.test(html), 'homepage H1 is missing the primary quant interview topic');
    invariant(!/Desk2Quant\.in\b/i.test(html), 'homepage still contains the Desk2Quant.in label');
    const canonical = canonicalFrom(html);
    invariant(canonical === `${CANONICAL_ORIGIN}/`, `expected homepage canonical ${CANONICAL_ORIGIN}/, received ${canonical ?? 'none'}`);
});

await check('sitemap contains only clean canonical-host URLs', async () => {
    const response = await fetchChecked(`${CANONICAL_ORIGIN}/sitemap.xml`);
    invariant(response.status === 200, `expected 200, received ${response.status}`);
    const xml = await response.text();
    invariant(/<urlset\b/i.test(xml), 'response is not a sitemap urlset');
    const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].replace(/&amp;/g, '&'));
    sitemapLocations = locations;
    invariant(locations.length > 0, 'sitemap has no URL locations');
    invariant(new Set(locations).size === locations.length, 'sitemap contains duplicate URLs');
    for (const location of locations) {
        const url = new URL(location);
        invariant(url.protocol === 'https:' && url.hostname === 'desk2quant.com', `non-canonical sitemap URL: ${location}`);
        invariant(!url.search && !url.hash, `sitemap URL contains a query or fragment: ${location}`);
    }
    invariant(locations.includes(`${CANONICAL_ORIGIN}/`), 'sitemap is missing the homepage');
    invariant(locations.some((location) => new URL(location).pathname.startsWith('/products/')), 'sitemap is missing product pages');
    invariant(locations.some((location) => new URL(location).pathname.startsWith('/guides/')), 'sitemap is missing intent guide pages');
    invariant(locations.some((location) => new URL(location).pathname.startsWith('/blog/')), 'sitemap is missing static blog articles');
});

await check('representative product, guide, and blog pages are live and self-canonical', async () => {
    const representatives = [
        `${CANONICAL_ORIGIN}/products/quant-interview-problem-book.html`,
        `${CANONICAL_ORIGIN}/guides/quant-interview-guide.html`,
        sitemapLocations.find((location) => new URL(location).pathname.startsWith('/blog/'))
    ].filter(Boolean);

    invariant(representatives.length === 3, 'could not select all representative SEO pages from the sitemap');
    for (const url of representatives) {
        const response = await fetchChecked(url);
        invariant(response.status === 200, `${url} expected 200, received ${response.status}`);
        const html = await response.text();
        invariant(canonicalFrom(html) === url, `${url} does not self-canonicalize`);
        invariant(/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html), `${url} has no visible H1`);
    }
});

await check('robots.txt advertises the canonical sitemap', async () => {
    const response = await fetchChecked(`${CANONICAL_ORIGIN}/robots.txt`);
    invariant(response.status === 200, `expected 200, received ${response.status}`);
    const robots = await response.text();
    invariant(/^User-agent:\s*\*/im.test(robots), 'robots.txt has no default user-agent group');
    invariant(
        /^Sitemap:\s*https:\/\/desk2quant\.com\/sitemap\.xml\s*$/im.test(robots),
        'robots.txt does not advertise the canonical sitemap URL'
    );
    invariant(!/desk2quant\.vercel\.app|quant-mentor\.vercel\.app/i.test(robots), 'robots.txt references a legacy host');
});

if (failures.length) {
    console.error(`\nSEO smoke check failed (${failures.length} check${failures.length === 1 ? '' : 's'}):`);
    for (const failure of failures) console.error(` - ${failure.label}: ${failure.message}`);
    process.exitCode = 1;
} else {
    console.log('\nSEO smoke check passed.');
}
