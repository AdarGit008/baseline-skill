#!/usr/bin/env node
// M4a suite — the rules split, the record schemas, scrub, and `baseline log`.
// Zero-dependency, Node >= 18. Fake secrets are ALWAYS built by concatenation so
// the skill repo's own SEC scan (and any scanner reading this file) never sees a
// well-formed signature at rest — the same discipline as the golden harness.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../src/rules.mjs'
import { RECORD_KINDS, validateRecord, parseFrontmatter, renderFrontmatter, parseAdrHeader, adrEdges } from '../../src/records.mjs'
import { evaluateJudgment, evalCondition, loadJudgments } from '../../src/jdg.mjs'
import { scan, findingId, DETERMINISTIC_SOURCES } from '../../src/scrub.mjs'
import { extractNext, diagnoseNext, newestLocalLog, gitFacts } from '../../src/facts/git.mjs'
import { runRules } from '../../src/engine.mjs'
import { makeEvalCheck } from '../../src/evaluators.mjs'
import { indexRepo } from '../../src/repo.mjs'
import { globMatcher } from '../../src/util.mjs'
import { resolveConfig } from '../../src/config.mjs'
import { loadClaims } from '../../src/claims.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
// v3 ids are PREFIX-NN-slug (PLAN §2). A test names a rule by its base prefix so a slug can
// be revised in review without touching the test; both the two- and three-part forms match.
const isId = (id, p) => id === p || String(id).startsWith(p + '-')
const baseId = (id) => String(id).replace(/^([A-Z]+-\d{2}).*/, '$1')

// ---------- rules loader (the split must be lossless) ----------
{
  const R = loadRules()
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules.json'), 'utf8'))
  // both counts DERIVE — the manifest must list exactly the module files on disk, and the
  // loader must assemble exactly their rules; no rule count is ever typed here
  const onDisk = fs.readdirSync(path.join(ROOT, 'rules')).filter(f => f.endsWith('.json')).map(f => `rules/${f}`).sort()
  const listed = [...(manifest.modules || [])].sort()
  ok(JSON.stringify(listed) === JSON.stringify(onDisk), `manifest lists exactly the modules on disk (${listed.length} listed, ${onDisk.length} on disk)`)
  const perModule = (manifest.modules || []).reduce((n, m) => n + JSON.parse(fs.readFileSync(path.join(ROOT, m), 'utf8')).rules.length, 0)
  ok(R.rules.length === perModule, `loader assembles every module's rules losslessly (${R.rules.length} assembled vs ${perModule} across ${(manifest.modules || []).length} modules)`)
  ok(!('rules' in manifest), 'manifest itself carries no rules (they live in rules/)')
  ok(new Set(R.rules.map(r => r.id)).size === R.rules.length, 'rule ids unique across modules')
  ok(!!R.version && R.packs && typeof R.packs === 'object' && !Array.isArray(R.packs) && Array.isArray(R.project_types), 'identity fields (version/packs/project_types) ride the manifest')
  // v3 §5: the profile vocabulary retired with the engine keying on `pack` — the manifest
  // keeps `packs` (the catalogue) and nothing else names a profile
  ok(!('profiles' in R), 'manifest carries no `profiles` map (retired; `packs` is the catalogue)')
  ok(R.rules.every(r => !('profile' in r) && !('requires' in r)), 'no rule carries a retired `profile`/`requires` key')
  const catalogued = new Set(Object.keys(R.packs))
  const declared = [...new Set(R.rules.map(r => r.pack).filter(Boolean))]
  ok(declared.every(pk => catalogued.has(pk)), `every pack a rule declares is in the manifest catalogue (${declared.length} declared, ${catalogued.size} catalogued)`)
  let homed = true
  for (const m of manifest.modules) {
    const cat = path.basename(m, '.json')
    const mod = JSON.parse(fs.readFileSync(path.join(ROOT, m), 'utf8'))
    for (const r of mod.rules) {
      // the module file IS the category: a rule's id prefix, lowercased, names its home
      const prefix = r.id.split('-')[0].toLowerCase()
      if (prefix !== cat) { homed = false; console.log(`      ${r.id} lives in ${m}`) }
    }
  }
  ok(homed, 'every rule lives in its own category module')
}

// ---------- record schemas ----------
{
  const validJdg = { record: 'judgment/1', id: 'JDG-0007', kind: 'break-glass', date: '2026-07-11', by: 'adar', subject: 'admit outage', reason: 'forge down; change reviewed by hand', review_by: '2026-07-18', gate: 'admit', tripwire: { fact: 'forge.available', op: 'eq', value: true } }
  ok(validateRecord('judgment', validJdg).length === 0, 'judgment: valid break-glass validates (kind + gate expressible — FS5 shape)')
  const e1 = validateRecord('judgment', { ...validJdg, kind: 'override', id: 'JDG-7', date: 'today', extra: 1, tripwire: { fact: 'x', op: 'unless' } })
  ok(e1.length === 5, `judgment: bad kind/id/date/extra-field/tripwire-op all caught (got ${e1.length}: ${e1.join(' | ')})`)
  ok(validateRecord('judgment', JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/judgment.json'), 'utf8'))).length === 0, 'templates/judgment.json validates (with _help ignored)')

  const sess = { record: 'session/1', lane: 'v2/m4a-records-log', agent: 'claude-fable', started: '2026-07-11T12:00:00Z' }
  ok(validateRecord('session', sess).length === 0, 'session: valid frontmatter validates')
  ok(validateRecord('session', { ...sess, agent: 'Claude Fable' }).length === 1, 'session: unslugged agent rejected')
  ok(validateRecord('session', { ...sess, started: '2026-07-11 12:00' }).length === 1, 'session: non-UTC-instant started rejected')
  ok(validateRecord('session', { record: 'session/1', lane: 'x', agent: 'a' }).length === 1, 'session: missing started caught')

  ok(validateRecord('claim', JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/claim.json'), 'utf8'))).length === 0, 'templates/claim.json validates')
  const badClaim = validateRecord('claim', { record: 'claim/1', id: 'CLM-0001', statement: 's', type: 'vibes', build_state: 'shipped-tested', blast_radius: 'recoverable', citations: [{ url: 'https://x' }] })
  ok(badClaim.length === 2, `claim: bad type + citation missing supports_because caught (got ${badClaim.length})`)

  const adr = parseAdrHeader(fs.readFileSync(path.join(ROOT, 'templates/adr.md'), 'utf8'))
  ok(validateRecord('adr', adr).length === 0, 'templates/adr.md header extracts + validates')
  ok(validateRecord('adr', { status: 'vibes', date: '2026-07-11' }).length === 1, 'adr: unknown status rejected')
  ok(Object.keys(RECORD_KINDS).length === 4, 'four record kinds registered')
}

// ---------- frontmatter ----------
{
  const fm = renderFrontmatter({ record: 'session/1', lane: 'a/b', agent: 'x', started: '2026-07-11T00:00:00Z' })
  const back = parseFrontmatter(fm + '\nbody line\n')
  ok(back.fields.lane === 'a/b' && back.body === '\nbody line\n', 'frontmatter roundtrip preserves fields + body')
  ok(parseFrontmatter('no frontmatter here').fields === null, 'no frontmatter -> fields null, body intact')
  ok(parseFrontmatter('---\r\nrecord: session/1\r\n---\r\nx').fields.record === 'session/1', 'CRLF frontmatter tolerated')
}

// ---------- scrub ----------
{
  const akia = 'AKIA' + 'IOSFODNN7EXAMPLE'
  const ghp = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'
  const pat = 'github_pat_' + '11ABCDEFG0' + 'abcdefghijklmnopqrstuv'
  const key = '-----BEGIN ' + 'PRIVATE KEY-----'
  const slack = 'xoxb-' + '123456789012-abcdefghijkl'
  const aiza = 'AIza' + 'SyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1v'
  const jwt = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiIxMjM0In0', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c']
  const detText = [akia, ghp, pat, key, slack, aiza, jwt.join('.')].join('\n')
  const det = scan(detText)
  ok(det.blocked.length === 7 && det.warned.length === 0, `all 7 deterministic signatures block (got ${det.blocked.length} blocked, ${det.warned.length} warned)`)
  ok(det.blocked.every(f => !detText.includes(f.masked) || f.masked.length <= 7), 'masked excerpts never reproduce a full match')

  const heur = scan(`password = ${JSON.stringify('hunter2hunter2')}\nblob wJalrXUtnFEMI` + 'K7MDENG' + 'bPxRfiCYEXAMPLEKEY9aB')
  ok(heur.blocked.length === 0 && heur.warned.length === 2, `heuristics warn, never block (got ${heur.blocked.length}/${heur.warned.length})`)

  const shas = scan('commits deadbeefdeadbeefdeadbeefdeadbeefdeadbeef and abc1234; next: replay the forge fixtures')
  ok(shas.blocked.length + shas.warned.length === 0, 'a 40-hex commit SHA in session prose never trips the entropy floor')

  const id = findingId('aws-access-key-id', akia)
  ok(id === findingId('aws-access-key-id', akia) && /^scrub-[0-9a-f]{12}$/.test(id), 'finding id is stable + content-derived')
  const allowed = scan(detText, { allowlist: [{ id, reason: 'documented example', date: '2026-07-11' }] })
  ok(allowed.blocked.length === 6 && allowed.allowed.length === 1 && allowed.allowed[0].reason === 'documented example', 'allowlist suppresses exactly its finding and surfaces the judgment')
  const dup = scan(akia + ' twice ' + akia)
  ok(dup.blocked.length === 1 && dup.blocked[0].count === 2, 'repeated value dedupes to one finding with a count')

  const overlap = scan('api_key: "' + akia + '"')
  ok(overlap.blocked.length === 1 && overlap.warned.length === 0, 'a signature inside a quoted assignment reports ONCE, deterministically (span suppression)')

  // scrub's deterministic tier must never drift from SEC-01 — pin each source as a
  // substring of the rule's pattern (normalizing escaping/non-capturing differences)
  const norm = s => s.replace(/\\-/g, '-').replace(/\(\?:/g, '(')
  const sec01 = norm(loadRules().rules.find(r => isId(r.id, 'SEC-01')).check.pattern)
  const shared = ['private-key-block', 'aws-access-key-id', 'google-api-key', 'slack-token', 'github-token']
  ok(shared.every(n => sec01.includes(norm(DETERMINISTIC_SOURCES.find(p => p.name === n).source))), 'deterministic tier stays SEC-01-parity (each source pinned inside the rule pattern)')
}

// ---------- `baseline log` end-to-end ----------
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const sh = (cwd, cmd, args, env = {}) => {
  try { return { out: execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...GIT_ENV, ...env } }).toString(), code: 0 } }
  catch (e) { return { out: (e.stdout || '').toString() + (e.stderr || '').toString(), code: e.status ?? 1 } }
}
const mkrepo = (branch) => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-records-'))
  sh(t, 'git', ['init', '-q'])
  sh(t, 'git', ['config', 'user.email', 'r@fixture.local'])
  sh(t, 'git', ['config', 'user.name', 'Records Fixture'])
  sh(t, 'git', ['checkout', '-qb', branch])
  return t
}
const NOW = { BASELINE_LOG_NOW: '2026-07-11T12:00:00Z' }
const tmps = []
try {
  // happy path on an unborn branch — first session, no commits yet
  const t1 = mkrepo('lane/alpha'); tmps.push(t1)
  const r1 = sh(t1, process.execPath, [BASELINE, 'log', '--repo', t1, '-m', 'did the thing; corpus green', '--next', 'wire CI'], NOW)
  const rel1 = 'records/sessions/lane/alpha/2026-07-11-120000-records-fixture.md'
  ok(r1.code === 0 && fs.existsSync(path.join(t1, rel1)), `log writes the CF1 path on an unborn branch (${rel1})`)
  const written = fs.readFileSync(path.join(t1, rel1), 'utf8')
  ok(validateRecord('session', parseFrontmatter(written).fields).length === 0, 'written record validates against its own schema')
  ok(extractNext(written) === 'wire CI', 'orient contract: extractNext reads the next: back')
  // #50: three states used to answer to one null, and the finding described one of them.
  ok(diagnoseNext(written).cause === 'ok', 'diagnoseNext calls a read next: ok')
  const noSection = '# S\n\n## Did\nwork\n\nnext: the one next step\n'
  ok(diagnoseNext(noSection).next === null && diagnoseNext(noSection).cause === 'no-section' && diagnoseNext(noSection).stray === 6,
    'diagnoseNext: no section -> no-section, pointing at the top-level next: it did not read (#50)')
  ok(diagnoseNext('# S\n\n## Did\nwork\n').cause === 'no-section' && diagnoseNext('# S\n\n## Did\nwork\n').stray === null,
    'diagnoseNext: no section and no next: anywhere -> no stray to point at (#50)')
  ok(diagnoseNext('## Left open\nnothing\n').cause === 'no-line', 'diagnoseNext: section without a next: line -> no-line (#50)')
  ok(diagnoseNext('## Left open\nnext:   \n').cause === 'blank', 'diagnoseNext: a blank value is the one case the old message described (#50)')
  ok(diagnoseNext('## Left open\nnext:\n\n## After\nnext: not this one\n').cause === 'blank',
    'diagnoseNext: the section ends at the next heading — a later next: is not smuggled in (#50)')
  ok(newestLocalLog({ REPO: t1 }, 'lane/alpha').next === 'wire CI', 'orient contract: newestLocalLog resolves lane -> next')
  const r1b = sh(t1, process.execPath, [BASELINE, 'log', '--repo', t1, '-m', 'again same second'], NOW)
  ok(r1b.code === 2 && /already exists/.test(r1b.out), 'same second + agent refuses loudly (O_EXCL, no counters)')
  const gf = gitFacts({ REPO: t1, HEAD: null, gitIsShallow: () => false })
  ok(gf.branch === 'lane/alpha' && gf.thisLaneLog?.next === 'wire CI', 'orient symmetry: gitFacts reads the unborn-branch lane + its next: (currentLane seam)')
  const rTxt = sh(t1, process.execPath, [BASELINE, 'log', '--repo', t1, '-m', '--started with a dash', '--lane', 'lane/dash'], NOW)
  ok(rTxt.code === 0, "free-text flags accept prose starting with '--'")
  const rDe = sh(t1, process.execPath, [BASELINE, 'log', '--repo', t1, '-m', 'x', '--deadends', 'tried Y; dead', '--lane', 'lane/de'], NOW)
  ok(rDe.code === 0 && fs.readFileSync(path.join(t1, 'records/sessions/lane/de/2026-07-11-120000-records-fixture.md'), 'utf8').includes('## Dead ends\ntried Y; dead'), '--deadends writes its own section')
  const rTrav = sh(t1, process.execPath, [BASELINE, 'log', '--repo', t1, '-m', 'x', '--lane', '../../outside'], NOW)
  ok(rTrav.code === 2 && /escapes records\/sessions/.test(rTrav.out), 'a traversal lane is refused before anything is written (containment check)')

  // scrub block -> non-lossy draft -> replay with the dated judgment
  const t2 = mkrepo('lane/beta'); tmps.push(t2)
  const akia = 'AKIA' + 'IOSFODNN7EXAMPLE'
  const r2 = sh(t2, process.execPath, [BASELINE, 'log', '--repo', t2, '-m', `found ${akia} in an old commit`, '--next', 'rotate'], NOW)
  const draft = 'records/sessions/lane/beta'
  ok(r2.code === 1 && !fs.existsSync(path.join(t2, draft)), 'deterministic finding blocks: exit 1, nothing under records/')
  const draftRel = (r2.out.match(/\.baseline\/cache\/[^\s]+\.md/) || [])[0]
  ok(!!draftRel && fs.existsSync(path.join(t2, draftRel)), `draft survives at ${draftRel || '(missing)'}`)
  const allowId = (r2.out.match(/scrub-[0-9a-f]{12}/) || [])[0]
  const r2b = sh(t2, process.execPath, [BASELINE, 'log', '--repo', t2, '--from', draftRel, '--allow', allowId, '--allow-reason', 'AWS documented example key'], NOW)
  ok(r2b.code === 0 && fs.existsSync(path.join(t2, 'records/sessions/lane/beta/2026-07-11-120000-records-fixture.md')), 'draft replay + --allow writes the record at the original stamp')
  const wl = JSON.parse(fs.readFileSync(path.join(t2, '.baseline/scrub-allowlist.json'), 'utf8'))
  ok(wl.entries.length === 1 && wl.entries[0].id === allowId && wl.entries[0].date === '2026-07-11' && !!wl.entries[0].reason, 'allowlist entry is a dated judgment (id + reason + date, never the secret)')
  ok(!JSON.stringify(wl).includes(akia), 'the allowlist never contains the flagged value')

  // stdin + --json + --lane override
  const t3 = mkrepo('main'); tmps.push(t3)
  const r3 = (() => { try { return { out: execFileSync(process.execPath, [BASELINE, 'log', '--repo', t3, '--json', '--lane', 'lane/gamma', '--agent', 'Piped Agent'], { cwd: t3, input: 'from stdin\n', stdio: ['pipe', 'pipe', 'pipe'], env: { ...GIT_ENV, ...NOW } }).toString(), code: 0 } } catch (e) { return { out: (e.stdout || '').toString(), code: e.status ?? 1 } } })()
  const j3 = JSON.parse(r3.out)
  ok(r3.code === 0 && j3.written === 'records/sessions/lane/gamma/2026-07-11-120000-piped-agent.md', 'stdin message + --lane/--agent overrides + --json shape')

  // environment errors + side-effect discipline
  const t4 = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-nogit-')); tmps.push(t4)
  const r4 = sh(t4, process.execPath, [BASELINE, 'log', '--repo', t4, '-m', 'x'], NOW)
  ok(r4.code === 2 && /no lane resolvable/.test(r4.out), 'outside git with no --lane: usage error, not a crash')
  const r5 = sh(t4, process.execPath, [BASELINE, 'log', '--repo', t4, '-m', 'x', '--allow', 'scrub-abc'], NOW)
  ok(r5.code === 2 && /--allow-reason/.test(r5.out), '--allow without --allow-reason refused (judgments are dated + reasoned)')

  const t5 = mkrepo('lane/omega'); tmps.push(t5)
  const rBadFrom = sh(t5, process.execPath, [BASELINE, 'log', '--repo', t5, '--from', 'nope.md', '--allow', 'scrub-deadbeef0000', '--allow-reason', 'typo test'], NOW)
  ok(rBadFrom.code === 2 && !fs.existsSync(path.join(t5, '.baseline/scrub-allowlist.json')), 'a failing invocation leaves the allowlist untouched (judgments land only on valid runs)')
  fs.mkdirSync(path.join(t5, '.baseline'), { recursive: true })
  fs.writeFileSync(path.join(t5, '.baseline/scrub-allowlist.json'), '{bad json')
  const rCor = sh(t5, process.execPath, [BASELINE, 'log', '--repo', t5, '-m', 'hello world'], NOW)
  ok(rCor.code === 2 && /allowlist unreadable/.test(rCor.out), 'corrupt allowlist -> exit 2 with a fix-it message, never a fake scrub block (exit 1)')

  // ---- the judgment machine contract (M4b): pure evaluator ----
  const F = { today: '2026-07-11', descriptor: { present: true, valid: true, workflow: 'multi-lane', anchoring: 'strict', maturity: 'prototype' }, planes: { forge: { available: false } }, git: { branch: 'lane/x' } }
  const J = over => ({ record: 'judgment/1', id: 'JDG-0001', kind: 'risk-acceptance', date: '2026-07-01', by: 'adar', subject: 'SEC-13', reason: 'r', review_by: '2026-12-31', ...over })
  ok(evaluateJudgment(J({ tripwire: { fact: 'descriptor.maturity', op: 'ne', value: 'prototype' } }), F).verdict === 'ok', 'evaluator: healthy judgment -> ok')
  ok(evaluateJudgment(J({}), F).findings.some(f => f.code === 'advice' && /no tripwire/.test(f.text)), 'evaluator: tripwire-less deviation-class judgment carries the warning note')
  ok(evaluateJudgment(J({ review_by: '2026-07-10' }), F).verdict === 'expired', 'evaluator: past review_by -> expired')
  ok(evaluateJudgment(J({ expected_state: { 'descriptor.maturity': 'claimed' } }), F).verdict === 'drifted', 'evaluator: expected_state mismatch -> drifted')
  ok(evaluateJudgment(J({ tripwire: { fact: 'descriptor.workflow', op: 'ne', value: 'single-lane' } }), F).verdict === 'tripped', 'evaluator: fired tripwire -> tripped')
  ok(evaluateJudgment(J({ tripwire: { fact: 'descriptor.nope', op: 'eq', value: 1 } }), F).verdict === 'unresolvable', 'evaluator: unknown fact path -> unresolvable, never a guess')
  ok(evaluateJudgment(J({ review_by: '2026-07-10', tripwire: { fact: 'descriptor.workflow', op: 'ne', value: 'single-lane' } }), F).verdict === 'tripped', 'evaluator lattice: tripped outranks expired')
  ok(evalCondition({ fact: 'a', op: 'gt', value: 2 }, { a: 3 }).fired === true && evalCondition({ fact: 'a', op: 'lt', value: '2026-08-01' }, { a: '2026-07-11' }).fired === true, 'evalCondition: numeric gt + ISO-date string lt compare correctly')
  ok(evalCondition({ fact: 'x.y', op: 'exists' }, { x: { y: 0 } }).fired === true && evalCondition({ fact: 'x.z', op: 'absent' }, { x: {} }).fired === true, 'evalCondition: exists/absent are presence tests (falsy-zero exists)')
  ok(evalCondition({ fact: 'a', op: 'gt', value: 2 }, { a: 'three' }).fired === null, 'evalCondition: mixed-type comparison is unresolvable, not false')

  // the DESC-03 shape — the record M2 deferred to this schema (issue #21 acceptance)
  const desc03 = { record: 'judgment/1', id: 'JDG-0002', kind: 'sign-off', date: '2026-07-11', by: 'adar', subject: 'baseline.repo.json', reason: 'posture change reviewed: workflow stays multi-lane, anchoring strict', review_by: '2026-10-01', expected_state: { 'descriptor.workflow': 'multi-lane', 'descriptor.anchoring': 'strict' }, tripwire: { fact: 'descriptor.workflow', op: 'ne', value: 'multi-lane' } }
  ok(validateRecord('judgment', desc03).length === 0, 'DESC-03-shape descriptor-change JDG validates with machine-readable expected_state + tripwire + review_by')
  ok(evaluateJudgment(desc03, F).verdict === 'ok', 'DESC-03 shape: evaluates ok while the posture holds')
  ok(evaluateJudgment(desc03, { ...F, descriptor: { ...F.descriptor, workflow: 'single-lane' } }).verdict === 'tripped', 'DESC-03 shape: posture weakening fires the tripwire')

  // ---- jdg new|check end-to-end ----
  const t6 = mkrepo('lane/jdg'); tmps.push(t6)
  const j1 = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'risk-acceptance', '--subject', 'SEC-13', '--reason', 'deferred until first consumer', '--review-by', '2026-12-31', '--expect', 'descriptor.present=true', '--tripwire', 'descriptor.maturity ne prototype'], NOW)
  ok(j1.code === 0 && validateRecord('judgment', JSON.parse(fs.readFileSync(path.join(t6, 'records/judgments/JDG-0001.json'), 'utf8'))).length === 0, 'jdg new writes a schema-valid numbered record')
  const j2 = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'break-glass', '--subject', 'forge outage', '--reason', 'reviewed by hand', '--review-by', '2026-07-18', '--gate', 'admit'], NOW)
  ok(j2.code === 0 && JSON.parse(fs.readFileSync(path.join(t6, 'records/judgments/JDG-0002.json'), 'utf8')).gate === 'admit', 'numbering increments; break-glass carries its gate')
  const jGate = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'break-glass', '--subject', 'x', '--reason', 'r', '--review-by', '2026-07-18'], NOW)
  ok(jGate.code === 2 && /--gate/.test(jGate.out), 'break-glass without --gate refused (FS5 shape law)')
  const jSecret = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'deviation', '--subject', 'SEC-01', '--reason', 'token ' + 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789', '--review-by', '2026-08-01'], NOW)
  ok(jSecret.code === 1 && !fs.existsSync(path.join(t6, 'records/judgments/JDG-0003.json')), 'a live secret in --reason is scrub-blocked, nothing written')
  const jdgDraft = (jSecret.out.match(/\.baseline\/cache\/[^\s]+\.json/) || [])[0]
  const jdgAllow = (jSecret.out.match(/scrub-[0-9a-f]{12}/) || [])[0]
  ok(!!jdgDraft && fs.existsSync(path.join(t6, jdgDraft)), 'jdg block is non-lossy: the draft survives under .baseline/cache/')
  const jReplay = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--from', jdgDraft, '--allow', jdgAllow, '--allow-reason', 'concatenated fixture token'], NOW)
  ok(jReplay.code === 0 && fs.existsSync(path.join(t6, 'records/judgments/JDG-0003.json')), 'jdg draft replay + --allow writes the record at the next free number')
  const jWs = sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'deviation', '--subject', 'x', '--reason', 'r', '--review-by', '2026-08-01', '--tripwire', 'git.branch eq "feat  x"'], NOW)
  ok(jWs.code === 0 && JSON.parse(fs.readFileSync(path.join(t6, 'records/judgments/JDG-0004.json'), 'utf8')).tripwire.value === 'feat  x', 'tripwire values keep their inner whitespace verbatim')
  ok(sh(t6, process.execPath, [BASELINE, 'jdg', 'new', '--repo', t6, '--kind', 'sign-off', '--subject', 's', '--reason', 'r', '--review-by', '2026-08-01', '--by', '--json'], NOW).code === 2, 'a value flag followed by a flag is refused — no ledger record attributed to "true"')
  ok(sh(t6, process.execPath, [BASELINE, 'jdg', 'check', '--repo', t6, '--facts', '--json'], NOW).code === 2, '--facts without a value is a usage error, not a silent no-overlay success')
  ok(evalCondition({ fact: 'o', op: 'ne', value: { a: 1, b: 2 } }, { o: { b: 2, a: 1 } }).fired === false, 'deepEq: JSON key order is not a changed world')
  const c1 = sh(t6, process.execPath, [BASELINE, 'jdg', 'check', '--repo', t6], NOW)
  ok(c1.code === 0 && /ledger healthy/.test(c1.out), 'check: healthy ledger exits 0')
  fs.writeFileSync(path.join(t6, 'facts.json'), JSON.stringify({ descriptor: { maturity: 'claimed' } }))
  const c2 = sh(t6, process.execPath, [BASELINE, 'jdg', 'check', '--repo', t6, '--facts', 'facts.json'], NOW)
  ok(c2.code === 1 && /TRIPPED/.test(c2.out), 'check: a --facts overlay firing a tripwire exits 1')
  const c3 = sh(t6, process.execPath, [BASELINE, 'jdg', 'check', '--repo', t6], { BASELINE_LOG_NOW: '2100-01-01T00:00:00Z' })
  ok(c3.code === 1 && /EXPIRED/.test(c3.out), 'check: past review_by exits 1 (judgments lapse)')
  fs.writeFileSync(path.join(t6, 'records/judgments/JDG-9999.json'), '{bad')
  const c4 = sh(t6, process.execPath, [BASELINE, 'jdg', 'check', '--repo', t6], NOW)
  ok(c4.code === 1 && /INVALID/.test(c4.out), 'check: an unparseable ledger file is loud, exit 1')
  fs.rmSync(path.join(t6, 'records/judgments/JDG-9999.json'))
  fs.writeFileSync(path.join(t6, 'records/judgments/JDG-0100.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(t6, 'records/judgments/JDG-0001.json'), 'utf8')), id: 'JDG-0007' }))
  ok(loadJudgments(t6).findings.some(f => /does not match filename/.test(f.error)), 'loadJudgments: id/filename mismatch is a finding')
  fs.rmSync(path.join(t6, 'records/judgments/JDG-0100.json'))

  // ---- v3 engine gates (pure, data-driven): a gate MISS is no row; in scope but
  // unevaluable is {state:'n/a', reason}. D4/V36: there is no SKIP tag anywhere. ----
  {
    const NOOP = () => ({ ok: true, detail: 'ran' })
    const gate = (rule, over = {}) => runRules({
      rules: [{ id: 'X-01', severity: 'warn', applies_to: 'all', contexts: ['check'], check: { kind: 'x' }, ...rule }],
      cfg: { project_type: 'docs', ...(over.cfg || {}) },
      ACTIVE_PACKS: over.ACTIVE_PACKS ?? new Set(),
      evalCheck: over.evalCheck ?? NOOP,
      DESCRIPTOR: over.DESCRIPTOR ?? null,
      TOOLS_PRESENT: 'TOOLS_PRESENT' in over ? over.TOOLS_PRESENT : null, // null = the runner detected nothing (the evaluator owns the subject question)
      forgeClosed: over.forgeClosed ?? null,
    })[0]
    const isNA = row => !!row && row.state === 'n/a' && typeof row.reason === 'string' && row.reason.trim().length > 0 && !('tag' in row)
    const SL = { valid: true, data: { workflow: 'single-lane' } }
    // posture gate (data-driven `workflow`): a miss is structural — no row, never a finding
    ok(gate({ workflow: 'multi-lane' }) === undefined, 'engine: a workflow rule with no descriptor is a gate MISS — no row')
    ok(gate({ workflow: 'multi-lane' }, { DESCRIPTOR: SL }) === undefined, 'engine: a workflow rule on the other posture is a gate MISS — no row')
    ok(gate({ workflow: ['multi-lane', 'single-lane'] }, { DESCRIPTOR: SL })?.tag === 'PASS', 'engine: a posture FAMILY that includes the descriptor posture runs')
    // type gate
    ok(gate({ applies_to: ['node'] }) === undefined, 'engine: an off-type rule is a gate MISS — no row')
    ok(gate({ applies_to: ['docs', 'node'] })?.tag === 'PASS', 'engine: an on-type rule runs')
    // pack gate (V15/V16): the engine keys on `pack`; an inactive pack pushes no row, and
    // activating one pack activates no other
    ok(gate({ pack: 'claims' }) === undefined, 'engine: a pack rule with no pack active is a gate MISS — no row')
    ok(gate({ pack: 'claims' }, { ACTIVE_PACKS: new Set(['claims']) })?.tag === 'PASS', 'engine: a pack rule runs when its pack is active')
    ok(gate({ pack: 'decisions' }, { ACTIVE_PACKS: new Set(['claims']) }) === undefined, 'engine: activating one pack activates no other (claims on, decisions rule still no row)')
    ok(gate({ requires: 'some_key' }, { cfg: { some_key: false } })?.tag === 'PASS', 'engine: a stray `requires` key confers no opt-out (retired vocabulary; selfcheck forbids it in the real set)')
    ok(gate({ profile: 'claims' })?.tag === 'PASS', 'engine: a stray `profile` key is not a pack gate (retired vocabulary; selfcheck forbids it in the real set)')
    // M6a: the context gate EXCLUDES (no row); a rule with NO contexts runs nowhere
    ok(gate({ contexts: ['admit'] }) === undefined, 'engine: a rule outside the run context is a gate MISS — no row')
    ok(gate({ contexts: undefined }) === undefined, 'engine: a rule with no contexts runs nowhere (selfcheck forbids it in the real set)')
    ok(gate({ contexts: ['check', 'admit'] })?.tag === 'PASS', 'engine: a shared-context rule runs in check (the default context)')
    // in scope but unevaluable (V36): an evaluator returning ok:null, or throwing, is an n/a
    // row with a non-empty reason and NO tag — never SKIP, never a silent drop
    const naRow = gate({}, { evalCheck: () => ({ ok: null, detail: 'no subject in the tree' }) })
    ok(isNA(naRow) && naRow.reason === 'no subject in the tree', `engine: an in-scope ok:null is {state:"n/a", reason} with no tag (got ${JSON.stringify({ state: naRow?.state, reason: naRow?.reason, tag: naRow?.tag })})`)
    ok(isNA(gate({}, { evalCheck: () => ({ ok: null, detail: '' }) })), 'engine: an ok:null with an empty detail still carries a non-empty reason (the engine supplies one)')
    ok(isNA(gate({}, { evalCheck: () => undefined })), 'engine: an evaluator returning nothing is n/a, not a crash')
    const thrown = gate({}, { evalCheck: () => { throw new Error('boom') } })
    ok(isNA(thrown) && /check errored/.test(thrown.reason) && /boom/.test(thrown.reason), 'engine: a THROWN check is an n/a row whose reason names the error')
    ok(![naRow, thrown].some(x => x?.tag === 'SKIP' || x?.state === 'SKIP'), 'engine: n/a is never spelled SKIP')
    // D12 (V19/V42): a forge-sourced rule under a closed forge resolves n/a BEFORE its evaluator
    let called = 0
    const fRow = gate({ sources: ['forge', 'tree'] }, { forgeClosed: 'forge not consulted', evalCheck: () => { called++; return { ok: true, detail: 'ran' } } })
    ok(isNA(fRow) && fRow.reason === 'forge not consulted' && called === 0, 'engine: a forge-sourced rule under a closed forge is n/a with the closure reason, evaluator NOT called')
    ok(gate({ sources: ['tree'] }, { forgeClosed: 'forge not consulted' })?.tag === 'PASS', 'engine: a closed forge gates only forge-sourced rules')
    ok(gate({ sources: ['forge'] })?.tag === 'PASS', 'engine: with the forge open (null) a forge-sourced rule evaluates')
    // §6 tool gate (V17/V20/V36, D13): tool present OR want -> in scope (want overrides the
    // type gate too); on-type with the tool absent -> n/a; off-type with the tool absent -> no row
    const tRow = gate({ tool: 'docker' }, { TOOLS_PRESENT: new Set() })
    ok(isNA(tRow) && /docker/.test(tRow.reason) && /want/.test(tRow.reason), 'engine: an on-type tool rule with the tool absent is n/a, and the reason names the tool and the want: route')
    ok(gate({ tool: 'docker' }, { TOOLS_PRESENT: new Set(['docker']) })?.tag === 'PASS', 'engine: a tool rule runs when the tool is detected')
    ok(gate({ tool: 'docker' }, { TOOLS_PRESENT: new Set(), cfg: { want: ['docker'] } })?.tag === 'PASS', 'engine: want:["docker"] puts the tool rule in scope with no Dockerfile (the evaluator, not the gate, answers)')
    ok(gate({ tool: 'docker', applies_to: ['node'] }, { TOOLS_PRESENT: new Set() }) === undefined, 'engine: an off-type tool rule with the tool absent is a gate MISS — no row')
    ok(gate({ tool: 'docker', applies_to: ['node'] }, { TOOLS_PRESENT: new Set(), cfg: { want: ['docker'] } })?.tag === 'PASS', 'engine: want overrides BOTH the tool gate and the type gate (REPRO-04 on a docs repo)')
    ok(gate({ tool: 'docker', applies_to: ['node'] }, { TOOLS_PRESENT: new Set(['docker']) })?.tag === 'PASS', 'engine: a detected tool overrides the type gate (a docs tree with a Dockerfile runs the docker rules)')
    ok(gate({ tool: 'docker' })?.tag === 'PASS', 'engine: a runner that detected no tools (null) leaves the subject question to the evaluator')
  }

  // ---- v3 §5 / D13 (V15/V16): the claims pack arms ONLY from an explicit switch ----
  // Before v3 a claims register in the tree auto-armed CLAIM, and the descriptor's maturity
  // tier demoted it. Both are gone: no tree content, no maturity tier, no default arms a pack.
  {
    const t9 = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-packs-')); tmps.push(t9)
    fs.mkdirSync(path.join(t9, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(t9, 'docs/CLAIMS.json'), JSON.stringify({ claims: [{ id: 'x', statement: 's', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' }] }))
    fs.mkdirSync(path.join(t9, 'records/claims'), { recursive: true })
    fs.writeFileSync(path.join(t9, 'records/claims/CLM-0001.json'), JSON.stringify({ record: 'claim/1', id: 'CLM-0001', statement: 's', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' }))
    const desc = m => JSON.stringify({ schema_version: 1, type: 'docs', lifecycle: 'production', maturity: m, workflow: 'single-lane', anchoring: 'off' })
    const cfgFile = path.join(t9, 'baseline.config.json')
    const res = (opts = {}) => resolveConfig(indexRepo(t9), opts)
    fs.writeFileSync(path.join(t9, 'baseline.repo.json'), desc('claimed'))
    let r = res()
    ok(r.CLAIMS_ACTIVE === false && !r.ACTIVE_PACKS.has('claims'), 'no config file: a claims register (monolith AND records/claims/) with maturity=claimed arms NOTHING — tree content is not an opt-in')
    ok(r.ACTIVE_PACKS.size === 0, `no config file: every pack is off (got ${JSON.stringify([...r.ACTIVE_PACKS])})`)
    ok(r.DEFAULTS.makes_external_claims === false, 'DEFAULTS never arm the claims pack (makes_external_claims defaults false)')
    fs.writeFileSync(cfgFile, JSON.stringify({ makes_external_claims: true }))
    r = res()
    ok(r.CLAIMS_ACTIVE === true && r.ACTIVE_PACKS.has('claims'), 'explicit makes_external_claims:true arms the claims pack')
    ok([...r.ACTIVE_PACKS].every(pk => pk === 'claims'), `activating claims activates no other pack (got ${JSON.stringify([...r.ACTIVE_PACKS])})`)
    fs.writeFileSync(path.join(t9, 'baseline.repo.json'), desc('prototype'))
    ok(res().CLAIMS_ACTIVE === true, 'maturity=prototype does NOT demote an explicit true — the maturity tier has no say (demotion retired with the auto-arm)')
    fs.writeFileSync(cfgFile, JSON.stringify({ makes_external_claims: false }))
    ok(res().CLAIMS_ACTIVE === false, 'explicit makes_external_claims:false leaves the pack off')
    fs.writeFileSync(cfgFile, JSON.stringify({ makes_external_claims: 'true' }))
    ok(res().CLAIMS_ACTIVE === false, 'only the boolean true arms it — the string "true" is not an explicit opt-in')
    fs.rmSync(cfgFile)
    ok(res().CLAIMS_ACTIVE === false && res().CLAIMS_REASON === null, 'with the config file removed the pack is off again, and there is no second (maturity) reason any more')
    // the other explicit routes: the profiles/packs list and --profile <pack>
    fs.writeFileSync(cfgFile, JSON.stringify({ profiles: ['claims'] }))
    ok(res().ACTIVE_PACKS.has('claims') && res().CLAIMS_ACTIVE === true, 'profiles:["claims"] arms the claims pack (list route)')
    fs.writeFileSync(cfgFile, JSON.stringify({ packs: ['claims'] }))
    ok(res().ACTIVE_PACKS.has('claims'), 'packs:["claims"] is the alias of profiles')
    fs.rmSync(cfgFile)
    ok(res({ profileArgs: ['claims'] }).ACTIVE_PACKS.has('claims'), '--profile claims arms the pack from the CLI (the flag stays; it means pack)')
    // the other pack switches never spill over, and the DEFAULTS value never activates
    r = res()
    ok(r.DEFAULTS.decision_globs.length > 0 && !r.ACTIVE_PACKS.has('decisions'), 'the non-empty DEFAULT decision_globs never activates the decisions pack')
    fs.writeFileSync(cfgFile, JSON.stringify({ decision_globs: ['docs/decisions/*.md'] }))
    r = res()
    ok(r.ACTIVE_PACKS.has('decisions') && !r.ACTIVE_PACKS.has('claims') && !r.ACTIVE_PACKS.has('service'), `explicit decision_globs arms decisions and only decisions (got ${JSON.stringify([...r.ACTIVE_PACKS])})`)
    fs.writeFileSync(cfgFile, JSON.stringify({ decision_globs: [] }))
    ok(!res().ACTIVE_PACKS.has('decisions'), 'an explicit but EMPTY decision_globs arms nothing')
    fs.writeFileSync(cfgFile, JSON.stringify({ project_type: 'service' }))
    r = res()
    ok(r.ACTIVE_PACKS.has('service') && r.ACTIVE_PACKS.size === 1, 'explicit project_type:"service" arms the service pack, and only it')
    fs.rmSync(cfgFile)
    fs.writeFileSync(path.join(t9, 'baseline.repo.json'), JSON.stringify({ schema_version: 1, type: 'service', lifecycle: 'production', maturity: 'claimed', workflow: 'single-lane', anchoring: 'off' }))
    r = res()
    ok(r.cfg.project_type === 'service' && !r.ACTIVE_PACKS.has('service'), "D13: the descriptor's declared type overlays project_type but never arms the service pack")
  }

  // ---- the sanction route's matcher: the subject is attacker-influenced text ----
  {
    const JDG = over => ({ record: 'judgment/1', id: 'JDG-0001', kind: 'deviation', date: '2026-07-01', by: 'a', subject: 'records/sessions/main/2026-07-01-100000-a.md', reason: 'r', review_by: '2999-01-01', ...over })
    // A glob like `**a**a**a…` compiled to `^.*a.*a.*a…$` backtracked exponentially: 892ms
    // at 68 chars, ~3.9x per 6 more, i.e. a hang well inside the 256-char schema cap. The
    // sweep matcher has no search tree, so these must stay in the low milliseconds. Lazy
    // quantifiers were measured and do NOT help (891ms) — do not "fix" this back to a regex.
    const hostile = '**a'.repeat(85) + '*' // exactly the 256-char cap the schema allows
    ok(hostile.length === 256, '#47: the ReDoS probe sits exactly at the schema cap (256 chars)')
    const t0 = Date.now()
    ok(globMatcher(hostile).test('a'.repeat(84) + 'b'.repeat(200)) === false, '#47: a hostile subject at the cap still answers (no hang)')
    ok(Date.now() - t0 < 250, `#47: ...and answers in bounded time (${Date.now() - t0}ms; the regex form never finished)`)
    ok(validateRecord('judgment', JDG({ subject: 'a'.repeat(257) })).some(e => /at most 256 characters/.test(e)), '#47: an over-long subject is refused at the schema (defense in depth, not the ReDoS fix)')
    ok(validateRecord('judgment', JDG({ subject: 'a'.repeat(256) })).length === 0, '#47: a subject exactly at the cap is valid')

    // the sweep replaced a regex — pin the semantics the regex had, exactly
    ok(globMatcher('**/x').test('x') && globMatcher('**/x').test('a/b/x'), '#47: `**/` swallows the slash — `**/x` still matches a bare `x`')
    ok(!globMatcher('*.md').test('a/b.md') && globMatcher('*.md').test('b.md'), '#47: a single `*` does not cross a path separator')
    ok(globMatcher('**.md').test('a/b.md'), '#47: `**` does cross path separators')
    ok(globMatcher('a?c').test('abc') && !globMatcher('a?c').test('ac'), '#47: `?` is exactly one character')
    ok(globMatcher('v1.2').test('v1.2') && !globMatcher('v1.2').test('v1x2'), '#47: a literal dot stays literal (metacharacters are not regex any more)')

  }

  // ---- M4c: REC-02 against real history ----
  {
    const RS = { kind: 'records-scrub', globs: ['records/**'] }
    let r
    const t11 = mkrepo('main'); tmps.push(t11)
    const rec2 = 'records/sessions/main/2026-07-01-110000-a.md'
    fs.mkdirSync(path.join(t11, path.dirname(rec2)), { recursive: true })
    fs.writeFileSync(path.join(t11, rec2), 'token: ' + 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789' + '\n')
    sh(t11, 'git', ['add', '-A']); sh(t11, 'git', ['commit', '-qm', 'r1'])
    const mk11 = () => makeEvalCheck({ repo: indexRepo(t11), cfg: {}, NO_EXEC: true, DESCRIPTOR: { valid: false }, BRANCH: 'main', DEFAULT_BRANCH: 'main' })
    r = mk11()(RS, { id: 'REC-02' })
    ok(r.ok === false && !r.soft && /deterministic/.test(r.detail) && !/ghp_a/.test(r.detail), 'REC-02: a landed deterministic secret fails — and the detail never reproduces it')
    const fid = findingId('github-token', 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789')
    fs.mkdirSync(path.join(t11, '.baseline'), { recursive: true })
    fs.writeFileSync(path.join(t11, '.baseline/scrub-allowlist.json'), JSON.stringify({ entries: [{ id: fid, reason: 'doc example', date: '2026-07-12' }] }))
    r = mk11()(RS, { id: 'REC-02' })
    ok(r.ok === true && /allowlisted/.test(r.detail), 'REC-02: a dated allowlist judgment clears exactly that finding')
    fs.writeFileSync(path.join(t11, rec2), 'password = "hunter2hunter2"\n'); sh(t11, 'git', ['add', '-A']); sh(t11, 'git', ['commit', '-qm', 'heur'])
    r = mk11()(RS, { id: 'REC-02' })
    ok(r.ok === false && r.soft === true, 'REC-02: heuristic-only findings are soft — WARN even after M7 promotes the severity')
    fs.writeFileSync(path.join(t11, rec2), 'scrubbed clean in the worktree only\n') // NOT committed
    r = mk11()(RS, { id: 'REC-02' })
    ok(r.ok === false && r.soft === true, 'REC-02: scans what LANDED — an uncommitted worktree cleanup cannot flip the verdict')

  }

  // ---- Issue #57: the decision graph's amendment edges — read, resolved, paired ----
  // Before this, `Amends:`/`Amended-by:` were read by no rule, no kind and no schema
  // check, and the ONE relation that was read was read by two different greps —
  // neither of which matched `Superseded-by:`, the spelling templates/adr.md ships.
  {
    // the reader (adrEdges): wrapping, commentary, 'none', and both supersede spellings
    const wrapped = '# ADR-0021 — the bench obligation\n\nStatus: Accepted\nSupersedes: none\nAmends: ADR-0019 (D5 sizing),\n  ADR-0017 (what it obliges the bench to do)\nAmended-by: n/a\nDate: 2026-08-11\n\n## Context\n\nx\n'
    const e = adrEdges(wrapped)
    ok(JSON.stringify(e.amends) === '[17,19]', `#57: a WRAPPED declaration is read whole — both targets (got ${JSON.stringify(e.amends)})`)
    ok(!e.amends.includes(5), '#57: parenthesised commentary declares no edge — "(D5 sizing)" is not ADR-5')
    ok(e.supersedes.length === 0 && e.amended_by.length === 0, "#57: 'none' and 'n/a' declare nothing (the template ships 'Supersedes: none' — not an edge to ADR-0)")
    ok(adrEdges('# 0002\n\nStatus: Superseded by ADR-0003\n').superseded_by[0] === 3, '#57: the legacy inline form (Status: Superseded by ADR-0003) still resolves — the golden corpus pins it')
    ok(adrEdges('# 0002\n\nStatus: Superseded\nSuperseded-by: ADR-0003\n').superseded_by[0] === 3, "#57: the HYPHENATED field form resolves — `\\s*` never matched a hyphen, so templates/adr.md's own spelling was invisible to both ADR rules")
    const hdr = parseAdrHeader(wrapped)
    ok(hdr.amends === 'ADR-0019 (D5 sizing), ADR-0017 (what it obliges the bench to do)' && hdr.amended_by === 'n/a', '#57: parseAdrHeader carries the amendment fields, folded across the wrap (one walk, shared with adrEdges)')
    ok(validateRecord('adr', hdr).length === 0, '#57: the amendment fields validate against record.adr.schema.json')

    // the rules, against a real tree
    const t57 = mkrepo('main'); tmps.push(t57)
    const D = 'docs/decisions'
    fs.mkdirSync(path.join(t57, D), { recursive: true })
    const adr = (n, body) => { fs.writeFileSync(path.join(t57, D, n), body); sh(t57, 'git', ['add', '-A']); sh(t57, 'git', ['commit', '-qm', n]) }
    const cfg57 = { decision_globs: [D + '/*.md'] }
    const mk57 = jdgs => makeEvalCheck({ repo: indexRepo(t57), cfg: cfg57, NO_EXEC: true, JUDGMENTS: jdgs, DESCRIPTOR: { valid: false }, BRANCH: 'main', DEFAULT_BRANCH: 'main' })
    const FWD = { kind: 'adr-forward-link', globs_from_config: 'decision_globs' }
    const BACK = { kind: 'adr-backlink', globs_from_config: 'decision_globs' }
    const STAT = { kind: 'adr-status', globs_from_config: 'decision_globs' }

    adr('0017-floor.md', '# ADR-0017 — the floor is the product\n\nStatus: Accepted\nSupersedes: none\nSuperseded-by: none\nDate: 2026-08-09\n\n## Context\n\nx\n')
    adr('0021-bench.md', '# ADR-0021 — the bench obligation\n\nStatus: Accepted\nAmends: ADR-0019 (D5 sizing), ADR-0017 (what it obliges)\nDate: 2026-08-11\n\n## Context\n\nx\n')
    let r = mk57([])(FWD, { id: 'CTX-07' })
    ok(r.ok === false && /0021-bench\.md amends ADR 0019/.test(r.detail) && /no such file/.test(r.detail), '#57 CTX-07: a dangling `Amends:` is a finding naming the verb and the target (it PASSED before — only "Supersed(ed) by" was resolved)')
    ok(!/ADR 0017/.test(r.detail), '#57 CTX-07: the edge that DOES resolve is not reported')
    r = mk57([])(BACK, { id: 'CTX-13' })
    ok(r.ok === false && /1 one-way amendment/.test(r.detail) && /0021-bench\.md amends ADR 0017/.test(r.detail) && /0017-floor\.md carries no Amended-by/.test(r.detail), '#57 CTX-13: an amendment declared at one end only is a finding naming BOTH records')
    ok(!/ADR 0019/.test(r.detail), "#57 CTX-13: a DANGLING amends is CTX-07's finding, not reported twice here")

    // the sanction route — the judgment route of #47, so a corpus with history adopts
    const JDG57 = over => ({ record: 'judgment/1', id: 'JDG-0001', kind: 'deviation', date: '2026-08-11', by: 'a', subject: D + '/0021-bench.md', reason: 'back-fill scheduled with the index rebuild', review_by: '2999-01-01', ...over })
    r = mk57([JDG57()])(BACK, { id: 'CTX-13' })
    ok(r.ok === true && /sanctioned by judgment/.test(r.detail) && /JDG-0001/.test(r.detail), '#57 CTX-13: an unexpired deviation naming the declaring record sanctions the one-way edge')
    r = mk57([JDG57({ review_by: '2000-01-01' })])(BACK, { id: 'CTX-13' })
    ok(r.ok === false && /1 one-way amendment/.test(r.detail), '#57 CTX-13: an EXPIRED judgment stops sanctioning — the review date is what a frozen allowlist never has')
    r = mk57([JDG57({ subject: D + '/**' })])(BACK, { id: 'CTX-13' })
    ok(r.ok === true && /sanctioned/.test(r.detail), '#57 CTX-13: a glob subject sanctions (the breadth the rule fix warns about — corpus-wide covers future edges too)')

    // the repair: both ends declared, and the target exists
    adr('0019-sizing.md', '# ADR-0019 — D5 sizing\n\nStatus: Amended\nAmended-by: ADR-0021\nDate: 2026-08-10\n\n## Context\n\nx\n')
    fs.writeFileSync(path.join(t57, D, '0017-floor.md'), '# ADR-0017 — the floor is the product\n\nStatus: Amended\nSupersedes: none\nSuperseded-by: none\nAmended-by: ADR-0021\nDate: 2026-08-09\n\n## Context\n\nx\n')
    sh(t57, 'git', ['add', '-A']); sh(t57, 'git', ['commit', '-qm', 'back-links'])
    r = mk57([])(FWD, { id: 'CTX-07' })
    ok(r.ok === true && /4 declared edge\(s\) resolve/.test(r.detail), `#57 CTX-07: with 0019 present every declared edge resolves, and the detail COUNTS them (got ${r.detail})`)
    r = mk57([])(BACK, { id: 'CTX-13' })
    ok(r.ok === true && /2 amendment edge\(s\) declared at both ends/.test(r.detail), `#57 CTX-13: both ends declared — PASS naming the paired count (got ${r.detail})`)

    // CTX-02: the template's own spelling is a forward link (it was not, at blocker severity)
    const t57b = mkrepo('main'); tmps.push(t57b)
    fs.mkdirSync(path.join(t57b, D), { recursive: true })
    const mk57b = () => makeEvalCheck({ repo: indexRepo(t57b), cfg: cfg57, NO_EXEC: true, DESCRIPTOR: { valid: false }, BRANCH: 'main', DEFAULT_BRANCH: 'main' })
    fs.writeFileSync(path.join(t57b, D, '0003-new.md'), '# ADR-0003 — the replacement\n\nStatus: Accepted\nDate: 2026-08-12\n\n## Context\n\nx\n')
    fs.writeFileSync(path.join(t57b, D, '0002-old.md'), '# ADR-0002 — old\n\nStatus: Superseded\nSuperseded-by: ADR-0003\nDate: 2026-08-01\n\n## Context\n\nx\n')
    sh(t57b, 'git', ['add', '-A']); sh(t57b, 'git', ['commit', '-qm', 'adrs'])
    ok(mk57b()(STAT, { id: 'CTX-02' }).ok === true, "#57 CTX-02: `Superseded-by: ADR-0003` IS a forward link — a record following templates/adr.md was reported as misdirecting a reader, at blocker severity")
    fs.writeFileSync(path.join(t57b, D, '0002-old.md'), '# ADR-0002 — old\n\nStatus: Superseded\nDate: 2026-08-01\n\n## Context\n\nNo forward link here.\n')
    sh(t57b, 'git', ['add', '-A']); sh(t57b, 'git', ['commit', '-qm', 'drop link'])
    ok(mk57b()(STAT, { id: 'CTX-02' }).ok === false, '#57 CTX-02: a superseded record with NO link still fails — the widening added a spelling, it did not relax the rule')
  }

  // ---- Issue #49 (a): the decision NUMBER is an identity, and nothing owned it ----
  // Two lanes each authored an 0027 under different filenames. Each tree was clean, both
  // merges were conflict-free, and the default branch ended with two ADR-0027s that no
  // rule had an opinion about. CTX-14 is the floor: it cannot see the other lane, but it
  // makes the collision unable to SURVIVE where both lanes land.
  {
    const t49 = mkrepo('main'); tmps.push(t49)
    const D = 'docs/decisions'
    fs.mkdirSync(path.join(t49, D), { recursive: true })
    const cfg49 = { decision_globs: [D + '/*.md'] }
    const mk49 = jdgs => makeEvalCheck({ repo: indexRepo(t49), cfg: cfg49, NO_EXEC: true, JUDGMENTS: jdgs, DESCRIPTOR: { valid: false }, BRANCH: 'main', DEFAULT_BRANCH: 'main' })
    const UNIQ = { kind: 'adr-number-unique', globs_from_config: 'decision_globs' }
    const adr49 = (n, title) => { fs.writeFileSync(path.join(t49, D, n), `# ADR-${n.slice(0, 4)} — ${title}\n\nStatus: Accepted\nDate: 2026-08-19\n\n## Context\n\nx\n`); sh(t49, 'git', ['add', '-A']); sh(t49, 'git', ['commit', '-qm', n]) }

    adr49('0026-a.md', 'twenty six')
    adr49('0027-run-identity-is-one-block.md', 'run identity')
    ok(mk49([])(UNIQ, { id: 'CTX-14' }).ok === true, '#49 CTX-14: distinct numbers pass')
    // the incident, reproduced: two files, one number, different filenames
    adr49('0027-a-routing-policy-is-adopted.md', 'routing policy')
    let r = mk49([])(UNIQ, { id: 'CTX-14' })
    ok(r.ok === false && /1 decision number\(s\) claimed twice/.test(r.detail), '#49 CTX-14: two records claiming 0027 is a finding (both trees passed every rule before)')
    ok(/0027 claimed by/.test(r.detail) && /0027-run-identity-is-one-block\.md/.test(r.detail) && /0027-a-routing-policy-is-adopted\.md/.test(r.detail), '#49 CTX-14: the finding names the number AND both files claiming it')
    // adoption: renumbering breaks the citations pointing at the record, so the existing
    // judgment route sanctions the collision — naming EITHER end names it (#47's route)
    const JDG49 = over => ({ record: 'judgment/1', id: 'JDG-0049', kind: 'deviation', date: '2026-08-19', by: 'a', subject: D + '/0027-a-routing-policy-is-adopted.md', reason: 'renumbering breaks 14 citations; scheduled with the index rebuild', review_by: '2999-01-01', ...over })
    r = mk49([JDG49()])(UNIQ, { id: 'CTX-14' })
    ok(r.ok === true && /sanctioned by judgment/.test(r.detail) && /JDG-0049/.test(r.detail), '#49 CTX-14: an unexpired judgment naming ONE colliding file sanctions the collision')
    ok(mk49([JDG49({ subject: D + '/0027-run-identity-is-one-block.md' })])(UNIQ, { id: 'CTX-14' }).ok === true, '#49 CTX-14: naming the OTHER end sanctions the same collision — a collision has two paths and no privileged one')
    ok(mk49([JDG49({ review_by: '2000-01-01' })])(UNIQ, { id: 'CTX-14' }).ok === false, '#49 CTX-14: an EXPIRED judgment stops sanctioning — the review date a frozen allowlist never has')
    ok(mk49([JDG49({ kind: 'break-glass' })])(UNIQ, { id: 'CTX-14' }).ok === false, '#49 CTX-14: break-glass is outage relief, not a sanction (SANCTION_KINDS, one home)')
    // the repair, and the gap the sequence is left with — reported, never a finding
    fs.rmSync(path.join(t49, D, '0027-a-routing-policy-is-adopted.md'))
    fs.writeFileSync(path.join(t49, D, '0029-a-routing-policy-is-adopted.md'), '# ADR-0029 — routing policy\n\nStatus: Accepted\nDate: 2026-08-19\n\n## Context\n\nx\n')
    sh(t49, 'git', ['add', '-A']); sh(t49, 'git', ['commit', '-qm', 'renumber'])
    r = mk49([])(UNIQ, { id: 'CTX-14' })
    ok(r.ok === true && /3 decision number\(s\) unique/.test(r.detail), `#49 CTX-14: renumbering to a free number resolves it (got ${r.detail})`)
    ok(/gap\(s\) in the sequence \(not an error\): 0028/.test(r.detail), '#49 CTX-14: a hole in the sequence rides the PASS detail — worth seeing, never a verdict')
    // a corpus whose filenames carry no number is not this rule's subject
    const t49b = mkrepo('main'); tmps.push(t49b)
    fs.mkdirSync(path.join(t49b, D), { recursive: true })
    fs.writeFileSync(path.join(t49b, D, 'README.md'), '# index\n')
    sh(t49b, 'git', ['add', '-A']); sh(t49b, 'git', ['commit', '-qm', 'index only'])
    ok(makeEvalCheck({ repo: indexRepo(t49b), cfg: cfg49, NO_EXEC: true, DESCRIPTOR: { valid: false }, BRANCH: 'main', DEFAULT_BRANCH: 'main' })(UNIQ, { id: 'CTX-14' }).ok === null,
      '#49 CTX-14: an index-only decision dir is a SKIP, not a pass on nothing')
  }

  // ---- the stored-status signature end-to-end through check.mjs (CTX-12, de-config-keyed) ----
  {
    const t12 = mkrepo('main'); tmps.push(t12)
    fs.writeFileSync(path.join(t12, 'README.md'), '# lane fixture\n')
    fs.writeFileSync(path.join(t12, 'LICENSE'), 'MIT\n')
    fs.writeFileSync(path.join(t12, 'baseline.repo.json'), JSON.stringify({ schema_version: 1, type: 'docs', lifecycle: 'production', maturity: 'released', workflow: 'multi-lane', anchoring: 'strict', lanes: { namespace: 'lane/*', lease_ttl: '7d' }, ground_truth_boundary: { forge: 'none', default_branch: 'main' } }))
    fs.writeFileSync(path.join(t12, 'baseline.config.json'), JSON.stringify({ project_type: 'docs', makes_external_claims: false }))
    sh(t12, 'git', ['add', '-A']); sh(t12, 'git', ['commit', '-qm', 'base'])
    const CHECK12 = path.join(ROOT, 'check.mjs')
    const byId = out => Object.fromEntries(JSON.parse(out).results.map(x => [baseId(x.id), x]))
    let res = byId(sh(t12, process.execPath, [CHECK12, '--repo', t12, '--json', '--no-exec'], NOW).out)
    // M7b: the stored-status surface is GONE — CTX-01 has no row at all, and
    // CTX-12 (blocker) is de-config-keyed: no stamp in the tree = PASS, no
    // status_file key to opt anything out.
    ok(!('CTX-01' in res), 'e2e: CTX-01 retired — no row, not a SKIP')
    ok(res['CTX-12'].tag === 'PASS' && res['CTX-12'].severity === 'blocker', 'e2e: CTX-12 is the de-config-keyed stored-status blocker — clean tree PASSes')
    fs.writeFileSync(path.join(t12, 'docs-stamp.md'), 'notes\n\nlast-verified: deadbee 2026-01-01\n')
    res = byId(sh(t12, process.execPath, [CHECK12, '--repo', t12, '--json', '--no-exec'], NOW).out)
    ok(res['CTX-12'].tag === 'FAIL' && /docs-stamp\.md/.test(res['CTX-12'].detail), 'e2e: a line-anchored stamp anywhere in the tree FAILs CTX-12 and names the file')
    fs.writeFileSync(path.join(t12, 'docs-stamp.md'), 'notes mention `last-verified: x` mid-line only\n')
    res = byId(sh(t12, process.execPath, [CHECK12, '--repo', t12, '--json', '--no-exec'], NOW).out)
    ok(res['CTX-12'].tag === 'PASS', 'e2e: a mid-line mention is not the signature — line-anchored means line-anchored')
    fs.writeFileSync(path.join(t12, 'docs-stamp.md'), 'last-verified: aaa1111\n')
    fs.writeFileSync(path.join(t12, 'docs-stamp2.md'), 'last-verified: bbb2222\n')
    res = byId(sh(t12, process.execPath, [CHECK12, '--repo', t12, '--json', '--no-exec'], NOW).out)
    ok(res['CTX-12'].tag === 'FAIL' && /matched in 2 file\(s\)/.test(res['CTX-12'].detail) && /docs-stamp\.md/.test(res['CTX-12'].detail) && /docs-stamp2\.md/.test(res['CTX-12'].detail), 'e2e: multiple stamps — the detail counts every match and names the files')
    fs.rmSync(path.join(t12, 'docs-stamp.md')); fs.rmSync(path.join(t12, 'docs-stamp2.md'))
  }

  // ---- M4c: claims dual-read + gen migrate-claims ----
  {
    const t13 = mkrepo('main'); tmps.push(t13)
    fs.mkdirSync(path.join(t13, 'docs'), { recursive: true })
    fs.mkdirSync(path.join(t13, 'records/claims'), { recursive: true })
    fs.writeFileSync(path.join(t13, 'docs/CLAIMS.json'), JSON.stringify({ claims: [
      { id: 'alpha', statement: 'legacy alpha', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' },
      { id: 'beta', statement: 'legacy beta', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' },
    ] }))
    fs.writeFileSync(path.join(t13, 'records/claims/CLM-0002.json'), JSON.stringify({ record: 'claim/1', id: 'CLM-0002', slug: 'alpha', statement: 'record alpha', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' }))
    const merged = loadClaims(indexRepo(t13), { claims_file: 'docs/CLAIMS.json' })
    ok(merged.claims.length === 1 && merged.claims[0].statement === 'record alpha' && merged.legacyPresent === true, 'records-only (M7b): the checker counts records alone; the unread monolith surfaces as legacyPresent')
    const g1 = sh(t13, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t13], NOW)
    ok(g1.code === 0 && /1 written/.test(g1.out) && /1 already migrated/.test(g1.out), 'gen: migrates only the unmigrated claim (numbering continues past CLM-0002)')
    ok(fs.existsSync(path.join(t13, 'records/claims/CLM-0003.json')) && JSON.parse(fs.readFileSync(path.join(t13, 'records/claims/CLM-0003.json'), 'utf8')).slug === 'beta', 'gen: the new record gets the next number and keeps the V1 id as slug')
    const g2 = sh(t13, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t13], NOW)
    ok(g2.code === 0 && /0 written/.test(g2.out) && /2 already migrated/.test(g2.out), 'gen: idempotent — a second run writes nothing')
    fs.writeFileSync(path.join(t13, 'docs/CLAIMS.json'), JSON.stringify({ claims: [{ id: 'gamma', statement: 's', type: 'capability', build_state: 'planned', blast_radius: 'company' }] }))
    const g3 = sh(t13, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t13], NOW)
    ok(g3.code === 1 && /refused/.test(g3.out) && !fs.existsSync(path.join(t13, 'records/claims/CLM-0004.json')), 'gen: a schema-invalid legacy claim is REFUSED loudly, nothing partial written')
  }

  // ---- M4c: `baseline scrub` (the pre-push hook's engine) ----
  {
    const t14 = mkrepo('main'); tmps.push(t14)
    const srec = 'records/sessions/main/2026-07-11-130000-a.md'
    fs.mkdirSync(path.join(t14, path.dirname(srec)), { recursive: true })
    fs.writeFileSync(path.join(t14, srec), 'AKIA' + 'IOSFODNN7EXAMPLE' + '\n')
    const s1 = sh(t14, process.execPath, [BASELINE, 'scrub', srec, '--repo', t14], NOW)
    ok(s1.code === 1 && /BLOCK/.test(s1.out) && /scrub-[0-9a-f]{12}/.test(s1.out), 'scrub: worktree mode blocks a deterministic shape and prints the finding id')
    sh(t14, 'git', ['add', '-A']); sh(t14, 'git', ['commit', '-qm', 'r1'])
    const s2 = sh(t14, process.execPath, [BASELINE, 'scrub', '--repo', t14, '--pushed', 'HEAD'], NOW)
    ok(s2.code === 1 && /BLOCK/.test(s2.out), 'scrub: --pushed mode scans committed blob content (a new ref scans the whole records/ tree)')
    const fid14 = findingId('aws-access-key-id', 'AKIA' + 'IOSFODNN7EXAMPLE')
    const s3 = sh(t14, process.execPath, [BASELINE, 'scrub', '--allow', fid14, '--allow-reason', 'documented example key', '--repo', t14], NOW)
    ok(s3.code === 0 && /allowlisted/.test(s3.out), 'scrub: --allow writes the dated judgment')
    const s4 = sh(t14, process.execPath, [BASELINE, 'scrub', '--repo', t14, '--pushed', 'HEAD'], NOW)
    ok(s4.code === 0 && /allowlisted/.test(s4.out), 'scrub: the allowlist clears the push')
    const s5 = sh(t14, process.execPath, [BASELINE, 'scrub', '--repo', t14], NOW)
    ok(s5.code === 2, 'scrub: no files and no --pushed is a usage error')
    const s6 = sh(t14, process.execPath, [BASELINE, 'scrub', '-x', 'whatever.md', '--repo', t14], NOW)
    ok(s6.code === 2 && /unknown flag/.test(s6.out), 'scrub: an unknown flag is a usage error, never a silently-dropped scan target')
  }

  // ---- M4c review: gen migrate-claims hardening (keys, fidelity, corrupt state) ----
  {
    const t15 = mkrepo('main'); tmps.push(t15)
    fs.mkdirSync(path.join(t15, 'docs'), { recursive: true })
    const V = { type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' }
    fs.writeFileSync(path.join(t15, 'docs/CLAIMS.json'), JSON.stringify({ claims: [
      { statement: 'no id — cannot key the migration', ...V },
      { id: 'dup', statement: 'first of a duplicated id', ...V },
      { id: 'dup', statement: 'second of a duplicated id', ...V },
      { id: 'cited', statement: 'citation fidelity', ...V, citations: [{ url: 'https://x.example', supports_because: 'says so', checked_on: '2026-01-01' }, 'https://bare.example'] },
    ] }))
    const g1 = sh(t15, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t15], NOW)
    ok(g1.code === 1 && /no id\) refused/.test(g1.out), 'gen: an id-less legacy claim is refused loudly — unkeyed claims would duplicate on every rerun')
    ok(/2 written/.test(g1.out) && /1 already migrated/.test(g1.out) && /1 refused/.test(g1.out), 'gen: dup + cited written once each (a duplicated id within one monolith mints ONE record, loudly skipping its twin)')
    const cited = JSON.parse(fs.readFileSync(path.join(t15, 'records/claims/CLM-0002.json'), 'utf8'))
    ok(cited.slug === 'cited' && cited.citations.length === 1 && cited.citations[0].url === 'https://x.example', 'gen: object citations survive with url+supports_because')
    ok(/citations\[0\]\.checked_on/.test(g1.out) && /citations\[1\] \(not an object\)/.test(g1.out), 'gen: stripped citation subfields and non-object entries are reported in the dropped channel')
    const g2 = sh(t15, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t15], NOW)
    ok(g2.code === 1 && /0 written/.test(g2.out) && /3 already migrated/.test(g2.out), 'gen: rerun is idempotent for keyed claims (all three occurrences skip); only the id-less one still refuses')
    // a crash-truncated existing record must gate the whole run — its slug is invisible
    fs.writeFileSync(path.join(t15, 'records/claims/CLM-0001.json'), '{"record": "claim/1", "id": "CLM-')
    const g3 = sh(t15, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t15], NOW)
    ok(g3.code === 2 && /unreadable|not valid JSON/.test(g3.out) && /nothing written/.test(g3.out), 'gen: a corrupt existing record aborts the run (exit 2) before any write')
    // non-array citations must refuse, not silently delete a CLAIM-04 finding
    fs.writeFileSync(path.join(t15, 'docs/CLAIMS.json'), JSON.stringify({ claims: [{ id: 'badcite', statement: 's', ...V, citations: 'https://x' }] }))
    fs.rmSync(path.join(t15, 'records/claims/CLM-0001.json'))
    const g4 = sh(t15, process.execPath, [BASELINE, 'gen', 'migrate-claims', '--repo', t15], NOW)
    ok(g4.code === 1 && /citations" must be an array/.test(g4.out), 'gen: non-array citations refuse the claim — migration must not flip CLAIM-04 to PASS by deletion')
    // reader/writer share one key: a record whose id collides with an unmigrated
    // legacy claim's spelling must NOT shadow it out of evaluation
    const t15b = mkrepo('main'); tmps.push(t15b)
    fs.mkdirSync(path.join(t15b, 'docs'), { recursive: true })
    fs.mkdirSync(path.join(t15b, 'records/claims'), { recursive: true })
    fs.writeFileSync(path.join(t15b, 'docs/CLAIMS.json'), JSON.stringify({ claims: [{ id: 'CLM-0001', statement: 'unmigrated legacy', type: 'novelty', build_state: 'planned', blast_radius: 'company' }] }))
    fs.writeFileSync(path.join(t15b, 'records/claims/CLM-0001.json'), JSON.stringify({ record: 'claim/1', id: 'CLM-0001', slug: 'unrelated', statement: 'unrelated record', ...V }))
    const merged15 = loadClaims(indexRepo(t15b), { claims_file: 'docs/CLAIMS.json' })
    ok(merged15.claims.length === 1 && merged15.claims[0].statement === 'unrelated record' && merged15.legacyPresent === true, 'records-only (M7b): legacy content is never counted — and never shadowed into silence; legacyPresent still points at the migration')
  }

  // ---- M4c review: scrub --since range semantics (the hook's primary mode) ----
  {
    const t16 = mkrepo('main'); tmps.push(t16)
    const KEY = 'AKIA' + 'IOSFODNN7EXAMPLE'
    fs.mkdirSync(path.join(t16, 'records/sessions/main'), { recursive: true })
    fs.writeFileSync(path.join(t16, 'records/sessions/main/2026-07-01-100000-a.md'), 'clean base\n')
    sh(t16, 'git', ['add', '-A']); sh(t16, 'git', ['commit', '-qm', 'c1'])
    const C1 = sh(t16, 'git', ['rev-parse', 'HEAD']).out.trim()
    fs.writeFileSync(path.join(t16, 'records/sessions/main/2026-07-02-100000-a.md'), 'oops ' + KEY + '\n')
    sh(t16, 'git', ['add', '-A']); sh(t16, 'git', ['commit', '-qm', 'c2'])
    const C2 = sh(t16, 'git', ['rev-parse', 'HEAD']).out.trim()
    fs.rmSync(path.join(t16, 'records/sessions/main/2026-07-02-100000-a.md'))
    sh(t16, 'git', ['add', '-A']); sh(t16, 'git', ['commit', '-qm', 'c3 removes it'])
    const C3 = sh(t16, 'git', ['rev-parse', 'HEAD']).out.trim()
    const r1 = sh(t16, process.execPath, [BASELINE, 'scrub', '--repo', t16, '--pushed', C3, '--since', C1], NOW)
    ok(r1.code === 1 && /BLOCK/.test(r1.out), 'scrub: a secret in an INTERIOR commit of the range blocks — the blob rides the pack even when the endpoint diff is clean')
    const r2 = sh(t16, process.execPath, [BASELINE, 'scrub', '--repo', t16, '--pushed', C1, '--since', C1], NOW)
    ok(r2.code === 0, 'scrub: an empty range is clean')
    const r3 = sh(t16, process.execPath, [BASELINE, 'scrub', '--repo', t16, '--pushed', C2, '--since', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'], NOW)
    ok(r3.code === 1 && /not found locally/.test(r3.out) && /BLOCK/.test(r3.out), 'scrub: an unresolvable --since falls back to a LOUD whole-tree scan — never a silent wave-through, never a bricked push')
    const rBad = sh(t16, process.execPath, [BASELINE, 'scrub', '--repo', t16, '--pushed', 'nonsense-ref'], NOW)
    ok(rBad.code === 2 && /does not resolve/.test(rBad.out), 'scrub: an unresolvable --pushed names itself, exit 2')
    // a git-quoted filename (non-ASCII) must not fall out of the scan
    const t16b = mkrepo('main'); tmps.push(t16b)
    fs.mkdirSync(path.join(t16b, 'records'), { recursive: true })
    fs.writeFileSync(path.join(t16b, 'records/café.md'), KEY + '\n')
    sh(t16b, 'git', ['add', '-A']); sh(t16b, 'git', ['commit', '-qm', 'quoted path'])
    const rq = sh(t16b, process.execPath, [BASELINE, 'scrub', '--repo', t16b, '--pushed', 'HEAD'], NOW)
    ok(rq.code === 1 && /BLOCK/.test(rq.out), 'scrub: a core.quotePath-quoted filename (café.md) is scanned, not silently skipped')
    // a committed .baseline/cache/ draft is scrub-rejected content by construction
    const t16c = mkrepo('main'); tmps.push(t16c)
    fs.mkdirSync(path.join(t16c, '.baseline/cache'), { recursive: true })
    fs.writeFileSync(path.join(t16c, '.baseline/cache/rejected-log-x.md'), 'harmless-looking\n')
    sh(t16c, 'git', ['add', '-A']); sh(t16c, 'git', ['commit', '-qm', 'oops committed cache'])
    const rc = sh(t16c, process.execPath, [BASELINE, 'scrub', '--repo', t16c, '--pushed', 'HEAD'], NOW)
    ok(rc.code === 1 && /\.baseline\/cache/.test(rc.out), 'scrub: any .baseline/cache/ path in a push blocks — rejected drafts must never ship')
  }

  // ---- M4c review: the pre-push hook protocol (stdin ref lines, fail modes) ----
  {
    const HOOK = path.join(ROOT, 'hooks', 'scrub-pre-push.sh')
    const t17 = mkrepo('main'); tmps.push(t17)
    fs.mkdirSync(path.join(t17, 'records'), { recursive: true })
    fs.writeFileSync(path.join(t17, 'records/leak.md'), 'AKIA' + 'IOSFODNN7EXAMPLE' + '\n')
    sh(t17, 'git', ['add', '-A']); sh(t17, 'git', ['commit', '-qm', 'leak'])
    const TIP = sh(t17, 'git', ['rev-parse', 'HEAD']).out.trim()
    const ZERO = '0'.repeat(40)
    const hookRun = (input, env = {}) => {
      // 2>&1 via exec so the hook's stderr warnings are observable on the success path too
      try { return { out: execFileSync('bash', ['-c', 'exec "$0" 2>&1', HOOK], { cwd: t17, input, stdio: ['pipe', 'pipe', 'pipe'], env: { ...GIT_ENV, BASELINE_DIR: ROOT, ...env } }).toString(), code: 0 } }
      catch (e) { return { out: (e.stdout || '').toString() + (e.stderr || '').toString(), code: e.status ?? 1 } }
    }
    const h1 = hookRun(`refs/heads/main ${TIP} refs/heads/main ${ZERO}\n`)
    ok(h1.code === 1 && /BLOCK/.test(h1.out), 'hook: a new-ref push carrying a secret blocks (exit 1)')
    const h2 = hookRun(`refs/heads/gone ${ZERO} refs/heads/gone ${TIP}\n`)
    ok(h2.code === 0, 'hook: a ref deletion (all-zero local sha) pushes nothing and passes')
    const h3 = hookRun(`refs/heads/main ${TIP} refs/heads/main ${ZERO}\n`, { BASELINE_DIR: '/nonexistent-baseline-dir' })
    ok(h3.code === 0 && /NOT scanned/.test(h3.out), 'hook: a missing runtime fails OPEN with a loud warning, never bricks the push')
    const h4 = hookRun(`refs/heads/a ${TIP} refs/heads/a ${ZERO}\nrefs/heads/b ${ZERO} refs/heads/b ${TIP}\n`)
    ok(h4.code === 1, 'hook: multiple stdin ref lines all process (child scrub must not drain the ref list)')
  }

  // ---- M7b: the de-config-keyed stored-status signature on a BARE repo ----
  // (was: the status_file:false unhonored-opt-out test — that concept retired with
  // the key; what remains checkable is that a bare repo with a stamp cannot
  // config its way out, because there is no config surface at all)
  {
    const t18 = mkrepo('main'); tmps.push(t18)
    fs.writeFileSync(path.join(t18, 'README.md'), '# bare\n\nlast-verified: abc1234 2026-01-01\n')
    fs.writeFileSync(path.join(t18, 'baseline.config.json'), JSON.stringify({ project_type: 'docs', makes_external_claims: false }))
    sh(t18, 'git', ['add', '-A']); sh(t18, 'git', ['commit', '-qm', 'base'])
    const res18 = JSON.parse(sh(t18, process.execPath, [path.join(ROOT, 'check.mjs'), '--repo', t18, '--json', '--no-exec'], NOW).out)
    const ctx12 = res18.results.find(x => isId(x.id, 'CTX-12'))
    ok(ctx12.tag === 'FAIL' && ctx12.severity === 'blocker' && /README\.md/.test(ctx12.detail), 'e2e: the stamp signature on a bare repo FAILs CTX-12 at blocker, no config key to hide behind')
    ok(!res18.results.some(x => isId(x.id, 'CTX-01')), 'e2e: CTX-01 is gone from the rule set entirely')
    // M7b: the WORKTREE read stays strict — the descriptor asymmetry's other half.
    // A retired field in the worktree descriptor is flagged (DESC-02 names it at
    // blocker since the M7c split; presence itself is DESC-01's PASS) and the
    // posture it declared is OFF until shed (the migration pressure). If the
    // ref-read strip is ever hoisted to worktree reads, this fails.
    fs.writeFileSync(path.join(t18, 'baseline.repo.json'), JSON.stringify({ schema_version: 1, type: 'docs', lifecycle: 'production', maturity: 'released', owner: 'legacy-team', workflow: 'multi-lane', anchoring: 'strict', lanes: { namespace: 'lane/*', lease_ttl: '7d' }, ground_truth_boundary: { forge: 'none', default_branch: 'main' } }))
    // v3 §5: the DESC rules ride the opt-in `descriptor` pack — with it off they push no row
    // at all, so the fixture arms it the way a repo would (packs: ["descriptor"])
    const res19off = JSON.parse(sh(t18, process.execPath, [path.join(ROOT, 'check.mjs'), '--repo', t18, '--json', '--no-exec'], NOW).out)
    ok(!res19off.results.some(x => isId(x.id, 'DESC-01') || isId(x.id, 'DESC-02')), 'e2e: with the descriptor pack off, DESC-01/02 push no row — a present descriptor is not an opt-in (V15)')
    fs.writeFileSync(path.join(t18, 'baseline.config.json'), JSON.stringify({ project_type: 'docs', makes_external_claims: false, packs: ['descriptor'] }))
    const res19 = JSON.parse(sh(t18, process.execPath, [path.join(ROOT, 'check.mjs'), '--repo', t18, '--json', '--no-exec'], NOW).out)
    const d1 = res19.results.find(x => isId(x.id, 'DESC-01'))
    ok(d1.tag === 'PASS' && /present \(schema validity is DESC-02's/.test(d1.detail), 'e2e: presence narrowed — DESC-01 PASSes a present-but-invalid file, pointing at DESC-02')
    const d2 = res19.results.find(x => isId(x.id, 'DESC-02'))
    ok(d2.tag === 'FAIL' && d2.severity === 'blocker' && /'owner' is not a known field/.test(d2.detail), 'e2e: worktree read stays STRICT — a retired field makes DESC-02 name it at blocker')
  }

} finally {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
}

console.log(fails ? `\n✗ ${fails} failure(s)` : '\n✓ records suite clean')
process.exit(fails ? 1 : 0)
