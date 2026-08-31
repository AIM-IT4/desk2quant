import test from 'node:test';
import assert from 'node:assert/strict';

process.env.QUANT_AGENT_SECRET = 'test-secret-that-is-long-enough-for-hmac';

const { allowedDocumentsFromProducts, QUANT_AGENT_SKILLS } = await import('../lib/quantAgentAdvanced.js');
const { formatSkills, ASSESSMENT_SKILLS } = await import('../cli/engine.mjs');

test('standalone product only unlocks its own private corpus', () => {
  assert.deepEqual(
    allowedDocumentsFromProducts(['Numerical Methods for Quants: The Master Field Manual']),
    ['numerical_methods']
  );
  assert.deepEqual(
    allowedDocumentsFromProducts(['Quant Researcher Interview Playbook: Time Series, Signals & Statistical Research']),
    ['quant_research']
  );
});

test('complete bundle unlocks all indexed private corpora', () => {
  const docs = allowedDocumentsFromProducts([
    'Complete Front Office & Risk Quant Professional Bundle (46+ high quality PDFs, 59 notebooks & 60+ scripts)'
  ]);
  assert.deepEqual(new Set(docs), new Set([
    'problem_book','numerical_methods','fixed_income','exotic_options','quant_research'
  ]));
});

test('unrelated product does not leak a private corpus entitlement', () => {
  assert.deepEqual(allowedDocumentsFromProducts(['Complete Quant ATS Friendly Resume LaTeX + DOCX Template Pack']), []);
});

test('adaptive skills are explicit and formatting does not mislabel theta as a percentage', () => {
  assert.ok(QUANT_AGENT_SKILLS.includes('stochastic_calculus'));
  assert.deepEqual(new Set(ASSESSMENT_SKILLS), new Set(QUANT_AGENT_SKILLS));
  const text = formatSkills([{ skill_key:'probability', theta:0.72, attempts:4, mean_score:0.81 }]);
  assert.match(text, /theta=0\.72/);
  assert.match(text, /mean score=81%/);
  assert.doesNotMatch(text, /ability=72%/i);
});
