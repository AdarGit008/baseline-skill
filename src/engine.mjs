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
export const NA = 'n/a'
export const isNA = x => x?.state === NA
export const isEvaluated = x => !!x && x.state !== NA

const na = (r, reason) => ({ r, state: NA, reason: String(reason || 'not evaluable here').trim() || 'not evaluable here' })

export function runRules({
  rules, cfg, evalCheck, DESCRIPTOR = null, context = 'check',
  ACTIVE_PACKS = null, ACTIVE = null,       // the active packs (v3 §5); ACTIVE is the pre-v3 name
  TOOLS_PRESENT = null,                      // tools detected in the tree (v3 §6); null = not gated here
  forgeClosed = null,                        // D12: a reason string closes the forge for this run
}) {
  const packs = ACTIVE_PACKS || ACTIVE || new Set()
  const want = new Set(Array.isArray(cfg?.want) ? cfg.want : [])
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
    // v3 §11 D12 (V19/V42): the forge is closed under check (and orient) — a forge-sourced
    // rule resolves n/a with the closure reason BEFORE its evaluator runs, so no path can
    // spawn gh, and the reason is the closure's own, never the evaluator's first subject miss.
    if (forgeClosed && Array.isArray(r.sources) && r.sources.includes('forge')) { results.push(na(r, forgeClosed)); continue }

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
