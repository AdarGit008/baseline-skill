#!/usr/bin/env node
// The baseline CLI — the unified entry point (V2). Routes subcommands:
//   check   score a repo against the rule set (the default; delegates to the intact
//           check.mjs, so the golden corpus and CI keep invoking check.mjs directly)
//   orient  five-line survey for session start — repo · work · graph · knowledge · score
//   log     write one scrubbed, schema-valid session record (the forensic tier)
//   jdg     author/evaluate the judgment ledger (sign-offs, deviations, break-glass)
//   explain what a rule checks and why — the okf-rag read seam (display only, never a verdict)
//   gen     generators — index views, migrate-claims, okf-concepts (the one-shot OKF migration)
//   trust   the trust circle — the tools THIS repo adopted (add/remove), and the committed
//           stamps that let CI gate an artifact it never clones (verifiable vs recorded-only)
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
} else if (cmd === 'admit') {
  const { runAdmit } = await import('./src/admit.mjs')
  process.exit(runAdmit(rest))
} else if (cmd === 'reconcile') {
  const { runReconcile } = await import('./src/reconcile.mjs')
  process.exit(runReconcile(rest))
} else if (cmd === 'orient') {
  const { runOrient } = await import('./src/orient.mjs')
  process.exit(await runOrient(rest))
} else if (cmd === 'log') {
  const { runLog } = await import('./src/log.mjs')
  process.exit(runLog(rest))
} else if (cmd === 'jdg') {
  const { runJdg } = await import('./src/jdg.mjs')
  process.exit(runJdg(rest))
} else if (cmd === 'explain') {
  const { runExplain } = await import('./src/explain.mjs')
  process.exit(runExplain(rest))
} else if (cmd === 'gen') {
  const { runGen } = await import('./src/gen.mjs')
  process.exit(runGen(rest))
} else if (cmd === 'trust') {
  const { runTrust } = await import('./src/trust.mjs')
  process.exit(runTrust(rest))
} else if (cmd === 'scrub') {
  const { runScrub } = await import('./src/scrubcli.mjs')
  process.exit(runScrub(rest))
} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`baseline <command> [options]

  check [--repo DIR] [--json] [--no-exec] [--profile P]   score a repo (default)
  admit [--repo DIR] [--target REF] [--json]              merge-point revalidation — a verdict is
                                                          valid only for the state it evaluated
                                                          (exit 1 = refused: stale/blocker/source-loss)
  reconcile [--repo DIR] [--json] [--dry-run]             post-merge revalidation of the default
      [--target REF]                                      branch; findings file as dedup'd issues
                                                          (exit 1 = delivery failed: tracker unreachable
                                                          or a write failed — even with zero findings)
  orient [--repo DIR] [--json]                            five-line survey for session start: repo ·
                                                          work · graph · knowledge · score (fetches
                                                          first and warns how far behind you are —
                                                          never pulls, never spawns gh; exit 0)
  explain <rule-id> [--json]                              what a rule checks and why: its title and
                                                          rationale, plus the concept from the okf bundle
                                                          when BASELINE_OKF_BUNDLE names one (display
                                                          only — never a verdict; degrades to the title)
  explain --audit [--json]                                every rule id resolves to a concept file in
                                                          the bundle, by filename (exit 1 = a hole)
  log -m "..." [--next "..."] [--lane L] [--agent A]      write a scrubbed session record
      [--from FILE] [--allow ID --allow-reason "..."]     (stdin accepted; never \$EDITOR)
  jdg new --kind K --subject S --reason "..."             record a judgment (sign-off ·
      --review-by DATE [--expect p=v] [--tripwire "..."]  deviation · risk-acceptance · break-glass)
  jdg check [--repo DIR] [--json] [--facts FILE]          evaluate the ledger: tripwires · expiry · drift
  gen index [--repo DIR] [--out PATH]                     write a deterministic, marker-headed index
  gen --check [--repo DIR]                                view (default docs/INDEX.md); --check is the
                                                          CI drift guard (zero views = trivially green)
  gen migrate-claims [--repo DIR]                         explode docs/CLAIMS.json into records/claims/
  gen okf-concepts [--repo DIR]                           stage one proposed concept per rule under
                                                          .baseline/proposed/ — deterministic extraction
                                                          from the shipped docs; the bundle is never written
  trust setup [--repo DIR] [--json]                       the trust circle — what this repo trusts and
                                                          what a fresh repo must wire (the bootstrapper
                                                          surface, derived from the plugin table)
  trust add NAME [--repo DIR] [--path P] [--ignored B]    adopt a tool: writes plugins.<name> into
                                                          baseline.config.json, and its rule starts
                                                          gating this build
  trust remove NAME [--repo DIR] [--json]                 drop a member: deletes the key, and the tool
                                                          goes back to a suggestion (n/a, never a finding)
  trust stamp [--repo DIR] [--member NAME] [--json]       write/refresh .baseline/trust/<member>.json so
                                                          CI can gate an artifact it never sees; commit
                                                          them. A RECORDED-ONLY stamp is re-asserted only
                                                          when named with --member
  trust verify [--repo DIR] [--json]                      recheck the committed stamps against the tracked
                                                          tree — graphify's hashes are RECOMPUTED (exit 1
                                                          on stale/broken); okf-rag's prints as the
                                                          unverifiable claim it is (never a gate)
  scrub <file...> | --pushed SHA [--since SHA]            scan records for secret shapes (the pre-push
      [--allow ID --allow-reason "..."]                   hook's engine; one scan API with log/REC-02)
  help                                                    this message

  Run \`baseline\` with no command (or a leading --flag) to score, e.g. \`baseline --repo .\`.`)
  process.exit(0)
} else {
  console.error(`baseline: unknown command '${cmd}' (try: check, admit, reconcile, orient, explain, log, jdg, gen, trust, scrub, help)`)
  process.exit(2)
}
