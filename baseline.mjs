#!/usr/bin/env node
// The baseline CLI — the unified entry point (V2). Routes subcommands:
//   check   score a repo against the rule set (the default; delegates to the intact
//           check.mjs, so the golden corpus and CI keep invoking check.mjs directly)
//   orient  derived-state survey for session start — lanes, backlog, divergence
//   log     write one scrubbed, schema-valid session record (the forensic tier)
//   jdg     author/evaluate the judgment ledger (sign-offs, deviations, break-glass)
//   gen     generators — M4c: migrate-claims (the C17 monolith explosion)
//   scrub   scan record content for secret shapes (the pre-push hook's engine)
//   help    usage
// Zero-dependency. check.mjs / rules.json / src/ are co-located — invoke by absolute path.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
// A leading non-flag token is the subcommand; a leading --flag (or nothing) means `check`,
// so `baseline --repo x` stays back-compatible with the old `check.mjs --repo x` —
// EXCEPT --help/-h, which must reach the help branch, never run a scoring check.
const cmd = (argv[0] === '--help' || argv[0] === '-h') ? 'help'
  : (argv[0] && !argv[0].startsWith('-')) ? argv[0] : 'check'
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
} else if (cmd === 'log') {
  const { runLog } = await import('./src/log.mjs')
  process.exit(runLog(rest))
} else if (cmd === 'jdg') {
  const { runJdg } = await import('./src/jdg.mjs')
  process.exit(runJdg(rest))
} else if (cmd === 'gen') {
  const { runGen } = await import('./src/gen.mjs')
  process.exit(runGen(rest))
} else if (cmd === 'scrub') {
  const { runScrub } = await import('./src/scrubcli.mjs')
  process.exit(runScrub(rest))
} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`baseline <command> [options]

  check [--repo DIR] [--json] [--no-exec] [--profile P]   score a repo (default)
  orient [--repo DIR] [--json] [--strict]                 derived-state survey for session start
  log -m "..." [--next "..."] [--lane L] [--agent A]      write a scrubbed session record
      [--from FILE] [--allow ID --allow-reason "..."]     (stdin accepted; never \$EDITOR)
  jdg new --kind K --subject S --reason "..."             record a judgment (sign-off ·
      --review-by DATE [--expect p=v] [--tripwire "..."]  deviation · risk-acceptance · break-glass)
  jdg check [--repo DIR] [--json] [--facts FILE]          evaluate the ledger: tripwires · expiry · drift
  gen migrate-claims [--repo DIR]                         explode docs/CLAIMS.json into records/claims/
  scrub <file...> | --pushed SHA [--since SHA]            scan records for secret shapes (the pre-push
      [--allow ID --allow-reason "..."]                   hook's engine; one scan API with log/REC-02)
  help                                                    this message

  Run \`baseline\` with no command (or a leading --flag) to score, e.g. \`baseline --repo .\`.`)
  process.exit(0)
} else {
  console.error(`baseline: unknown command '${cmd}' (try: check, orient, log, jdg, gen, scrub, help)`)
  process.exit(2)
}
