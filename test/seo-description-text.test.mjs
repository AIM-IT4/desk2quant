import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stripHtml, clamp } = require('../scripts/generate-seo-pages.js');

test('an inline tag inside a word does not split the word', () => {
    // The real defect: the XVA product's meta description read
    // "F eatures full mathematical derivations" in Google's results.
    assert.equal(
        stripHtml('Sensitivities. F<strong>eatures</strong> full derivations'),
        'Sensitivities. Features full derivations'
    );
    assert.equal(stripHtml('A <em>10</em>-module masterclass'), 'A 10-module masterclass');
    assert.equal(stripHtml('CVA<sub>total</sub> exposure'), 'CVAtotal exposure');
});

test('block elements still separate words that would otherwise run together', () => {
    // The inline fix must not go so far that adjacent blocks collide into
    // "para.Second" -- that is the bug the original space-for-every-tag
    // behaviour was there to prevent.
    assert.equal(stripHtml('<p>First para.</p><p>Second para.</p>'), 'First para. Second para.');
    assert.equal(stripHtml('<li>One</li><li>Two</li>'), 'One Two');
    assert.equal(stripHtml('Line<br>Break'), 'Line Break');
    assert.equal(stripHtml('<h2>Heading</h2>Body copy'), 'Heading Body copy');
});

test('script and style contents never reach a description', () => {
    assert.equal(stripHtml('Before<script>alert(1)</script>After'), 'Before After');
    assert.equal(stripHtml('Before<style>.a{color:red}</style>After'), 'Before After');
});

test('entities are decoded so the description reads as prose', () => {
    assert.equal(stripHtml('Audit &amp; Regulatory Review'), 'Audit & Regulatory Review');
    assert.equal(stripHtml('Risk&nbsp;Quant'), 'Risk Quant');
});

test('clamp cuts on a word boundary and never mid-word', () => {
    const text = 'A comprehensive desk-oriented field manual for quantitative researchers';
    const out = clamp(text, 30);

    assert.ok(out.length <= 30, `expected <= 30 chars, got ${out.length}`);
    assert.ok(out.endsWith('…'), 'truncated text should be marked with an ellipsis');
    // Whatever survives must be whole words from the source.
    const kept = out.slice(0, -1).trim();
    assert.ok(text.startsWith(kept), 'kept text must be a prefix of the source');
    assert.ok(!/\S$/.test(kept) || text[kept.length] === ' ', 'must not cut mid-word');
});

test('text shorter than the limit is returned whole, with no ellipsis', () => {
    assert.equal(clamp('Short description.', 158), 'Short description.');
});
