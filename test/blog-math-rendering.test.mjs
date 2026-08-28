import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const template = fs.readFileSync('scripts/blog-seo-template.js', 'utf8');
const css = fs.readFileSync('seo-product.css', 'utf8');

test('blog SEO template enables MathJax for LaTeX content', () => {
  assert.match(template, /MathJax/);
  assert.match(template, /tex-mml-chtml\.js/);
  assert.match(template, /displayMath/);
});

test('display equations have responsive overflow styling', () => {
  assert.match(css, /\.seo-article-body \.math-block/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /mjx-container\[display="true"\]/);
});
