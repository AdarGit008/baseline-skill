#!/usr/bin/env node
// The v3 RED suite runner. Deliberately NOT wired into .github/workflows/ci.yml: every
// assertion below states the TARGET of docs/v3/PLAN.md, so the suite is expected to fail
// until v3 lands. It is the burn-down list, not a gate.
//
//   node test/red/run.mjs            # run everything, report how much is still red (exit 0)
//   node test/red/run.mjs --green    # exit 1 while anything is still red (flip this into
//                                    # CI on the day v3 is done, then delete --green)
//   node test/red/run.mjs ids packs  # run only the named areas
//
// BASELINE_RED_ROOT=<repo> points the whole suite at a repo other than the one it sits in.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// area -> the PLAN.md invariants it owns. The union must be V1..V37, and the runner
// checks that itself: a suite added without registering its invariants is a silent gap.
const AREAS = [
  ['ids', 'PLAN §2 — rule ids carry three parts', [5, 6, 7]],
  ['deletions', 'PLAN §3 — delete 15 rules, and their machinery', [8, 9, 10, 11, 12]],
  ['retarget', 'PLAN §4 — retarget three REC rules, delete the ledger', [13, 14]],
  ['packs', 'PLAN §5 — five opt-in packs', [15, 16]],
  ['scope', 'PLAN §6 — derive the scope from the repo', [17, 18, 19, 20]],
  ['seams', 'PLAN §1 + §7 — the four-part shape and the three seams', [1, 2, 3, 4, 21, 22, 23, 24, 25, 26, 27, 28]],
  ['surface', 'PLAN §8 + §9 — orient v2, the SKILL.md diet, the drift', [29, 30, 31, 32, 33]],
  ['decisions', 'PLAN §10 — the five decisions of 2026-08-25', [34, 35, 36, 37]],
]

const TOTAL_INVARIANTS = 37
const argv = process.argv.slice(2)
const GREEN = argv.includes('--green')
const only = argv.filter(a => !a.startsWith('-'))
const selected = only.length ? AREAS.filter(([n]) => only.includes(n)) : AREAS

// coverage self-check: V1..V37, each owned exactly once
{
  const owned = AREAS.flatMap(([, , vs]) => vs).sort((a, b) => a - b)
  const missing = []
  for (let v = 1; v <= TOTAL_INVARIANTS; v++) if (!owned.includes(v)) missing.push(`V${v}`)
  const dupes = owned.filter((v, i) => owned.indexOf(v) !== i).map(v => `V${v}`)
  if (missing.length || dupes.length) {
    console.error(`red suite coverage is broken — unowned: ${missing.join(',') || 'none'}; owned twice: ${dupes.join(',') || 'none'}`)
    process.exit(2)
  }
}

const rows = []
for (const [name, blurb, vs] of selected) {
  console.log(`\n=== ${name}  ·  ${blurb}  ·  ${vs.map(v => 'V' + v).join(' ')}`)
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [path.join(HERE, `${name}.mjs`)], { encoding: 'utf8', env: process.env })
  process.stdout.write(r.stdout || '')
  if (r.stderr) process.stderr.write(r.stderr)
  const m = (r.stdout || '').match(/\[(\S+)\] (?:(\d+)\/(\d+) still red|all green \((\d+)\))/)
  const red = m ? (m[2] ? Number(m[2]) : 0) : null
  const total = m ? Number(m[3] || m[4]) : null
  rows.push({ name, vs, red, total, crashed: r.status !== 0 && !m, ms: Date.now() - t0 })
}

console.log('\n' + '─'.repeat(74))
console.log('  v3 RED suite — burn-down')
console.log('  area        invariants                                 red/total   state')
let totalRed = 0, totalAll = 0, crashed = 0
for (const r of rows) {
  const vs = r.vs.map(v => 'V' + v).join(' ')
  if (r.crashed) { crashed++; console.log(`  ${r.name.padEnd(11)} ${vs.padEnd(42)} ${'—'.padStart(9)}   CRASHED`); continue }
  totalRed += r.red ?? 0; totalAll += r.total ?? 0
  console.log(`  ${r.name.padEnd(11)} ${vs.padEnd(42)} ${String(`${r.red}/${r.total}`).padStart(9)}   ${r.red === 0 ? 'GREEN' : 'red'}`)
}
console.log('─'.repeat(74))
const areasRed = rows.filter(r => (r.red ?? 1) > 0 || r.crashed).length
console.log(`  ${totalRed}/${totalAll} assertions still red across ${areasRed}/${rows.length} areas` + (crashed ? ` · ${crashed} area(s) crashed` : ''))
console.log(`  invariants covered: ${selected.flatMap(([, , v]) => v).length}/${TOTAL_INVARIANTS}\n`)

// Default exit 0: red is the expected state of this suite. --green flips it into a gate.
process.exit(GREEN && (totalRed > 0 || crashed) ? 1 : 0)
