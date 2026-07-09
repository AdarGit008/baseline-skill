// The gate -> evaluate -> tag pipeline. Three gates can short-circuit a rule to
// SKIP (wrong type, off profile, opted out) before its check ever runs; only a
// blocker that evaluates to false FAILs. An erroring check degrades to SKIP.
export function runRules({ rules, cfg, ACTIVE, CLAIMS_ACTIVE, evalCheck }) {
  const results = []
  for (const r of rules) {
    if (r.applies_to && r.applies_to !== 'all' && !r.applies_to.includes(cfg.project_type)) { results.push({ r, tag: 'SKIP', detail: `n/a for ${cfg.project_type}` }); continue }
    if (r.profile && !ACTIVE.has(r.profile)) { results.push({ r, tag: 'SKIP', detail: `profile '${r.profile}' off` }); continue }
    if (r.requires === 'makes_external_claims') { if (!CLAIMS_ACTIVE) { results.push({ r, tag: 'SKIP', detail: 'claims opt-in (no register; set makes_external_claims:true to enable)' }); continue } }
    else if (r.requires && cfg[r.requires] === false) { results.push({ r, tag: 'SKIP', detail: `opted out (${r.requires}:false)` }); continue }
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
