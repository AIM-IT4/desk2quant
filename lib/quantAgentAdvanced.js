import { GROQ_CHAT_MODEL } from './groqModels.js';
import { getServiceKey } from './supabaseAdmin.js';
import { normalizeAccessEmail } from './accessTokens.js';
import { handleQuantAgent, verifyAgentToken } from './quantAgentServer.js';

const SKILLS = new Set([
  'probability','linear_algebra','statistics','stochastic_calculus','derivatives',
  'fixed_income','numerical_methods','programming','risk','quant_research'
]);
const ALL_DOCS = ['problem_book','numerical_methods','fixed_income','exotic_options','quant_research'];
const PRODUCT_DOC_RULES = [
  [/complete front office.*risk quant professional bundle/i, ALL_DOCS],
  [/quant interview problem book/i, ['problem_book']],
  [/numerical methods for quants/i, ['numerical_methods']],
  [/fixed income math.*bond pricing/i, ['fixed_income']],
  [/exotic options pricing guide/i, ['exotic_options']],
  [/quant researcher interview playbook/i, ['quant_research']]
];

function headers(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}
function sbUrl() {
  return process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function logistic(x) { return 1 / (1 + Math.exp(-x)); }
function normalizeSkill(value='') {
  const raw = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    probability_theory:'probability', prob:'probability', maths:'linear_algebra', math:'linear_algebra',
    stochastic:'stochastic_calculus', ito:'stochastic_calculus', options:'derivatives', exotics:'derivatives',
    bonds:'fixed_income', rates:'fixed_income', monte_carlo:'numerical_methods', python:'programming',
    cpp:'programming', sql:'programming', var:'risk', es:'risk', research:'quant_research'
  };
  const skill = aliases[raw] || raw;
  return SKILLS.has(skill) ? skill : 'probability';
}

async function modelJson(messages, maxTokens = 1800) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL || GROQ_CHAT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status})`);
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty model response');
  return JSON.parse(raw);
}

async function purchasedProductNames(email, key) {
  const response = await fetch(
    `${sbUrl()}/rest/v1/purchases?customer_email=ilike.${encodeURIComponent(email)}`
      + '&payment_id=like.pay_*&select=customer_email,product_name&limit=100',
    { headers: headers(key) }
  );
  if (!response.ok) return [];
  const target = normalizeAccessEmail(email);
  const rows = await response.json();
  return [...new Set((Array.isArray(rows) ? rows : [])
    .filter(r => normalizeAccessEmail(r.customer_email) === target)
    .map(r => String(r.product_name || '').trim())
    .filter(Boolean))];
}

export function allowedDocumentsFromProducts(productNames=[]) {
  const docs = new Set();
  for (const name of productNames) {
    for (const [pattern, keys] of PRODUCT_DOC_RULES) {
      if (pattern.test(name)) keys.forEach(k => docs.add(k));
    }
  }
  return [...docs];
}

async function retrievePrivateContext(email, query, key) {
  const names = await purchasedProductNames(email, key);
  const allowed = allowedDocumentsFromProducts(names);
  if (!allowed.length) return { context: '', sources: [] };
  const response = await fetch(`${sbUrl()}/rest/v1/rpc/search_quant_agent_knowledge`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ query_text: String(query).slice(0, 2000), allowed_document_keys: allowed, result_limit: 5 })
  });
  if (!response.ok) return { context: '', sources: [] };
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return { context: '', sources: [] };
  const sources = rows.map(r => ({ document: r.document_title, section: r.section }));
  const context = rows.map((r,i) => `[Private Desk2Quant source ${i+1}: ${r.document_title} / ${r.section}]\n${r.snippet}`).join('\n\n');
  return { context, sources };
}

async function loadSkill(user, skill, key) {
  const response = await fetch(
    `${sbUrl()}/rest/v1/quant_agent_skills?user_key=eq.${user}&skill_key=eq.${skill}`
      + '&select=user_key,skill_key,theta,information,attempts,mean_score,last_score,updated_at&limit=1',
    { headers: headers(key) }
  );
  if (!response.ok) throw new Error('skill state unavailable');
  const rows = await response.json();
  return rows?.[0] || { user_key:user, skill_key:skill, theta:0, information:0, attempts:0, mean_score:0, last_score:null };
}

async function listSkills(user, key) {
  const response = await fetch(
    `${sbUrl()}/rest/v1/quant_agent_skills?user_key=eq.${user}`
      + '&select=skill_key,theta,information,attempts,mean_score,last_score,updated_at&order=updated_at.desc',
    { headers: headers(key) }
  );
  if (!response.ok) throw new Error('skill state unavailable');
  return await response.json();
}

async function startAssessment(user, requestedSkill, key) {
  const skill = normalizeSkill(requestedSkill);
  const state = await loadSkill(user, skill, key);
  const difficulty = clamp(Number(state.theta) || 0, -2.25, 2.25);
  const discrimination = 1.15;
  const prompt = [
    { role:'system', content:'You are Desk2Quant assessment engine. Return strict JSON only. Create ONE original quant interview assessment item. It must test reasoning, not trivia. Do not quote proprietary books. JSON keys: question, rubric, referenceAnswer. rubric must specify objective scoring criteria totaling 100 points. referenceAnswer must be concise but sufficient to grade. No markdown fences.' },
    { role:'user', content:`Skill: ${skill}. IRT difficulty b=${difficulty.toFixed(2)} on a scale where 0 is intermediate, negative is easier, positive is harder. Create an item appropriate to that difficulty.` }
  ];
  const item = await modelJson(prompt, 1800);
  if (!item.question || !item.rubric || !item.referenceAnswer) throw new Error('invalid assessment item');
  const response = await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments`, {
    method:'POST',
    headers:headers(key,{Prefer:'return=representation'}),
    body:JSON.stringify({
      user_key:user, skill_key:skill, difficulty, discrimination,
      question:String(item.question).slice(0,6000),
      rubric:String(item.rubric).slice(0,8000),
      reference_answer:String(item.referenceAnswer).slice(0,12000)
    })
  });
  if (!response.ok) throw new Error('failed to save assessment');
  const rows = await response.json();
  const created = rows?.[0];
  return {
    assessmentId: created.id,
    skill,
    difficulty,
    question: created.question,
    expiresAt: created.expires_at,
    currentTheta: Number(state.theta) || 0,
    attempts: Number(state.attempts) || 0
  };
}

async function gradeAssessment(user, assessmentId, answer, key) {
  if (!assessmentId || !String(answer || '').trim()) throw new Error('assessmentId and answer required');
  if (String(answer).length > 12000) throw new Error('answer too long');
  const response = await fetch(
    `${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${encodeURIComponent(assessmentId)}`
      + `&user_key=eq.${user}&status=eq.open&select=*&limit=1`,
    { headers:headers(key) }
  );
  if (!response.ok) throw new Error('assessment unavailable');
  const rows = await response.json();
  const item = rows?.[0];
  if (!item) throw new Error('assessment not found or already graded');
  if (Date.now() > new Date(item.expires_at).getTime()) {
    await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${item.id}`, { method:'PATCH', headers:headers(key), body:JSON.stringify({status:'expired'}) });
    throw new Error('assessment expired');
  }
  const grading = await modelJson([
    { role:'system', content:'You are a strict quant interview grader. Return JSON only with keys score and feedback. score must be a number in [0,1]. Grade only against the supplied rubric/reference answer; give partial credit for correct reasoning. Do not reward verbosity.' },
    { role:'user', content:`QUESTION:\n${item.question}\n\nRUBRIC:\n${item.rubric}\n\nREFERENCE ANSWER:\n${item.reference_answer}\n\nCANDIDATE ANSWER:\n${String(answer)}` }
  ], 1200);
  const score = clamp(Number(grading.score), 0, 1);
  const state = await loadSkill(user, item.skill_key, key);
  const theta = Number(state.theta) || 0;
  const a = Number(item.discrimination) || 1;
  const b = Number(item.difficulty) || 0;
  const p = logistic(a * (theta - b));
  const attempts = Number(state.attempts) || 0;
  const eta = 0.75 / Math.sqrt(1 + attempts / 4);
  const nextTheta = clamp(theta + eta * a * (score - p), -4, 4);
  const info = (Number(state.information) || 0) + a*a*p*(1-p);
  const nextAttempts = attempts + 1;
  const mean = ((Number(state.mean_score) || 0) * attempts + score) / nextAttempts;
  const now = new Date().toISOString();
  await fetch(`${sbUrl()}/rest/v1/quant_agent_skills`, {
    method:'POST', headers:headers(key,{Prefer:'resolution=merge-duplicates,return=minimal'}),
    body:JSON.stringify({ user_key:user, skill_key:item.skill_key, theta:nextTheta, information:info, attempts:nextAttempts, mean_score:mean, last_score:score, updated_at:now })
  });
  await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${item.id}`, {
    method:'PATCH', headers:headers(key),
    body:JSON.stringify({ status:'graded', score, feedback:String(grading.feedback || '').slice(0,6000), graded_at:now })
  });
  return {
    assessmentId:item.id,
    skill:item.skill_key,
    score,
    feedback:String(grading.feedback || ''),
    thetaBefore:theta,
    thetaAfter:nextTheta,
    attempts:nextAttempts,
    meanScore:mean,
    information:info,
    abilityNote:'theta is a calibrated latent skill estimate from graded assessments, not a percentage.'
  };
}

function authSession(req) {
  const email = normalizeAccessEmail(req.body?.email);
  if (!email || !email.includes('@')) return { error:'Valid email required.' };
  const session = verifyAgentToken(email, req.body?.agentToken);
  if (!session) return { error:'Quant Agent session expired. Run `d2q login` again.' };
  return { email, session };
}

export async function handleQuantAgentAdvanced(req, res) {
  const action = String(req.body?.action || '');
  if (!['agent-assess-start','agent-assess-submit','agent-skills','agent-run'].includes(action)) {
    return handleQuantAgent(req, res);
  }
  const auth = authSession(req);
  if (auth.error) return res.status(401).json({ error:auth.error });
  const key = getServiceKey();
  if (!key) return res.status(503).json({ error:'Quant Agent database access is not configured.' });

  try {
    if (action === 'agent-assess-start') {
      return res.status(200).json({ success:true, ...(await startAssessment(auth.session.sub, req.body.skill, key)) });
    }
    if (action === 'agent-assess-submit') {
      return res.status(200).json({ success:true, ...(await gradeAssessment(auth.session.sub, req.body.assessmentId, req.body.answer, key)) });
    }
    if (action === 'agent-skills') {
      const skills = await listSkills(auth.session.sub, key);
      return res.status(200).json({ success:true, skills, note:'theta is centered at 0; positive values indicate stronger demonstrated performance at harder items, negative values weaker performance. It is not a percentile.' });
    }

    // RAG enrichment for ordinary agent-run. Entitlement is derived from this signed-in buyer's purchases.
    const originalQuery = String(req.body.query || '');
    const rag = await retrievePrivateContext(auth.email, originalQuery, key);
    if (!rag.context) return handleQuantAgent(req, res);
    const enriched = `${originalQuery}\n\nINTERNAL PRIVATE DESK2QUANT RETRIEVAL CONTEXT (licensed to this buyer):\n${rag.context}\n\nUse the context when relevant. Paraphrase rather than reproducing long passages. If it does not answer the question, rely on your quant reasoning and say the private material did not directly cover that point.`;
    req.body = { ...req.body, query: enriched.slice(0, 6000) };
    res.setHeader('X-D2Q-RAG', '1');
    return handleQuantAgent(req, res);
  } catch (err) {
    console.error('Advanced Quant Agent error:', err.message);
    const status = /expired|not found|already graded|required|too long/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: err.message === 'assessment expired' ? 'Assessment expired. Start a new one.' : 'Advanced Quant Agent request failed.' });
  }
}

export const QUANT_AGENT_SKILLS = [...SKILLS];
