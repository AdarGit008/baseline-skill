// Claims dual-read (M4c -> M7): the CLAIM rules read BOTH homes — the legacy
// docs/CLAIMS.json monolith (V1) and the exploded per-claim records/claims/CLM-*.json
// (C17/C23). THE MIGRATION KEY IS THE SLUG, nowhere else: a record whose `slug`
// matches a legacy claim's id supersedes it, so the sanctioned overlap window never
// double-counts a claim — and never false-shadows one (a record's own CLM-NNNN id
// must not hide an unmigrated legacy claim that happens to share the spelling; the
// reader and `gen migrate-claims` share this one definition of "migrated"). The
// legacy read retires at M7 (#24's delete list); until then CLAIM-07 warns it into
// motion. `gen migrate-claims` writes through the same shapes.
import { validateRecord } from './records.mjs'

export const CLAIM_RECORD_GLOB = 'records/claims/CLM-*.json'

// -> { claims: [{...claim, _file}], errors: ['file: why'] }. Unparseable or
// schema-invalid record files surface as errors (findings for the caller), never
// as silently-dropped claims.
export function loadClaimRecords(repo) {
  const claims = [], errors = []
  for (const f of repo.match(CLAIM_RECORD_GLOB)) {
    const raw = repo.read(f)
    if (raw == null) { errors.push(`${f}: unreadable`); continue }
    let obj
    try { obj = JSON.parse(raw) } catch { errors.push(`${f}: not valid JSON`); continue }
    const errs = validateRecord('claim', obj)
    if (errs.length) { errors.push(`${f}: ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`); continue }
    claims.push({ ...obj, _file: f })
  }
  return { claims, errors }
}

// -> { present, claims, error }. present=false when the monolith doesn't exist;
// error set when it exists but can't be read as {claims:[...]}.
export function loadLegacyClaims(repo, cfg) {
  const f = cfg.claims_file
  if (!f || typeof f !== 'string') return { present: false, claims: [], error: null } // claims_file:false is absence, not JSON.parse(false)
  const raw = repo.read(f)
  if (raw == null) return { present: false, claims: [], error: null }
  let data
  try { data = JSON.parse(raw) } catch { return { present: true, claims: [], error: `${f}: not valid JSON` } }
  if (!Array.isArray(data.claims)) return { present: true, claims: [], error: `${f}: "claims" must be an array` }
  return { present: true, claims: data.claims.filter(cl => cl && typeof cl === 'object').map(cl => ({ ...cl, _file: f })), error: null }
}

// The merged view the CLAIM checks evaluate. Records win: a legacy claim whose id
// matches a record's SLUG is shadowed — its migrated copy is the one home. Slug
// only: shadowing by record id would silently drop an unmigrated legacy claim
// whose author picked a CLM-NNNN-shaped id (green-by-omission on blocker rules).
export function loadClaims(repo, cfg) {
  const rec = loadClaimRecords(repo)
  const legacy = loadLegacyClaims(repo, cfg)
  const migrated = new Set()
  for (const cl of rec.claims) if (cl.slug) migrated.add(String(cl.slug))
  const survivors = legacy.claims.filter(cl => !migrated.has(String(cl.id ?? '')))
  const errors = [...rec.errors, ...(legacy.error ? [legacy.error] : [])]
  return { claims: [...rec.claims, ...survivors], recordCount: rec.claims.length, legacyPresent: legacy.present, legacyCount: legacy.claims.length, errors }
}
