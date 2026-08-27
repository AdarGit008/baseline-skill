#!/usr/bin/env node
// baseline orient — the five-line contract (v3 PLAN §8 V29; §10 D5 V37; §11 D7/D8/D12,
// V24/V25/V39/V42). orient is an agent helper, never a gate: five labelled lines on stdout,
// exit 0 always, one network act (`git fetch` — never a pull) and never `gh`. Nothing about its
// wording is pinned — only the shape (labels, line count, --json keys), the exit code, what
// it must not do (spawn gh, read a plugin artifact, dirty the tree), and that every count on
// the score line is the derived one: check's own summary over the same repo, never a literal.
//
// Fixtures are throwaway git repos with LOCAL bare origins (no network). The forge is proven
// closed by a `gh` stub first on PATH that records every spawn into a sentinel.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const short = (s, n = 90) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// ---------------------------------------------------------------- env hygiene
// Same law as test/golden and test/admit: the ambient env must never steer the tool under
// test. A dev's BASELINE_OKF_BUNDLE would flip the knowledge line; a CI job's GITHUB_* would
// relabel the lane; GIT_TERMINAL_PROMPT=0 so no fetch can ever wait on a credential prompt.
const GITENV = {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Orient Tester', GIT_AUTHOR_EMAIL: 'orient@test.invalid',
  GIT_COMMITTER_NAME: 'Orient Tester', GIT_COMMITTER_EMAIL: 'orient@test.invalid',
}
const CLEAN_ENV = { ...process.env }
for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD', 'BASELINE_AGENT', 'BASELINE_GOV_ADMIN',
  'BASELINE_OKF_BUNDLE', 'BASELINE_GRAPH_DIR', 'GITHUB_HEAD_REF', 'GITHUB_REF_NAME', 'GITHUB_REF_TYPE', 'GITHUB_EVENT_NAME',
  'GITHUB_WORKSPACE', 'GITHUB_ACTIONS', 'CI']) delete CLEAN_ENV[k]

const tmps = []
const mktmp = name => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `orient-${name}-`)); tmps.push(d); return d }
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...CLEAN_ENV, ...GITENV } }).trim()
const writeAll = (dir, files) => { for (const [rel, body] of Object.entries(files)) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body) } }
/** a committed repo holding exactly `files`; no origin unless the test adds one */
function mkrepo(name, files) {
  const dir = mktmp(name)
  git(dir, 'init', '-q', '-b', 'main'); writeAll(dir, files); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'fixture')
  return dir
}
/** bodies that clear the always-on blockers, so a score reflects only what a test planted */
const CLEAN_NODE = () => ({
  'package.json': JSON.stringify({ name: 'orient-fixture', version: '0.0.0', private: true, scripts: { test: 'true' } }, null, 2) + '\n',
  '.github/workflows/ci.yml': 'name: ci\non: [push]\npermissions: read-all\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n',
  'test/basic.test.js': '// a test exists\n',
  'src/index.js': 'export const hi = () => 1\n',
  '.gitignore': '.env\nnode_modules/\ngraphify-out/\n',
  LICENSE: 'MIT-ish fixture (not a real grant).\n',
  'README.md': '# orient fixture\n\nNo links, no counts, nothing to break.\n',
})

// ---------------------------------------------------------------- the gh stub
// A fake `gh` first on PATH: every invocation lands in the sentinel, so "orient never spawned
// gh" is a file that stayed absent, not an assumption about the host.
const GHBOX = mktmp('ghbox')
const SENTINEL = path.join(GHBOX, 'gh-calls')
fs.mkdirSync(path.join(GHBOX, 'bin'))
fs.writeFileSync(path.join(GHBOX, 'bin', 'gh'), `#!/bin/sh\nprintf '%s\\n' "gh $*" >> ${JSON.stringify(SENTINEL)}\nexit 0\n`)
fs.chmodSync(path.join(GHBOX, 'bin', 'gh'), 0o755)
const ghCalls = () => { try { return fs.readFileSync(SENTINEL, 'utf8').trim() } catch { return '' } }
const STUBPATH = { PATH: `${path.join(GHBOX, 'bin')}:${process.env.PATH}` }

// ---------------------------------------------------------------- running the CLI
const cli = (cwd, args, env = {}) => {
  const r = spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV, ...STUBPATH, ...env } })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}
const orient = (dir, args = [], env = {}) => cli(dir, ['orient', '--repo', dir, ...args], env)
const orientJson = (dir, env = {}) => { const r = orient(dir, ['--json'], env); let j = null; try { j = JSON.parse(r.stdout) } catch {} ; return { ...r, j } }
const checkJson = (dir, env = {}) => { const r = cli(dir, ['check', '--repo', dir, '--no-exec', '--json'], env); let j = null; try { j = JSON.parse(r.stdout) } catch {} ; return { ...r, j } }

// ---------------------------------------------------------------- the contract, as predicates
const LABELS = ['repo:', 'work:', 'graph:', 'knowledge:', 'score:']
const nonEmpty = s => s.split('\n').map(l => l.trimEnd()).filter(Boolean)
const labelOf = l => LABELS.find(p => l.trimStart().startsWith(p)) || null
/** the human render: ≤5 non-empty lines, every one a label, no label twice, exit 0 */
function assertFiveLines(r, what) {
  const lines = nonEmpty(r.stdout)
  ok(r.status === 0, `${what}: exit 0 (got ${r.status}${r.status ? `: ${short(r.stderr)}` : ''})`)
  ok(lines.length > 0 && lines.length <= LABELS.length, `${what}: at most ${LABELS.length} non-empty lines on stdout (got ${lines.length})`)
  const stray = lines.filter(l => !labelOf(l))
  ok(stray.length === 0, `${what}: every line starts with one of ${LABELS.join(' ')} (stray: ${short(stray[0]) || '—'})`)
  const seen = lines.map(labelOf).filter(Boolean)
  ok(new Set(seen).size === seen.length, `${what}: no label appears twice`)
  ok(!/PLUG-0\d/.test(r.stdout), `${what}: no PLUG row on an orient line (D8)`)
  return lines
}
/** the --json payload: the keys the contract names, typed */
function assertJsonShape(o, what) {
  const j = o.j
  ok(o.status === 0 && !!j, `${what} --json: exit 0 and parseable (exit ${o.status}: ${short(o.stderr)})`)
  ok(!!j && typeof j.repo === 'object' && j.repo !== null && 'head' in j.repo, `${what} --json: repo.head is carried`)
  ok(!!j && typeof j.work === 'object' && j.work !== null, `${what} --json: work is an object`)
  ok(!!j && typeof j.graph === 'object' && j.graph !== null && ['present', 'absent'].includes(j.graph?.state) && 'mtime' in (j.graph || {}),
    `${what} --json: graph carries state present|absent and mtime (got ${JSON.stringify(j?.graph?.state)})`)
  ok(!!j && typeof j.knowledge === 'object' && j.knowledge !== null, `${what} --json: knowledge is an object`)
  ok(!!j && Number.isInteger(j.score?.blockers) && Number.isInteger(j.score?.advisory), `${what} --json: score.blockers and score.advisory are integers (got ${JSON.stringify(j?.score)})`)
  ok(!!j && Array.isArray(j.notes) && Array.isArray(j.suggestions), `${what} --json: notes[] and suggestions[] are arrays`)
  ok(!!j && !(j.results || []).some(x => /^PLUG-0\d/.test(String(x.id))), `${what} --json: no PLUG result row (D8)`)
  const forge = (j?.results || []).filter(x => /^(GOV-01|GOV-02|OPS-07)/.test(String(x.id)))
  ok(forge.every(x => x.state === 'n/a'), `${what} --json: any forge rule carried is state n/a (D12) (${forge.map(x => `${x.id}=${x.state ?? x.tag}`).join(' ') || 'none carried'})`)
  ok(!!j && j.planes?.forge?.available !== true && j.forgeAvailable !== true, `${what} --json: no forge plane reports available`)
  return j
}
/** blockers/advisory the way check derives them from its own rows over the same repo */
function expectedScore(dir, env = {}) {
  const c = checkJson(dir, env)
  const rows = c.j?.results || []
  const blocking = x => x.severity === 'blocker' && (x.tag === 'FAIL' || x.tag === 'DIVERGED')
  const evaluated = rows.filter(x => x.state !== 'n/a' && x.tag != null)
  return { blockers: c.j?.summary?.blockers, advisory: evaluated.filter(x => x.tag !== 'PASS' && !blocking(x)).length, checkExit: c.status }
}

// ======================================================== 1 · a clean repo, no origin
{
  const dir = mkrepo('clean', CLEAN_NODE())
  const sha = git(dir, 'rev-parse', 'HEAD')
  const h = orient(dir)
  const lines = assertFiveLines(h, 'clean repo')
  const repoLine = lines.find(l => labelOf(l) === 'repo:') || ''
  ok(repoLine.includes(sha.slice(0, 7)), `clean repo: the repo line carries the real HEAD (${short(repoLine)})`)
  ok(ghCalls() === '', `clean repo: orient never spawned gh (${short(ghCalls()) || 'none'})`)

  const o = orientJson(dir)
  const j = assertJsonShape(o, 'clean repo')
  ok(!!j && sha.startsWith(String(j.repo?.head || '\u0000')), `clean repo --json: repo.head is HEAD (${j?.repo?.head} vs ${sha.slice(0, 7)})`)
  ok(!!j && j.graph?.state === 'absent', `clean repo --json: no graphify-out/ reads as graph absent`)
  const sugg = (j?.suggestions || []).filter(s => /graph/i.test(typeof s === 'string' ? s : JSON.stringify(s)))
  ok(sugg.length > 0, `clean repo --json: an absent graph is a suggestion (${short(JSON.stringify(j?.suggestions))})`)
  const find = (j?.findings || []).filter(f => /graph/i.test(typeof f === 'string' ? f : JSON.stringify(f)))
  ok(find.length === 0, `clean repo --json: and never a finding`)
  ok(/graph/i.test(lines.find(l => labelOf(l) === 'graph:') || ''), 'clean repo: the human graph line says so')
  // asked BEFORE check runs below: a check WARN leaves .baseline/log/ by design (D10); orient must not
  ok(git(dir, 'status', '--porcelain') === '', `clean repo: orient leaves the worktree clean (${short(git(dir, 'status', '--porcelain')) || '—'})`)
  ok(ghCalls() === '', 'clean repo --json: still no gh')
  // the score is check's own count over the same repo
  const want = expectedScore(dir)
  ok(!!j && j.score?.blockers === want.blockers, `clean repo: score.blockers equals check's summary.blockers (${j?.score?.blockers} vs ${want.blockers})`)
  ok(!!j && j.score?.advisory === want.advisory, `clean repo: score.advisory equals check's non-pass, non-blocking rows (${j?.score?.advisory} vs ${want.advisory})`)
}

// ======================================================== 2 · a broken repo blocks nothing
{
  const dir = mkrepo('broken', { 'README.md': '# broken\n\n[dead](./nope.md)\n' })
  const h = orient(dir)
  assertFiveLines(h, 'broken repo')
  const o = orientJson(dir)
  const j = assertJsonShape(o, 'broken repo')
  const want = expectedScore(dir)
  ok(want.checkExit === 1 && want.blockers > 0, `broken repo: (fixture) check itself fails it (exit ${want.checkExit}, ${want.blockers} blockers)`)
  ok(!!j && j.score?.blockers === want.blockers, `broken repo: orient reports those blockers (${j?.score?.blockers} vs ${want.blockers}) and still exits 0`)
  ok(!!j && j.score?.advisory === want.advisory, `broken repo: and the same advisory count (${j?.score?.advisory} vs ${want.advisory})`)
}

// ======================================================== 3 · the plugin artifacts are metadata (D7)
{
  // a tracked tdd.json, an ignored graphify-out/ three days old whose report claims a bogus
  // commit, and a bundle of garbage bytes: orient may stat them, never open them
  const BOGUS = 'deadbeef'.repeat(5)
  const GARBAGE = Buffer.from([0x00, 0xff, 0xfe, 0x7b, 0x01, 0x02, 0x00, 0x22, 0x5c, 0x0a, 0xc0, 0x80, 0x00, 0x7d, 0x7b, 0x7b])
  const dir = mkrepo('plugins', { ...CLEAN_NODE(), 'tdd.json': GARBAGE })
  writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': `# GRAPH_REPORT\n\nBuilt from commit: ${BOGUS}\n` })
  const planted = new Date(Date.now() - 3 * 86400e3); planted.setMilliseconds(0)
  fs.utimesSync(path.join(dir, 'graphify-out', 'GRAPH_REPORT.md'), planted, planted)
  fs.utimesSync(path.join(dir, 'graphify-out'), planted, planted)
  const bundle = mktmp('bundle')
  fs.mkdirSync(path.join(bundle, 'baseline', 'rules'), { recursive: true })
  fs.writeFileSync(path.join(bundle, 'baseline', 'rules', 'sec-01.md'), GARBAGE)
  const env = { BASELINE_OKF_BUNDLE: bundle }

  const h = orient(dir, [], env)
  const lines = assertFiveLines(h, 'plugins present')
  const o = orientJson(dir, env)
  const j = assertJsonShape(o, 'plugins present')
  ok(!!j && j.graph?.state === 'present', `plugins present --json: graph.state is present (got ${JSON.stringify(j?.graph?.state)})`)
  const got = Date.parse(String(j?.graph?.mtime))
  ok(Number.isFinite(got) && Math.abs(got - planted.getTime()) < 2000, `plugins present --json: graph.mtime is the directory's mtime (${j?.graph?.mtime} vs planted ${planted.toISOString()})`)
  ok(!(h.stdout + h.stderr + o.stdout + o.stderr).includes(BOGUS), 'plugins present: the report\'s "Built from commit" line is never read, so never echoed')
  ok(!/parse|unexpected token|invalid json|malformed/i.test(h.stderr + o.stderr), `plugins present: nothing complains about the content, because nothing read it (${short(h.stderr + o.stderr) || '—'})`)
  ok(/tdd\.json|present/i.test(lines.find(l => labelOf(l) === 'work:') || ''), `plugins present: the work line reports tdd.json (${short(lines.find(l => labelOf(l) === 'work:'))})`)
  ok(!(j?.suggestions || []).some(s => /graph/i.test(typeof s === 'string' ? s : JSON.stringify(s))), 'plugins present --json: a present graph draws no graph suggestion')
  ok(git(dir, 'status', '--porcelain') === '', `plugins present: worktree clean afterwards (${short(git(dir, 'status', '--porcelain')) || '—'})`)
  ok(ghCalls() === '', 'plugins present: no gh')

  // a present and an absent graph exit identically — the graph changes no exit code (V25)
  const absent = orientJson(mkrepo('graph-absent', CLEAN_NODE()), env)
  ok(absent.status === o.status && absent.status === 0, `graph present and absent exit identically (${o.status}/${absent.status})`)
}

// ======================================================== 4 · step 0 is the FETCH (D5, v4)
{
  // THE BOUNDARY: baseline never changes your files, your branch or your history. origin
  // carries a commit the clone does not have yet — orient must REPORT the gap and leave it
  // open, because closing it is a pull and pulling is the human's act.
  const origin = mktmp('origin'); git(origin, 'init', '-q', '-b', 'main'); writeAll(origin, CLEAN_NODE())
  git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'first')
  const bare = path.join(mktmp('bare'), 'o.git'); git(path.dirname(bare), 'clone', '-q', '--bare', origin, bare)
  const work = path.join(mktmp('work'), 'clone'); git(path.dirname(work), 'clone', '-q', bare, work)
  writeAll(origin, { 'AHEAD.md': '# landed upstream after the clone\n' })
  git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'second'); git(origin, 'push', '-q', bare, 'main')

  const before = git(work, 'rev-parse', 'HEAD')
  const o = orientJson(work)
  const after = git(work, 'rev-parse', 'HEAD')
  assertJsonShape(o, 'origin ahead')
  ok(after === before, `origin ahead: orient never moved HEAD (${before.slice(0, 7)} → ${after.slice(0, 7)})`)
  ok(!fs.existsSync(path.join(work, 'AHEAD.md')), 'origin ahead: the upstream commit is NOT in the tree — orient does not pull')
  ok(!!o.j && after.startsWith(String(o.j.repo?.head || '\u0000')), `origin ahead: the repo line reports the UNMOVED head (${o.j?.repo?.head} vs ${after.slice(0, 7)})`)
  // the fetch did happen: a behind-count is only knowable from refs it brought in
  ok(o.j?.repo?.behind === 1, `origin ahead: the gap is counted, not closed (behind=${JSON.stringify(o.j?.repo?.behind)})`)
  ok(o.j?.repo?.upstream === 'origin/main', `origin ahead: the upstream is named (${JSON.stringify(o.j?.repo?.upstream)})`)
  ok(/behind/i.test(JSON.stringify(o.j?.notes ?? [])), `origin ahead: being behind is a warning note (${short(JSON.stringify(o.j?.notes))})`)
  ok(/behind/i.test(orient(work).stdout), 'origin ahead: and the human repo line says so')
  ok(git(work, 'status', '--porcelain') === '', 'origin ahead: worktree clean')
  ok(git(work, 'stash', 'list') === '', 'origin ahead: no stash')
  ok(ghCalls() === '', 'origin ahead: no gh')
  const h = orient(work)
  assertFiveLines(h, 'origin ahead (human)')

  // diverged: a local commit AND a newer upstream one. There is nothing special left to
  // refuse — orient never merges anything — so this is now just a both-ways count, with the
  // tree exactly as it was (no merge in progress, no rebase, no stash)
  writeAll(origin, { 'MORE.md': '# third\n' }); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'third'); git(origin, 'push', '-q', bare, 'main')
  writeAll(work, { 'LOCAL.md': '# mine\n' }); git(work, 'add', '-A'); git(work, 'commit', '-qm', 'local')
  const localHead = git(work, 'rev-parse', 'HEAD')
  const d = orientJson(work)
  ok(d.status === 0, `diverged: exit 0 (got ${d.status})`)
  ok(git(work, 'rev-parse', 'HEAD') === localHead, 'diverged: HEAD untouched (no merge, no reset)')
  ok(!fs.existsSync(path.join(work, '.git', 'MERGE_HEAD')) && !fs.existsSync(path.join(work, '.git', 'rebase-merge')), 'diverged: no merge or rebase left in progress')
  ok(git(work, 'status', '--porcelain') === '' && git(work, 'stash', 'list') === '', 'diverged: worktree clean, no stash')
  ok(d.j?.repo?.ahead >= 1 && d.j?.repo?.behind >= 1,
    `diverged: counted both ways, never reconciled (ahead=${JSON.stringify(d.j?.repo?.ahead)} behind=${JSON.stringify(d.j?.repo?.behind)})`)
  const dnotes = JSON.stringify(d.j?.notes ?? [])
  ok(/behind/i.test(dnotes), `diverged: a note warns about the gap (${short(dnotes)})`)
}

// ======================================================== 5 · no origin, an unreachable one, and no git at all
{
  const lone = mkrepo('no-origin', CLEAN_NODE())
  const a = orientJson(lone)
  assertJsonShape(a, 'no origin')
  ok(/pull|fetch|origin|offline/i.test(JSON.stringify(a.j?.notes ?? [])), `no origin: the fetch's absence is a note (${short(JSON.stringify(a.j?.notes))})`)

  const gone = mkrepo('gone-origin', CLEAN_NODE())
  git(gone, 'remote', 'add', 'origin', path.join(mktmp('nowhere'), 'nope.git'))
  const b = orientJson(gone)
  assertJsonShape(b, 'unreachable origin')
  ok(/pull|fetch|origin|offline/i.test(JSON.stringify(b.j?.notes ?? []) + b.stdout), `unreachable origin: degrades to a note, never a refusal (${short(JSON.stringify(b.j?.notes))})`)
  ok(git(gone, 'status', '--porcelain') === '', 'unreachable origin: worktree clean')
  assertFiveLines(orient(gone), 'unreachable origin (human)')

  // a service repo with a forge-shaped origin: the forge rules stay closed, gh stays unspawned
  const svc = mkrepo('service', { ...CLEAN_NODE(), 'baseline.config.json': JSON.stringify({ project_type: 'service' }, null, 2) + '\n' })
  git(svc, 'remote', 'add', 'origin', path.join(mktmp('forge-shaped'), 'does-not-exist.git'))
  const s = orientJson(svc)
  assertJsonShape(s, 'service repo')
  const sh = orient(svc)
  assertFiveLines(sh, 'service repo (human)')
  ok(!/\bgh (pr|issue|auth)\b|forge unreachable/i.test(sh.stdout), `service repo: orient never points at gh (${short(sh.stdout.match(/.*\bgh\b.*/)?.[0]) || '—'})`)
  ok(ghCalls() === '', `service repo: no gh spawned (${short(ghCalls()) || 'none'})`)

  // not a git repository at all: still five lines, still exit 0
  const nogit = mktmp('nogit'); writeAll(nogit, { 'README.md': '# not git\n' })
  assertFiveLines(orient(nogit), 'non-git dir')
  const n = orientJson(nogit)
  assertJsonShape(n, 'non-git dir')
  ok(!!n.j && !n.j.repo?.head, 'non-git dir --json: repo.head is empty rather than invented')
}

// ======================================================== 6 · --help exits 0 and names the five lines
{
  const r = cli(ROOT, ['orient', '--help'])
  ok(r.status === 0, `--help exits 0 (got ${r.status})`)
  ok(!/--strict/.test(r.stdout), '--help no longer offers --strict (orient always exits 0)')
}

for (const t of tmps) { try { fs.rmSync(t, { recursive: true, force: true }) } catch {} }
console.log(fails ? `\n✗ ${fails} orient check(s) failed\n` : '\n✓ orient five-line contract holds\n')
process.exit(fails ? 1 : 0)
