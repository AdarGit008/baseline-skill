// The C39 repo descriptor: baseline.repo.json — the repo's declared identity and
// posture. This is the one stored piece of intent every applicability, severity, and
// join derivation hangs off; keeping it small and schema-bound is what stops it from
// regrowing into a status blob. Read from the working tree, or from a git ref (the
// target-ref anchor seam, FS1 — enforcing contexts pass the default branch so a PR
// cannot weaken the posture that judges it). Validated by a zero-dependency subset
// validator against schema/repo.schema.json (the single source of truth).
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { validateAgainst } from './validate.mjs'

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
  lifecycle:             'reserved:M7 · record-scrutiny promotion (M4 shipped no lifecycle consumer; #24 decides consume-or-drop)',
  maturity:              'M4c · config CLAIMS_ACTIVE gate — CLAIM category activates at "claimed" (C24, discrete tiers)',
  owner:                 'reserved:M5 · lane lease ownership',
  workflow:              'M4c · engine posture gate — rules declaring `workflow` SKIP on other postures; M5 extends to lanes',
  anchoring:             'reserved:M5 · FLOW-01 anchoring severity',
  ground_truth_boundary: 'M4c · engine default-branch lane gate (branch_scope rules); probe/target-ref reads reserved:M6',
  lanes:                 'reserved:M5 · lane namespace + lease TTL',
  join_keys:             'reserved:M5 · join.mjs declared-key allowlist',
  engine_pin:            'reserved:M7 · pointer-install skew detection',
  staleness:             'reserved:M3 · orient staleness ceilings',
}

// The subset validator lives in src/validate.mjs since M4a (shared with the record
// schemas); the descriptor's messages and semantics are unchanged.

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
