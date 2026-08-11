import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { assertNonEmptyPublishedBlogs } = require('../scripts/build-seo.js');

test('SEO build refuses an empty or invalid published-blog response before cleanup', () => {
  for (const response of [undefined, null, {}, '[]', []]) {
    assert.throws(
      () => assertNonEmptyPublishedBlogs(response),
      /empty published blogs response/,
      `Expected ${JSON.stringify(response)} to be rejected`
    );
  }

  const blogs = [{ id: 'published-blog' }];
  assert.equal(assertNonEmptyPublishedBlogs(blogs), blogs);
});
