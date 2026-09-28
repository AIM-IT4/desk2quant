import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertHomepageHeading } from '../scripts/seo-homepage-check.mjs';

test('the live SEO monitor accepts the homepage shipped by this repository', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.doesNotThrow(() => assertHomepageHeading(html));
});

test('homepage monitoring accepts relevant copy changes and inline heading markup', () => {
    for (const heading of [
        'Build Quant Skills That Survive the Interview and the Desk',
        'Build Quant Finance Skills That Survive the <span>Interview and the Desk</span>',
        'QUANT&nbsp;finance<br>from the inter<span>view</span> to the desk'
    ]) {
        assert.doesNotThrow(() => assertHomepageHeading(`<h1>${heading}</h1>`));
    }
});

test('homepage monitoring rejects missing topics and keywords outside the visible H1', () => {
    for (const html of [
        '<h1></h1>',
        '<h1>Finance skills for the interview and desk</h1>',
        '<h1>Quant skills for the desk</h1>',
        '<h1>Quant interview skills</h1>',
        '<h1>Welcome</h1><p>Quant interview desk</p>',
        '<h1 aria-label="Quant interview desk">Welcome</h1>',
        '<!-- <h1>Quant interview desk</h1> --><h1>Welcome</h1>',
        '<script>const title = "<h1>Quant interview desk</h1>";</script>'
    ]) {
        assert.throws(() => assertHomepageHeading(html), /homepage/);
    }
});
