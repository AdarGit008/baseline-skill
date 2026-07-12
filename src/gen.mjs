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
import { validateRecord } from './records.mjs'
import { loadClaimRecords, loadLegacyClaims, CLAIM_RECORD_GLOB } from './claims.mjs'

// The claim schema's own field list (additionalProperties:false) — anything else in a
// legacy entry is dropped LOUDLY, per claim, so no intent vanishes in the move.
const CLAIM_FIELDS = ['statement', 'type', 'build_state', 'blast_radius', 'de_risk_milestone', 'prior_art_checked', 'how_we_differ', 'confidence']

export function runGen(argv) {
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  const rest = sub ? argv.slice(1) : argv
  const usage = msg => { console.error(`baseline gen: ${msg}\n  usage: baseline gen migrate-claims [--repo DIR]`); return 2 }
  if (sub !== 'migrate-claims') return usage(sub ? `unknown generator '${sub}'` : 'a generator is required')
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

  let wrote = 0, skipped = 0, refused = 0
  for (const cl of legacy.claims) {
    const slug = String(cl.id ?? '')
    if (slug && migrated.has(slug)) { skipped++; console.log(`  = ${slug} already migrated — skipped`); continue }
    const rec = { record: 'claim/1', id: `CLM-${String(++maxN).padStart(4, '0')}` }
    if (slug) rec.slug = slug
    const dropped = []
    for (const k of Object.keys(cl)) if (k !== 'id' && k !== '_file' && !CLAIM_FIELDS.includes(k) && k !== 'citations') dropped.push(k)
    for (const k of CLAIM_FIELDS) if (cl[k] !== undefined) rec[k] = cl[k]
    if (Array.isArray(cl.citations)) rec.citations = cl.citations.filter(c => c && typeof c === 'object').map(c => ({ url: c.url, supports_because: c.supports_because }))
    const errs = validateRecord('claim', rec)
    if (errs.length) {
      refused++; maxN-- // the number wasn't spent
      console.error(`  ✗ ${slug || rec.id} refused (fix in ${cfg.claims_file}, rerun): ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (+${errs.length - 3})` : ''}`)
      continue
    }
    const rel = `records/claims/${rec.id}.json`
    const abs = path.join(REPO, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    try { fs.writeFileSync(abs, JSON.stringify(rec, null, 2) + '\n', { flag: 'wx' }) }
    catch (e) { refused++; console.error(`  ✗ ${rel}: ${e.code === 'EEXIST' ? 'already exists (never overwritten)' : e.message}`); continue }
    wrote++
    console.log(`  + ${rel}${slug ? ` (slug: ${slug})` : ''}${dropped.length ? ` — dropped unknown field(s): ${dropped.join(', ')}` : ''}`)
  }
  console.log(`\ngen migrate-claims: ${wrote} written · ${skipped} already migrated · ${refused} refused`)
  if (wrote) console.log(`  review + commit the new records; the legacy ${cfg.claims_file} stays dual-readable until M7 — deleting it after review clears CLAIM-07`)
  return refused ? 1 : 0
}
