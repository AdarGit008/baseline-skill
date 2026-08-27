// The gate -> evaluate -> tag pipeline (v3 §5/§6/§10/§11).
//
// Two kinds of result row, and nothing else:
//   { r, tag, detail }          an EVALUATED rule — PASS / WARN / FAIL / DIVERGED
//   { r, state: 'n/a', reason } a rule that was IN SCOPE but could not be evaluated here
//                               (no subject in the tree, a closed plane, an erroring check)
// A gate MISS pushes no row at all: a rule outside the run's context, in an inactive pack,
// off-type, or off-posture is simply not part of this run — never a SKIP (D4/V36: n/a is
// silent to humans and explicit to machines; there is no SKIP tag anywhere any more).
// The posture gate is data-driven (a rule declares `workflow`), so "no wallpaper warns"
// is structural: a posture-gated rule is unrepresentable as a finding on a repo of
// another posture — it never runs there.
import { baselineLayerOf, LAYER_KEY } from './repo.mjs'

export const NA = 'n/a'
export const isNA = x => x?.state === NA
export const isEvaluated = x => !!x && x.state !== NA

// v4 — the two kinds of rule, told apart by the one structural fact that separates them:
// a PLUGIN rule names the trust-circle member it stands for (check.plugin), and every other
// rule is a BASELINE rule. Not a category list and not an id list, so a plugin rule added
// tomorrow is classified by what it reads rather than by where it was filed.
export const isPluginRule = r => typeof r?.check?.plugin === 'string' && !!r.check.plugin
export const isBaselineRule = r => !isPluginRule(r)

const na = (r, reason) => ({ r, state: NA, reason: String(reason || 'not evaluable here').trim() || 'not evaluable here' })

export function runRules({
  rules, cfg, evalCheck, DESCRIPTOR = null, context = 'check',
  ACTIVE_PACKS = null, ACTIVE = null,       // the active packs (v3 §5); ACTIVE is the pre-v3 name
  TOOLS_PRESENT = null,                      // tools detected in the tree (v3 §6); null = not gated here
}) {
  const packs = ACTIVE_PACKS || ACTIVE || new Set()
  const want = new Set(Array.isArray(cfg?.want) ? cfg.want : [])
  // v4 THE BASELINE RULES LAYER — the second opt-in, and the only one whose default is IN.
  // Read once per run off the config (repo.mjs baselineLayerOf: an absent key is IN), so a
  // cfg that never heard of the key behaves exactly as it did before the layer existed.
  const LAYER = baselineLayerOf(cfg)
  const results = []
  for (const r of rules) {
    // M6a: context-gated execution — a rule outside the run's context is EXCLUDED (no row).
    if (!Array.isArray(r.contexts) || !r.contexts.includes(context)) continue
    // v3 §5 (V15/V16): a rule in a pack runs only when that pack is active — no row otherwise.
    // The engine keys on `pack` alone; the v2 `profile`/`requires` keys are retired.
    if (r.pack && !packs.has(r.pack)) continue
    // v3 §6 (V17/V20/V36, D13) — the tool gate, stated once. A rule declaring `tool` is IN
    // SCOPE when the tool is detected in the tree OR config `want` names it, and that scope
    // overrides the applies_to type gate (a docs-only tree with a Dockerfile, or one that
    // wants docker, runs REPRO-04). Otherwise the type gate stands: off-type is no row, and
    // an on-type rule whose tool is absent is an n/a row carrying the reason — present for
    // machines (state "n/a"), hidden from humans. A runner that detected no tools (null)
    // leaves the subject question to the evaluator, as before.
    const toolScoped = !!r.tool && (want.has(r.tool) || (!!TOOLS_PRESENT && TOOLS_PRESENT.has(r.tool)))
    if (!toolScoped && r.applies_to && r.applies_to !== 'all' && !r.applies_to.includes(cfg.project_type)) continue
    if (!toolScoped && r.tool && TOOLS_PRESENT) { results.push(na(r, `${r.tool} not detected in the tree (declare want:["${r.tool}"] to evaluate anyway)`)); continue }
    if (r.workflow) {
      if (!DESCRIPTOR || !DESCRIPTOR.valid) continue
      // string-or-array (M5c): a rule may serve a posture FAMILY — e.g. multi-lane AND
      // multi-lane-local, whose difference is forge access
      const wfs = Array.isArray(r.workflow) ? r.workflow : [r.workflow]
      if (!wfs.includes(DESCRIPTOR.data.workflow)) continue
    }
    // The D12 forge closure that used to sit here is gone with the seam: every rule in the
    // v4 set declares sources:["tree"], so there is no plane left to close (v4 rule-set cut).

    // v4 the BASELINE RULES LAYER, opted out. The row is n/a — the SAME treatment a plugin
    // whose tool this repo never adopted gets, and for the same reason: not-chosen is not
    // failed. n/a is out of summarize(), out of the AND-gate and out of the exit code, but
    // it is still a ROW, so `--json` carries every muted rule by id with the reason, and the
    // report prints the layer's state on every run. Opting out is a decision on the record,
    // never a way for a failing rule to go quiet.
    if (!LAYER.in && isBaselineRule(r)) {
      results.push(na(r, `the baseline rules layer is opted OUT (baseline.config.json "${LAYER_KEY}": false) — this rule produces no finding and is excluded from the gate; \`baseline trust setup --baseline-rules in\` puts the layer back`))
      continue
    }

    let res; try { res = evalCheck(r.check, r) } catch (e) { res = { ok: null, detail: 'check errored: ' + String(e && e.message).slice(0, 60) } }
    if (!res || res.ok === null || res.ok === undefined) { results.push(na(r, res?.detail)); continue }
    let tag
    if (res.ok === true) tag = 'PASS'
    // M5c: a cross-tier contradiction is its own verdict, not a generic warn — the
    // DIVERGED tag survives promotion (M7a): a blocker-severity DIVERGED row keeps
    // this tag and the COUNTING seams (report exits, admit leg (b)) treat it as
    // failing. The verdict class is never erased into a generic FAIL.
    else if (res.diverged) tag = 'DIVERGED'
    // res.soft downgrades to WARN. The law, stated precisely (M7c panel corrected
    // the absolute form): soft-on-a-blocker is a DELIBERATE adoption-path downgrade
    // that exists in exactly one place today — BUILD-05 (kind `command`) with no
    // bootstrap_command configured softens to WARN (unconfigured ≠ failing). Every
    // other soft consumer rides warn-severity rules (records-scrub heuristics,
    // descriptor absence), where soft is a no-op. NO NEW blocker kind may lean on
    // soft — a soft return slips past isBlocking, so each one is a hole in the
    // gate that must be argued as an adoption path, on the record, like BUILD-05.
    else if (res.soft) tag = 'WARN'
    else tag = r.severity === 'blocker' ? 'FAIL' : 'WARN'
    // row-level extras an evaluator attaches ride through to the report when present (a
    // PLUG WARN's repo-relative `log`, a `fix`) — never as empty keys
    const row = { r, tag, detail: res.detail }
    for (const k of ['log', 'fix']) if (res[k] != null) row[k] = res[k]
    results.push(row)
  }
  return results
}
