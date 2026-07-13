// `baseline gen` — generators that write derivable/mechanical artifacts. M4c ships
// one subcommand: `gen migrate-claims`, the C17 explosion of the V1 docs/CLAIMS.json
// monolith into per-claim records/claims/CLM-NNNN.json (slug preserves the V1 id so
// cross-references survive). Idempotent: already-migrated claims (slug match) are
// skipped, numbering continues after the highest existing record, files are written
// O_EXCL (never overwrite). Schema-invalid claims are REFUSED per claim and reported
// — a partial migration is visible, never silent. The legacy monolith is left in
// place (dual-read until M7); deleting it after review is the human's move, nudged
// by CLAIM-07. (`gen --check` index-view drift guarding lands at M6.)
import fs from 'node:fs'
import path from 'node:path'
import { makeOpt } from './util.mjs'
import { indexRepo } from './repo.mjs'
import { resolveConfig } from './config.mjs'
import { validateRecord, recordSchema } from './records.mjs'
import { loadClaimRecords, loadLegacyClaims, CLAIM_RECORD_GLOB } from './claims.mjs'

// The claim schema's own field list, DERIVED (additionalProperties:false) — a field
// added to the schema can never silently become a "dropped unknown field" here.
// Anything outside it in a legacy entry is dropped LOUDLY, per claim.
const CLAIM_FIELDS = Object.keys(recordSchema('claim').properties).filter(k => !['record', 'id', 'slug', 'citations'].includes(k))

const GEN_USAGE = 'usage: baseline gen migrate-claims [--repo DIR]'

export function runGen(argv) {
  // help must never mutate: a generator WRITES, so an argv we don't fully
  // understand is a usage error, not a shrug-and-proceed
  if (argv.includes('--help') || argv.includes('-h')) { console.log(`baseline gen — generators that write derivable artifacts\n  ${GEN_USAGE}\n  migrate-claims: explode the legacy docs/CLAIMS.json monolith into records/claims/CLM-NNNN.json (dual-read until M7; idempotent by slug)`); return 0 }
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  const rest = sub ? argv.slice(1) : argv
  const usage = msg => { console.error(`baseline gen: ${msg}\n  ${GEN_USAGE}`); return 2 }
  if (sub !== 'migrate-claims') return usage(sub ? `unknown generator '${sub}'` : 'a generator is required')
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('-')) return usage(`unexpected argument '${rest[i]}'`)
    if (rest[i] !== '--repo') return usage(`unknown flag '${rest[i]}'`)
    i++ // skip --repo's value
  }
  const opt = makeOpt(rest)
  if (opt('--repo', null) === true) return usage('--repo needs a value')
  const REPO = path.resolve(String(opt('--repo', process.cwd())))

  const repo = indexRepo(REPO)
  const { cfg } = resolveConfig(repo)
  const legacy = loadLegacyClaims(repo, cfg)
  if (!legacy.present) { console.log(`gen migrate-claims: no legacy register (${cfg.claims_file}) — nothing to migrate`); return 0 }
  if (legacy.error) { console.error(`gen migrate-claims: ${legacy.error}`); return 2 }
  if (!legacy.claims.length) { console.log(`gen migrate-claims: ${cfg.claims_file} has no claims — nothing to migrate`); return 0 }

  const existing = loadClaimRecords(repo)
  // a corrupt/partial record file hides its slug — a rerun would re-migrate its
  // claim as a duplicate while reporting success. Refuse to write until it's fixed.
  if (existing.errors.length) {
    for (const e of existing.errors) console.error(`  ✗ ${e}`)
    console.error(`gen migrate-claims: ${existing.errors.length} existing record(s) unreadable — fix or delete them, then rerun (nothing written)`)
    return 2
  }
  const migrated = new Set()
  let maxN = 0
  for (const cl of existing.claims) {
    if (cl.slug) migrated.add(String(cl.slug))
    const m = String(cl.id || '').match(/^CLM-(\d{4})$/); if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  // number past every CLM-*.json on disk too, valid or not — never mint a taken id
  for (const f of repo.match(CLAIM_RECORD_GLOB)) {
    const m = f.match(/CLM-(\d{4})\.json$/); if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  try { fs.mkdirSync(path.join(REPO, 'records/claims'), { recursive: true }) }
  catch (e) { console.error(`gen migrate-claims: cannot create records/claims/ — ${e.code === 'EEXIST' || e.code === 'ENOTDIR' ? 'a file exists where the directory belongs' : e.message}`); return 2 }

  let wrote = 0, skipped = 0, refused = 0
  for (const cl of legacy.claims) {
    const slug = String(cl.id ?? '')
    // the slug IS the migration key (claims.mjs shadows by it) — an unkeyed claim
    // can never be marked migrated, so writing it would duplicate on every rerun
    if (!slug) { refused++; console.error(`  ✗ (no id) refused — every legacy claim needs an "id" to key the migration: add one in ${cfg.claims_file}, rerun`); continue }
    if (migrated.has(slug)) { skipped++; console.log(`  = ${slug} already migrated — skipped`); continue }
    const rec = { record: 'claim/1', id: `CLM-${String(++maxN).padStart(4, '0')}`, slug }
    const dropped = []
    for (const k of Object.keys(cl)) if (k !== 'id' && k !== '_file' && !CLAIM_FIELDS.includes(k) && k !== 'citations') dropped.push(k)
    for (const k of CLAIM_FIELDS) if (cl[k] !== undefined) rec[k] = cl[k]
    // citations carry over losslessly or loudly: a non-array is a refusal (it was
    // already a CLAIM-04 finding — migration must not flip it to PASS by deletion),
    // and any subfield beyond url/supports_because is reported into the same
    // dropped channel as top-level fields
    if (cl.citations !== undefined) {
      if (!Array.isArray(cl.citations)) { refused++; maxN--; console.error(`  ✗ ${slug} refused — "citations" must be an array (fix in ${cfg.claims_file}, rerun)`); continue }
      const cits = []
      cl.citations.forEach((c, i) => {
        if (!c || typeof c !== 'object') { dropped.push(`citations[${i}] (not an object)`); return }
        for (const k of Object.keys(c)) if (k !== 'url' && k !== 'supports_because') dropped.push(`citations[${i}].${k}`)
        cits.push({ url: c.url, supports_because: c.supports_because })
      })
      rec.citations = cits
    }
    const errs = validateRecord('claim', rec)
    if (errs.length) {
      refused++; maxN-- // the number wasn't spent
      console.error(`  ✗ ${slug} refused (fix in ${cfg.claims_file}, rerun): ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (+${errs.length - 3})` : ''}`)
      continue
    }
    const rel = `records/claims/${rec.id}.json`
    const abs = path.join(REPO, rel)
    try { fs.writeFileSync(abs, JSON.stringify(rec, null, 2) + '\n', { flag: 'wx' }) }
    catch (e) { refused++; console.error(`  ✗ ${rel}: ${e.code === 'EEXIST' ? 'already exists (never overwritten)' : e.message}`); continue }
    migrated.add(slug) // a duplicate id later in the SAME monolith skips instead of minting a twin
    wrote++
    console.log(`  + ${rel} (slug: ${slug})${dropped.length ? ` — dropped: ${dropped.join(', ')}` : ''}`)
  }
  console.log(`\ngen migrate-claims: ${wrote} written · ${skipped} already migrated · ${refused} refused`)
  if (wrote) console.log(`  review + commit the new records; the legacy ${cfg.claims_file} stays dual-readable until M7 — deleting it after review clears CLAIM-07`)
  return refused ? 1 : 0
}
