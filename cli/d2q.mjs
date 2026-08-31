#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  COMMANDS,
  HELP,
  exchangeMagicLink,
  formatProgress,
  formatSkills,
  formatTerminalMath,
  getProgress,
  getSkills,
  loadConfig,
  logout,
  requestLogin,
  runCommand,
  startAssessment,
  submitAssessment
} from './engine.mjs';
import { startTui } from './tui.mjs';

const VERSION = '2.0.0';

function hasFlag(args, flag) { return args.includes(flag); }
function withoutFlags(args) { return args.filter(a => !a.startsWith('--')); }
function print(value, json = false) {
  if (json) return console.log(JSON.stringify(value, null, 2));
  if (typeof value === 'string') return console.log(formatTerminalMath(value));
  if (value?.content) {
    console.log(formatTerminalMath(value.content));
    if (value.meta?.remainingToday !== undefined) console.log(`\n[${value.meta.remainingToday} requests remaining today]`);
    return;
  }
  console.log(value);
}

async function login(email, rl, json = false) {
  await requestLogin(email);
  if (!json) {
    console.log('A Desk2Quant sign-in link has been requested.');
    console.log('Open your email and copy the raw Desk2Quant URL shown in the "Using the Quant Agent CLI?" box.');
    console.log('Paste that complete https://desk2quant.com/my-access.html?email=...&tk=... URL below.');
  }
  const link = (await rl.question('Magic link > ')).trim();
  const result = await exchangeMagicLink(link);
  if (json) return print({ success: true, email: result.config.email, tier: result.tier, expiresAt: result.expiresAt, progress: result.progress }, true);
  console.log(`Signed in as ${result.config.email} (${result.tier}).`);
  if (result.progress) console.log('\n' + formatProgress(result.progress));
  console.log('\nRun `d2q` to open the dedicated Quant Agent interface.');
}

async function execute(command, rest, rl, json = false) {
  if (command === 'help') return console.log(HELP);
  if (command === 'login') {
    const email = rest.join(' ').trim();
    if (!email) throw new Error('Usage: d2q login <purchase-email>');
    return login(email, rl, json);
  }
  if (command === 'logout') {
    const removed = await logout();
    return print(json ? { success: true, removed } : (removed ? 'Signed out.' : 'No local Desk2Quant session was present.'), json);
  }
  if (command === 'whoami') {
    const cfg = await loadConfig();
    if (!cfg) throw new Error('Not signed in. Run `d2q login <purchase-email>`.');
    const info = { email: cfg.email, tier: cfg.tier, expiresAt: cfg.expiresAt, baseUrl: cfg.baseUrl };
    return print(json ? info : `${cfg.email} (${cfg.tier})\nSession expires: ${new Date(Number(cfg.expiresAt)).toLocaleString()}`, json);
  }
  if (command === 'progress') {
    const result = await getProgress();
    return print(json ? result : formatProgress(result.progress), json);
  }
  if (command === 'skills') {
    const result = await getSkills();
    return print(json ? result : `${formatSkills(result.skills)}\n\n${result.note || ''}`.trim(), json);
  }
  if (command === 'assess') {
    const result = await startAssessment(rest.join(' ').trim());
    if (json) return print(result, true);
    console.log(`Assessment ID: ${result.assessmentId}`);
    console.log(`Skill: ${result.skill} | difficulty b=${Number(result.difficulty).toFixed(2)} | current theta=${Number(result.currentTheta).toFixed(2)}`);
    console.log(`\n${formatTerminalMath(result.question)}`);
    console.log(`\nSubmit with:\n  d2q submit ${result.assessmentId} "your answer"`);
    return;
  }
  if (command === 'submit') {
    const assessmentId = rest.shift();
    const answer = rest.join(' ').trim();
    const result = await submitAssessment(assessmentId, answer);
    if (json) return print(result, true);
    console.log(`Score: ${(Number(result.score) * 100).toFixed(1)}%`);
    console.log(`Theta: ${Number(result.thetaBefore).toFixed(2)} -> ${Number(result.thetaAfter).toFixed(2)}`);
    console.log(`Attempts: ${result.attempts}`);
    console.log(`\n${formatTerminalMath(result.feedback)}`);
    console.log(`\n${formatTerminalMath(result.abilityNote)}`);
    return;
  }
  if (command === 'tui') return startTui();
  if (COMMANDS.has(command)) {
    const query = rest.join(' ').trim();
    const result = await runCommand(command, query);
    return print(result, json);
  }
  throw new Error(`Unknown command "${command}". Run d2q --help.`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) return console.log(HELP);
  if (rawArgs.includes('--version') || rawArgs.includes('-v')) return console.log(`Desk2Quant Quant Agent CLI ${VERSION}`);
  const json = hasFlag(rawArgs, '--json');
  const args = withoutFlags(rawArgs);

  if (!args.length) {
    const cfg = await loadConfig();
    if (!cfg) {
      console.log(`Desk2Quant Quant Agent CLI ${VERSION}`);
      console.log('Not signed in.');
      console.log('Run: d2q login <purchase-email>');
      return;
    }
    return startTui();
  }

  const rl = readline.createInterface({ input, output });
  try {
    return await execute(args[0].toLowerCase(), args.slice(1), rl, json);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`Desk2Quant CLI: ${err.message}`);
  process.exitCode = 1;
});
