import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, normalizeCommand, offlineResponse, runCommand } from '../cli/engine.mjs';

test('accepts the five MVP commands', () => {
  for (const c of ['learn','solve','practice','interview','project']) assert.equal(normalizeCommand(c), c);
});

test('rejects unknown commands', () => {
  assert.throws(() => normalizeCommand('trade'), /Unknown command/);
});

test('buildMessages preserves user query and mode instruction', () => {
  const messages = buildMessages('learn', "Ito's lemma");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "Ito's lemma");
  assert.match(messages[0].content, /expert quantitative-finance mentor/i);
});

test('offline modes return meaningful terminal output', () => {
  assert.match(offlineResponse('learn','Black-Scholes'), /Black-Scholes/);
  assert.match(offlineResponse('interview','quant research'), /Question:/);
  assert.match(offlineResponse('project','Heston'), /Deliverables:/);
});

test('runCommand falls back offline when no API key is configured', async () => {
  const result = await runCommand('practice','probability',{ D2Q_OFFLINE:'1' });
  assert.match(result, /PRACTICE/);
  assert.match(result, /probability/);
});
