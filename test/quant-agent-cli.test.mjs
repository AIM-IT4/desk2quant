import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  configPath,
  exchangeMagicLink,
  formatProgress,
  loadConfig,
  logout,
  normalizeCommand,
  parseMagicLink,
  runCommand
} from '../cli/engine.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('accepts the five quant commands', () => {
  for (const c of ['learn','solve','practice','interview','project']) assert.equal(normalizeCommand(c), c);
});

test('rejects unknown quant commands', () => {
  assert.throws(() => normalizeCommand('trade'), /Unknown command/);
});

test('parseMagicLink accepts Desk2Quant links and rejects untrusted hosts', () => {
  const parsed = parseMagicLink('https://desk2quant.com/my-access.html?email=buyer%40example.com&tk=abc.def');
  assert.equal(parsed.email, 'buyer@example.com');
  assert.equal(parsed.accessToken, 'abc.def');
  assert.throws(() => parseMagicLink('https://evil.example/?email=buyer%40example.com&tk=x'), /untrusted host/);
});

test('exchangeMagicLink stores owner-only session config', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'd2q-test-'));
  const env = { D2Q_CONFIG_DIR: dir };
  const fetchImpl = async (url, init) => {
    assert.match(url, /\/api\/products$/);
    const body = JSON.parse(init.body);
    assert.equal(body.action, 'agent-auth');
    assert.equal(body.email, 'buyer@example.com');
    return jsonResponse({ tier: 'pro', agentToken: 'signed-agent-token', expiresAt: Date.now() + 60_000, progress: { totalSessions: 0 } });
  };
  await exchangeMagicLink('https://desk2quant.com/my-access.html?email=buyer%40example.com&tk=access-token', {
    baseUrl: 'https://desk2quant.com', fetchImpl, env
  });
  const cfg = await loadConfig(env);
  assert.equal(cfg.email, 'buyer@example.com');
  assert.equal(cfg.agentToken, 'signed-agent-token');
  const stat = await fs.stat(configPath(env));
  assert.equal(stat.mode & 0o077, 0);
  assert.equal(await logout(env), true);
  assert.equal(await loadConfig(env), null);
});

test('runCommand sends only Desk2Quant session credentials, never a model API key', async () => {
  const config = { email: 'buyer@example.com', agentToken: 'session-token', tier: 'pro', expiresAt: Date.now() + 60_000, baseUrl: 'https://desk2quant.com' };
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(init.body);
    return jsonResponse({ success: true, content: 'lesson', meta: { remainingToday: 99 } });
  };
  const result = await runCommand('learn', 'Ito lemma', { config, fetchImpl });
  assert.equal(result.content, 'lesson');
  assert.deepEqual(captured, {
    action: 'agent-run', email: 'buyer@example.com', agentToken: 'session-token', command: 'learn', query: 'Ito lemma'
  });
  assert.equal('GROQ_API_KEY' in captured, false);
});

test('runCommand fails closed without a local session', async () => {
  await assert.rejects(() => runCommand('practice', 'probability', { config: null, env: { D2Q_CONFIG_DIR: '/definitely/missing/d2q' } }), /Not signed in/);
});

test('formatProgress does not overstate activity as ability', () => {
  const text = formatProgress({
    totalSessions: 12, usedToday: 3, dailyLimit: 100, remainingToday: 97,
    lastCommand: 'practice', lastTopic: 'probability', topTopics: [{ topic: 'probability', sessions: 5 }],
    note: 'Progress reflects activity/exposure, not an inferred ability score unless a graded assessment is added.'
  });
  assert.match(text, /12/);
  assert.match(text, /97 remaining/);
  assert.match(text, /not an inferred ability score/i);
});
