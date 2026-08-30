import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { FOOTER_HTML } = require('../scripts/seo-template.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function footerHrefs() {
    return [...FOOTER_HTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}

test('the footer links somewhere', () => {
    assert.ok(footerHrefs().length >= 4, 'expected several outbound links');
});

test('every footer link resolves to a file that exists', () => {
    // The whole point of the footer is to stop generated pages being crawl
    // dead-ends. Linking /about.html or /contact.html -- neither of which
    // exists -- would instead ship a 404 on 50+ pages at once, which is worse
    // than having no footer. Checked against the repo so a typo or an
    // optimistic new link fails here rather than in Search Console.
    for (const href of footerHrefs()) {
        const rel = href === '/' ? 'index.html'
            : href.endsWith('/') ? path.join(href.slice(1), 'index.html')
            : href.slice(1);
        assert.ok(
            fs.existsSync(path.join(ROOT, rel)),
            `footer links to ${href} but ${rel} does not exist in the repo`
        );
    }
});

test('the footer is wired into the product, hub and blog templates', () => {
    // Guides deliberately keep their own renderFooter(); they are not checked.
    for (const file of ['scripts/seo-template.js', 'scripts/build-seo.js', 'scripts/blog-seo-template.js']) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.match(src, /FOOTER_HTML/, `${file} no longer references FOOTER_HTML`);
    }
});
