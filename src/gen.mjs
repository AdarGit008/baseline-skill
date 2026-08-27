// `baseline gen` — generators that write derivable/mechanical artifacts.
//
// M4c: `gen migrate-claims` — the C17 explosion of the V1 docs/CLAIMS.json
// monolith into per-claim records (idempotent by slug, O_EXCL, refusals loud).
//
// M6c: `gen index` + `gen --check` — C05 as amended (in-PR index views ONLY; the
// main-written snapshot ceremony and its hash/as_of headers are CUT):
//   - a generated view is a tracked markdown file whose FIRST line is the marker
//       <!-- baseline:generated <kind> — do not edit by hand; regenerate: baseline gen <kind> -->
//     Static text, byte-identical every run — no hash (regenerate-and-compare
//     needs none), no timestamp (determinism is ruled), no version (version-in-
//     marker would drift every view on every vendor bump; that case lives in the
//     REMEDY text instead).
//   - `gen index` derives docs/INDEX.md (or --out) from committed-shape content
//     ONLY — records ledgers + a docs map, everything sorted code-unit, dates
//     from filenames (the tool's one recency truth), links RELATIVE TO THE OUT
//     FILE's directory (CTX-05 resolves a doc's links against its own dir — a
//     root-relative link would break the consumer's md-links check).
//   - `gen --check` discovers marked views over the tracked pool (uncapped
//     reads — a size-capped read would silently green a big drifted view),
//     regenerates each in memory, byte-compares. Zero marked views → exit 0
//     (the ruled pre-adoption state). Drift → exit 1 with the remedy printed
//     VERBATIM-RUNNABLE (derived from this process's own argv — the consumer
//     invokes a vendored path, not a `baseline` binary). An unknown kind or an
//     unreadable discovered view → exit 1, named — never silently skipped.
//   - overwrite law: `gen index` writes over its own marker or into absence;
//     a file WITHOUT the marker is refused (move it aside or pass a different
//     --out — never paste the marker onto a hand-written file to authorize a
//     clobber). The refusal probe uses the same uncapped read.
//
// v3 D2: `gen okf-concepts` — the one-shot OKF migration, a deterministic EXTRACTION
// (never authorship, never a model, never the network). One markdown concept per
// loaded rule, YAML frontmatter (id, title, source span), staged under
// <repo>/.baseline/proposed/baseline/rules/ and nowhere else (V35). The bundle at
// BASELINE_OKF_BUNDLE is not consulted and not written (V4): the maintainer reviews
// the batch and copies it in by hand. Byte-identical on every rerun — no date, no
// sha, no absolute path in the output.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeOpt, sanitizeTTY } from './util.mjs'
import { loadRules } from './rules.mjs'
import { conceptOf, baseOf } from './explain.mjs'
import { indexRepo } from './repo.mjs'
import { resolveConfig } from './config.mjs'
import { validateRecord, recordSchema } from './records.mjs'
import { loadClaimRecords, loadLegacyClaims, CLAIM_RECORD_GLOB, LEGACY_CLAIMS_FILE } from './claims.mjs'
import { loadJudgments } from './jdg.mjs'
import { SESSION_BASES } from './facts/git.mjs'

// ---- the generated-view contract (M6c) ----
export const MARKER_OF = (kind) => `<!-- baseline:generated ${kind} — do not edit by hand; regenerate: baseline gen ${kind} -->`
// Detection tolerates a BOM and CRLF on line 1 (they still byte-compare as drift
// — loud, correct); the marker's identity is the `baseline:generated <kind>` prefix.
export const MARKER_DETECT_RE = /^\uFEFF?<!--\s*baseline:generated\s+(\S+)[^>]*-->\r?$/
export const GEN_KINDS = new Set(['index'])

// The verbatim-runnable remedy: derived from THIS invocation's argv, repo-relative
// when the runner lives inside the target repo (the vendored-consumer reality —
// there is no `baseline` binary on any PATH).
export function remedyCommand(REPO, kind, outRel) {
  const self = path.resolve(process.argv[1] || 'baseline.mjs')
  const inRepo = self.startsWith(REPO + path.sep)
  // VERBATIM-runnable is the contract — a space-bearing path must survive the
  // reader's shell, so anything beyond the safe charset gets single-quoted
  const q = s => /^[A-Za-z0-9._/-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`
  return inRepo
    ? `node ${q(path.relative(REPO, self).split(path.sep).join('/'))} gen ${kind} --out ${q(outRel)} --repo .`
    : `node ${q(self)} gen ${kind} --out ${q(outRel)} --repo ${q(REPO)}`
}

const firstHeading = (md) => md.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null
// Markdown-cell/link hygiene for repo-authored strings: a '|' or newline in a
// judgment subject must not split the table; '[' ']' in a title must not break
// the link (escaping ']' does NOT survive CTX-05's naive link regex — strip);
// a destination with spaces/parens rides in <...> (CommonMark; CTX-05 skips it).
const cell = s => String(s).replace(/\r?\n/g, ' ').replace(/\|/g, '∣')
const linkTitle = s => String(s).replace(/\r?\n/g, ' ').replace(/[[\]]/g, '')
const linkDest = s => /[\s()]/.test(s) ? `<${s}>` : s

// Deterministic index content over the repo's committed-shape surfaces. Pure of
// clock and machine: every list sorted code-unit, dates from filenames, titles
// from first headings (filename fallback — determinism has no hole).
export function generateIndex(repo, outRel) {
  const P = []
  P.push(MARKER_OF('index'))
  P.push('# Index')
  P.push('')
  P.push('_Generated view — edit the records, not this file. Regenerate: `baseline gen index`._')
  P.push('')
  // judgments ledger
  const { records: jdgs, findings: jdgBad } = loadJudgments(repo.REPO)
  P.push(`## Judgments (${jdgs.length}${jdgBad.length ? ` + ${jdgBad.length} invalid` : ''})`)
  P.push('')
  if (!jdgs.length) P.push('_none_')
  else {
    P.push('| id | kind | subject | review by |')
    P.push('|---|---|---|---|')
    for (const j of [...jdgs].sort((a, b) => a.id < b.id ? -1 : 1)) P.push(`| ${j.id} | ${j.kind} | ${cell(j.subject)} | ${j.review_by} |`)
  }
  P.push('')
  // claims ledger
  const claims = loadClaimRecords(repo)
  P.push(`## Claims (${claims.claims.length}${claims.errors.length ? ` + ${claims.errors.length} unreadable` : ''})`)
  P.push('')
  if (!claims.claims.length) P.push('_none_')
  else {
    P.push('| id | slug |')
    P.push('|---|---|')
    // _file tiebreak: claim ids are NOT filename-enforced (judgments are), so a
    // duplicate id must not leave row order to the fs walk — that would make the
    // committed view green on one machine and "drifted" on another
    for (const c of [...claims.claims].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : String(a._file) < String(b._file) ? -1 : 1)) P.push(`| ${cell(c.id)} | ${cell(c.slug ?? '')} |`)
  }
  P.push('')
  // session records by lane — count + newest DATE from the filename (the same
  // recency truth newestLocalLog and the forge listing already derive from).
  // Pool = tracked ∪ walked (M7c, ruled): `baseline log` never stages, so a
  // tracked-only pool makes log→regen→commit lag one session forever — the
  // committed view omits the record riding its own commit and CI's gen --check
  // reds it. The union sees the just-written record pre-add (parity with the
  // JSON ledgers, which already read the worktree) while the tracked side keeps
  // deleted-but-tracked records counted, exactly as before.
  const sessions = [...new Set([...repo.match(['records/sessions/**/*.md'], { tracked: true }), ...repo.match(['records/sessions/**/*.md'])])].sort()
  const byLane = new Map()
  for (const f of sessions) {
    const rest = f.slice('records/sessions/'.length)
    const cut = rest.lastIndexOf('/')
    // a record parked directly under records/sessions/ has no lane dir — it still
    // counts, honestly grouped, or the header total and the bullets would disagree
    const lane = cut < 1 ? '(unlaned)' : rest.slice(0, cut)
    const file = cut < 1 ? rest : rest.slice(cut + 1)
    const e = byLane.get(lane) || { n: 0, newest: '' }
    e.n++
    const d = file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''
    if (d > e.newest) e.newest = d
    byLane.set(lane, e)
  }
  P.push(`## Session records (${sessions.length})`)
  P.push('')
  if (!byLane.size) P.push('_none_')
  else for (const [lane, e] of [...byLane.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) P.push(`- \`${lane}\` — ${e.n} record(s)${e.newest ? `, newest ${e.newest}` : ''}`)
  P.push('')
  // docs map — docs/**/*.md, EXCLUDING generated views (self-reference) and the
  // session bases (a V1-shaped repo keeps session logs under docs/); links are
  // relative to the OUT file's dir (CTX-05's resolver reads them from there)
  const outDir = path.posix.dirname(outRel)
  const docs = repo.match(['docs/**/*.md'], { tracked: true })
    .filter(f => f !== outRel && !SESSION_BASES.some(b => f.startsWith(b + '/')))
    .filter(f => { const raw = repo.read(f); return raw === null || !MARKER_DETECT_RE.test(raw.split('\n', 1)[0]) })
    .sort()
  P.push(`## Docs (${docs.length})`)
  P.push('')
  if (!docs.length) P.push('_none_')
  else for (const f of docs) {
    const title = firstHeading(repo.read(f) || '') || path.posix.basename(f)
    P.push(`- [${linkTitle(title)}](${linkDest(path.posix.relative(outDir, f))})`)
  }
  P.push('')
  return P.join('\n')
}

// The claim schema's own field list, DERIVED (additionalProperties:false) — a field
// added to the schema can never silently become a "dropped unknown field" here.
// Anything outside it in a legacy entry is dropped LOUDLY, per claim.
const CLAIM_FIELDS = Object.keys(recordSchema('claim').properties).filter(k => !['record', 'id', 'slug', 'citations'].includes(k))

const GEN_USAGE = `usage: baseline gen index [--repo DIR] [--out PATH]
         baseline gen --check [--repo DIR]
         baseline gen migrate-claims [--repo DIR]
         baseline gen okf-concepts [--repo DIR]`

export function runGen(argv) {
  // help must never mutate: a generator WRITES, so an argv we don't fully
  // understand is a usage error, not a shrug-and-proceed
  if (argv.includes('--help') || argv.includes('-h')) { console.log(`baseline gen — generators that write derivable artifacts\n  ${GEN_USAGE}\n  index: write a deterministic, marker-headed index view (default docs/INDEX.md) over the records ledgers + docs map\n  --check: regenerate every marker-headed view and byte-compare — the CI drift guard (zero views → trivially green; advisory job, never continue-on-error)\n  migrate-claims: explode the legacy docs/CLAIMS.json monolith into records/claims/CLM-NNNN.json (the checker reads records only since M7b; idempotent by slug)\n  okf-concepts: stage one proposed markdown concept per rule (YAML frontmatter with its source span) under <repo>/.baseline/proposed/baseline/rules/ — a deterministic extraction from the shipped docs, byte-identical on rerun; the okf bundle itself is never read or written`); return 0 }
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  const rest = sub ? argv.slice(1) : argv
  const usage = msg => { console.error(`baseline gen: ${msg}\n  ${GEN_USAGE}`); return 2 }
  const CHECK = argv.includes('--check')
  if (CHECK && sub) return usage(`--check takes no generator (it discovers marked views)`)
  const FLAGS = CHECK ? new Set(['--check', '--repo']) : sub === 'index' ? new Set(['--repo', '--out']) : new Set(['--repo'])
  const VALUELESS = new Set(['--check'])
  if (!CHECK && sub !== 'migrate-claims' && sub !== 'index' && sub !== 'okf-concepts') return usage(sub ? `unknown generator '${sub}'` : 'a generator (or --check) is required')
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('-')) return usage(`unexpected argument '${rest[i]}'`)
    if (!FLAGS.has(rest[i])) return usage(`unknown flag '${rest[i]}'`)
    if (!VALUELESS.has(rest[i])) i++ // skip the value
  }
  const opt = makeOpt(rest)
  for (const f of ['--repo', '--out']) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const REPO = path.resolve(String(opt('--repo', process.cwd())))

  if (CHECK) return runGenCheck(REPO)
  if (sub === 'index') {
    // --out is repo-relative, posix, and stays INSIDE the repo — a generator that
    // can write outside its repo is a footgun, not a knob
    const rawOut = String(opt('--out', 'docs/INDEX.md'))
    const outRel = path.posix.normalize(rawOut.split(/[\\/]/).join('/'))
    if (path.posix.isAbsolute(outRel) || outRel === '..' || outRel.startsWith('../')) return usage(`--out must be a repo-relative path inside the repo (got '${rawOut}')`)
    return runGenIndex(REPO, outRel)
  }
  if (sub === 'okf-concepts') return runGenOkfConcepts(REPO)

  const repo = indexRepo(REPO)
  const { cfg } = resolveConfig(repo)
  const legacy = loadLegacyClaims(repo, cfg)
  const legacyFile = cfg.claims_file === undefined ? LEGACY_CLAIMS_FILE : cfg.claims_file
  if (!legacy.present) { console.log(`gen migrate-claims: no legacy register (${legacyFile}) — nothing to migrate`); return 0 }
  if (legacy.error) { console.error(`gen migrate-claims: ${legacy.error}`); return 2 }
  if (!legacy.claims.length) { console.log(`gen migrate-claims: ${legacyFile} has no claims — nothing to migrate`); return 0 }

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
    if (!slug) { refused++; console.error(`  ✗ (no id) refused — every legacy claim needs an "id" to key the migration: add one in ${legacyFile}, rerun`); continue }
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
      if (!Array.isArray(cl.citations)) { refused++; maxN--; console.error(`  ✗ ${slug} refused — "citations" must be an array (fix in ${legacyFile}, rerun)`); continue }
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
      console.error(`  ✗ ${slug} refused (fix in ${legacyFile}, rerun): ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (+${errs.length - 3})` : ''}`)
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
  if (wrote) console.log(`  review + commit the new records; the checker no longer reads the legacy ${legacyFile} — deleting it after review completes the migration`)
  return refused ? 1 : 0
}

// ---- gen index (M6c) ----
function runGenIndex(REPO, outRel) {
  const repo = indexRepo(REPO)
  const content = generateIndex(repo, outRel)
  const abs = path.join(REPO, outRel)
  // a symlinked out-path defeats the stay-inside-the-repo law through the string
  // guard (writes follow the link; a dangling one CREATES the outside file)
  try { if (fs.lstatSync(abs).isSymbolicLink()) { console.error(`gen index: refusing ${outRel} — it is a symlink (a generated view is a plain file inside the repo)`); return 2 } }
  catch {}
  // the overwrite law rides an UNCAPPED read: a size-capped probe would read a
  // big hand-written file as "absent" and clobber it
  let existing = null
  try { existing = fs.readFileSync(abs, 'utf8') }
  catch (e) {
    if (e.code === 'EISDIR' || e.code === 'ENOTDIR') { console.error(`gen index: cannot write ${outRel} — ${e.code === 'EISDIR' ? 'it is a directory' : 'a file exists where a directory belongs on its path'}`); return 2 }
    if (e.code !== 'ENOENT') { console.error(`gen index: cannot read ${outRel} — ${e.message}`); return 2 }
  }
  if (existing !== null && !MARKER_DETECT_RE.test(existing.split('\n', 1)[0])) {
    console.error(`gen index: refusing to overwrite ${outRel} — it exists without the generated marker (a hand-written file). Move it aside, or pass a different --out.`)
    return 2
  }
  if (existing === content) { console.log(`gen index: ${outRel} is up to date`); return 0 }
  try { fs.mkdirSync(path.dirname(abs), { recursive: true }) }
  catch (e) { console.error(`gen index: cannot create ${path.posix.dirname(outRel)}/ — ${e.code === 'EEXIST' || e.code === 'ENOTDIR' ? 'a file exists where the directory belongs' : e.message}`); return 2 }
  try { fs.writeFileSync(abs, content) }
  catch (e) { console.error(`gen index: cannot write ${outRel} — ${e.message}`); return 2 }
  console.log(`gen index: wrote ${outRel} (${content.split('\n').length} lines) — commit it; \`baseline gen --check\` guards it from drift`)
  return 0
}

// ---- gen --check (M6c) — the CI drift guard ----
function runGenCheck(REPO) {
  const repo = indexRepo(REPO)
  // discovery = tracked ∪ walked: the walk sees a just-generated, not-yet-added
  // view (the gen→check local flow must not go blind between write and git add);
  // the tracked pool sees committed views inside walk-skipped dirs (vendor/ …).
  // A vendored tree's own marked views ride along: bounded cost, and an alien
  // kind fails loudly below — documented residual.
  const pool = [...new Set([...repo.match(['**/*.md'], { tracked: true }), ...repo.match(['**/*.md'])])].sort()
  const drifted = [], broken = []
  let views = 0
  for (const f of pool) {
    // uncapped read: readText's 512KB/binary cap would silently green a big
    // drifted view — the exact silent-green hole --check exists to close
    let raw = null
    try { raw = fs.readFileSync(path.join(REPO, f), 'utf8') }
    catch (e) {
      if (e.code === 'ENOENT') {
        // deleted-but-tracked: only a red flag if the STAGED content is a view —
        // a deleted ordinary doc is git's business, not a drift finding
        const staged = repo.gitCatFile(':0', f)
        if (staged !== null && MARKER_DETECT_RE.test(staged.split('\n', 1)[0])) broken.push({ f, why: 'generated view deleted from the worktree but still tracked — restore it (regenerate) or git rm it' })
        continue
      }
      broken.push({ f, why: 'tracked but unreadable — the view (if it is one) is unscannable; fix the file or its permissions' }); continue
    }
    const m = raw.split('\n', 1)[0].match(MARKER_DETECT_RE)
    if (!m) continue
    views++
    const kind = m[1]
    if (!GEN_KINDS.has(kind)) {
      broken.push({ f, why: `unknown generated kind '${kind}' — either the vendored skill here is OLDER than the view (bump the vendored skill, then regenerate) or the marker is a typo (kinds: ${[...GEN_KINDS].join(', ')})` })
      continue
    }
    const fresh = generateIndex(repo, f)
    if (fresh !== raw) drifted.push(f)
  }
  if (!views && !broken.length) { console.log('gen --check: no generated views (marker absent) — trivially green'); return 0 }
  // repo-authored bytes (filenames, marker kind tokens) reach the terminal here —
  // the anti-tamper guard's own output must not be spoofable by the content it
  // scans (an ESC-bearing kind could overwrite a finding as green). Same sanitize
  // discipline as every other human surface.
  const S = sanitizeTTY
  for (const f of drifted) {
    console.error(`✗ ${S(f)} drifted from its inputs`)
    console.error(`    regenerate and commit: ${S(remedyCommand(REPO, 'index', f))}`)
    console.error(`    (the drift may predate this PR — regenerating here clears it for everyone; if the vendored skill just bumped, the generator's shape changed with it — regenerate with the NEW version and commit the view alongside the bump; if this file was never generated at all, someone pasted the marker — delete the marker line instead)`)
  }
  for (const b of broken) console.error(`✗ ${S(b.f)}: ${S(b.why)}`)
  if (drifted.length || broken.length) { console.error(`\ngen --check: ${drifted.length} drifted · ${broken.length} broken of ${views} view(s)`); return 1 }
  console.log(`gen --check: ${views} generated view(s) in sync`)
  return 0
}

// ---- gen okf-concepts (v3 D2 / V35) — the one-shot OKF migration ----
// Inputs are the runner's OWN shipped files, co-located like rules.json: the rule set
// (title, lesson, rationale, fix, prior-art url), docs/REFERENCE.md's rule table (the row
// is the source span the frontmatter cites) and docs/GLOSSARY.md (the terms a rule's prose
// uses, each cited by line). Nothing from the target repo, nothing from the bundle.
// The prose lives under docs/ and ships there (install.sh), so these are the same relative
// paths in this repo and in a vendored copy.
const SHIPPED = (rel) => { try { return fs.readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8') } catch { return null } }
const OKF_STAGING = 'baseline/rules' // under <repo>/.baseline/proposed/ — the bundle's own layout
// The two prose views this extraction cites, named once so the citation strings and the
// reads can never drift apart. Both are shipped by install.sh at exactly these paths.
const REFERENCE_MD = 'docs/REFERENCE.md'
const GLOSSARY_MD = 'docs/GLOSSARY.md'

/** docs/REFERENCE.md rule table: base id → 1-based line of its row. Matched on the two-part
 *  base so the row is found before and after the slugs land (PLAN §2). */
function referenceRows(md) {
  const rows = new Map()
  if (md === null) return rows
  md.split('\n').forEach((line, i) => {
    const m = line.match(/^\|\s*([A-Z]+-\d{2})(?:-[a-z0-9-]+)?\s*\|/)
    if (m && !rows.has(m[1])) rows.set(m[1], i + 1)
  })
  return rows
}
/** docs/GLOSSARY.md: every `## Term` heading with its line and first paragraph, one line each. */
function glossaryTerms(md) {
  const terms = []
  if (md === null) return terms
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.+?)\s*$/)
    if (!h) continue
    const para = []
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      if (!lines[j].trim()) { if (para.length) break; continue }
      para.push(lines[j].trim())
    }
    terms.push({ name: h[1], line: i + 1, def: para.join(' ') })
  }
  return terms
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = (hay, name) => new RegExp('(^|[^A-Za-z0-9])' + esc(name) + '([^A-Za-z0-9]|$)', 'i').test(hay)
const y = (v) => JSON.stringify(String(v)) // a YAML double-quoted scalar is JSON-compatible
const md1 = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** One concept per loaded rule, in rules.json module order. Pure of clock, machine and
 *  cwd: the same rule set and docs produce the same bytes anywhere. */
export function generateConcepts() {
  const { modules, rules } = loadRules()
  // which module a rule came from — the fallback source span when docs/REFERENCE.md has no row
  const moduleOf = new Map()
  for (const m of modules) for (const r of JSON.parse(SHIPPED(m) || '{"rules":[]}').rules || []) if (!moduleOf.has(r.id)) moduleOf.set(r.id, m)
  const rows = referenceRows(SHIPPED(REFERENCE_MD))
  const terms = glossaryTerms(SHIPPED(GLOSSARY_MD))
  const out = []
  for (const r of rules) {
    const refLine = rows.get(baseOf(r.id))
    const source = refLine ? `${REFERENCE_MD}:${refLine}` : `${moduleOf.get(r.id) || 'rules.json'}#${r.id}`
    const hay = [r.title, r.lesson, r.rationale, r.fix].map(md1).join(' ')
    const used = terms.filter(t => mentions(hay, t.name))
    const applies = Array.isArray(r.applies_to) ? r.applies_to.join(', ') : String(r.applies_to ?? 'all')
    const P = []
    P.push('---')
    P.push(`id: ${conceptOf(r.id)}`)
    P.push(`title: ${y(r.title)}`)
    P.push(`rule: ${r.id}`)
    P.push(`category: ${r.category}`)
    P.push(`severity: ${r.severity}`)
    P.push(`source: ${source}`)
    P.push('---')
    P.push('')
    P.push(`# ${r.id} — ${md1(r.title)}`)
    P.push('')
    P.push(`- **Severity:** ${r.severity} · **Category:** ${r.category} · **Applies to:** ${applies}${r.pack ? ` · **Pack:** ${r.pack}` : ''}`)
    if (r.lesson) P.push(`- **Lesson:** ${md1(r.lesson)}`)
    if (r.rationale) P.push(`- **Why it matters:** ${md1(r.rationale)}`)
    if (r.fix) P.push(`- **Fix:** ${md1(r.fix)}`)
    if (r.source) P.push(`- **Prior art:** ${md1(r.source)}`)
    P.push(`- **Extracted from:** ${source}`)
    if (used.length) {
      P.push('')
      P.push('## Terms')
      P.push('')
      for (const t of used) P.push(`- **${t.name}** (${GLOSSARY_MD}:${t.line}) — ${t.def}`)
    }
    P.push('')
    out.push({ rel: `${OKF_STAGING}/${String(r.id).toLowerCase()}.md`, content: P.join('\n'), fromReference: !!refLine })
  }
  return out
}

function runGenOkfConcepts(REPO) {
  try { if (!fs.statSync(REPO).isDirectory()) throw new Error('not a directory') }
  catch (e) { console.error(`gen okf-concepts: --repo ${REPO} — ${e.message}`); return 2 }
  let concepts
  try { concepts = generateConcepts() }
  catch (e) { console.error(`gen okf-concepts: ${e.message}`); return 2 }
  const stagingRel = path.posix.join('.baseline', 'proposed')
  const rulesDir = path.join(REPO, stagingRel, OKF_STAGING)
  // the staging tree is generator-owned: a stale concept for a rule that no longer
  // exists must not linger, or two runs on the same input would differ by a file
  try {
    fs.rmSync(rulesDir, { recursive: true, force: true })
    fs.mkdirSync(rulesDir, { recursive: true })
  } catch (e) { console.error(`gen okf-concepts: cannot prepare ${stagingRel}/${OKF_STAGING}/ — ${e.message}`); return 2 }
  let fromRef = 0
  for (const c of concepts) {
    try { fs.writeFileSync(path.join(REPO, stagingRel, c.rel), c.content) }
    catch (e) { console.error(`gen okf-concepts: cannot write ${c.rel} — ${e.message}`); return 2 }
    if (c.fromReference) fromRef++
  }
  console.log(`gen okf-concepts: ${concepts.length} concept(s) staged under ${stagingRel}/${OKF_STAGING}/ (${fromRef} cite a ${REFERENCE_MD} row, ${concepts.length - fromRef} their rules/ module)`)
  console.log('  review the batch, then copy it into the okf bundle by hand — baseline never writes there')
  return 0
}
