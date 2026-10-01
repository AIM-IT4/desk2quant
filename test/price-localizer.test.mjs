import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// price-localizer.js is generated from script.js so that pages that cannot load
// script.js (static SEO product pages, bundle landing sections, the homepage
// mentor card) show exactly the same localized + PPP price the checkout charges.

test('price-localizer.js is up to date with script.js', async () => {
    const { build } = require('../scripts/build-price-localizer.js');
    const committed = await fs.readFile('price-localizer.js', 'utf8');
    assert.equal(committed, build(), 'run `node scripts/build-price-localizer.js` and commit price-localizer.js');
});

test('the generated localizer carries the same PPP multipliers as the server', async () => {
    const out = await fs.readFile('price-localizer.js', 'utf8');
    assert.ok(out.includes('isWeaker ? 1.3 : 1.6'));
    const server = await fs.readFile('lib/pricing.js', 'utf8');
    assert.ok(server.includes('const PPP_STRONG = 1.6;') && server.includes('const PPP_WEAK = 1.3;'));
});

test('pages that show prices to visitors load the localizer', async () => {
    for (const f of ['index.html', 'product.html']) {
        assert.ok((await fs.readFile(f, 'utf8')).includes('price-localizer.js'), `${f} must load price-localizer.js`);
    }
    const tpl = await fs.readFile('scripts/seo-template.js', 'utf8');
    assert.ok(tpl.includes('data-price-inr='), 'static product pages mark their price for localization');
    assert.ok(tpl.includes('/price-localizer.js'), 'static product pages load the localizer');
    const gen = await fs.readFile('scripts/generate-seo-pages.js', 'utf8');
    assert.ok(gen.includes('enable_ppp'), 'the SEO build must fetch enable_ppp');
});

test('localizer root selectors still match the bundle landing markup', async () => {
    const out = await fs.readFile('price-localizer.js', 'utf8');
    const roots = out.match(/var ROOT_SELECTOR = '([^']+)'/)[1];
    const bundle = (await Promise.all(['bundle-product-v2.js', 'bundle-proof-v3.js', 'bundle-polish-v4.js'].map(f => fs.readFile(f, 'utf8')))).join('\n');
    for (const needle of ['bundle-v2-content', 'bundle-proof', 'bundle-price-note', 'bundle-final-price']) {
        assert.ok(roots.includes(needle), `${needle} must be a localizer root`);
        assert.ok(bundle.includes(needle), `${needle} no longer exists in the bundle scripts`);
    }
    assert.ok((await fs.readFile('product.html', 'utf8')).includes('id="p-desc" data-localize-inr'));
});
