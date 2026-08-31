import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  formatProgress,
  formatSkills,
  formatTerminalMath,
  getProgress,
  getSkills,
  loadConfig,
  runCommand,
  startAssessment,
  submitAssessment
} from './engine.mjs';

const VERSION = '2.0.0';
const MODES = new Set(['auto', 'learn', 'solve', 'practice', 'interview', 'project']);
const DEPTHS = new Set(['concise', 'standard', 'deep']);
const ESC = '\u001b[';

const ANSI = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  cyan: `${ESC}36m`,
  yellow: `${ESC}33m`,
  green: `${ESC}32m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  red: `${ESC}31m`,
  gray: `${ESC}90m`,
  white: `${ESC}97m`
};

function color(code, value) {
  if (!output.isTTY || process.env.NO_COLOR) return String(value);
  return `${code}${value}${ANSI.reset}`;
}

function stripAnsi(value = '') {
  return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pad(value, width) {
  const raw = String(value);
  const len = stripAnsi(raw).length;
  if (len >= width) return raw;
  return raw + ' '.repeat(width - len);
}

export function wrapText(value = '', width = 80) {
  const target = Math.max(18, Number(width) || 80);
  const out = [];
  for (const paragraph of String(value).replace(/\r\n/g, '\n').split('\n')) {
    if (!paragraph) {
      out.push('');
      continue;
    }
    if (paragraph.startsWith('```') || /^\s{4}/.test(paragraph)) {
      out.push(paragraph);
      continue;
    }
    const indent = (paragraph.match(/^\s*(?:[-*•]|\d+\.)\s+/) || [''])[0];
    const words = paragraph.trim().split(/\s+/);
    let line = indent;
    for (const word of words) {
      const candidate = line.trim().length ? `${line}${line.endsWith(' ') ? '' : ' '}${word}` : word;
      if (stripAnsi(candidate).length > target && line.trim()) {
        out.push(line.trimEnd());
        line = indent ? `${' '.repeat(indent.length)}${word}` : word;
      } else {
        line = candidate;
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
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
    return 'Be direct and technically correct. State the key equation/result, define essential notation, and give the practical quant interpretation. Avoid generic filler.';
  }
  if (depth === 'standard') {
    return 'Give a rigorous quant-level answer: intuition, notation, core derivation or logic, assumptions, one sanity check or example, and practical interpretation. Avoid hand-waving and generic filler.';
  }
  return [
    'Answer at practitioner quantitative-finance level, not as a generic chatbot.',
    'Start with the direct answer, then build intuition and mathematics.',
    'Define notation before using it. Derive non-trivial claims step by step.',
    'State modelling conventions and assumptions explicitly.',
    'Check at least one limiting case, unit/dimension, sign, boundary condition, or calibration identity when relevant.',
    'Use a small numerical example when it materially improves understanding.',
    'Include desk/model-risk interpretation and common failure modes where relevant.',
    'For code, give production-minded Python with numerical/validation considerations rather than toy pseudocode.',
    'Do not invent market data, citations, or facts. If something is uncertain, say exactly what is uncertain.',
    'End with a compact takeaway rather than repeating the whole answer.'
  ].join(' ');
}

export function buildContextQuery(query, history = [], { depth = 'deep' } = {}) {
  const current = String(query || '').trim();
  const recent = Array.isArray(history) ? history.slice(-8) : [];
  let context = recent
    .map((m) => `${m.role === 'assistant' ? 'Desk2Quant' : 'User'}: ${String(m.content || '').trim()}`)
    .join('\n\n');
  if (context.length > 3200) context = context.slice(context.length - 3200);
  const pieces = [
    `QUALITY CONTRACT:\n${qualityContract(depth)}`,
    context ? `RECENT CONVERSATION CONTEXT:\n${context}` : '',
    `CURRENT USER REQUEST:\n${current}`,
    'Answer the CURRENT USER REQUEST. Use conversation context only when it is relevant; do not restate it unnecessarily.'
  ].filter(Boolean);
  const combined = pieces.join('\n\n');
  return combined.length <= 5600 ? combined : `${combined.slice(0, 5600)}\n`;
}

function configDir(env = process.env) {
  return env.D2Q_CONFIG_DIR || path.join(os.homedir(), '.desk2quant');
}

function historyPath(env = process.env) {
  return path.join(configDir(env), 'tui-history.json');
}

async function loadHistory(env = process.env) {
  try {
    const raw = await fs.readFile(historyPath(env), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.messages) ? parsed : { messages: [] };
  } catch (err) {
    if (err?.code === 'ENOENT') return { messages: [] };
    return { messages: [] };
  }
}

async function saveHistory(messages, env = process.env) {
  const dir = configDir(env);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = historyPath(env);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    messages: messages.slice(-40)
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try { await fs.chmod(file, 0o600); } catch (_) {}
}

function truncate(value, n) {
  const text = String(value || '');
  return text.length > n ? text.slice(0, Math.max(0, n - 1)) + '…' : text;
}

function divider(width, left = '├', right = '┤') {
  return `${left}${'─'.repeat(Math.max(0, width - 2))}${right}`;
}

function top(width) { return `┌${'─'.repeat(Math.max(0, width - 2))}┐`; }
function bottom(width) { return `└${'─'.repeat(Math.max(0, width - 2))}┘`; }

function renderHeader(state, width) {
  const inside = width - 4;
  const left = color(ANSI.bold + ANSI.cyan, `Desk2Quant Quant Agent v${VERSION}`);
  const right = color(ANSI.green, `${String(state.tier || 'pro').toUpperCase()} · ${state.remaining ?? '?'} left`);
  const gap = Math.max(1, inside - stripAnsi(left).length - stripAnsi(right).length);
  return [
    top(width),
    `│ ${left}${' '.repeat(gap)}${right} │`,
    divider(width)
  ];
}

function sidebarLines(state) {
  const modeText = state.mode === 'auto' ? `auto → ${state.lastMode || 'learn'}` : state.mode;
  return [
    color(ANSI.yellow, 'MODE'),
    ` ${modeText}`,
    '',
    color(ANSI.yellow, 'DEPTH'),
    ` ${state.depth}`,
    '',
    color(ANSI.yellow, 'SESSION'),
    ` ${state.email}`,
    ` turns: ${Math.floor(state.history.length / 2)}`,
    '',
    color(ANSI.yellow, 'COMMANDS'),
    ' /mode  /depth',
    ' /progress',
    ' /skills /assess',
    ' /context /history',
    ' /new /export',
    ' /help /quit'
  ];
}

function styleAnswerLine(line) {
  const raw = String(line);
  if (/^#{1,4}\s+/.test(raw)) return color(ANSI.bold + ANSI.cyan, raw.replace(/^#{1,4}\s+/, ''));
  if (/^[A-Z][A-Z0-9 /&()_-]{4,}:?$/.test(raw.trim())) return color(ANSI.bold + ANSI.cyan, raw);
  if (/^\s*(?:[-*•]|\d+\.)\s+/.test(raw)) return color(ANSI.white, raw);
  if (/^```/.test(raw)) return color(ANSI.magenta, raw);
  return raw;
}

function chatLines(state, width, heightBudget) {
  const out = [];
  const available = Math.max(20, width);
  const messages = state.history.slice(-8);
  for (const message of messages) {
    const isUser = message.role === 'user';
    const label = isUser ? color(ANSI.bold + ANSI.blue, 'YOU') : color(ANSI.bold + ANSI.green, 'DESK2QUANT');
    out.push(label);
    const body = isUser ? String(message.content || '') : formatTerminalMath(String(message.content || ''));
    for (const line of wrapText(body, available)) out.push(isUser ? color(ANSI.white, line) : styleAnswerLine(line));
    out.push('');
  }
  if (state.notice) {
    out.push(color(ANSI.bold + ANSI.yellow, 'SYSTEM'));
    for (const line of wrapText(state.notice, available)) out.push(color(ANSI.gray, line));
    out.push('');
  }
  if (out.length > heightBudget) return out.slice(out.length - heightBudget);
  return out;
}

function renderScreen(state) {
  const width = clamp(output.columns || 110, 72, 150);
  const height = clamp(output.rows || 34, 24, 60);
  const sidebarWidth = width >= 96 ? 24 : 0;
  const contentWidth = sidebarWidth ? width - sidebarWidth - 5 : width - 4;
  const head = renderHeader(state, width);
  const budget = Math.max(8, height - head.length - 5);
  const chat = chatLines(state, contentWidth, budget);
  const side = sidebarWidth ? sidebarLines(state) : [];
  const bodyRows = Math.max(chat.length, side.length, 8);
  const lines = [...head];
  for (let i = 0; i < bodyRows; i += 1) {
    const sideText = sidebarWidth ? pad(side[i] || '', sidebarWidth) : '';
    const chatText = pad(chat[i] || '', contentWidth);
    if (sidebarWidth) lines.push(`│ ${sideText} │ ${chatText} │`);
    else lines.push(`│ ${chatText} │`);
  }
  lines.push(divider(width));
  const status = ` ${String(state.tier || 'pro').toUpperCase()} | mode ${state.mode}${state.mode === 'auto' ? `→${state.lastMode || 'learn'}` : ''} | depth ${state.depth} | ${state.remaining ?? '?'} requests left | /help `;
  lines.push(`│${pad(color(ANSI.dim, truncate(status, width - 2)), width - 2)}│`);
  lines.push(bottom(width));

  if (output.isTTY) output.write(`${ESC}2J${ESC}H`);
  output.write(lines.join('\n') + '\n');
}

async function withSpinner(promise, label = 'Reasoning') {
  if (!output.isTTY) return promise;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const timer = setInterval(() => {
    output.write(`\r${ESC}2K${color(ANSI.cyan, frames[i++ % frames.length])} ${label}…`);
  }, 90);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
    output.write(`\r${ESC}2K`);
  }
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
  const body = [
    '# Desk2Quant Quant Agent Session',
    '',
    `- Account: ${state.email}`,
    `- Mode: ${state.mode}`,
    `- Depth: ${state.depth}`,
    `- Exported: ${new Date().toISOString()}`,
    '',
    ...state.history.flatMap((m) => [
      `## ${m.role === 'user' ? 'You' : 'Desk2Quant'}`,
      '',
      String(m.content || ''),
      ''
    ])
  ].join('\n');
  await fs.writeFile(file, body, 'utf8');
  return file;
}

function helpText() {
  return [
    'Ask naturally; the agent automatically routes to learn/solve/practice/interview/project.',
    '/mode auto|learn|solve|practice|interview|project — override routing',
    '/depth concise|standard|deep — control answer depth',
    '/progress — usage and activity',
    '/skills — calibrated assessment skills',
    '/assess <skill> — start an adaptive question',
    '/submit <id> <answer> — grade an adaptive question',
    '/context — show active local context',
    '/history — show recent prompts',
    '/sources — show source metadata from the latest response when available',
    '/new — start a fresh conversation',
    '/export — save the session as Markdown',
    '/clear — clear transient system notices',
    '/quit — exit the TUI'
  ].join('\n');
}

async function handleSlash(command, state) {
  const { name, args, raw } = command;
  if (name === 'help') { state.notice = helpText(); return false; }
  if (name === 'quit' || name === 'exit') return true;
  if (name === 'mode') {
    const next = String(args[0] || '').toLowerCase();
    if (!MODES.has(next)) state.notice = `Mode must be one of: ${[...MODES].join(', ')}`;
    else { state.mode = next; state.notice = `Mode set to ${next}.`; }
    return false;
  }
  if (name === 'depth') {
    const next = String(args[0] || '').toLowerCase();
    if (!DEPTHS.has(next)) state.notice = `Depth must be one of: ${[...DEPTHS].join(', ')}`;
    else { state.depth = next; state.notice = `Answer depth set to ${next}.`; }
    return false;
  }
  if (name === 'progress') {
    const result = await withSpinner(getProgress(), 'Loading progress');
    state.remaining = result?.progress?.remainingToday ?? state.remaining;
    state.notice = formatProgress(result.progress);
    return false;
  }
  if (name === 'skills') {
    const result = await withSpinner(getSkills(), 'Loading skills');
    state.notice = `${formatSkills(result.skills)}${result.note ? `\n\n${result.note}` : ''}`;
    return false;
  }
  if (name === 'assess') {
    if (!raw) { state.notice = 'Usage: /assess <skill>'; return false; }
    const result = await withSpinner(startAssessment(raw), 'Preparing assessment');
    state.notice = `Assessment ID: ${result.assessmentId}\nSkill: ${result.skill} | difficulty b=${Number(result.difficulty).toFixed(2)} | current θ=${Number(result.currentTheta).toFixed(2)}\n\n${formatTerminalMath(result.question)}\n\nSubmit with: /submit ${result.assessmentId} "your answer"`;
    return false;
  }
  if (name === 'submit') {
    const id = args.shift();
    const answer = args.join(' ').replace(/^"|"$/g, '');
    if (!id || !answer) { state.notice = 'Usage: /submit <assessment-id> <answer>'; return false; }
    const result = await withSpinner(submitAssessment(id, answer), 'Grading');
    state.notice = `Score: ${(Number(result.score) * 100).toFixed(1)}%\nθ: ${Number(result.thetaBefore).toFixed(2)} → ${Number(result.thetaAfter).toFixed(2)}\nAttempts: ${result.attempts}\n\n${formatTerminalMath(result.feedback)}\n\n${formatTerminalMath(result.abilityNote)}`;
    return false;
  }
  if (name === 'context') {
    state.notice = `Account: ${state.email} (${state.tier})\nMode: ${state.mode}${state.mode === 'auto' ? ` → ${state.lastMode || 'learn'}` : ''}\nDepth: ${state.depth}\nConversation messages in local context: ${state.history.length}\nSession expires: ${new Date(Number(state.expiresAt)).toLocaleString()}`;
    return false;
  }
  if (name === 'history') {
    const prompts = state.history.filter((m) => m.role === 'user').slice(-8).map((m, i) => `${i + 1}. ${truncate(m.content, 110)}`);
    state.notice = prompts.length ? prompts.join('\n') : 'No conversation history yet.';
    return false;
  }
  if (name === 'sources') {
    const sources = state.lastMeta?.sources;
    state.notice = Array.isArray(sources) && sources.length
      ? sources.map((s, i) => `[${i + 1}] ${typeof s === 'string' ? s : JSON.stringify(s)}`).join('\n')
      : 'The latest backend response did not return source-level metadata. The agent still uses its server-side quant knowledge anchor, but it will not fabricate citations.';
    return false;
  }
  if (name === 'new') {
    state.history = [];
    state.notice = 'Started a fresh conversation. Previous local transcript was cleared.';
    await saveHistory(state.history);
    return false;
  }
  if (name === 'export') {
    const file = await exportTranscript(state);
    state.notice = `Session exported to:\n${file}`;
    return false;
  }
  if (name === 'clear') { state.notice = ''; return false; }
  state.notice = `Unknown command /${name}. Use /help.`;
  return false;
}

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
    lastMeta: null
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
        try {
          if (await handleSlash(slash, state)) break;
        } catch (err) {
          state.notice = `Error: ${err.message}`;
        }
        continue;
      }

      state.notice = '';
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
