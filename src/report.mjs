// Scorecard rendering: human-readable per-category report or --json machine
// output. Both return the process exit code (1 if any blocker FAILed).
import path from 'node:path'

export const CATS = { build: 'Build & execution', quality: 'Code quality', test: 'Tests & invariants', security: 'Security & supply-chain', repro: 'Reproducibility', ops: 'Operability (service)', governance: 'Change governance', community: 'Community & onboarding', context: 'Context management', claims: 'Claims discipline', records: 'Records & ledger', flow: 'Lane workflow', desc: 'Repo descriptor' }

export function makeColor(JSON_OUT) {
  return (c, s) => (process.stdout.isTTY && !JSON_OUT) ? `\x1b[${c}m${s}\x1b[0m` : s
}

export function reportJson({ results, REPO, cfg, ACTIVE, HEAD }) {
  const out = { repo: REPO, project_type: cfg.project_type, profiles: [...ACTIVE], head: HEAD, results: results.map(x => ({ id: x.r.id, category: x.r.category, severity: x.r.severity, profile: x.r.profile || 'core', tag: x.tag, detail: x.detail })) }
  const blockers = results.filter(x => x.tag === 'FAIL' && x.r.severity === 'blocker').length
  out.summary = { blockers, pass: results.filter(x => x.tag === 'PASS').length, warn: results.filter(x => x.tag === 'WARN').length, signoff: results.filter(x => x.tag === 'SIGN-OFF').length, skip: results.filter(x => x.tag === 'SKIP').length, total: results.length }
  console.log(JSON.stringify(out, null, 2))
  return blockers ? 1 : 0
}

export function reportHuman({ results, REPO, cfg, ACTIVE, HEAD, version, color }) {
  const TAG = { PASS: color(32, 'PASS'), FAIL: color(31, 'FAIL'), WARN: color(33, 'WARN'), SKIP: color(90, 'SKIP'), 'SIGN-OFF': color(35, 'SIGN-OFF') }
  console.log(`\n  project-baseline v${version}  ·  ${path.basename(REPO)}  ·  type=${cfg.project_type}  ·  profiles=[${[...ACTIVE].join(',')}]  ·  HEAD=${HEAD || 'n/a'}\n`)
  for (const cat of Object.keys(CATS)) {
    const rows = results.filter(x => x.r.category === cat); if (!rows.length) continue
    console.log('  ' + color(1, CATS[cat]))
    for (const x of rows) console.log(`    ${TAG[x.tag].padEnd(x.tag.length + (process.stdout.isTTY ? 9 : 0))}  ${x.r.id.padEnd(9)} ${x.r.title}\n            ${color(90, '↳ ' + x.detail)}`)
    console.log('')
  }
  const n = t => results.filter(x => x.tag === t).length
  const blockers = results.filter(x => x.tag === 'FAIL' && x.r.severity === 'blocker').length
  const scored = results.filter(x => x.tag !== 'SKIP').length
  console.log('  ' + color(1, 'Summary') + `  ${color(32, n('PASS') + ' pass')} · ${color(31, n('FAIL') + ' fail')} · ${color(33, n('WARN') + ' warn')} · ${color(35, n('SIGN-OFF') + ' sign-off')} · ${color(90, n('SKIP') + ' n/a')}`)
  console.log(`  Readiness: ${Math.round(100 * n('PASS') / Math.max(1, scored))}%  (${n('PASS')}/${scored} applicable)`)
  console.log(blockers ? color(31, `\n  ✗ ${blockers} blocker(s) — not build-ready.\n`) : color(32, `\n  ✓ no blockers.\n`))
  return blockers ? 1 : 0
}
