#!/usr/bin/env node
// The baseline CLI — the unified entry point (V2). Routes subcommands:
//   check   score a repo against rules.json (the default; delegates to the intact
//           check.mjs, so the golden corpus and CI keep invoking check.mjs directly)
//   orient  derived-state survey for session start — lanes, backlog, divergence
//   help    usage
// Zero-dependency. check.mjs / rules.json / src/ are co-located — invoke by absolute path.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
// A leading non-flag token is the subcommand; a leading --flag (or nothing) means `check`,
// so `baseline --repo x` stays back-compatible with the old `check.mjs --repo x`.
const cmd = (argv[0] && !argv[0].startsWith('-')) ? argv[0] : 'check'
const rest = (argv[0] === cmd) ? argv.slice(1) : argv

function delegateToCheck() {
  try { execFileSync(process.execPath, [path.join(HERE, 'check.mjs'), ...rest], { stdio: 'inherit' }) }
  catch (e) { process.exit(e.status ?? 1) }
  process.exit(0)
}

if (cmd === 'check') {
  delegateToCheck()
} else if (cmd === 'orient') {
  const { runOrient } = await import('./src/orient.mjs')
  process.exit(await runOrient(rest))
} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`baseline <command> [options]

  check [--repo DIR] [--json] [--no-exec] [--profile P]   score a repo (default)
  orient [--repo DIR] [--json] [--strict]                 derived-state survey for session start
  help                                                    this message

  Run \`baseline\` with no command (or a leading --flag) to score, e.g. \`baseline --repo .\`.`)
  process.exit(0)
} else {
  console.error(`baseline: unknown command '${cmd}' (try: check, orient, help)`)
  process.exit(2)
}
