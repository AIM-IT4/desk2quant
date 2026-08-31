import crypto from 'crypto';
import { GROQ_CHAT_MODEL } from './groqModels.js';
import { getServiceKey } from './supabaseAdmin.js';
import { normalizeAccessEmail, verifyAccessToken } from './accessTokens.js';
import { inferTopic, knowledgeFor } from './quantAgentKnowledge.js';

const COMMANDS = new Set(['learn', 'solve', 'practice', 'interview', 'project']);
const AGENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 100;
const MAX_QUERY_CHARS = 6000;

const MODE_INSTRUCTIONS = {
  learn: 'Teach from intuition to mathematics. Define every variable, give one worked quant-finance example, identify assumptions/failure modes, and finish with one checkpoint question.',
  solve: 'Solve rigorously. State assumptions, derive step by step, check limiting cases or units where relevant, and clearly isolate the final result.',
  practice: 'Generate exactly five interview-style questions from easier to harder. Do not reveal full solutions. Give one concise hint per question.',
  interview: 'Act as a demanding but fair quant interviewer. Ask ONE realistic question only, do not reveal the solution, and state skill + difficulty.',
  project: 'Design one resume-worthy quant project with objective, mathematics, data, implementation milestones, validation, failure experiments, deliverables, and interview talking points.'
};

function agentSecret() {
  return process.env.QUANT_AGENT_SECRET
    || process.env.INTERVIEW_SESSION_SECRET
    || process.env.RAZORPAY_KEY_SECRET
    || '';
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function emailHash(email) {
  return crypto.createHash('sha256').update(normalizeAccessEmail(email)).digest('hex');
}

function userKey(email) {
  const secret = agentSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(normalizeAccessEmail(email)).digest('hex');
}

export function signAgentToken(email, tier = 'pro', ttlMs = AGENT_TTL_MS) {
  const secret = agentSecret();
  const uk = userKey(email);
  if (!secret || !uk) return null;
  const payload = {
    v: 1,
    sub: uk,
    eh: emailHash(email),
    tier,
    exp: Date.now() + ttlMs
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAgentToken(email, token) {
  const secret = agentSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.v !== 1 || !payload.exp || Date.now() > payload.exp) return null;
    if (!safeEqual(payload.eh, emailHash(email))) return null;
    if (!safeEqual(payload.sub, userKey(email))) return null;
    return payload;
  } catch {
    return null;
  }
}

function dbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

function exactEmailRows(rows, email) {
  const target = normalizeAccessEmail(email);
  return Array.isArray(rows) ? rows.filter(r => normalizeAccessEmail(r.customer_email) === target) : [];
}

async function fetchRazorpayPayment(paymentId) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) return null;
  const auth = 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: auth }
  });
  if (!response.ok) return null;
  const payment = await response.json();
  let order = null;
  if (payment.order_id) {
    try {
      const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(payment.order_id)}`, {
        headers: { Authorization: auth }
      });
      if (orderResponse.ok) order = await orderResponse.json();
    } catch (_) {}
  }
  return { payment, order };
}

async function verifyPaidEntitlement(email, key) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const response = await fetch(
    `${supabaseUrl}/rest/v1/purchases?customer_email=ilike.${encodeURIComponent(email)}`
      + '&payment_id=like.pay_*&select=customer_email,product_name,payment_id,created_at&order=created_at.desc&limit=20',
    { headers: dbHeaders(key) }
  );
  if (!response.ok) return { ok: false, status: 503, error: 'Could not verify Desk2Quant purchase history.' };
  const rows = exactEmailRows(await response.json(), email);
  const seen = new Set();
  for (const row of rows) {
    const paymentId = String(row.payment_id || '');
    if (!paymentId.startsWith('pay_') || seen.has(paymentId)) continue;
    seen.add(paymentId);
    const verified = await fetchRazorpayPayment(paymentId);
    if (!verified || verified.payment?.status !== 'captured') continue;
    const p = verified.payment;
    const o = verified.order;
    const knownEmails = [
      p.email,
      p.notes?.customer_email,
      p.notes?.email,
      o?.notes?.customer_email,
      o?.notes?.email
    ].filter(Boolean).map(normalizeAccessEmail);
    if (!knownEmails.length || !knownEmails.includes(normalizeAccessEmail(email))) continue;
    return {
      ok: true,
      tier: 'pro',
      paymentId,
      product: p.notes?.product_name || o?.notes?.product_name || row.product_name || 'Desk2Quant purchase'
    };
  }
  return { ok: false, status: 402, error: 'A verified paid Desk2Quant purchase is required for Quant Agent access.' };
}

function startOfUtcDayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function usageToday(user, key) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const response = await fetch(
    `${supabaseUrl}/rest/v1/quant_agent_usage_events?user_key=eq.${user}`
      + `&created_at=gte.${encodeURIComponent(startOfUtcDayIso())}&select=id&limit=${DAILY_LIMIT + 10}`,
    { headers: dbHeaders(key) }
  );
  if (!response.ok) throw new Error('quant_agent_usage_events unavailable');
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function loadProfile(user, key) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const response = await fetch(
    `${supabaseUrl}/rest/v1/quant_agent_profiles?user_key=eq.${user}&select=user_key,total_sessions,command_counts,topic_counts,last_command,last_topic,updated_at&limit=1`,
    { headers: dbHeaders(key) }
  );
  if (!response.ok) throw new Error('quant_agent_profiles unavailable');
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : {
    user_key: user,
    total_sessions: 0,
    command_counts: {},
    topic_counts: {},
    last_command: null,
    last_topic: null,
    updated_at: null
  };
}

function publicProgress(profile, usedToday) {
  const commands = profile.command_counts || {};
  const topics = profile.topic_counts || {};
  const topTopics = Object.entries(topics)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 5)
    .map(([topic, sessions]) => ({ topic, sessions: Number(sessions) || 0 }));
  return {
    totalSessions: Number(profile.total_sessions) || 0,
    commandCounts: commands,
    topTopics,
    lastCommand: profile.last_command || null,
    lastTopic: profile.last_topic || null,
    usedToday,
    dailyLimit: DAILY_LIMIT,
    remainingToday: Math.max(0, DAILY_LIMIT - usedToday),
    updatedAt: profile.updated_at || null,
    note: 'Progress reflects activity/exposure, not an inferred ability score unless a graded assessment is added.'
  };
}

export function buildAgentMessages(command, query, profile = {}) {
  if (!COMMANDS.has(command)) throw new Error('unsupported command');
  const topic = inferTopic(query);
  const progress = publicProgress(profile, 0);
  const system = [
    'You are Desk2Quant Quant Agent, a rigorous mentor for aspiring quantitative finance professionals.',
    MODE_INSTRUCTIONS[command],
    'The response is displayed in a command-line terminal, not a browser. Write equations in terminal-native Unicode/plain text. Use symbols such as θ, σ, μ, Δ, ∂, ∫, √, ≤, ≥ and arrows directly. Write fractions as (numerator)/(denominator), powers as x^2 or exp(x), and subscripts as r_t or P(t,T). Do NOT emit LaTeX delimiters or LaTeX commands such as \\( \\), \\[ \\], $$, \\frac, \\boxed, \\begin, \\theta, or \\sigma. Fenced code blocks are allowed for actual code only.',
    'Be mathematically explicit and professionally concise. For calibrated no-arbitrage models, verify the worked example reproduces the calibration target before presenting it as correct.',
    'Never claim a user is interview-ready from activity counts alone. Never fabricate citations, market data, employers, or proprietary-note quotations.',
    'When multiple modelling conventions exist, state the convention used.',
    `Verified knowledge anchor:\n${knowledgeFor(query)}`,
    `Learner activity context (use only to tune pacing, not to infer competence): ${JSON.stringify({ totalSessions: progress.totalSessions, topTopics: progress.topTopics, lastCommand: progress.lastCommand, lastTopic: progress.lastTopic })}`
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: String(query).trim() }];
}

async function callModel(command, query, profile) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL || GROQ_CHAT_MODEL,
      messages: buildAgentMessages(command, query, profile),
      temperature: command === 'solve' ? 0.2 : command === 'interview' ? 0.55 : 0.4,
      max_tokens: command === 'project' ? 2600 : 2200
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Model request failed (${response.status}): ${detail}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Model returned an empty response');
  return { content, usage: data.usage || {}, model: data.model || process.env.GROQ_CHAT_MODEL || GROQ_CHAT_MODEL };
}

async function recordUsageAndProgress({ user, command, topic, model, usage, key, profile }) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const event = {
    user_key: user,
    command,
    topic: String(topic).slice(0, 80),
    model: String(model || '').slice(0, 120),
    input_tokens: Number(usage?.prompt_tokens) || 0,
    output_tokens: Number(usage?.completion_tokens) || 0,
    created_at: new Date().toISOString()
  };
  const eventResp = await fetch(`${supabaseUrl}/rest/v1/quant_agent_usage_events`, {
    method: 'POST', headers: dbHeaders(key, { Prefer: 'return=minimal' }), body: JSON.stringify(event)
  });
  if (!eventResp.ok) throw new Error('failed to record usage');

  const commands = { ...(profile.command_counts || {}) };
  const topics = { ...(profile.topic_counts || {}) };
  commands[command] = (Number(commands[command]) || 0) + 1;
  topics[topic] = (Number(topics[topic]) || 0) + 1;
  const updated = {
    user_key: user,
    total_sessions: (Number(profile.total_sessions) || 0) + 1,
    command_counts: commands,
    topic_counts: topics,
    last_command: command,
    last_topic: topic,
    updated_at: new Date().toISOString()
  };
  const profileResp = await fetch(`${supabaseUrl}/rest/v1/quant_agent_profiles`, {
    method: 'POST',
    headers: dbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(updated)
  });
  if (!profileResp.ok) throw new Error('failed to update profile');
  return updated;
}

function requireServerConfig(res) {
  if (!agentSecret()) {
    res.status(503).json({ error: 'Quant Agent signing secret is not configured.' });
    return false;
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    res.status(503).json({ error: 'Quant Agent entitlement verification is not configured.' });
    return false;
  }
  if (!getServiceKey()) {
    res.status(503).json({ error: 'Quant Agent database access is not configured.' });
    return false;
  }
  return true;
}

export async function handleQuantAgent(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!requireServerConfig(res)) return;

  const body = req.body || {};
  const action = String(body.action || '');
  const email = normalizeAccessEmail(body.email);
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
  const key = getServiceKey();

  try {
    if (action === 'agent-auth') {
      if (!verifyAccessToken(email, body.accessToken, ['login', 'session'])) {
        return res.status(401).json({ error: 'The Desk2Quant sign-in token is invalid or expired.' });
      }
      const ent = await verifyPaidEntitlement(email, key);
      if (!ent.ok) return res.status(ent.status).json({ error: ent.error });
      const token = signAgentToken(email, ent.tier);
      if (!token) return res.status(503).json({ error: 'Could not create agent session.' });
      let profile;
      try { profile = await loadProfile(userKey(email), key); }
      catch { profile = { total_sessions: 0, command_counts: {}, topic_counts: {} }; }
      let used = 0;
      try { used = await usageToday(userKey(email), key); } catch (_) {}
      return res.status(200).json({
        success: true,
        tier: ent.tier,
        agentToken: token,
        expiresAt: Date.now() + AGENT_TTL_MS,
        progress: publicProgress(profile, used)
      });
    }

    const session = verifyAgentToken(email, body.agentToken);
    if (!session) return res.status(401).json({ error: 'Quant Agent session expired. Run `d2q login` again.' });
    const user = session.sub;

    if (action === 'agent-progress') {
      const [profile, used] = await Promise.all([loadProfile(user, key), usageToday(user, key)]);
      return res.status(200).json({ success: true, tier: session.tier, progress: publicProgress(profile, used) });
    }

    if (action !== 'agent-run') return res.status(400).json({ error: 'Unknown Quant Agent action.' });
    const command = String(body.command || '').trim().toLowerCase();
    if (!COMMANDS.has(command)) return res.status(400).json({ error: 'Unsupported command.' });
    const query = String(body.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Query required.' });
    if (query.length > MAX_QUERY_CHARS) return res.status(413).json({ error: `Query exceeds ${MAX_QUERY_CHARS} characters.` });

    const used = await usageToday(user, key);
    if (used >= DAILY_LIMIT) {
      res.setHeader('Retry-After', String(24 * 60 * 60));
      return res.status(429).json({ error: 'Daily Quant Agent limit reached.', dailyLimit: DAILY_LIMIT, remainingToday: 0 });
    }

    const profile = await loadProfile(user, key);
    const topic = inferTopic(query);
    const started = Date.now();
    const modelResult = await callModel(command, query, profile);
    const updatedProfile = await recordUsageAndProgress({ user, command, topic, model: modelResult.model, usage: modelResult.usage, key, profile });
    const usedAfter = used + 1;

    return res.status(200).json({
      success: true,
      content: modelResult.content,
      meta: {
        command,
        topic,
        model: modelResult.model,
        latencyMs: Date.now() - started,
        remainingToday: Math.max(0, DAILY_LIMIT - usedAfter)
      },
      progress: publicProgress(updatedProfile, usedAfter)
    });
  } catch (err) {
    console.error('Quant Agent error:', err.message);
    if (/quant_agent_(profiles|usage_events) unavailable/.test(err.message)) {
      return res.status(503).json({ error: 'Quant Agent database migration has not been applied yet.' });
    }
    return res.status(500).json({ error: 'Quant Agent request failed. Please try again.' });
  }
}

export const QUANT_AGENT_COMMANDS = COMMANDS;
export const QUANT_AGENT_DAILY_LIMIT = DAILY_LIMIT;