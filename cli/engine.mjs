import { GROQ_CHAT_MODEL } from '../lib/groqModels.js';

export const COMMANDS = new Set(['learn','solve','practice','interview','project']);
export const HELP = `Desk2Quant Quant Agent CLI\n\nUsage:\n  d2q learn <topic>\n  d2q solve <problem>\n  d2q practice <topic>\n  d2q interview <role/topic>\n  d2q project <topic>\n\nEnvironment:\n  GROQ_API_KEY      enables live AI responses\n  GROQ_CHAT_MODEL   optional model override\n  D2Q_OFFLINE=1     deterministic offline mode for tests/demo`;

const modePrompts = {
  learn: 'Teach the topic from intuition to mathematics, define variables, include one worked quant-finance example, then ask one checkpoint question.',
  solve: 'Solve rigorously. State assumptions, derive step by step, check units/edge cases, and end with the final result. If information is missing, state the minimum assumption needed.',
  practice: 'Generate exactly five interview-style practice questions ordered from easier to harder. Do not reveal full solutions; provide short hints only.',
  interview: 'Act as a demanding but fair quant interviewer. Ask ONE question only. Do not reveal the answer. Include the skill being tested and expected difficulty.',
  project: 'Design one resume-worthy quant project. Include objective, mathematical model, data inputs, implementation milestones, validation tests, deliverables, and interview talking points.'
};

export function normalizeCommand(command='') {
  const c = String(command).trim().toLowerCase();
  if (COMMANDS.has(c)) return c;
  throw new Error(`Unknown command "${command}". Use: ${[...COMMANDS].join(', ')}`);
}

export function buildMessages(command, query='') {
  const c = normalizeCommand(command);
  const q = String(query).trim() || defaultQuery(c);
  return [
    { role: 'system', content: `You are Desk2Quant, an expert quantitative-finance mentor for aspiring quants. ${modePrompts[c]} Be precise, mathematically correct, concise but substantive. Use plain-text equations suitable for a terminal. Never fabricate citations or claim access to proprietary notes unless supplied in context.` },
    { role: 'user', content: q }
  ];
}

function defaultQuery(c) {
  return ({learn:'Black-Scholes',solve:'Explain how to compute E[S_T^2] for geometric Brownian motion.',practice:'probability',interview:'quant research',project:'volatility modelling'})[c];
}

export async function runCommand(command, query='', env=process.env) {
  const c = normalizeCommand(command);
  if (env.D2Q_OFFLINE === '1' || !env.GROQ_API_KEY) return offlineResponse(c, query);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.GROQ_CHAT_MODEL || GROQ_CHAT_MODEL, messages: buildMessages(c, query), temperature: c === 'solve' ? 0.2 : 0.5, max_tokens: 1800 })
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status}): ${(await response.text()).slice(0,300)}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty response');
  return text;
}

export function offlineResponse(command, query='') {
  const q = String(query).trim() || defaultQuery(command);
  switch(command) {
    case 'learn': return `LEARN — ${q}\n\n1. Intuition: connect the concept to prices, uncertainty, or hedging.\n2. Mathematics: write the governing equation and define every variable.\n3. Worked example: compute a small numerical case.\n4. Checkpoint: explain which assumption matters most and what breaks if it fails.\n\nOffline demo mode: set GROQ_API_KEY for a fully generated lesson.`;
    case 'solve': return `SOLVE — ${q}\n\nMethod: identify the stochastic/process assumptions, derive symbolically, then verify limiting cases.\nOffline demo mode does not invent a numerical answer. Set GROQ_API_KEY for the full derivation.`;
    case 'practice': return `PRACTICE — ${q}\n\n1. Easy: define the key object and one property.\n2. Easy/Medium: compute a one-step example.\n3. Medium: derive a conditional expectation or pricing relation.\n4. Hard: diagnose a modelling/numerical failure.\n5. Hard: connect the topic to a desk-level implementation.\n\nHints only in live mode.`;
    case 'interview': return `INTERVIEW — ${q}\n\nQuestion: You observe a strategy with a high in-sample Sharpe ratio. Before trusting it, what statistical and market-microstructure checks would you perform, and why?\n\nSkill: research robustness | Difficulty: medium-hard`;
    case 'project': return `PROJECT — ${q}\n\nObjective: build an implementation that can be defended in an interview.\nMilestones: theory -> data -> baseline -> calibration/estimation -> diagnostics -> stress tests -> report.\nValidation: unit tests, limiting cases, numerical stability, and out-of-sample checks.\nDeliverables: Python package/notebook, tests, charts, README, 2-page technical note.\n\nSet GROQ_API_KEY for a topic-specific project specification.`;
  }
}
