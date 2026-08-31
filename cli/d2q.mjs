#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  COMMANDS,
  HELP,
  exchangeMagicLink,
  formatProgress,
  getProgress,
  loadConfig,
  logout,
  requestLogin,
  runCommand
} from './engine.mjs';

const VERSION = '1.0.0';

function hasFlag(args, flag) { return args.includes(flag); }
function withoutFlags(args) { return args.filter(a => !a.startsWith('--')); }
function print(value, json = false) {
  if (json) return console.log(JSON.stringify(value, null, 2));
  if (typeof value === 'string') return console.log(value);
  if (value?.content) {
    console.log(value.content);
    if (value.meta?.remainingToday !== undefined) console.log(`\n[${value.meta.remainingToday} requests remaining today]`);
    return;
  }
  console.log(value);
}

async function login(email, rl, json = false) {
  await requestLogin(email);
  if (!json) {
    console.log('A Desk2Quant sign-in link has been requested.');
    console.log('Open your email, copy the complete "My Access" sign-in URL, and paste it below.');
  }
  const link = (await rl.question('Magic link > ')).trim();
  const result = await exchangeMagicLink(link);
  if (json) return print({ success: true, email: result.config.email, tier: result.tier, expiresAt: result.expiresAt, progress: result.progress }, true);
  console.log(`Signed in as ${result.config.email} (${result.tier}).`);
  if (result.progress) console.log('\n' + formatProgress(result.progress));
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
  const rl = readline.createInterface({ input, output });

  try {
    if (args.length) return await execute(args[0].toLowerCase(), args.slice(1), rl, json);

    console.log(`Desk2Quant Quant Agent CLI ${VERSION}`);
    const cfg = await loadConfig();
    console.log(cfg ? `Signed in: ${cfg.email}` : 'Not signed in. Type: login <purchase-email>');
    console.log('Type help for commands, or exit.');

    while (true) {
      const line = (await rl.question('d2q > ')).trim();
      if (!line) continue;
      if (['exit', 'quit'].includes(line.toLowerCase())) break;
      const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const clean = parts.map(p => p.replace(/^"|"$/g, ''));
      const command = String(clean.shift() || '').toLowerCase();
      try { await execute(command, clean, rl, false); }
      catch (err) { console.error(`Error: ${err.message}`); }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`Desk2Quant CLI: ${err.message}`);
  process.exitCode = 1;
});
