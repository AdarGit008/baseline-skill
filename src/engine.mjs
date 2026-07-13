// The gate -> evaluate -> tag pipeline. Gates can short-circuit a rule to SKIP
// (wrong type, off profile, opted out, wrong posture, wrong branch) before its
// check ever runs; only a blocker that evaluates to false FAILs. An erroring
// check degrades to SKIP. The posture/branch gates are data-driven (a rule
// declares `workflow` / `branch_scope`), so "no wallpaper warns" is structural:
// a lane rule is unrepresentable as a finding on a single-lane repo or on the
// default branch — it never runs there.
export function runRules({ rules, cfg, ACTIVE, CLAIMS_ACTIVE, evalCheck, DESCRIPTOR = null, BRANCH = null, DEFAULT_BRANCH = null, CLAIMS_REASON = null }) {
  const results = []
  for (const r of rules) {
    if (r.applies_to && r.applies_to !== 'all' && !r.applies_to.includes(cfg.project_type)) { results.push({ r, tag: 'SKIP', detail: `n/a for ${cfg.project_type}` }); continue }
    if (r.profile && !ACTIVE.has(r.profile)) { results.push({ r, tag: 'SKIP', detail: `profile '${r.profile}' off` }); continue }
    if (r.requires === 'makes_external_claims') { if (!CLAIMS_ACTIVE) { results.push({ r, tag: 'SKIP', detail: CLAIMS_REASON || 'claims opt-in (no register; set makes_external_claims:true to enable)' }); continue } }
    else if (r.requires && cfg[r.requires] === false) {
      // status_file:false is an honored opt-out only when a valid descriptor supplies the
      // derived replacement (M4c) — a bare repo can't silence CTX by config alone. The key
      // itself (and this carve-out) retires with the stored-status surface at M7.
      const honored = r.requires !== 'status_file' || (DESCRIPTOR && DESCRIPTOR.valid)
      if (honored) { results.push({ r, tag: 'SKIP', detail: `opted out (${r.requires}:false)` }); continue }
    }
    if (r.workflow) {
      if (!DESCRIPTOR || !DESCRIPTOR.valid) { results.push({ r, tag: 'SKIP', detail: 'workflow contract off (no valid baseline.repo.json)' }); continue }
      if (DESCRIPTOR.data.workflow !== r.workflow) { results.push({ r, tag: 'SKIP', detail: `workflow=${DESCRIPTOR.data.workflow} (rule needs ${r.workflow})` }); continue }
    }
    if (r.branch_scope === 'lane') {
      if (!BRANCH) { results.push({ r, tag: 'SKIP', detail: 'no branch resolved (detached HEAD / CI checkout) — lane rules n/a' }); continue }
      // an undeclared default branch is a SKIP, never a guessed 'main' — a guess can
      // put lane rules ON the real default branch, the exact wallpaper the gate forbids
      if (!DEFAULT_BRANCH) { results.push({ r, tag: 'SKIP', detail: 'default branch undeclared (set ground_truth_boundary.default_branch) — lane rules n/a' }); continue }
      if (BRANCH === DEFAULT_BRANCH) { results.push({ r, tag: 'SKIP', detail: `on default branch '${DEFAULT_BRANCH}' — lane rules n/a` }); continue }
    }
    let res; try { res = evalCheck(r.check, r) } catch (e) { res = { ok: null, detail: 'check errored: ' + String(e.message).slice(0, 60) } }
    let tag
    if (res.ok === null) tag = 'SKIP'
    else if (res.ok === true) tag = 'PASS'
    else if (res.signoff || r.check.kind === 'signoff') tag = 'SIGN-OFF'
    else if (res.soft) tag = 'WARN'
    else tag = r.severity === 'blocker' ? 'FAIL' : 'WARN'
    results.push({ r, tag, detail: res.detail })
  }
  return results
}
