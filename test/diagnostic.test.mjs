import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calculateDiagnostic } = require('../diagnostic.js');

const scores = (value) => ({ foundations: value, pricing: value, risk: value, implementation: value, interview: value });

test('advanced self-ratings meet the selected pricing benchmark without fabricated gaps', () => {
  const result = calculateDiagnostic({ role: 'pricing', experience: 'transition', timeline: 'runway', scores: scores(100) });
  assert.equal(result.readiness, 100);
  assert.equal(result.priorities.length, 0);
  assert.equal(result.bundleAlternative, false);
  assert.match(result.resources[0].name, /Project|Gauntlet/);
});

test('pricing role with zero self-ratings prioritises pricing, foundations and implementation', () => {
  const result = calculateDiagnostic({ role: 'pricing', experience: 'transition', timeline: 'urgent', scores: scores(0) });
  assert.equal(result.readiness, 0);
  assert.deepEqual(result.priorities.map(p => p.key), ['pricing', 'foundations', 'implementation']);
  assert.equal(result.bundleAlternative, true);
  assert.equal(result.resources[0].id, 'bdb3c59e-c8c0-430f-8705-b7467514458e');
});

test('XVA role maps a material risk gap to the XVA Calculus Lab', () => {
  const result = calculateDiagnostic({
    role: 'xva', experience: 'early', timeline: 'near',
    scores: { foundations: 75, pricing: 75, risk: 25, implementation: 75, interview: 75 }
  });
  assert.equal(result.priorities[0].key, 'risk');
  assert.equal(result.resources[0].id, '351aa09b-681b-4da9-9b61-844cf295640c');
  assert.equal(result.plan.length, 4);
});

test('quant developer role weights implementation strongly and recommends coding work', () => {
  const result = calculateDiagnostic({
    role: 'quantdev', experience: 'transition', timeline: 'near',
    scores: { foundations: 75, pricing: 75, risk: 50, implementation: 25, interview: 75 }
  });
  assert.equal(result.priorities[0].key, 'implementation');
  assert.equal(result.resources[0].id, '9ad9f8ac-9872-40c3-82b8-1e6168e65062');
});

test('experience raises benchmarks but never beyond the documented cap', () => {
  const result = calculateDiagnostic({ role: 'xva', experience: 'experienced', timeline: 'runway', scores: scores(75) });
  assert.equal(result.domains.risk.benchmark, 95);
  assert.ok(Object.values(result.domains).every(d => d.benchmark <= 95));
});