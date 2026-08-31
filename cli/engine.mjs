import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatTerminalText } from './terminal-format.mjs';

export const COMMANDS = new Set(['learn','solve','practice','interview','project']);
export const ASSESSMENT_SKILLS = ['probability','linear_algebra','statistics','stochastic_calculus','derivatives','fixed_income','numerical_methods','programming','risk','quant_research'];
export const BASE_URL = process.env.D2Q_BASE_URL || 'https://desk2quant.com';
export const HELP = `Desk2Quant Quant Agent CLI

Authentication:
  d2q login <purchase-email>   Email a Desk2Quant magic link, then paste it
  d2q logout                   Remove the local agent session
  d2q whoami                   Show the signed-in account and tier
  d2q progress                 Show activity and today's usage

Quant Agent:
  d2q                          Open the dedicated Quant Agent TUI
  d2q learn <topic>
  d2q solve <problem>
  d2q practice <topic>
  d2q interview <role/topic>
  d2q project <topic>

Adaptive Assessment:
  d2q assess <skill>           Start one calibrated assessment question
  d2q submit <id> <answer>     Grade the answer and update latent skill theta
  d2q skills                   Show calibrated skill estimates

Skills:
  ${ASSESSMENT_SKILLS.join(', ')}

Options:
  --json                      Print machine-readable JSON
  --help, -h                  Show help
  --version, -v               Show version

Security:
  The CLI never stores or receives Desk2Quant's model/API secrets.
  Its local session file is created with owner-only permissions.`;

function configDir(env = process.env) {
  return env.D2Q_CONFIG_DIR || path.join(os.homedir(), '.desk2quant');
}

export function configPath(env = process.env) {
  return path.join(configDir(env), 'config.json');
}

export function normalizeCommand(command='') {
  const c = String(command).trim().toLowerCase();
  if (COMMANDS.has(c)) return c;
  throw new Error(`Unknown command "${command}". Use: ${[...COMMANDS].join(', ')}`);
}

export function parseMagicLink(value='') {
  const raw = String(value).trim();
  if (!raw) throw new Error('Magic link is required.');
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('Paste the complete Desk2Quant sign-in link from your email.'); }
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const token = String(url.searchParams.get('tk') || '').trim();
  if (!email || !email.includes('@') || !token) {
    throw new Error('That link does not contain a valid Desk2Quant email/token pair.');
  }
  const host = url.hostname.toLowerCase();
  const allowed = host === 'desk2quant.com' || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1';
  if (!allowed) throw new Error('Refusing a sign-in link from an untrusted host.');
  return { email, accessToken: token };
}

export function formatTerminalMath(value='') {
  return formatTerminalText(value);
}

async function readJson(response) {
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Desk2Quant returned an invalid response (${response.status}).`); }
  if (!response.ok) {
    const err = new Error(data.error || `Desk2Quant request failed (${response.status}).`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiPost(route, payload, { baseUrl = BASE_URL, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Desk2Quant-CLI/2.0.2' },
    body: JSON.stringify(payload)
  });
  return readJson(response);
}

export async function requestLogin(email, options = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('A valid purchase email is required.');
  return apiPost('/api/interview', { action: 'access-login', email: normalized }, options);
}

export async function exchangeMagicLink(link, options = {}) {
  const parsed = parseMagicLink(link);
  const data = await apiPost('/api/products', {
    action: 'agent-auth',
    email: parsed.email,
    accessToken: parsed.accessToken
  }, options);
  const config = {
    version: 1,
    email: parsed.email,
    tier: data.tier || 'pro',
    agentToken: data.agentToken,
    expiresAt: data.expiresAt,
    baseUrl: options.baseUrl || BASE_URL
  };
  if (!config.agentToken) throw new Error('Desk2Quant did not return an agent session.');
  await saveConfig(config, options.env || process.env);
  return { ...data, config };
}

export async function saveConfig(config, env = process.env) {
  const dir = configDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = configPath(env);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
  try { await fs.chmod(file, 0o600); } catch (_) {}
}

export async function loadConfig(env = process.env) {
  try {
    const raw = await fs.readFile(configPath(env), 'utf8');
    const cfg = JSON.parse(raw);
    if (!cfg?.email || !cfg?.agentToken) return null;
    return cfg;
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new Error('Could not read ~/.desk2quant/config.json. Run `d2q logout` and sign in again.');
  }
}

export async function logout(env = process.env) {
  try { await fs.unlink(configPath(env)); return true; }
  catch (err) { if (err?.code === 'ENOENT') return false; throw err; }
}

function assertSession(config) {
  if (!config) throw new Error('Not signed in. Run `d2q login <purchase-email>`.');
  if (config.expiresAt && Date.now() >= Number(config.expiresAt)) {
    throw new Error('Your Desk2Quant agent session expired. Run `d2q login <purchase-email>` again.');
  }
}

async function sessionPost(action, extra = {}, options = {}) {
  const config = options.config || await loadConfig(options.env || process.env);
  assertSession(config);
  return apiPost('/api/products', {
    action,
    email: config.email,
    agentToken: config.agentToken,
    ...extra
  }, {
    baseUrl: options.baseUrl || config.baseUrl || BASE_URL,
    fetchImpl: options.fetchImpl || fetch
  });
}

export async function runCommand(command, query='', options = {}) {
  const c = normalizeCommand(command);
  const q = String(query).trim();
  if (!q) throw new Error(`${c} requires a topic/problem.`);
  return sessionPost('agent-run', { command: c, query: q }, options);
}

export async function getProgress(options = {}) {
  return sessionPost('agent-progress', {}, options);
}

export async function startAssessment(skill, options = {}) {
  const s = String(skill || '').trim();
  if (!s) throw new Error('Usage: d2q assess <skill>');
  return sessionPost('agent-assess-start', { skill: s }, options);
}

export async function submitAssessment(assessmentId, answer, options = {}) {
  const id = String(assessmentId || '').trim();
  const response = String(answer || '').trim();
  if (!id || !response) throw new Error('Usage: d2q submit <assessment-id> <answer>');
  return sessionPost('agent-assess-submit', { assessmentId: id, answer: response }, options);
}

export async function getSkills(options = {}) {
  return sessionPost('agent-skills', {}, options);
}

export function formatProgress(progress = {}) {
  const lines = [
    `Total sessions: ${Number(progress.totalSessions) || 0}`,
    `Today: ${Number(progress.usedToday) || 0}/${Number(progress.dailyLimit) || 0} used (${Number(progress.remainingToday) || 0} remaining)`
  ];
  if (progress.lastCommand) lines.push(`Last: ${progress.lastCommand} — ${progress.lastTopic || 'general quant'}`);
  if (Array.isArray(progress.topTopics) && progress.topTopics.length) {
    lines.push('Top topics:');
    for (const item of progress.topTopics) lines.push(`  ${item.topic}: ${item.sessions}`);
  }
  if (progress.note) lines.push(`\n${progress.note}`);
  return lines.join('\n');
}

export function formatSkills(skills = []) {
  if (!Array.isArray(skills) || !skills.length) return 'No graded skill assessments yet. Run `d2q assess <skill>`.';
  return skills.map(s => {
    const theta = Number(s.theta) || 0;
    const score = Math.round((Number(s.mean_score) || 0) * 100);
    return `${s.skill_key}: theta=${theta.toFixed(2)} | attempts=${Number(s.attempts)||0} | mean score=${score}%`;
  }).join('\n');
}
