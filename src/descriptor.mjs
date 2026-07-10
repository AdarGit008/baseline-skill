// The C39 repo descriptor: baseline.repo.json — the repo's declared identity and
// posture. This is the one stored piece of intent every applicability, severity, and
// join derivation hangs off; keeping it small and schema-bound is what stops it from
// regrowing into a status blob. Read from the working tree, or from a git ref (the
// target-ref anchor seam, FS1 — enforcing contexts pass the default branch so a PR
// cannot weaken the posture that judges it). Validated by a zero-dependency subset
// validator against schema/repo.schema.json (the single source of truth).
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

export const DESCRIPTOR_FILE = 'baseline.repo.json'

// The schema is the single source of truth for both validation here and the docs.
export const DESCRIPTOR_SCHEMA = JSON.parse(fs.readFileSync(new URL('../schema/repo.schema.json', import.meta.url), 'utf8'))

// Which module consumes each descriptor field. --self-check (S7 / DESC-02) asserts every
// schema property appears here and vice-versa, so no field is silently unconsumed and
// every deferral is auditable. 'M2' = wired and active now; 'reserved:Mx' = declared now,
// switched on when module Mx lands (the honest-slice ruling — nothing pretends to work).
export const FIELD_CONSUMERS = {
  schema_version:        'M2 · loader compatibility gate',
  type:                  'M2 · config.project_type — supersedes filesystem auto-detection',
  lifecycle:             'reserved:M4 · record scrutiny',
  maturity:              'reserved:M4 · CLAIM category activates at "claimed"',
  owner:                 'reserved:M5 · lane lease ownership',
  workflow:              'reserved:M5 · FLOW contract graduation (multi-lane vs single-lane)',
  anchoring:             'reserved:M5 · FLOW-01 anchoring severity',
  ground_truth_boundary: 'reserved:M3 · capability probe + target-ref policy',
  lanes:                 'reserved:M5 · lane namespace + lease TTL',
  join_keys:             'reserved:M5 · join.mjs declared-key allowlist',
  engine_pin:            'reserved:M7 · pointer-install skew detection',
  staleness:             'reserved:M3 · orient staleness ceilings',
}

function matchesType(v, t) {
  switch (t) {
    case 'object':  return v !== null && typeof v === 'object' && !Array.isArray(v)
    case 'array':   return Array.isArray(v)
    case 'integer': return typeof v === 'number' && Number.isInteger(v)
    case 'number':  return typeof v === 'number'
    case 'string':  return typeof v === 'string'
    case 'boolean': return typeof v === 'boolean'
    default:        return true
  }
}
const describe = v => (v !== null && typeof v === 'object') ? (Array.isArray(v) ? 'array' : 'object') : JSON.stringify(v)
const childPath = (where, k) => where ? `${where}.${k}` : k

// A small, deterministic subset of JSON Schema — enough for the descriptor and no more:
// type, enum, pattern, minLength, required, additionalProperties:false, nested properties,
// array items. Messages are input-derived only (no paths/dates) so golden pins stay stable.
function validateAgainst(value, schema, where, errors) {
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${where || 'descriptor'} must be ${schema.type} (got ${describe(value)})`)
    return // a type mismatch cascades into noise — stop at this node
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${where} must be one of ${schema.enum.join('|')} (got ${describe(value)})`)
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${where} must match ${schema.pattern} (got ${describe(value)})`)
  if (schema.minLength != null && typeof value === 'string' && value.length < schema.minLength) errors.push(`${where} must be non-empty`)
  if (schema.type === 'object' && matchesType(value, 'object')) {
    const props = schema.properties || {}
    for (const req of (schema.required || [])) if (!(req in value)) errors.push(`${where ? where + ': ' : ''}missing required field '${req}'`)
    for (const k of Object.keys(value)) {
      if (k.startsWith('_')) continue // inline comment keys, ignored (matches the config-file convention)
      if (!(k in props)) { if (schema.additionalProperties === false) errors.push(`'${childPath(where, k)}' is not a known field`); continue }
      validateAgainst(value[k], props[k], childPath(where, k), errors)
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) value.forEach((el, i) => validateAgainst(el, schema.items, `${where}[${i}]`, errors))
}

function readSource(repo, ref) {
  if (ref) {
    // filenames/ref are literal argv (execFileSync, no shell) — never a shell string
    try { return execFileSync('git', ['show', `${ref}:${DESCRIPTOR_FILE}`], { cwd: repo.REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8') } catch { return null }
  }
  return repo.read(DESCRIPTOR_FILE)
}

// -> { present, valid, data, errors, source }. `data` is the parsed object even when
// invalid (for diagnostics); consumers gate on `valid` before trusting a field.
export function loadDescriptor(repo, { ref = null } = {}) {
  const source = ref ? `ref:${ref}` : 'worktree'
  const raw = readSource(repo, ref)
  if (raw == null) return { present: false, valid: false, data: null, errors: [], source }
  let data
  try { data = JSON.parse(raw) } catch { return { present: true, valid: false, data: null, errors: ['not valid JSON'], source } }
  const errors = []
  validateAgainst(data, DESCRIPTOR_SCHEMA, '', errors)
  return { present: true, valid: errors.length === 0, data, errors, source }
}
