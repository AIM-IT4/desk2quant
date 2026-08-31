import test from 'node:test';
import assert from 'node:assert/strict';

process.env.QUANT_AGENT_SECRET = 'test-secret-that-is-long-enough-for-hmac';

const {
  buildAgentMessages,
  signAgentToken,
  verifyAgentToken,
  QUANT_AGENT_DAILY_LIMIT
} = await import('../lib/quantAgentServer.js');

const { knowledgeFor, inferTopic } = await import('../lib/quantAgentKnowledge.js');

test('agent session token is signed, email-bound and expires', () => {
  const token = signAgentToken('Buyer@Example.com', 'pro', 60_000);
  assert.ok(token);
  const valid = verifyAgentToken('buyer@example.com', token);
  assert.equal(valid.tier, 'pro');
  assert.equal(verifyAgentToken('other@example.com', token), null);

  const expired = signAgentToken('buyer@example.com', 'pro', -1);
  assert.equal(verifyAgentToken('buyer@example.com', expired), null);
});

test('quant prompts include verified topic anchors and conservative progress language', () => {
  const messages = buildAgentMessages('learn', "Teach me Ito's lemma", {
    total_sessions: 8,
    command_counts: { learn: 5 },
    topic_counts: { ito: 4 },
    last_command: 'learn',
    last_topic: 'ito'
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /quadratic variation/i);
  assert.match(messages[0].content, /never claim a user is interview-ready/i);
  assert.match(messages[1].content, /Ito/);
});

test('knowledge anchors cover professional quant topics', () => {
  assert.match(knowledgeFor('Heston calibration'), /parameter identifiability/i);
  assert.match(knowledgeFor('SSVI surface'), /static arbitrage/i);
  assert.equal(inferTopic('I need Heston calibration help'), 'heston');
});

test('professional daily quota is explicit', () => {
  assert.equal(QUANT_AGENT_DAILY_LIMIT, 100);
});
