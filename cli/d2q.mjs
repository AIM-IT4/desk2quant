#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { runCommand, HELP } from './engine.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return console.log(HELP);
  if (args.includes('--version') || args.includes('-v')) return console.log('Desk2Quant Quant Agent CLI 0.1.0');

  if (args.length) {
    const command = args[0];
    const query = args.slice(1).join(' ');
    console.log(await runCommand(command, query));
    return;
  }

  console.log('Desk2Quant Quant Agent CLI\nType learn, solve, practice, interview, project, help, or exit.');
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const line = (await rl.question('d2q > ')).trim();
      if (!line) continue;
      if (['exit', 'quit'].includes(line.toLowerCase())) break;
      if (line === 'help') { console.log(HELP); continue; }
      const [command, ...rest] = line.split(/\s+/);
      try { console.log(await runCommand(command, rest.join(' '))); }
      catch (err) { console.error(`Error: ${err.message}`); }
    }
  } finally { rl.close(); }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
