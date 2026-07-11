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
import { RECORD_KINDS, validateRecord, parseFrontmatter, renderFrontmatter, parseAdrHeader } from '../../src/records.mjs'
import { evaluateJudgment, evalCondition, loadJudgments } from '../../src/jdg.mjs'
import { scan, findingId, DETERMINISTIC_SOURCES } from '../../src/scrub.mjs'
import { extractNext, newestLocalLog, gitFacts } from '../../src/facts/git.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

// ---------- rules loader (the split must be lossless) ----------
{
  const R = loadRules()
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules.json'), 'utf8'))
  ok(R.rules.length === 71, `loader assembles 71 rules (got ${R.rules.length})`)
  ok((manifest.modules || []).length === 11, `manifest lists 11 modules (got ${(manifest.modules || []).length})`)
  ok(!('rules' in manifest), 'manifest itself carries no rules (they live in rules/)')
  ok(new Set(R.rules.map(r => r.id)).size === R.rules.length, 'rule ids unique across modules')
  ok(!!R.version && !!R.profiles && Array.isArray(R.project_types), 'identity fields (version/profiles/project_types) ride the manifest')
  let homed = true
  for (const m of manifest.modules) {
    const cat = path.basename(m, '.json')
    const mod = JSON.parse(fs.readFileSync(path.join(ROOT, m), 'utf8'))
    for (const r of mod.rules) {
      const prefix = r.id.split('-')[0].toLowerCase()
      const want = { build: 'build', test: 'test', ctx: 'ctx', claim: 'claim', sec: 'sec', gov: 'gov', comm: 'comm', qual: 'qual', repro: 'repro', ops: 'ops', desc: 'desc' }[prefix]
      if (want !== cat) { homed = false; console.log(`      ${r.id} lives in ${m}`) }
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
  const sec01 = norm(loadRules().rules.find(r => r.id === 'SEC-01').check.pattern)
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

  // ---- the signoff→JDG bridge through check.mjs ----
  const t7 = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-bridge-')); tmps.push(t7)
  fs.mkdirSync(path.join(t7, 'records/judgments'), { recursive: true })
  fs.mkdirSync(path.join(t7, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(t7, '.project-baseline'), { recursive: true })
  fs.writeFileSync(path.join(t7, 'baseline.repo.json'), JSON.stringify({ schema_version: 1, type: 'docs', lifecycle: 'production', maturity: 'prototype', owner: 'adar', workflow: 'single-lane', anchoring: 'off' }))
  fs.writeFileSync(path.join(t7, 'docs/start-here.md'), '# status\n\nlast-verified: abc1234\n')
  fs.writeFileSync(path.join(t7, 'README.md'), '# bridge fixture\n')
  fs.writeFileSync(path.join(t7, 'LICENSE'), 'MIT\n')
  fs.writeFileSync(path.join(t7, '.project-baseline/signoff.json'), JSON.stringify({ 'CTX-04': { by: 'legacy', date: '2020-01-01', note: 'eternal legacy entry' } }))
  fs.writeFileSync(path.join(t7, 'records/judgments/JDG-0001.json'), JSON.stringify({ record: 'judgment/1', id: 'JDG-0001', kind: 'sign-off', date: '2026-06-01', by: 'adar', subject: 'CTX-04', reason: 'r', review_by: '2026-07-10' }))
  const CHECK = path.join(ROOT, 'check.mjs')
  const br = sh(t7, process.execPath, [CHECK, '--repo', t7, '--json', '--no-exec'], NOW)
  const ctx04 = JSON.parse(br.out).results.find(r => r.id === 'CTX-04')
  ok(ctx04.tag === 'SIGN-OFF' && /lapsed/.test(ctx04.detail), 'bridge: a LAPSED sign-off JDG is honestly not signed — and outranks the eternal legacy entry')
  // a malformed record must never read as signed-forever: strict loading excludes it
  fs.writeFileSync(path.join(t7, 'records/judgments/JDG-0002.json'), JSON.stringify({ record: 'judgment/1', id: 'JDG-0002', kind: 'sign-off', date: '2026-07-01', by: 'adar', subject: 'CTX-04', reason: 'r', review_by: 20200101 }))
  const br2 = sh(t7, process.execPath, [CHECK, '--repo', t7, '--json', '--no-exec'], NOW)
  const ctx04b = JSON.parse(br2.out).results.find(r => r.id === 'CTX-04')
  ok(ctx04b.tag === 'SIGN-OFF' && /lapsed/.test(ctx04b.detail), 'bridge: a schema-invalid sign-off (numeric review_by) is excluded — it can never read as signed while jdg check calls it INVALID')
} finally {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
}

console.log(fails ? `\n✗ ${fails} failure(s)` : '\n✓ records suite clean')
process.exit(fails ? 1 : 0)
