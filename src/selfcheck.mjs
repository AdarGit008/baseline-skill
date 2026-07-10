// --self-check: validate rules.json integrity (no dangling scopes/kinds/types)
// and print the per-type coverage matrix. Returns the process exit code.
import { CATS } from './report.mjs'
import { DESCRIPTOR_SCHEMA, FIELD_CONSUMERS } from './descriptor.mjs'

export function runSelfCheck({ RULES, TYPES, CHECK_KINDS, DEFAULTS, color }) {
  const problems = []
  const typeSet = new Set(TYPES)
  const profileKeys = new Set(Object.keys(RULES.profiles || {}))
  const sevOk = new Set(['blocker', 'warn', 'manual'])
  const catKeys = new Set(Object.keys(CATS))
  const ids = new Set()
  const expand = r => r.applies_to === 'all' ? TYPES : (Array.isArray(r.applies_to) ? r.applies_to : [])
  let curId
  const checkKinds = c => {
    if (!c || typeof c !== 'object') return
    if (c.kind) { if (!CHECK_KINDS.has(c.kind)) problems.push(`${curId}: unknown check kind '${c.kind}'`) }
    for (const sub of (c.checks || [])) checkKinds(sub)
    if (c.when) checkKinds(c.when)
    if (c.then) checkKinds(c.then)
  }
  for (const r of RULES.rules) {
    curId = r.id || '(rule with no id)'
    if (!r.id) problems.push('a rule is missing "id"')
    else if (ids.has(r.id)) problems.push(`duplicate rule id: ${r.id}`)
    else ids.add(r.id)
    if (r.applies_to === undefined) problems.push(`${curId}: missing applies_to (must be "all" or a subset of project_types)`)
    else if (r.applies_to !== 'all') {
      if (!Array.isArray(r.applies_to) || r.applies_to.length === 0) problems.push(`${curId}: applies_to must be "all" or a non-empty array`)
      else for (const t of r.applies_to) if (!typeSet.has(t)) problems.push(`${curId}: applies_to has unknown type '${t}' (not in project_types)`)
    }
    if (r.profile !== undefined && !profileKeys.has(r.profile)) problems.push(`${curId}: unknown profile '${r.profile}'`)
    if (!sevOk.has(r.severity)) problems.push(`${curId}: invalid severity '${r.severity}'`)
    if (!catKeys.has(r.category)) problems.push(`${curId}: unknown category '${r.category}'`)
    if (r.requires !== undefined && !(r.requires in DEFAULTS)) problems.push(`${curId}: 'requires' names unknown config key '${r.requires}'`)
    checkKinds(r.check)
  }
  for (const t of TYPES) if (!RULES.rules.some(r => expand(r).includes(t))) problems.push(`no rule applies to type '${t}' (orphan type)`)
  for (const p of profileKeys) {
    const has = p === 'core' ? RULES.rules.some(r => !r.profile) : RULES.rules.some(r => r.profile === p)
    if (!has) problems.push(`no rule uses profile '${p}' (orphan profile)`)
  }

  // S7 (DESC-02): the descriptor schema and the engine's consumption map stay in lockstep —
  // every declared field has a consumer (active now, or reserved for a NAMED later module), and
  // no consumer names a field the schema lacks. This is DESC-02 rehomed to the skill's own
  // self-check: it's an engine property, not a repo property. It makes every honest-slice
  // deferral auditable — a field can't be silently added and left unconsumed, nor claimed as
  // consumed without existing in the schema.
  const descProps = Object.keys(DESCRIPTOR_SCHEMA.properties || {})
  for (const f of descProps) if (!(f in FIELD_CONSUMERS)) problems.push(`descriptor field '${f}' has no declared consumer (add it to FIELD_CONSUMERS in src/descriptor.mjs)`)
  for (const f of Object.keys(FIELD_CONSUMERS)) if (!descProps.includes(f)) problems.push(`FIELD_CONSUMERS names '${f}', which is absent from the descriptor schema`)
  // coverage matrix: applicable rules per type, split by profile
  const profOf = r => r.profile || 'core'
  console.log(`\n  project-baseline self-check · v${RULES.version} · ${RULES.rules.length} rules · types=[${TYPES.join(', ')}]\n`)
  console.log('  Coverage — rules applicable per project type:')
  console.log('    type        core  service  advanced   total')
  for (const t of TYPES) {
    const appl = RULES.rules.filter(r => expand(r).includes(t))
    const by = { core: 0, service: 0, advanced: 0 }
    for (const r of appl) by[profOf(r)] = (by[profOf(r)] || 0) + 1
    console.log(`    ${t.padEnd(10)}  ${String(by.core).padStart(4)}  ${String(by.service).padStart(7)}  ${String(by.advanced).padStart(8)}  ${String(appl.length).padStart(6)}`)
  }
  console.log('')
  const activeN = descProps.filter(f => /^M\d/.test(FIELD_CONSUMERS[f] || '')).length
  console.log(`  Descriptor — ${descProps.length} schema field(s): ${activeN} active, ${descProps.length - activeN} reserved for later modules; every field has a declared consumer (S7).\n`)
  if (problems.length) {
    console.log(color(31, `  ✗ ${problems.length} integrity problem(s):`))
    for (const p of problems.slice(0, 60)) console.log('    - ' + p)
    console.log('')
    return 1
  }
  console.log(color(32, `  ✓ rule set is internally consistent — every rule carries a valid applies_to, profile, kind, severity, and category; all ${TYPES.length} types and ${profileKeys.size} profiles are covered.\n`))
  return 0
}
