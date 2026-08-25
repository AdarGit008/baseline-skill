// --self-check: validate rules.json integrity (no dangling scopes/kinds/types)
// and print the per-type coverage matrix. Returns the process exit code.
import { CATS } from './report.mjs'
import { DESCRIPTOR_SCHEMA, FIELD_CONSUMERS } from './descriptor.mjs'

// v3 §2: the id grammar — PREFIX-NN-slug. The prefix is the v2 id (a v2 id stays resolvable,
// V7); the slug is the concept handle (§7.3), unique across the set (V6). Enforced HERE so a
// two-part id added tomorrow is rejected by the tool's own gate, not only by the red tests.
export const ID_RE = /^[A-Z]+-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/
export const PREFIX_OF = id => (String(id).match(/^[A-Z]+-\d{2}/) || [null])[0]
export const SLUG_OF = id => String(id).replace(/^[A-Z]+-\d{2}-?/, '')

// v3 §6 / §11 D13: the closed vocabulary a rule's `tool` field may name — the subject whose
// absence resolves the rule n/a (V17) and whose declaration in config `want` brings it back
// (V20). ONE place: the engine's scope detector (WP3) and the `want` validator import it from
// here. The set grows only with a rule that declares the new value (orphan-tool law below).
export const TOOLS = Object.freeze(['docker'])
// A check kind whose subject IS a tool's artifact must be declared on the rule, so `want`
// can reach it and an absent tool mutes it — a kind added here binds every rule using it.
export const TOOL_OF_KIND = Object.freeze({ 'dockerfile-digest': 'docker' })

export function runSelfCheck({ RULES, TYPES, CHECK_KINDS, DEFAULTS, color }) {
  const problems = []
  const typeSet = new Set(TYPES)
  // `profiles` is the v2 activation map (WP3 retires it); `packs` is the v3 one (§5). While
  // both exist, a rule declaring both must agree, and each map's keys must all be in use.
  const profileKeys = new Set(Object.keys(RULES.profiles || {}))
  if (!RULES.packs || typeof RULES.packs !== 'object' || Array.isArray(RULES.packs)) problems.push('rules.json has no "packs" map (the opt-in packs, each with a one-line description)')
  const packKeys = new Set(Object.keys(RULES.packs || {}))
  for (const p of packKeys) if (typeof RULES.packs[p] !== 'string' || !RULES.packs[p].trim()) problems.push(`rules.json packs: '${p}' needs a one-line description`)
  const toolSet = new Set(TOOLS)
  // the two severities the engine routes: blocker → FAIL (exit code), anything else → WARN.
  // 'manual' (the sign-off ledger) left with its five rules (v3 §11 D11).
  const sevOk = new Set(['blocker', 'warn'])
  const catKeys = new Set(Object.keys(CATS))
  const ids = new Set()
  const prefixes = new Map()   // PREFIX-NN → the rule id that owns it (exactly one, V7)
  const slugs = new Map()      // slug → the rule id that owns it (exactly one, V6)
  const expand = r => r.applies_to === 'all' ? TYPES : (Array.isArray(r.applies_to) ? r.applies_to : [])
  let curId, kindsSeen
  const checkKinds = c => {
    if (!c || typeof c !== 'object') return
    if (c.kind) { kindsSeen.add(c.kind); if (!CHECK_KINDS.has(c.kind)) problems.push(`${curId}: unknown check kind '${c.kind}'`) }
    for (const sub of (c.checks || [])) checkKinds(sub)
    if (c.when) checkKinds(c.when)
    if (c.then) checkKinds(c.then)
  }
  for (const r of RULES.rules) {
    curId = r.id || '(rule with no id)'
    kindsSeen = new Set()
    if (!r.id) problems.push('a rule is missing "id"')
    else if (ids.has(r.id)) problems.push(`duplicate rule id: ${r.id}`)
    else ids.add(r.id)
    // v3 §2 (V5/V6/V7): grammar, one rule per v2 prefix, one rule per slug
    if (r.id && !ID_RE.test(r.id)) problems.push(`${curId}: id '${r.id}' does not match the v3 grammar PREFIX-NN-slug (${ID_RE.source})`)
    else if (r.id) {
      const pre = PREFIX_OF(r.id), slug = SLUG_OF(r.id)
      if (prefixes.has(pre)) problems.push(`${curId}: prefix '${pre}' is already ${prefixes.get(pre)} — a v2 id must resolve to exactly one rule`)
      else prefixes.set(pre, r.id)
      if (slugs.has(slug)) problems.push(`${curId}: slug '${slug}' duplicates ${slugs.get(slug)} — slugs are the concept handles and must be unique across the set`)
      else slugs.set(slug, r.id)
    }
    if (r.applies_to === undefined) problems.push(`${curId}: missing applies_to (must be "all" or a subset of project_types)`)
    else if (r.applies_to !== 'all') {
      if (!Array.isArray(r.applies_to) || r.applies_to.length === 0) problems.push(`${curId}: applies_to must be "all" or a non-empty array`)
      else for (const t of r.applies_to) if (!typeSet.has(t)) problems.push(`${curId}: applies_to has unknown type '${t}' (not in project_types)`)
    }
    if (r.profile !== undefined && !profileKeys.has(r.profile)) problems.push(`${curId}: unknown profile '${r.profile}'`)
    // v3 §5: a pack is DATA on the rule, drawn from the rules.json packs map — never a table in prose
    if (r.pack !== undefined) {
      if (typeof r.pack !== 'string' || !packKeys.has(r.pack)) problems.push(`${curId}: unknown pack '${r.pack}' (rules.json packs: {${[...packKeys].join('|')}})`)
      if (r.profile !== undefined && r.profile !== r.pack) problems.push(`${curId}: profile '${r.profile}' disagrees with pack '${r.pack}' — the two activation maps must name the same thing while both exist`)
    }
    // v3 §6 / §11 D13: the tool field is a closed set, an unknown value rejected BY NAME
    if (r.tool !== undefined && (typeof r.tool !== 'string' || !toolSet.has(r.tool))) problems.push(`${curId}: unknown tool '${r.tool}' — the closed set is {${TOOLS.join('|')}} (src/selfcheck.mjs TOOLS)`)
    if (!sevOk.has(r.severity)) problems.push(`${curId}: invalid severity '${r.severity}'`)
    if (!catKeys.has(r.category)) problems.push(`${curId}: unknown category '${r.category}'`)
    if (r.requires !== undefined && !(r.requires in DEFAULTS)) problems.push(`${curId}: 'requires' names unknown config key '${r.requires}'`)
    // M4c posture gates are data: a rule may declare the workflow(s) it needs — the value
    // set is read from the descriptor schema itself (lockstep by construction, not by
    // habit); string-or-array since M5c (a rule may serve a posture FAMILY). The lane
    // branch gate (branch_scope) left with the FLOW/DIV/MERGE families (v3 §3).
    if (r.workflow !== undefined) {
      const wfEnum = DESCRIPTOR_SCHEMA.properties?.workflow?.enum || []
      const wfs = Array.isArray(r.workflow) ? r.workflow : [r.workflow]
      if (!wfs.length) problems.push(`${curId}: workflow must be a value or non-empty array from the descriptor schema enum`)
      for (const w of wfs) if (!wfEnum.includes(w)) problems.push(`${curId}: workflow '${w}' is not in the descriptor schema enum {${wfEnum.join('|')}}`)
    }
    // M4c review ruling: the CLAIM family is uniformly opt-in — a claims rule
    // without the family gate would fire on repos that never opted into claims
    // discipline (the CLAIM-06 wallpaper class, fixed once, kept fixed here).
    if (r.category === 'claims' && r.requires !== 'makes_external_claims') problems.push(`${curId}: claims-category rules must carry requires:makes_external_claims (uniform family opt-in)`)
    checkKinds(r.check)
    // a kind that reads a tool's artifact binds the rule to that tool (V17/V20 reach it by the field)
    for (const k of kindsSeen) {
      const t = TOOL_OF_KIND[k]
      if (t && r.tool !== t) problems.push(`${curId}: check kind '${k}' reads a ${t} artifact, so the rule must declare "tool": "${t}" (got ${JSON.stringify(r.tool ?? null)})`)
    }
  }
  for (const t of TYPES) if (!RULES.rules.some(r => expand(r).includes(t))) problems.push(`no rule applies to type '${t}' (orphan type)`)
  for (const p of profileKeys) {
    const has = p === 'core' ? RULES.rules.some(r => !r.profile) : RULES.rules.some(r => r.profile === p)
    if (!has) problems.push(`no rule uses profile '${p}' (orphan profile)`)
  }
  for (const p of packKeys) if (!RULES.rules.some(r => r.pack === p)) problems.push(`no rule belongs to pack '${p}' (orphan pack)`)
  for (const t of TOOLS) if (!RULES.rules.some(r => r.tool === t)) problems.push(`no rule declares tool '${t}' (orphan tool — the vocabulary grows only with a rule that uses it)`)

  // S7 (DESC-02): the descriptor schema and the engine's consumption map stay in lockstep —
  // every declared field has a consumer (active now, or reserved for a NAMED later module), and
  // no consumer names a field the schema lacks. This is DESC-02 rehomed to the skill's own
  // self-check: it's an engine property, not a repo property. It makes every honest-slice
  // deferral auditable — a field can't be silently added and left unconsumed, nor claimed as
  // consumed without existing in the schema.
  const descProps = Object.keys(DESCRIPTOR_SCHEMA.properties || {})
  for (const f of descProps) if (!(f in FIELD_CONSUMERS)) problems.push(`descriptor field '${f}' has no declared consumer (add it to FIELD_CONSUMERS in src/descriptor.mjs)`)
  for (const f of Object.keys(FIELD_CONSUMERS)) if (!descProps.includes(f)) problems.push(`FIELD_CONSUMERS names '${f}', which is absent from the descriptor schema`)
  // M6a: x-strictness (DESC-03's weakening ladder) is schema DATA — each order must be a
  // total order over exactly its enum, or the classifier and the validator drift apart.
  for (const [f, p] of Object.entries(DESCRIPTOR_SCHEMA.properties || {})) {
    if (!p['x-strictness']) continue
    const order = [...p['x-strictness']].sort().join('|'), en = [...(p.enum || [])].sort().join('|')
    if (order !== en) problems.push(`schema property '${f}': x-strictness must be a total order over exactly the enum values (order {${p['x-strictness'].join(',')}} vs enum {${(p.enum || []).join(',')}})`)
  }

  // M3c: rule-metadata invariants. Every rule declares which planes it reads (sources), what it does
  // when a source is unreachable (on_unreachable), the contexts it runs in, and its certainty — and
  // one structural law holds (the STRATA graft): a blocker must be deterministic. The sign-off half
  // of the graft (severity 'manual' ⇔ certainty 'judgment') left with the ledger (v3 §11 D11), and
  // the lane-only laws (branch_scope × reconcile, no 'flow' source) with the lane families (v3 §3).
  const SRC = new Set(['tree', 'history', 'forge', 'exec'])
  const CTXV = new Set(['check', 'admit', 'reconcile'])
  const UNR = new Set(['skip', 'fail', 'stale-ok'])
  const CERT = new Set(['deterministic', 'heuristic'])
  for (const r of RULES.rules) {
    const id = r.id || '(no id)'
    if (!Array.isArray(r.sources) || !r.sources.length || !r.sources.every(s => SRC.has(s))) problems.push(`${id}: sources must be a non-empty subset of {${[...SRC].join('|')}}`)
    if (!UNR.has(r.on_unreachable)) problems.push(`${id}: on_unreachable must be one of {${[...UNR].join('|')}}`)
    if (!Array.isArray(r.contexts) || !r.contexts.length || !r.contexts.every(c => CTXV.has(c))) problems.push(`${id}: contexts must be a non-empty subset of {${[...CTXV].join('|')}}`)
    if (!CERT.has(r.certainty)) problems.push(`${id}: certainty must be one of {${[...CERT].join('|')}}`)
    if (r.severity === 'blocker' && r.certainty !== 'deterministic') problems.push(`${id}: blocker must be deterministic (got '${r.certainty}') — a blocker can't rest on a heuristic/judgment`)
  }
  // coverage matrix: applicable rules per type, split by pack ('core' = no pack; the pack
  // columns are the rules.json packs map, in its order — never a hand-kept column list)
  const cols = ['core', ...packKeys]
  const packOf = r => r.pack || 'core'
  const W = c => Math.max(6, c.length)
  console.log(`\n  project-baseline self-check · v${RULES.version} · ${RULES.rules.length} rules · types=[${TYPES.join(', ')}]\n`)
  console.log('  Coverage — rules applicable per project type:')
  console.log(`    ${'type'.padEnd(10)}  ${cols.map(c => c.padStart(W(c))).join('  ')}  ${'total'.padStart(6)}`)
  for (const t of TYPES) {
    const appl = RULES.rules.filter(r => expand(r).includes(t))
    const by = Object.fromEntries(cols.map(c => [c, 0]))
    for (const r of appl) by[packOf(r)] = (by[packOf(r)] || 0) + 1
    console.log(`    ${t.padEnd(10)}  ${cols.map(c => String(by[c]).padStart(W(c))).join('  ')}  ${String(appl.length).padStart(6)}`)
  }
  console.log('')
  const activeN = descProps.filter(f => /^M\d/.test(FIELD_CONSUMERS[f] || '')).length
  console.log(`  Descriptor — ${descProps.length} schema field(s): ${activeN} active, ${descProps.length - activeN} reserved for later modules; every field has a declared consumer (S7).\n`)
  const cBy = c => RULES.rules.filter(r => r.certainty === c).length
  console.log(`  Metadata — every rule declares sources/on_unreachable/contexts/certainty; certainty: ${[...CERT].map(c => `${cBy(c)} ${c}`).join(', ')}. Law: blocker⇒deterministic.`)
  const toolN = t => RULES.rules.filter(r => r.tool === t).length
  console.log(`  Scope — tool vocabulary {${TOOLS.join('|')}}: ${TOOLS.map(t => `${toolN(t)} ${t}`).join(', ')}; ${RULES.rules.filter(r => r.pack).length} rules in ${packKeys.size} packs, ${RULES.rules.filter(r => !r.pack).length} always-on.\n`)
  if (problems.length) {
    console.log(color(31, `  ✗ ${problems.length} integrity problem(s):`))
    for (const p of problems.slice(0, 200)) console.log('    - ' + p)
    if (problems.length > 200) console.log(`    … and ${problems.length - 200} more`)
    console.log('')
    return 1
  }
  console.log(color(32, `  ✓ rule set is internally consistent — every rule carries a v3 id (unique prefix and slug), a valid applies_to, pack, tool, kind, severity, and category; all ${TYPES.length} types, ${packKeys.size} packs, and ${TOOLS.length} tool(s) are in use.\n`))
  return 0
}
