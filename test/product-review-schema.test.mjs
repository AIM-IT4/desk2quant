import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderPage } = require('../scripts/seo-template.js');
const { keepProductSpecificLinks } = require('../scripts/generate-seo-pages.js');

const product = {
    id: 'p1',
    name: 'Test Pack',
    description: 'A test product used to exercise the JSON-LD emitter.',
    price: 799
};

function schemaOf(html) {
    const blocks = [...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    )].map((m) => JSON.parse(m[1]));
    return blocks.find((b) => b['@type'] === 'Product');
}

test('product JSON-LD omits rating fields entirely when no reviews are linked', () => {
    const schema = schemaOf(renderPage(product, 'test-pack', [], []));

    // Absent, not zero/null: Google treats an empty or nil aggregateRating as
    // malformed rather than as "unrated".
    assert.equal('aggregateRating' in schema, false);
    assert.equal('review' in schema, false);
});

test('product JSON-LD reports the real average, never a rounded-up 5', () => {
    const reviews = [
        { name: 'A', rating: 5, review: 'Genuinely useful worked examples.' },
        { name: 'B', rating: 4, review: 'Solid, though I wanted more on FRTB.' }
    ];
    const schema = schemaOf(renderPage(product, 'test-pack', [], reviews));

    assert.equal(schema.aggregateRating.ratingValue, '4.5');
    assert.equal(schema.aggregateRating.reviewCount, '2');
    assert.equal(schema.review.length, 2);
});

test('reviews shared across products are dropped before they reach a page', async () => {
    // Mirrors the real defect: one mentoring-session testimonial linked to two
    // products, and one genuine review linked to a single product. Only the
    // product-specific review may be published, otherwise the same reviewBody
    // appears on unrelated products -- which is what Google's review-snippet
    // policy forbids.
    const kept = keepProductSpecificLinks([
        { product_id: 'p1', testimonial_id: 't-session' },
        { product_id: 'p2', testimonial_id: 't-session' },
        { product_id: 'p1', testimonial_id: 't-specific' }
    ]);

    assert.deepEqual(kept, [{ product_id: 'p1', testimonial_id: 't-specific' }]);
});

test('a duplicated join row is not mistaken for a second product', () => {
    const kept = keepProductSpecificLinks([
        { product_id: 'p1', testimonial_id: 't1' },
        { product_id: 'p1', testimonial_id: 't1' }
    ]);

    assert.equal(kept.length, 2, 'same product twice is still one product');
});
