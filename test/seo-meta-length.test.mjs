import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { seoTitle, metaDescription } = require('../scripts/generate-seo-pages.js');

test('titles stay within the 60-char SERP budget', () => {
  const names = [
    'The Vol Surface Construction Playbook — SVI, SSVI, Static Arbitrage & Dupire Local Vol',
    'Linear Algebra & Differential Equations for Quants : Interview Playbook',
    'Quant Models for Each Asset Class Master Pack : IR, FX, CREDITS , EQUITY',
    'Statistics & Econometrics For Quants : Interview & Desk Playbook',
    'Mental Math & Market Intuition for Quants : Interview Playbook'
  ];
  for (const n of names) {
    const t = seoTitle(n);
    assert.ok(t.length <= 60, `"${t}" is ${t.length} chars`);
    assert.ok(t.length > 0);
  }
});

test('short names keep the brand suffix', () => {
  assert.equal(seoTitle('SQL for Quant Interviews'), 'SQL for Quant Interviews | Desk2Quant');
});

test('titles are never cut mid-word', () => {
  const t = seoTitle('Supercalifragilistic Quantitative Finance Masterclass Programme Edition');
  assert.ok(t.length <= 60);
  assert.ok(!/\s$/.test(t), 'trailing whitespace');
});

test('descriptions never end in an ellipsis', () => {
  const long = 'A free 17-page interview workbook covering FX forwards and NDFs, '
    + 'Garman-Kohlhagen, FX delta conventions, volatility smiles, barriers, quanto '
    + 'effects, collateral and basis, Monte Carlo, PDE methods, and model validation.';
  const d = metaDescription(long, 158);
  assert.ok(d.length <= 158, `${d.length} chars`);
  assert.ok(!d.endsWith('\u2026'), 'ends with ellipsis');
  assert.ok(!d.endsWith('...'), 'ends with dots');
});

test('descriptions prefer a sentence boundary when one falls late enough', () => {
  const txt = 'Build an OIS/SOFR discount curve from par swap quotes and submit your '
    + 'numbers for automated grading against a reference. '
    + 'Hidden tests catch the errors you cannot see yourself.';
  const d = metaDescription(txt, 158);
  assert.ok(d.endsWith('.'), `got "${d}"`);
  assert.ok(d.length <= 158);
});

test('an early-only sentence end is ignored so the snippet stays substantial', () => {
  // The single period sits at ~char 53, below the 60% floor. Cutting there
  // would waste two thirds of the snippet, so a word-boundary cut is correct.
  const txt = 'Build an OIS/SOFR discount curve from par swap quotes. '
    + 'Hidden tests catch the errors you cannot see yourself, and grading runs at '
    + 'a 1e-6 relative tolerance against a reference implementation you never see.';
  const d = metaDescription(txt, 158);
  assert.ok(d.length > 120, `too short: ${d.length}`);
  assert.ok(!d.endsWith('\u2026'));
});

test('short descriptions pass through untouched', () => {
  assert.equal(metaDescription('A short one.', 158), 'A short one.');
});

test('descriptions do not end on dangling punctuation', () => {
  const d = metaDescription('word '.repeat(60) + 'end', 158);
  assert.ok(!/[,;:\u2013\u2014-]$/.test(d), `got "${d}"`);
});
