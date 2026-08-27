// Scorecard rendering: human-readable per-category report or --json machine
// output. Both return the process exit code (1 if any blocker FAILed).
//
// D4 (PLAN §10, V36): a result row is one of two things, never a third —
//   · EVALUATED  { r, tag: PASS|FAIL|WARN|DIVERGED, detail }   — counted, rendered, exits
//   · N/A        { r, state: 'n/a', reason }                   — --json only, no tag
// "Didn't apply" and "passed" are different facts. A human reads only what was
// evaluated (no SKIP row, no n/a tally, no HEAD=n/a); a machine reads both, and
// summary.total counts the evaluated rows alone (scope.mjs V17).
import path from 'node:path'
import { sanitizeTTY } from './util.mjs'
import { baselineLayerOf, LAYER_KEY } from './repo.mjs'
import { isBaselineRule } from './engine.mjs'

export const CATS = { build: 'Build & execution', quality: 'Code quality', test: 'Tests & invariants', security: 'Security & supply-chain', repro: 'Reproducibility', ops: 'Operability (service)', governance: 'Change governance', community: 'Community & onboarding', context: 'Context management', claims: 'Claims discipline', records: 'Records & ledger', desc: 'Repo descriptor', plugins: 'Plugins' }

export function makeColor(JSON_OUT) {
  return (c, s) => (process.stdout.isTTY && !JSON_OUT) ? `\x1b[${c}m${s}\x1b[0m` : s
}

// M7a: a blocker-severity row fails whether it tagged FAIL or DIVERGED — the
// verdict class is preserved in the output; the EXIT treats both as blocking.
// One predicate, every counting seam (both reports here, admit's leg (b)).
export const isBlocking = x => x.r.severity === 'blocker' && (x.tag === 'FAIL' || x.tag === 'DIVERGED')

// The D4 row predicate, ONE home for every seam that counts or renders results (check,
// admit, reconcile). An n/a row carries `state` and no tag; a tagless row is n/a by
// construction. A legacy SKIP tag is read as n/a too, so the output shape holds while
// the engine's gates finish moving to the no-row / state:'n/a' contract.
export const isNA = x => x.state === 'n/a' || x.tag == null || x.tag === 'SKIP'
export const evaluated = results => results.filter(x => !isNA(x))

// the --json row: identity + (tag, detail) for an evaluated rule, (state, reason) for an
// n/a one. `pack` names the opt-in pack the rule belongs to (null = always-on); the
// rule-side `profile` key is retired (§11 D13). Row-level extras a family attaches
// (PLUG's `log`, a `fix`) ride through when present, never as empty keys.
export const rowJson = x => {
  const base = { id: x.r.id, category: x.r.category, severity: x.r.severity, pack: x.r.pack ?? null }
  if (isNA(x)) return { ...base, state: 'n/a', reason: String(x.reason || x.detail || 'not applicable') }
  const extra = {}
  for (const k of ['log', 'fix']) if (x[k] != null) extra[k] = x[k]
  return { ...base, tag: x.tag, detail: x.detail, ...extra }
}

// the shared summary: every key counts evaluated rows only; no skip, no signoff
export function summarize(results) {
  const ev = evaluated(results)
  const n = t => ev.filter(x => x.tag === t).length
  return { blockers: results.filter(isBlocking).length, pass: n('PASS'), warn: n('WARN'), fail: n('FAIL'), diverged: n('DIVERGED'), total: ev.length }
}

// ---------------------------------------------------------------- v4 the trust circle
//
// The enabler property, rendered. baseline SUPPORTS a table of tools; a repo ADOPTS the
// ones its baseline.config.json `plugins` names (repo.mjs `member` — key presence, a fact
// about the config, not a guess about the tree). A MEMBER's rule gates. A SUGGESTION
// resolves n/a, stays out of summarize() and out of the exit code, and is offered HERE
// instead — output, never a verdict.
//
// Both lists are derived, never typed: the names come from the rules that actually ran
// (`check.plugin`), so a roster entry no rule stands for — my-onto, fail-silent until it
// exists — is never offered as something this repo could adopt today.
export function trustSummary(results, cfg) {
  const named = [...new Set((results || []).map(x => x?.r?.check?.plugin).filter(n => typeof n === 'string' && n))]
  const P = (cfg && cfg.plugins) || {}
  return { members: named.filter(n => P[n]?.member), suggested: named.filter(n => !P[n]?.member) }
}

// ---------------------------------------------------------------- v4 the baseline rules layer
//
// The other half of the opt-in story, and the half whose default is IN. Every non-plugin
// rule is a LAYER a repo opts in or out of at setup time; opting OUT makes those rules n/a
// and takes them out of the AND-gate, which is exactly the treatment an unadopted plugin
// gets — so it MUST be as visible as membership is, or it becomes a way to hide a failing
// rule. Hence: rendered on every run (in and out), and machine-visible in --json beside
// `trust`. The rule ids are DERIVED from the rows that ran, never a second hand-kept list.
export function baselineSummary(results, cfg) {
  const l = baselineLayerOf(cfg)
  const rules = (results || []).filter(x => x?.r && isBaselineRule(x.r)).map(x => x.r.id)
  return { layer: l.in ? 'in' : 'out', source: l.source, key: LAYER_KEY, rules }
}

/** The layer's state for the human render: one line, plus one line of consequence. Printed
 *  whether the layer is in or out — an opted-out layer that said nothing would be a silent
 *  hole in the gate, which is the one thing this must never be. */
function baselineLines(results, cfg, color) {
  const b = baselineSummary(results, cfg)
  if (!b.rules.length) return []
  const how = b.source === 'config' ? `${LAYER_KEY} in baseline.config.json` : 'the default — no ' + LAYER_KEY + ' key'
  if (b.layer === 'in') {
    return ['  ' + color(1, 'Baseline layer') + `  IN (${how})  ·  ${b.rules.length} rule(s) in scope — a finding among them fails this build`]
  }
  return [
    '  ' + color(1, 'Baseline layer') + `  ${color(33, 'OUT')} (${how})  ·  ${b.rules.length} rule(s) muted: ${b.rules.map(sanitizeTTY).join(', ')}`,
    color(90, `                  a muted rule produces no finding and is excluded from the exit code — nothing below was checked for them. \`baseline trust setup --baseline-rules in\` puts the layer back.`),
  ]
}

/** The suggestion surface for the human render: at most two lines, and silent about
 *  nothing — a repo with a full circle still gets told what it adopted. */
function trustLines(results, cfg, color) {
  const t = trustSummary(results, cfg)
  if (!t.members.length && !t.suggested.length) return []
  const S = sanitizeTTY
  const lines = []
  if (!t.members.length) {
    lines.push('  ' + color(1, 'Trust circle') + `  no members — ${t.suggested.length} supported tool(s) suggested: ${t.suggested.map(S).join(', ')}`)
    lines.push(color(90, `                a suggestion is not a finding and can never fail this build. \`baseline trust setup\` prints the recommended config; \`baseline trust add <tool>\` adopts one, and then it gates.`))
  } else {
    lines.push('  ' + color(1, 'Trust circle') + `  ${t.members.length} member(s): ${t.members.map(S).join(', ')}${t.suggested.length ? `  ·  also suggested (not gated): ${t.suggested.map(S).join(', ')}` : ''}`)
    if (t.suggested.length) lines.push(color(90, `                \`baseline trust add <tool>\` adopts one; \`baseline trust remove <tool>\` drops a member.`))
  }
  return lines
}

// packs the run activated — the JSON's `packs` and the human header. 'core' is not a
// pack (it is what is left when every pack is off), so it never prints as one.
const packsOf = ACTIVE => [...(ACTIVE || [])].filter(p => p !== 'core')

export function reportJson({ results, REPO, cfg, ACTIVE, HEAD, lane = null }) {
  const packs = packsOf(ACTIVE)
  const out = {
    repo: REPO, project_type: cfg.project_type, packs,
    // `profiles` is the config key and the --profile flag's spelling (§11 D13: "a
    // `profiles` list, alias `packs`"), kept as the same list under the older name
    profiles: packs,
    head: HEAD,
    ...(lane ? { lane: { name: lane.lane, basis: lane.basis, event: lane.event } } : {}),
    // V28 (§7.3): no get_knowledge result is read during check — the verdict's
    // provenance says so on every run, so a consumer can tell "not consulted" from
    // "consulted and silent"
    provenance: { knowledge: 'not-consulted' },
    // v4: which plugins this repo ADOPTED (their PLUG rules gate) and which baseline merely
    // SUGGESTS (n/a rows, never an exit code). Machine-visible so a CI reader can tell an
    // unadopted tool from a passing one without re-parsing the config.
    trust: trustSummary(results, cfg),
    // v4: the baseline rules layer — 'in' (the default: the non-plugin rules gate) or 'out'
    // (they are n/a rows and cannot reach the exit code). Machine-visible beside `trust` so
    // a CI reader can tell a muted rule from a passing one without re-parsing the config.
    baseline: baselineSummary(results, cfg),
    results: results.map(rowJson),
  }
  out.summary = summarize(results)
  console.log(JSON.stringify(out, null, 2))
  return out.summary.blockers ? 1 : 0
}

// The human row: one line per EVALUATED rule — tag, id, title, detail — grouped by
// category; n/a rows are not rendered at all (D4). Shared with admit so the two
// merge-time surfaces read the same. Returns the lines; the caller prints.
export function humanRows(results, color) {
  const TAG = { PASS: color(32, 'PASS'), FAIL: color(31, 'FAIL'), WARN: color(33, 'WARN'), DIVERGED: color(31, 'DIVERGED') }
  // pad to the widest tag (DIVERGED = 8) by VISIBLE width — color the tag, then
  // append spaces, so the id column aligns in both TTY (ANSI-wrapped) and pipe modes
  const TAGW = 8
  const tagCell = t => (TAG[t] ?? color(90, String(t))) + ' '.repeat(Math.max(1, TAGW - String(t).length + 1))
  // repo-authored strings (rule details carry descriptor fields; titles are rule text)
  // are stripped of terminal control bytes before printing — no cursor-move that
  // overwrites a printed FAIL with fake PASS (--json is unaffected; JSON escapes them).
  // A detail is one line: an embedded newline would split the row a reader (and
  // plugins.mjs V39) takes as one.
  const S = s => sanitizeTTY(s)
  const oneLine = s => S(s).replace(/\s*\n\s*/g, ' ')
  const rows = evaluated(results)
  // the id column fits the widest id ON THIS RUN — v3 ids are three-part (PREFIX-NN-slug, §2)
  // and vary in length, so the width is derived from the rows, never a literal
  const IDW = Math.max(9, ...rows.map(x => String(x.r.id).length))
  const lines = []
  // categories in CATS order; a category CATS does not name still renders (never a silent drop)
  const cats = [...Object.keys(CATS), ...new Set(rows.map(x => x.r.category).filter(c => !(c in CATS)))]
  for (const cat of cats) {
    const group = rows.filter(x => x.r.category === cat); if (!group.length) continue
    lines.push('  ' + color(1, CATS[cat] ?? String(cat)))
    // a row that left a log (a PLUG WARN, D10) names it on the same line as its id, so a
    // reader who filters by id sees the finding and where the probe's record is
    for (const x of group) lines.push(`    ${tagCell(x.tag)} ${String(x.r.id).padEnd(IDW)} ${S(x.r.title)}  ${color(90, '↳ ' + oneLine(x.detail) + (x.log ? ` · log: ${oneLine(String(x.log))}` : ''))}`)
    lines.push('')
  }
  return lines
}

export function reportHuman({ results, REPO, cfg, ACTIVE, HEAD, version, color, lane = null }) {
  const S = sanitizeTTY
  const packs = packsOf(ACTIVE)
  // HEAD is printed when there is one; a tree without git says nothing rather than a token
  console.log(`\n  project-baseline v${version}  ·  ${path.basename(REPO)}  ·  type=${cfg.project_type}  ·  packs=[${packs.join(',')}]${HEAD ? `  ·  HEAD=${HEAD}` : ''}\n`)
  // A lane the CHECKOUT could not name is a weaker claim than a checked-out branch, and
  // the difference is a property of the RUN, not of any one rule (#55) — so it is stated
  // once, here, and no rule's detail string has to carry it. Silent on the ordinary case:
  // basis 'checkout' is what every local run and every push-with-branch run resolves on.
  if (lane && lane.lane && lane.basis && lane.basis !== 'checkout') {
    console.log(`  ${color(33, 'lane')} ${S(lane.lane)} resolved from ${lane.basis}${lane.event ? ` (${S(lane.event)} event)` : ''} — the checkout is detached, so the rules read the tree that IS checked out (on a pull_request, the merge result), not the lane tip\n`)
  }
  for (const line of humanRows(results, color)) console.log(line)
  const s = summarize(results)
  console.log('  ' + color(1, 'Summary') + `  ${color(32, s.pass + ' pass')} · ${color(31, s.fail + ' fail')} · ${color(33, s.warn + ' warn')}${s.diverged ? ` · ${color(31, s.diverged + ' diverged')}` : ''}`)
  console.log(`  Readiness: ${Math.round(100 * s.pass / Math.max(1, s.total))}%  (${s.pass}/${s.total} evaluated)`)
  for (const line of baselineLines(results, cfg, color)) console.log(line)
  for (const line of trustLines(results, cfg, color)) console.log(line)
  console.log(s.blockers ? color(31, `\n  ✗ ${s.blockers} blocker(s) — not build-ready.\n`) : color(32, `\n  ✓ no blockers.\n`))
  return s.blockers ? 1 : 0
}
