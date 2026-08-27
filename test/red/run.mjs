#!/usr/bin/env node
// The v3 suite runner — every assertion states an invariant of docs/v3/PLAN.md. It was
// written RED, as the burn-down list for v3, and is now green by construction: the CI
// step "v3 invariants" runs it with --green, so a regression against the plan fails the
// build the same way a golden-corpus drift does.
//
//   node test/red/run.mjs            # run everything, report per area (always exit 0)
//   node test/red/run.mjs --green    # exit 1 while anything is red — the CI form
//   node test/red/run.mjs ids packs  # run only the named areas
//
// --green stays: without it the runner is a report (useful while an area is being
// reworked); with it the runner is a gate. Only the gate is wired into CI.
//
// BASELINE_RED_ROOT=<repo> points the whole suite at a repo other than the one it sits in.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// area -> the PLAN.md invariants it owns. The union must be every LIVE invariant, V1..V43
// minus the four §11 withdrew, and the runner checks that itself: a suite added without
// registering its invariants is a silent gap.
const AREAS = [
  ['ids', 'PLAN §2 — rule ids carry three parts', [5, 6, 7]],
  ['deletions', 'PLAN §3 — delete 15 rules, and their machinery', [8, 9, 10, 11, 12]],
  ['retarget', 'PLAN §4 — retarget three REC rules, delete the ledger', [13]],
  ['packs', 'PLAN §5 — five opt-in packs', [15, 16]],
  ['scope', 'PLAN §6 — derive the scope from the repo', [17, 18, 19, 20]],
  ['seams', 'PLAN §1 + §7 — the four-part shape and the three seams', [1, 2, 3, 4, 24, 25, 26, 27, 28]],
  ['surface', 'PLAN §8 + §9 — orient v2, the SKILL.md diet, the drift', [29, 30, 31, 32, 33]],
  ['decisions', 'PLAN §10 — the five decisions of 2026-08-25', [34, 35, 36, 37]],
  ['plugins', 'PLAN §11 — the plugin boundary, and v4 trust-circle membership', [38, 39, 40, 41, 42, 43]],
  ['layer', 'v4 — the baseline rules layer: every non-plugin rule, opt-out, default in', [44]],
]

// V43 is the v4 addition: TRUST-CIRCLE MEMBERSHIP — a supported tool a repo never adopted
// is a SUGGESTION (n/a, out of the exit gate), and a declared MEMBER whose artifact is
// missing is a blocker. It lives with the plugin boundary because it is the same family's
// gate, read one step earlier.
//
// V44 is its mirror, and the second v4 addition: THE BASELINE RULES LAYER. Every rule that
// is NOT a plugin rule is one layer a repo opts in or out of at setup time, DEFAULT IN —
// the opt-OUT half of the same story, in its own area because nothing in PLAN §11 covers
// it. Out means n/a and out of the gate, exactly as an unadopted plugin is, and the layer's
// state is printed on every run so the opt-out can never be a silent hole.
//
// PLAN §11 "Superseded": V14 (REC-06 freshness), V21, V22, V23 (tdd.json as evidence) are
// withdrawn — D7 forbids the artifact reading they required. They are not expected to be
// owned, never counted as a hole, and a file that still asserts them is not registering
// them here. The live total is derived from the highest id and this list, never typed in.
const WITHDRAWN = [14, 21, 22, 23]
const MAX_INVARIANT = 44
const TOTAL_INVARIANTS = MAX_INVARIANT - WITHDRAWN.length
const argv = process.argv.slice(2)
const GREEN = argv.includes('--green')
const only = argv.filter(a => !a.startsWith('-'))
const selected = only.length ? AREAS.filter(([n]) => only.includes(n)) : AREAS

// coverage self-check: every live invariant in V1..V43, each owned exactly once
{
  const owned = AREAS.flatMap(([, , vs]) => vs).sort((a, b) => a - b)
  const missing = []
  for (let v = 1; v <= MAX_INVARIANT; v++) if (!WITHDRAWN.includes(v) && !owned.includes(v)) missing.push(`V${v}`)
  const dead = owned.filter(v => WITHDRAWN.includes(v)).map(v => `V${v}`)
  if (dead.length) { console.error(`red suite coverage is broken — withdrawn (PLAN §11) but still registered: ${dead.join(',')}`); process.exit(2) }
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
