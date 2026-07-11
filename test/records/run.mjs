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
import { scan, findingId } from '../../src/scrub.mjs'
import { extractNext, newestLocalLog } from '../../src/facts/git.mjs'

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

  // scrub block -> non-lossy draft -> replay with the dated judgment
  const t2 = mkrepo('lane/beta'); tmps.push(t2)
  const akia = 'AKIA' + 'IOSFODNN7EXAMPLE'
  const r2 = sh(t2, process.execPath, [BASELINE, 'log', '--repo', t2, '-m', `found ${akia} in an old commit`, '--next', 'rotate'], NOW)
  const draft = 'records/sessions/lane/beta'
  ok(r2.code === 1 && !fs.existsSync(path.join(t2, draft)), 'deterministic finding blocks: exit 1, nothing under records/')
  const draftRel = (r2.out.match(/\.baseline\/cache\/[^\s]+\.md/) || [])[0]
  ok(!!draftRel && fs.existsSync(path.join(t2, draftRel)), `draft survives at ${draftRel || '(missing)'}`)
  const allowId = (r2.out.match(/scrub-[0-9a-f]{12}/) || [])[0]
  const r2b = sh(t2, process.execPath, [BASELINE, 'log', '--repo', t2, '--from', draftRel, '--allow', allowId, '--reason', 'AWS documented example key'], NOW)
  ok(r2b.code === 0 && fs.existsSync(path.join(t2, 'records/sessions/lane/beta/2026-07-11-120000-records-fixture.md')), 'draft replay + --allow writes the record at the original stamp')
  const wl = JSON.parse(fs.readFileSync(path.join(t2, '.baseline/scrub-allowlist.json'), 'utf8'))
  ok(wl.entries.length === 1 && wl.entries[0].id === allowId && wl.entries[0].date === '2026-07-11' && !!wl.entries[0].reason, 'allowlist entry is a dated judgment (id + reason + date, never the secret)')
  ok(!JSON.stringify(wl).includes(akia), 'the allowlist never contains the flagged value')

  // stdin + --json + --lane override
  const t3 = mkrepo('main'); tmps.push(t3)
  const r3 = (() => { try { return { out: execFileSync(process.execPath, [BASELINE, 'log', '--repo', t3, '--json', '--lane', 'lane/gamma', '--agent', 'Piped Agent'], { cwd: t3, input: 'from stdin\n', stdio: ['pipe', 'pipe', 'pipe'], env: { ...GIT_ENV, ...NOW } }).toString(), code: 0 } } catch (e) { return { out: (e.stdout || '').toString(), code: e.status ?? 1 } } })()
  const j3 = JSON.parse(r3.out)
  ok(r3.code === 0 && j3.written === 'records/sessions/lane/gamma/2026-07-11-120000-piped-agent.md', 'stdin message + --lane/--agent overrides + --json shape')

  // environment errors
  const t4 = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-nogit-')); tmps.push(t4)
  const r4 = sh(t4, process.execPath, [BASELINE, 'log', '--repo', t4, '-m', 'x'], NOW)
  ok(r4.code === 2 && /no lane resolvable/.test(r4.out), 'outside git with no --lane: usage error, not a crash')
  const r5 = sh(t4, process.execPath, [BASELINE, 'log', '--repo', t4, '-m', 'x', '--allow', 'scrub-abc'], NOW)
  ok(r5.code === 2 && /--reason/.test(r5.out), '--allow without --reason refused (judgments are dated + reasoned)')
} finally {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
}

console.log(fails ? `\n✗ ${fails} failure(s)` : '\n✓ records suite clean')
process.exit(fails ? 1 : 0)
