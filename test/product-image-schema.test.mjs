import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const seo = require('../product-seo.js');
const { renderPage } = require('../scripts/seo-template.js');
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const slug = 'the-vol-surface-construction-playbook-svi-ssvi-static-arbitrage-and-du';
const imageUrl = 'https://desk2quant.com/assets/images/vol-surface-cover.svg';
const product = {
    id: '928a14d2-64b4-4a73-951d-dcf191fe72ad',
    name: 'The Vol Surface Construction Playbook',
    description: 'SVI, SSVI and Dupire local volatility.',
    price: 999,
    cover_image_url: `data:image/svg+xml,${encodeURIComponent(read('assets/images/vol-surface-cover.svg').trim())}`
};

function productSchema(html) {
    return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map((match) => JSON.parse(match[1]))
        .find((schema) => schema['@type'] === 'Product');
}

test('generated and checked-in Vol Surface pages use the real hosted cover', () => {
    for (const html of [renderPage(product, slug, [], []), read(`products/${slug}.html`)]) {
        assert.equal(productSchema(html).image, imageUrl);
        assert.ok(html.includes(`<meta property="og:image" content="${imageUrl}">`));
        assert.ok(html.includes(`<meta name="twitter:image" content="${imageUrl}">`));
        assert.ok(html.includes(`<img src="${imageUrl}"`));
        assert.ok(!html.includes('data:image/'));
    }
});

test('browser product and homepage schemas resolve the same inline cover without mutating catalog data', () => {
    const elements = new Map();
    const context = vm.createContext({
        window: { Desk2QuantProductSeo: seo },
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {
                    textContent: '',
                    setAttribute(name, value) { this[name] = value; }
                });
                return elements.get(id);
            }
        },
        plainTextFromHtml: (text) => text,
        stripMarkdown: (text) => text,
        truncateText: (text) => text,
        getProductSeoUrl: seo.getProductUrl,
        product
    });
    const original = structuredClone(product);
    const page = read('product.html');
    vm.runInContext(page.slice(page.indexOf('        function updateProductSEO(product)'),
        page.indexOf('        async function loadProduct(id)')), context);
    vm.runInContext('updateProductSEO(product)', context);
    assert.equal(JSON.parse(elements.get('p-product-jsonld').textContent).image, imageUrl);
    assert.equal(elements.get('p-meta-og-image').content, imageUrl);
    assert.equal(elements.get('p-meta-twitter-image').content, imageUrl);

    const script = read('script.js');
    vm.runInContext(script.slice(script.indexOf('function buildProductCatalogJsonLd(products)'),
        script.indexOf('// Stale-while-revalidate cache for products/sessions')), context);
    vm.runInContext('buildProductCatalogJsonLd([product])', context);
    const catalog = JSON.parse(elements.get('product-catalog-jsonld').textContent);
    assert.equal(catalog.itemListElement[0].item.image, imageUrl);
    assert.deepEqual(product, original);
});

test('existing hosted covers, future replacements and missing-image fallbacks are preserved', () => {
    const replacement = 'https://desk2quant.com/assets/images/vol-surface-cover.svg?v=next';
    assert.equal(seo.getProductSeoImage({ ...product, cover_image_url: replacement }), replacement);
    const otherCover = 'https://cdn.example.com/other-product.png';
    assert.equal(seo.getProductSeoImage({ id: 'other', cover_image_url: otherCover }), otherCover);
    assert.equal(seo.getProductSeoImage({ id: 'other' }),
        'https://desk2quant.com/assets/images/desk2quant-logo.png');
    assert.equal(seo.getProductSeoImage({}, 'https://desk2quant.com/assets/images/desk2quant-logo.png?v=3'),
        'https://desk2quant.com/assets/images/desk2quant-logo.png?v=3');
});
