import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextQuery, inferMode } from '../cli/tui.mjs';
import { wrapTerminalText } from '../cli/terminal-format.mjs';

test('TUI auto-routes common quant intents', () => {
  assert.equal(inferMode('derive the Black-Scholes PDE'), 'solve');
  assert.equal(inferMode('interview me for an equity derivatives quant role'), 'interview');
  assert.equal(inferMode('give me five probability practice questions'), 'practice');
  assert.equal(inferMode('design a Heston calibration project'), 'project');
  assert.equal(inferMode('explain Ito lemma intuitively'), 'learn');
});

test('explicit TUI mode overrides auto-routing', () => {
  assert.equal(inferMode('derive Black-Scholes', 'learn'), 'learn');
  assert.equal(inferMode('explain duration', 'solve'), 'solve');
});

test('context query preserves recent conversation and quality contract', () => {
  const q = buildContextQuery('Why is rho unstable?', [
    { role: 'user', content: 'I am calibrating Heston to an SPX smile.' },
    { role: 'assistant', content: 'Use price or IV residuals with parameter bounds.' }
  ], { depth: 'deep' });
  assert.match(q, /Heston/);
  assert.match(q, /rho unstable/);
  assert.match(q, /QUALITY CONTRACT/);
  assert.match(q, /limiting case|boundary condition/);
  assert.ok(q.length <= 5600);
});

test('context query remains inside backend query limit', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(1000) }));
  const q = buildContextQuery('y'.repeat(4000), history, { depth: 'deep' });
  assert.ok(q.length <= 5600);
});

test('terminal wrapping keeps lines within target for ordinary prose', () => {
  const lines = wrapTerminalText('Gamma becomes concentrated around the strike as expiry approaches because the normal density term is divided by sigma S sqrt(T).', 40);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => line.length <= 40));
});
