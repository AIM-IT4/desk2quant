import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const CANONICAL_ORIGIN = 'https://desk2quant.com';
const require = createRequire(import.meta.url);
const { renderBlogPage } = require('../scripts/blog-seo-template.js');

// These are source artifacts rather than deployable web documents. Keep this
// list narrow and explicit so a newly added HTML page cannot silently skip SEO.
const HTML_ARTIFACT_EXCLUSIONS = [
    { matches: (file) => file.startsWith('email-templates/'), reason: 'email source template' },
    { matches: (file) => file === 'emailjs_template.html', reason: 'EmailJS source template' },
    { matches: (file) => file.startsWith('temp_template/'), reason: 'archived upstream template' },
    { matches: (file) => file.startsWith('archive/'), reason: 'archived site artifact' },
    { matches: (file) => /^google[a-z0-9]+\.html$/i.test(file), reason: 'Google ownership token' },
    // Local-only output of scripts/preview-emails.mjs. It is gitignored, so CI
    // never sees it -- but these tests walk the filesystem, so without this a
    // developer who previews the email templates and then runs the suite gets a
    // spurious failure on an artifact that is never deployed.
    { matches: (file) => file === 'email-preview-generated.html', reason: 'generated email preview' }
];

const DIRECTORY_EXCLUSIONS = new Set(['.git', '.github', '.vercel', 'node_modules', 'coverage']);

function normaliseFile(file) {
    return file.split(path.sep).join('/');
}

function exclusionFor(file) {
    return HTML_ARTIFACT_EXCLUSIONS.find((entry) => entry.matches(file));
}

async function collectHtml(directory = projectRoot, relativeDirectory = '') {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && DIRECTORY_EXCLUSIONS.has(entry.name)) continue;
        const relative = normaliseFile(path.join(relativeDirectory, entry.name));
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectHtml(absolute, relative));
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(relative);
    }
    return files.sort();
}

function attribute(tag, name) {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function tags(html, tagName) {
    return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function articleMarkup(html, file) {
    const match = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    assert.ok(match, `${file} needs a visible article element`);
    return match[1];
}

function canonicalLinks(html) {
    return tags(html, 'link')
        .filter((tag) => (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'))
        .map((tag) => attribute(tag, 'href'));
}

function hasNoindex(html) {
    return tags(html, 'meta').some((tag) => {
        if ((attribute(tag, 'name') ?? '').toLowerCase() !== 'robots') return false;
        return /(?:^|[\s,])noindex(?:$|[\s,])/i.test(attribute(tag, 'content') ?? '');
    });
}

function assertCanonicalUrl(value, label) {
    assert.ok(value, `${label} must be present`);
    let url;
    assert.doesNotThrow(() => { url = new URL(value); }, `${label} must be an absolute URL`);
    assert.equal(url.protocol, 'https:', `${label} must use HTTPS`);
    assert.equal(url.hostname, 'desk2quant.com', `${label} must use only desk2quant.com`);
    assert.equal(url.port, '', `${label} must not use a non-default port`);
    assert.equal(url.username, '', `${label} must not contain credentials`);
    assert.equal(url.password, '', `${label} must not contain credentials`);
    assert.equal(url.hash, '', `${label} must not contain a fragment`);
    return url;
}

function jsonLdDocuments(html, file) {
    const documents = [];
    const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    for (const [index, match] of [...html.matchAll(scripts)].entries()) {
        if ((attribute(`<script ${match[1]}>`, 'type') ?? '').toLowerCase() !== 'application/ld+json') continue;
        // A few application pages populate their JSON-LD script at runtime.
        // There is no static document to parse in that case; generated SEO
        // pages below are still required to contain complete static schemas.
        if (!match[2].trim()) continue;
        assert.doesNotThrow(
            () => documents.push(JSON.parse(match[2])),
            `${file} JSON-LD block ${index + 1} must contain valid JSON`
        );
    }
    return documents;
}

function schemaNodes(documents) {
    return documents.flatMap((document) => {
        if (Array.isArray(document)) return document;
        if (document && Array.isArray(document['@graph'])) return document['@graph'];
        return document ? [document] : [];
    });
}

function hasSchemaType(node, type) {
    const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
    return types.includes(type);
}

function assertNonemptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim(), `${label} must not be empty`);
}

function assertBreadcrumb(node, canonical, file) {
    assert.ok(Array.isArray(node.itemListElement), `${file} BreadcrumbList must have itemListElement`);
    assert.ok(node.itemListElement.length >= 2, `${file} BreadcrumbList must contain at least two crumbs`);
    node.itemListElement.forEach((item, index) => {
        assert.ok(hasSchemaType(item, 'ListItem'), `${file} breadcrumb ${index + 1} must be a ListItem`);
        assert.equal(item.position, index + 1, `${file} breadcrumb positions must be sequential`);
        assertNonemptyString(item.name, `${file} breadcrumb ${index + 1} name`);
        assertCanonicalUrl(item.item, `${file} breadcrumb ${index + 1} item`);
    });
    assert.equal(
        new URL(node.itemListElement.at(-1).item).href,
        new URL(canonical).href,
        `${file} final breadcrumb must be the page canonical`
    );
}

function decodeHtml(value) {
    const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
    return value
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

function searchableText(value) {
    return decodeHtml(value)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
        .toLowerCase();
}

const allHtmlFiles = await collectHtml();
const deployableHtmlFiles = allHtmlFiles.filter((file) => !exclusionFor(file));
const htmlByFile = new Map(await Promise.all(
    deployableHtmlFiles.map(async (file) => [file, await readFile(path.join(projectRoot, file), 'utf8')])
));

test('every deployable HTML page has one canonical or an explicit noindex directive', () => {
    assert.ok(deployableHtmlFiles.length > 0, 'Expected deployable HTML files');
    const missingMetadata = [];
    const duplicateCanonicals = [];
    for (const [file, html] of htmlByFile) {
        const canonicals = canonicalLinks(html);
        const noindex = hasNoindex(html);
        if (canonicals.length === 0 && !noindex) missingMetadata.push(file);
        if (canonicals.length > 1) duplicateCanonicals.push(file);
        for (const canonical of canonicals) assertCanonicalUrl(canonical, `${file} canonical`);
    }
    assert.deepEqual(missingMetadata, [], `HTML files missing canonical/noindex:\n${missingMetadata.join('\n')}`);
    assert.deepEqual(duplicateCanonicals, [], `HTML files with duplicate canonicals:\n${duplicateCanonicals.join('\n')}`);
});

test('deployable HTML contains no stale Desk2Quant.in branding', () => {
    const staleFiles = [...htmlByFile]
        .filter(([, html]) => /Desk2Quant\.in\b/i.test(html))
        .map(([file]) => file);
    assert.deepEqual(staleFiles, [], `HTML files containing Desk2Quant.in:\n${staleFiles.join('\n')}`);
});

// The brand lockup is only half-static. Pages ship the legacy wordmark
// (desk2quant-logo.png, which already contains the words "Desk2Quant") in their
// markup, and ui-components.js rewrites every .logo-img to the square mark at
// runtime. A navbar page that omits the script therefore renders the wordmark
// straight next to <span class="logo-text">Desk2Quant</span> and reads
// "Desk2Quant Desk2Quant" -- exactly how my-access.html shipped. Generated
// pages under products/, guides/ and blog/ have no navbar and are unaffected.
test('every page with a navbar logo loads ui-components.js to apply the brand mark', () => {
    const offenders = [...htmlByFile]
        // *-test.html are local scaffolds; they are not deployed (both 404 in
        // production) so their logo markup never reaches a visitor.
        .filter(([file]) => !/(^|\/)[a-z0-9-]*-test\.html$/i.test(file))
        .filter(([, html]) => /class="[^"]*\blogo-img\b/.test(html))
        .filter(([, html]) => !/ui-components\.js/.test(html))
        .map(([file]) => file);

    assert.deepEqual(
        offenders,
        [],
        'These pages render a .logo-img but never load ui-components.js, so the '
        + `logo will show the wordmark twice:\n${offenders.join('\n')}`
    );
});

test('all JSON-LD blocks parse and generated product schemas are coherent', () => {
    for (const [file, html] of htmlByFile) jsonLdDocuments(html, file);

    const productFiles = deployableHtmlFiles.filter(
        (file) => file.startsWith('products/') && file !== 'products/index.html'
    );
    assert.ok(productFiles.length > 0, 'Expected generated product pages');

    for (const file of productFiles) {
        const html = htmlByFile.get(file);
        const canonical = canonicalLinks(html)[0];
        assert.ok(canonical, `${file} must have a canonical URL`);
        assert.equal(hasNoindex(html), false, `${file} must remain indexable`);
        const nodes = schemaNodes(jsonLdDocuments(html, file));
        const product = nodes.find((node) => hasSchemaType(node, 'Product'));
        const breadcrumb = nodes.find((node) => hasSchemaType(node, 'BreadcrumbList'));
        const faq = nodes.find((node) => hasSchemaType(node, 'FAQPage'));

        assert.ok(product, `${file} needs Product JSON-LD`);
        assert.ok(breadcrumb, `${file} needs BreadcrumbList JSON-LD`);
        assert.ok(faq, `${file} needs FAQPage JSON-LD`);
        assertNonemptyString(product.name, `${file} Product.name`);
        assertNonemptyString(product.description, `${file} Product.description`);
        assert.equal(new URL(product.url).href, new URL(canonical).href, `${file} Product.url must match canonical`);
        assert.equal(product.brand?.['@type'], 'Brand', `${file} Product.brand must be a Brand`);
        assert.equal(product.brand?.name, 'Desk2Quant', `${file} Product.brand must be Desk2Quant`);
        assert.ok(product.image, `${file} Product.image must be present`);

        const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
        assert.ok(offers[0], `${file} Product.offers must be present`);
        for (const [index, offer] of offers.entries()) {
            assert.ok(hasSchemaType(offer, 'Offer'), `${file} offer ${index + 1} must be an Offer`);
            assert.ok(Object.hasOwn(offer, 'price'), `${file} offer ${index + 1} must include price`);
            assert.match(offer.priceCurrency ?? '', /^[A-Z]{3}$/, `${file} offer ${index + 1} needs an ISO currency`);
            assertCanonicalUrl(offer.url, `${file} offer ${index + 1} URL`);
            assert.match(offer.availability ?? '', /^https:\/\/schema\.org\//, `${file} offer ${index + 1} needs availability`);
        }
        assertBreadcrumb(breadcrumb, canonical, file);

        const visible = searchableText(
            html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        );
        assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length > 0, `${file} FAQPage needs questions`);
        faq.mainEntity.forEach((question, index) => {
            assert.ok(hasSchemaType(question, 'Question'), `${file} FAQ ${index + 1} must be a Question`);
            assert.ok(hasSchemaType(question.acceptedAnswer, 'Answer'), `${file} FAQ ${index + 1} needs an Answer`);
            assert.ok(visible.includes(searchableText(question.name)), `${file} FAQ ${index + 1} question must be visible`);
            assert.ok(visible.includes(searchableText(question.acceptedAnswer.text)), `${file} FAQ ${index + 1} answer must be visible`);
        });
    }
});

test('generated guides have valid Article, breadcrumb, and visible FAQ structured data', async () => {
    const guidesDirectory = path.join(projectRoot, 'guides');
    await assert.doesNotReject(() => stat(guidesDirectory), 'Expected generated guides directory');
    const guideFiles = deployableHtmlFiles.filter(
        (file) => file.startsWith('guides/') && file !== 'guides/index.html'
    );
    assert.ok(guideFiles.length > 0, 'Expected at least one generated guide page');

    for (const file of guideFiles) {
        const html = htmlByFile.get(file);
        const canonical = canonicalLinks(html)[0];
        assert.ok(canonical, `${file} must have a canonical URL`);
        const nodes = schemaNodes(jsonLdDocuments(html, file));
        const article = nodes.find((node) => hasSchemaType(node, 'TechArticle') || hasSchemaType(node, 'Article'));
        const breadcrumb = nodes.find((node) => hasSchemaType(node, 'BreadcrumbList'));
        const faq = nodes.find((node) => hasSchemaType(node, 'FAQPage'));

        assert.ok(article, `${file} needs Article or TechArticle JSON-LD`);
        assert.ok(breadcrumb, `${file} needs BreadcrumbList JSON-LD`);
        assert.ok(faq, `${file} needs FAQPage JSON-LD`);
        assertNonemptyString(article.headline ?? article.name, `${file} Article headline`);
        const articlePage = typeof article.mainEntityOfPage === 'string'
            ? article.mainEntityOfPage
            : article.mainEntityOfPage?.['@id'];
        assertCanonicalUrl(articlePage, `${file} Article.mainEntityOfPage`);
        assert.equal(
            new URL(articlePage).href,
            new URL(canonical).href,
            `${file} Article.mainEntityOfPage must match canonical`
        );
        assertBreadcrumb(breadcrumb, canonical, file);
        assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length > 0, `${file} FAQPage needs questions`);

        const visible = searchableText(
            html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        );
        faq.mainEntity.forEach((question, index) => {
            assert.ok(hasSchemaType(question, 'Question'), `${file} FAQ ${index + 1} must be a Question`);
            assertNonemptyString(question.name, `${file} FAQ ${index + 1} question`);
            assert.ok(hasSchemaType(question.acceptedAnswer, 'Answer'), `${file} FAQ ${index + 1} needs an Answer`);
            assertNonemptyString(question.acceptedAnswer.text, `${file} FAQ ${index + 1} answer`);
            assert.ok(visible.includes(searchableText(question.name)), `${file} FAQ ${index + 1} question must be visible`);
            assert.ok(visible.includes(searchableText(question.acceptedAnswer.text)), `${file} FAQ ${index + 1} answer must be visible`);
        });
    }
});

test('generated blog articles have static BlogPosting metadata and matching canonicals', () => {
    const blogFiles = deployableHtmlFiles.filter((file) => file.startsWith('blog/'));
    assert.ok(blogFiles.length > 0, 'Expected generated static blog articles');

    for (const file of blogFiles) {
        const html = htmlByFile.get(file);
        const canonical = canonicalLinks(html)[0];
        const nodes = schemaNodes(jsonLdDocuments(html, file));
        const article = nodes.find((node) => hasSchemaType(node, 'BlogPosting'));
        const breadcrumb = nodes.find((node) => hasSchemaType(node, 'BreadcrumbList'));

        assert.ok(canonical, `${file} needs a canonical URL`);
        assert.equal(hasNoindex(html), false, `${file} must remain indexable`);
        assert.ok(article, `${file} needs BlogPosting JSON-LD`);
        assert.ok(breadcrumb, `${file} needs BreadcrumbList JSON-LD`);
        assertNonemptyString(article.headline, `${file} BlogPosting.headline`);
        assert.equal(new URL(article.url).href, new URL(canonical).href, `${file} BlogPosting.url must match canonical`);
        const mainEntity = typeof article.mainEntityOfPage === 'string'
            ? article.mainEntityOfPage
            : article.mainEntityOfPage?.['@id'];
        assert.equal(new URL(mainEntity).href, new URL(canonical).href, `${file} mainEntityOfPage must match canonical`);
        assertBreadcrumb(breadcrumb, canonical, file);
        assert.match(html, /<h1\b[^>]*>[\s\S]*?<\/h1>/i, `${file} needs a visible H1`);
        const visibleArticle = articleMarkup(html, file);
        assert.doesNotMatch(visibleArticle, /<script\b/i, `${file} article body must not contain scripts`);
        assert.doesNotMatch(visibleArticle, /\son[a-z]+\s*=/i, `${file} article body must not contain event handlers`);
        assert.doesNotMatch(visibleArticle, /&amp;mdash;/i, `${file} must not render an encoded mdash literally`);
    }

    const richFile = 'blog/monte-carlo-methods-for-option-pricing-visual-guide-python.html';
    const richArticle = articleMarkup(htmlByFile.get(richFile), richFile);
    assert.match(richArticle, /<h2\b/i, `${richFile} must preserve section headings`);
    assert.match(richArticle, /<ul\b/i, `${richFile} must preserve lists`);
    assert.match(richArticle, /<table\b/i, `${richFile} must preserve tables`);
    assert.match(richArticle, /<pre\b[^>]*>[\s\S]*?<code\b/i, `${richFile} must preserve code blocks`);
    assert.ok(tags(richArticle, 'img').length > 1, `${richFile} must preserve inline article images`);

    const mathFile = 'blog/calibrating-the-heston-stochastic-volatility-model-a-practitioner-s-notebook.html';
    const mathHtml = htmlByFile.get(mathFile);
    assert.match(mathHtml, /window\.MathJax\s*=/, `${mathFile} must configure math rendering`);
    assert.match(mathHtml, /mathjax@3\/es5\/tex-mml-chtml\.js/, `${mathFile} must load MathJax asynchronously`);
});

test('blog rich renderer repairs text and removes active content and dangerous URLs', () => {
    const html = renderBlogPage({
        title: 'Safe renderer regression',
        excerpt: 'Safe renderer regression',
        cover_image_url: 'javascript:alert(1)',
        content: [
            '<script>alert("script")</script><style>body{display:none}</style>',
            '<h2 onclick="alert(1)">Desk\u00e2\u20ac\u201dready &mdash;</h2>',
            '<p>It\u00e2\u20ac\u2122s safe <a href="/safe?x=1&amp;y=2" target="_blank" onclick="bad()">inside</a>.</p>',
            '<ul><li>One</li><li>Two</li></ul>',
            '<table><thead><tr><th scope="col">Risk</th></tr></thead><tbody><tr><td>Vanna</td></tr></tbody></table>',
            '<pre onmouseover="bad()"><code class="language-python">x &lt; y</code></pre>',
            '<a href="jav&#x61;script:alert(1)">bad link</a>',
            '<img src="data:image/svg+xml,bad" onerror="bad()" alt="bad">',
            '<img src="/assets/images/safe.png" onerror="bad()" alt="safe">',
            '<iframe src="https://example.com">hidden</iframe>'
        ].join('')
    }, 'safe-renderer-regression');
    const article = articleMarkup(html, 'synthetic blog page');

    assert.match(article, /Desk—ready —/, 'common UTF-8 mojibake and named entities must be repaired once');
    assert.match(article, /It’s safe/, 'mojibake apostrophes must be repaired');
    assert.doesNotMatch(article, /&amp;mdash;/i, 'named entities must not be double escaped');
    assert.doesNotMatch(article, /\u00e2(?:\u20ac|\u0080)|\u00c2\u00a0/, 'known mojibake sequences must not remain');
    assert.match(article, /<h2\b[^>]*>/i);
    assert.match(article, /<ul\b[^>]*>[\s\S]*?<li\b/i);
    assert.match(article, /<table\b[^>]*>[\s\S]*?<th\b/i);
    assert.match(article, /<pre\b[^>]*>[\s\S]*?<code class="language-python">x &lt; y<\/code>/i);
    assert.match(article, /href="\/safe\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"/i);
    assert.match(article, /src="\/assets\/images\/safe\.png"/i);
    assert.doesNotMatch(article, /<script\b|<style\b|<iframe\b/i);
    assert.doesNotMatch(article, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(article, /(?:href|src)="(?:javascript|data):/i);
    assert.match(html, /property="og:image" content="https:\/\/desk2quant\.com\/assets\/images\/desk2quant-editorial-og\.jpg"/i,
        'unsafe cover URLs must fall back before reaching meta tags or JSON-LD');
});

test('sitemap contains only unique, self-canonical desk2quant.com URLs without queries', async () => {
    const xml = await readFile(path.join(projectRoot, 'sitemap.xml'), 'utf8');
    const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeHtml(match[1]));
    assert.ok(locations.length > 0, 'sitemap.xml must contain URLs');
    assert.equal(new Set(locations).size, locations.length, 'sitemap.xml must not contain duplicate URLs');
    const locationSet = new Set(locations);

    for (const location of locations) {
        const url = assertCanonicalUrl(location, `sitemap location ${location}`);
        assert.equal(url.search, '', `${location} must not contain a query string`);
        assert.notEqual(url.pathname, '/index.html', 'Homepage sitemap URL must use /, not /index.html');

        const relativeFile = url.pathname.endsWith('/')
            ? `${url.pathname.slice(1)}index.html`
            : url.pathname.slice(1);
        const file = relativeFile || 'index.html';
        assert.ok(htmlByFile.has(file), `${location} must resolve to a checked HTML file (${file})`);
        const html = htmlByFile.get(file);
        assert.equal(hasNoindex(html), false, `${location} must not point to a noindex page`);
        assert.equal(canonicalLinks(html)[0], location, `${location} must match the page's self-canonical link`);
    }

    const generatedSeoFiles = deployableHtmlFiles.filter(
        (file) => file.startsWith('products/') || file.startsWith('guides/') || file.startsWith('blog/')
    );
    for (const file of generatedSeoFiles) {
        const html = htmlByFile.get(file);
        if (hasNoindex(html)) continue;
        const canonical = canonicalLinks(html)[0];
        assert.ok(canonical, `${file} needs a canonical before it can be listed in the sitemap`);
        assert.ok(locationSet.has(canonical), `${file} canonical is missing from sitemap.xml: ${canonical}`);
    }
});
