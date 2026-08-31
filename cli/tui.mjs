import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  formatProgress,
  formatSkills,
  getProgress,
  getSkills,
  loadConfig,
  runCommand,
  startAssessment,
  submitAssessment
} from './engine.mjs';
import { formatTerminalText, wrapTerminalText } from './terminal-format.mjs';

const VERSION = '2.0.2';
const MODES = new Set(['auto', 'learn', 'solve', 'practice', 'interview', 'project']);
const DEPTHS = new Set(['concise', 'standard', 'deep']);
const ESC = '\u001b[';
const PAGE_STEP = 14;

const ANSI = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, cyan: `${ESC}36m`, yellow: `${ESC}33m`,
  green: `${ESC}32m`, blue: `${ESC}34m`, magenta: `${ESC}35m`, red: `${ESC}31m`, gray: `${ESC}90m`, white: `${ESC}97m`
};

function color(code, value) {
  if (!output.isTTY || process.env.NO_COLOR) return String(value);
  return `${code}${value}${ANSI.reset}`;
}
function stripAnsi(value = '') { return String(value).replace(/\u001b\[[0-9;]*m/g, ''); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function truncate(value, n) {
  const text = String(value || '');
  return text.length > n ? text.slice(0, Math.max(0, n - 1)) + '…' : text;
}

export function inferMode(query = '', preferred = 'auto') {
  const forced = String(preferred || 'auto').toLowerCase();
  if (MODES.has(forced) && forced !== 'auto') return forced;
  const q = String(query).toLowerCase();
  if (/\b(mock interview|interview me|ask me|interviewer|screen me)\b/.test(q)) return 'interview';
  if (/\b(practice|quiz|drill|question set|questions for me|test me)\b/.test(q)) return 'practice';
  if (/\b(project|portfolio project|research project|build a project|implementation roadmap)\b/.test(q)) return 'project';
  if (/\b(solve|derive|calculate|compute|prove|show that|price|calibrate|estimate|find the|work out)\b/.test(q)) return 'solve';
  return 'learn';
}

function qualityContract(depth = 'deep') {
  if (depth === 'concise') {
    return 'Answer directly in 3-6 compact paragraphs or bullets. Use only the mathematics needed to answer the question. Do not include code unless the user explicitly asks for code or implementation.';
  }
  if (depth === 'standard') {
    return 'Give a rigorous but compact quant-level answer: direct intuition, essential equations, assumptions, and practical interpretation. Do not include code unless explicitly requested or the task is inherently an implementation task.';
  }
  return [
    'Answer at practitioner quantitative-finance level, but optimize for relevance rather than maximum length.',
    'Start with the direct answer. Add only the mathematics needed to support it.',
    'For broad conceptual questions, explain the modelling trade-offs and practical reasons before equations.',
    'Do not include Python, pseudocode, implementation sketches, or code blocks unless the user explicitly asks to code, implement, build, debug, simulate, calibrate in code, or requests a project implementation.',
    'Define notation before using it and state modelling conventions when they matter.',
    'Use a limiting case, sanity check, or numerical example only when it materially improves the answer.',
    'Avoid long textbook derivations when the user asked a conceptual why/what question.',
    'Do not invent market data, citations, or facts.',
    'End with a compact practical takeaway.'
  ].join(' ');
}

export function buildContextQuery(query, history = [], { depth = 'deep' } = {}) {
  const current = String(query || '').trim();
  const recent = Array.isArray(history) ? history.slice(-6) : [];
  let context = recent.map((m) => `${m.role === 'assistant' ? 'Desk2Quant' : 'User'}: ${String(m.content || '').trim()}`).join('\n\n');
  if (context.length > 2600) context = context.slice(context.length - 2600);
  const parts = [
    `QUALITY CONTRACT:\n${qualityContract(depth)}`,
    context ? `RECENT CONVERSATION CONTEXT:\n${context}` : '',
    `CURRENT USER REQUEST:\n${current}`,
    'Answer only the CURRENT USER REQUEST. Use recent context only for continuity; do not continue an earlier derivation or code sample unless the current request requires it.'
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 5600);
}

function configDir(env = process.env) { return env.D2Q_CONFIG_DIR || path.join(os.homedir(), '.desk2quant'); }
function historyPath(env = process.env) { return path.join(configDir(env), 'tui-history.json'); }
async function loadHistory(env = process.env) {
  try {
    const parsed = JSON.parse(await fs.readFile(historyPath(env), 'utf8'));
    return Array.isArray(parsed?.messages) ? parsed : { messages: [] };
  } catch { return { messages: [] }; }
}
async function saveHistory(messages, env = process.env) {
  const dir = configDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = historyPath(env);
  await fs.writeFile(file, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), messages: messages.slice(-40) }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try { await fs.chmod(file, 0o600); } catch (_) {}
}
function horizontal(width, char = '─') { return char.repeat(Math.max(8, width)); }

function styleLine(line) {
  const raw = String(line);
  const trimmed = raw.trim();
  if (/^(Python|JavaScript|TypeScript|SQL|Code)$/.test(trimmed)) return color(ANSI.bold + ANSI.magenta, raw);
  if (/^[A-Z][A-Z0-9 /&()_-]{3,}:?$/.test(trimmed)) return color(ANSI.bold + ANSI.cyan, raw);
  if (/^(Takeaway|Intuition|Setup|Derivation|Example|Assumptions|Practical takeaway|Desk implication|Why|What this means)\b/i.test(trimmed)) return color(ANSI.bold + ANSI.cyan, raw);
  if (/^\s*(?:[-•]|\d+\.)\s+/.test(raw)) return color(ANSI.white, raw);
  if (/^\s{4}\S/.test(raw)) return color(ANSI.yellow, raw);
  return raw;
}

function latestTurn(history) {
  if (!Array.isArray(history) || !history.length) return [];
  let userIndex = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') { userIndex = i; break; }
  }
  if (userIndex < 0) return history.slice(-1);
  const result = [history[userIndex]];
  for (let i = userIndex + 1; i < history.length; i += 1) {
    if (history[i]?.role === 'assistant') { result.push(history[i]); break; }
  }
  return result;
}

function renderConversation(state, width, heightBudget) {
  const out = [];
  const contentWidth = Math.max(40, width - 2);
  const messages = latestTurn(state.history);

  for (const message of messages) {
    const isUser = message.role === 'user';
    out.push(isUser ? color(ANSI.bold + ANSI.blue, 'YOU') : color(ANSI.bold + ANSI.green, 'DESK2QUANT'));
    const body = isUser ? String(message.content || '') : formatTerminalText(String(message.content || ''));
    for (const line of wrapTerminalText(body, contentWidth)) out.push(isUser ? color(ANSI.white, line) : styleLine(line));
    out.push('');
  }

  if (state.notice) {
    out.push(color(ANSI.bold + ANSI.yellow, 'SYSTEM'));
    for (const line of wrapTerminalText(formatTerminalText(state.notice), contentWidth)) out.push(color(ANSI.gray, line));
    out.push('');
  }

  const offset = Math.max(0, Number(state.viewOffset) || 0);
  const page = out.slice(offset, offset + heightBudget);
  if (offset > 0 && page.length) page[0] = color(ANSI.dim, `↑ /top · showing lines ${offset + 1}-${Math.min(out.length, offset + heightBudget)} of ${out.length}`);
  if (offset + heightBudget < out.length) {
    if (page.length >= heightBudget) page[heightBudget - 1] = color(ANSI.dim, '… /more for the next page · /export for full transcript …');
    else page.push(color(ANSI.dim, '… /more for the next page · /export for full transcript …'));
  }
  return page;
}

function renderScreen(state) {
  const width = clamp(output.columns || 110, 72, 150);
  const height = clamp(output.rows || 34, 22, 60);
  const inner = width - 2;
  const modeText = state.mode === 'auto' ? `auto→${state.lastMode || 'learn'}` : state.mode;
  const title = color(ANSI.bold + ANSI.cyan, `Desk2Quant Quant Agent v${VERSION}`);
  const right = color(ANSI.green, `${String(state.tier || 'pro').toUpperCase()} · ${state.remaining ?? '?'} left`);
  const gap = Math.max(1, inner - stripAnsi(title).length - stripAnsi(right).length);
  const status = `${modeText} · ${state.depth} · ${truncate(state.email, 28)} · /help`;
  const headerRows = 4;
  const footerRows = 3;
  const budget = Math.max(8, height - headerRows - footerRows);
  const conversation = renderConversation(state, inner, budget);

  const lines = [
    `${title}${' '.repeat(gap)}${right}`,
    color(ANSI.dim, horizontal(inner)),
    color(ANSI.dim, status),
    ''
  ];
  lines.push(...conversation);
  while (lines.length < height - 2) lines.push('');
  lines.push(color(ANSI.dim, horizontal(inner)));
  lines.push(color(ANSI.dim, `mode ${modeText} · depth ${state.depth} · ${state.remaining ?? '?'} requests left`));
  if (output.isTTY) output.write(`${ESC}2J${ESC}H`);
  output.write(lines.slice(0, height).join('\n') + '\n');
}

async function withSpinner(promise, label = 'Reasoning') {
  if (!output.isTTY) return promise;
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const timer = setInterval(() => output.write(`\r${ESC}2K${color(ANSI.cyan, frames[i++ % frames.length])} ${label}…`), 90);
  try { return await promise; }
  finally { clearInterval(timer); output.write(`\r${ESC}2K`); }
}

function parseSlash(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('/')) return null;
  const [name, ...rest] = text.slice(1).split(/\s+/);
  return { name: String(name || '').toLowerCase(), args: rest, raw: rest.join(' ') };
}

async function exportTranscript(state) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.resolve(process.cwd(), `desk2quant-session-${stamp}.md`);
  const body = ['# Desk2Quant Quant Agent Session','',`- Account: ${state.email}`,`- Mode: ${state.mode}`,`- Depth: ${state.depth}`,`- Exported: ${new Date().toISOString()}`,'',
    ...state.history.flatMap((m) => [`## ${m.role === 'user' ? 'You' : 'Desk2Quant'}`,'',String(m.content || ''),''])].join('\n');
  await fs.writeFile(file, body, 'utf8');
  return file;
}

function helpText() {
  return [
    'Ask naturally; the agent routes to learn/solve/practice/interview/project.',
    '/mode auto|learn|solve|practice|interview|project — override routing',
    '/depth concise|standard|deep — control answer depth',
    '/more — show the next page of the current answer',
    '/top — return to the start of the current answer',
    '/progress — usage and activity',
    '/skills — calibrated assessment skills',
    '/assess <skill> — start an adaptive question',
    '/submit <id> <answer> — grade an adaptive question',
    '/context — show session context',
    '/history — show recent prompts',
    '/sources — show source metadata when available',
    '/new — start a fresh conversation',
    '/export — save the session as Markdown',
    '/clear — clear system notices',
    '/quit — exit the TUI'
  ].join('\n');
}

async function handleSlash(command, state) {
  const { name, args, raw } = command;
  if (name === 'help') { state.notice = helpText(); state.viewOffset = 0; return false; }
  if (name === 'quit' || name === 'exit') return true;
  if (name === 'more') { state.viewOffset = Math.max(0, (Number(state.viewOffset) || 0) + PAGE_STEP); state.notice = ''; return false; }
  if (name === 'top') { state.viewOffset = 0; state.notice = ''; return false; }
  if (name === 'mode') {
    const next = String(args[0] || '').toLowerCase();
    if (!MODES.has(next)) state.notice = `Mode must be one of: ${[...MODES].join(', ')}`;
    else { state.mode = next; state.notice = `Mode set to ${next}.`; }
    state.viewOffset = 0; return false;
  }
  if (name === 'depth') {
    const next = String(args[0] || '').toLowerCase();
    if (!DEPTHS.has(next)) state.notice = `Depth must be one of: ${[...DEPTHS].join(', ')}`;
    else { state.depth = next; state.notice = `Answer depth set to ${next}.`; }
    state.viewOffset = 0; return false;
  }
  if (name === 'progress') {
    const result = await withSpinner(getProgress(), 'Loading progress');
    state.remaining = result?.progress?.remainingToday ?? state.remaining;
    state.notice = formatProgress(result.progress); state.viewOffset = 0; return false;
  }
  if (name === 'skills') {
    const result = await withSpinner(getSkills(), 'Loading skills');
    state.notice = `${formatSkills(result.skills)}${result.note ? `\n\n${result.note}` : ''}`; state.viewOffset = 0; return false;
  }
  if (name === 'assess') {
    if (!raw) { state.notice = 'Usage: /assess <skill>'; return false; }
    const result = await withSpinner(startAssessment(raw), 'Preparing assessment');
    state.notice = `Assessment ID: ${result.assessmentId}\nSkill: ${result.skill} | difficulty b=${Number(result.difficulty).toFixed(2)} | current θ=${Number(result.currentTheta).toFixed(2)}\n\n${result.question}\n\nSubmit with: /submit ${result.assessmentId} "your answer"`;
    state.viewOffset = 0; return false;
  }
  if (name === 'submit') {
    const id = args.shift();
    const answer = args.join(' ').replace(/^"|"$/g, '');
    if (!id || !answer) { state.notice = 'Usage: /submit <assessment-id> <answer>'; return false; }
    const result = await withSpinner(submitAssessment(id, answer), 'Grading');
    state.notice = `Score: ${(Number(result.score) * 100).toFixed(1)}%\nθ: ${Number(result.thetaBefore).toFixed(2)} → ${Number(result.thetaAfter).toFixed(2)}\nAttempts: ${result.attempts}\n\n${result.feedback}\n\n${result.abilityNote}`;
    state.viewOffset = 0; return false;
  }
  if (name === 'context') {
    state.notice = `Account: ${state.email} (${state.tier})\nMode: ${state.mode}${state.mode === 'auto' ? ` → ${state.lastMode || 'learn'}` : ''}\nDepth: ${state.depth}\nMessages in local context: ${state.history.length}\nSession expires: ${new Date(Number(state.expiresAt)).toLocaleString()}`;
    state.viewOffset = 0; return false;
  }
  if (name === 'history') {
    const prompts = state.history.filter((m) => m.role === 'user').slice(-8).map((m, i) => `${i + 1}. ${truncate(m.content, 110)}`);
    state.notice = prompts.length ? prompts.join('\n') : 'No conversation history yet.'; state.viewOffset = 0; return false;
  }
  if (name === 'sources') {
    const sources = state.lastMeta?.sources;
    state.notice = Array.isArray(sources) && sources.length ? sources.map((s, i) => `[${i + 1}] ${typeof s === 'string' ? s : JSON.stringify(s)}`).join('\n') : 'The latest response did not return source-level metadata.';
    state.viewOffset = 0; return false;
  }
  if (name === 'new') {
    state.history = []; state.notice = 'Started a fresh conversation.'; state.viewOffset = 0;
    await saveHistory(state.history); return false;
  }
  if (name === 'export') { state.notice = `Session exported to:\n${await exportTranscript(state)}`; state.viewOffset = 0; return false; }
  if (name === 'clear') { state.notice = ''; state.viewOffset = 0; return false; }
  state.notice = `Unknown command /${name}. Use /help.`; state.viewOffset = 0; return false;
}

export const wrapText = wrapTerminalText;

export async function startTui({ env = process.env } = {}) {
  const cfg = await loadConfig(env);
  if (!cfg) throw new Error('Not signed in. Run `d2q login <purchase-email>` first, then run `d2q`.');
  const stored = await loadHistory(env);
  let progress = null;
  try { progress = await getProgress({ env }); } catch (_) {}

  const state = {
    email: cfg.email,
    tier: cfg.tier || 'pro',
    expiresAt: cfg.expiresAt,
    mode: 'auto',
    lastMode: 'learn',
    depth: 'deep',
    remaining: progress?.progress?.remainingToday ?? '?',
    history: stored.messages || [],
    notice: 'Ask a quant question naturally. Use /help for controls.',
    lastMeta: null,
    viewOffset: 0
  };

  const rl = readline.createInterface({ input, output, terminal: true, historySize: 200 });
  try {
    while (true) {
      renderScreen(state);
      let line;
      try { line = (await rl.question(color(ANSI.bold + ANSI.cyan, '› '))).trim(); }
      catch (err) { if (err?.code === 'ERR_USE_AFTER_CLOSE') break; throw err; }
      if (!line) { state.notice = ''; continue; }

      const slash = parseSlash(line);
      if (slash) {
        try { if (await handleSlash(slash, state)) break; }
        catch (err) { state.notice = `Error: ${err.message}`; state.viewOffset = 0; }
        continue;
      }

      state.notice = '';
      state.viewOffset = 0;
      const mode = inferMode(line, state.mode);
      state.lastMode = mode;
      const query = buildContextQuery(line, state.history, { depth: state.depth });
      try {
        const result = await withSpinner(runCommand(mode, query, { env }), `Reasoning · ${mode}`);
        state.history.push({ role: 'user', content: line, at: Date.now() });
        state.history.push({ role: 'assistant', content: result.content, at: Date.now(), mode });
        state.history = state.history.slice(-40);
        state.remaining = result?.meta?.remainingToday ?? state.remaining;
        state.lastMeta = result?.meta || null;
        await saveHistory(state.history, env);
      } catch (err) {
        state.notice = `Request failed: ${err.message}`;
      }
    }
  } finally {
    rl.close();
    if (output.isTTY) output.write(`${ESC}0m\n`);
  }
}
