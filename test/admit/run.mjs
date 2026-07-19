#!/usr/bin/env node
// baseline admit — the M6a command contract, exercised against LOCAL bare origins
// (no network, no forge; forge-dependent rules degrade to labeled SKIPs exactly as
// designed). Covers: the C35 staleness refusal in both directions, FS1 target-ref
// descriptor reads (a branch cannot weaken the posture that judges it), DESC-03's
// same-range judgment contract (subject = the ONE spelling), the JDG-only admission
// path, break-glass-from-main relief for ancestry-unprovable (shallow) runs,
// MERGE-02 sister-lane dependencies + the Baseline-Stacked-On lift, and the context
// gate (admit-only rules are invisible to check).
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
const tmps = []

const GITENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Admit Tester', GIT_AUTHOR_EMAIL: 'admit@test.invalid', GIT_COMMITTER_NAME: 'Admit Tester', GIT_COMMITTER_EMAIL: 'admit@test.invalid' }
// The ambient env must not steer the tool under test (the golden harness's lesson,
// test/golden/run.mjs): a dev's exported BASELINE_LOG_NOW would time-travel the
// review_by comparisons, and CI's pull_request events set GITHUB_HEAD_REF for every
// step — which admit deliberately reads on detached HEAD, so the detached-HEAD assert
// below would read the LEAKED branch. Strip them all; tests re-inject explicitly.
const CLEAN_ENV = { ...process.env }
for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD', 'BASELINE_AGENT', 'BASELINE_GOV_ADMIN', 'GITHUB_HEAD_REF']) delete CLEAN_ENV[k]
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...CLEAN_ENV, ...GITENV } }).trim()
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV, ...env } })
const admitJson = (cwd, args = [], env = {}) => {
  const r = cli(cwd, ['admit', '--json', ...args], env)
  let j = null; try { j = JSON.parse(r.stdout) } catch {}
  return { ...r, j }
}

const BASE_DESC = {
  schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype', owner: 't',
  workflow: 'multi-lane', anchoring: 'strict',
  ground_truth_boundary: { default_branch: 'main' },
  lanes: { namespace: 'lane/*', lease_ttl: '7d' },
  join_keys: ['Baseline-Agent', 'Baseline-Issue'],
}
const JDG = (id, over = {}) => JSON.stringify({
  record: 'judgment/1', id, kind: 'deviation', date: '2026-07-15', by: 'adar',
  subject: 'baseline.repo.json', reason: 'test judgment', review_by: '2099-12-31', ...over,
}, null, 2) + '\n'

// seed a bare origin + a working clone with main carrying the descriptor
function mkworld(name, desc = BASE_DESC) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `admit-${name}-`)); tmps.push(dir)
  const bare = path.join(dir, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: { ...process.env, ...GITENV } })
  const seed = path.join(dir, 'seed'); fs.mkdirSync(seed)
  git(seed, 'init', '-q', '-b', 'main')
  if (desc) fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  fs.writeFileSync(path.join(seed, 'README.md'), `# ${name}\n`)
  git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed')
  git(seed, 'remote', 'add', 'origin', bare)
  git(seed, 'push', '-q', 'origin', 'main')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['clone', '-q', bare, clone], { env: { ...process.env, ...GITENV } })
  git(clone, 'config', 'user.name', 'Admit Tester'); git(clone, 'config', 'user.email', 'admit@test.invalid')
  return { dir, bare, seed, clone }
}
const commit = (cwd, rel, content, msg) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), content); git(cwd, 'add', '-A'); git(cwd, 'commit', '-qm', msg) }
// M7a: promoted FLOW-02 refuses a record-less lane at admit — worlds that assert
// OTHER things plant one committed session record so their assertion stays isolated
const logLane = (cwd, lane) => commit(cwd, `records/sessions/${lane}/2026-07-18-1200-t.md`, `---\nrecord: session/1\nlane: ${lane}\nagent: t\ndate: 2026-07-18\ntime: "12:00"\n---\n## Did\nwork\n## Left open\nnext: push\n`, 'session record')
const advanceMainAtOrigin = (w) => { commit(w.seed, 'ADVANCE.md', 'main moved\n', 'main advances'); git(w.seed, 'push', '-q', 'origin', 'main') }

// ---------- environment refusals (exit 2 — nothing evaluated) ----------
{
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'admit-notrepo-')); tmps.push(bare)
  ok(cli(bare, ['admit']).status === 2, 'not a git repo → exit 2')
  const w = mkworld('noorigin')
  git(w.clone, 'remote', 'remove', 'origin')
  ok(cli(w.clone, ['admit']).status === 2, 'no origin and no --target → exit 2')
  const w2 = mkworld('nodesc', null)
  const r2 = cli(w2.clone, ['admit'])
  ok(r2.status === 2 && /no baseline\.repo\.json at origin\/main/.test(r2.stderr), 'no descriptor at the TARGET → exit 2 naming FS1')
  ok(cli(w2.clone, ['admit', '--target']).status === 2, '--target without a value → usage')
}

// ---------- staleness: the C35 command contract ----------
{
  const w = mkworld('stale')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w.clone, 'work.txt', 'w\n', 'lane work')
  logLane(w.clone, 'lane/7')
  let r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.verdict === 'ADMITTED' && r.j?.staleness.ancestor === true, `fresh branch admits (got ${r.status})`)
  ok(r.j?.target.ref === 'origin/main', `target derived as origin/main (got ${r.j?.target.ref})`)
  advanceMainAtOrigin(w)
  r = admitJson(w.clone)
  ok(r.status === 1 && r.j?.verdict === 'REFUSED' && r.j?.staleness.stale === true, `advanced target refuses (got ${r.status})`)
  ok(/re-derive at an up-to-date SHA/.test((r.j?.refusals || [])[0] || ''), 'the refusal names the re-derive recipe')
  git(w.clone, 'fetch', '-q', 'origin'); git(w.clone, 'merge', '-q', '--no-edit', 'origin/main')
  r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.staleness.ancestor === true, 're-derived (merged target) admits again')
}

// ---------- FS1 + DESC-03: the target's posture judges; changes carry their judgment ----------
{
  const w = mkworld('desc')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  logLane(w.clone, 'lane/7')
  const weak = { ...BASE_DESC, anchoring: 'off', workflow: 'single-lane' }
  commit(w.clone, 'baseline.repo.json', JSON.stringify(weak, null, 2) + '\n', 'weaken posture on-branch')
  let r = admitJson(w.clone)
  ok(r.status === 1 && r.j?.verdict === 'REFUSED', `descriptor change without judgment refuses (got ${r.status})`)
  const d3 = r.j?.results.find(x => x.id === 'DESC-03')
  ok(d3?.tag === 'FAIL' && /no same-range judgment/.test(d3?.detail || ''), 'DESC-03 FAILs naming the missing judgment')
  ok(/WEAKENING/.test(d3?.detail || '') && /anchoring: 'strict' → 'off'/.test(d3?.detail || '') && /workflow/.test(d3?.detail || ''), `the weakening ladder names both down-moves (got: ${d3?.detail?.slice(0, 140)})`)
  // FS1: the RUN's posture came from the target — lane rules still evaluated (rows exist)
  ok((r.j?.results || []).some(x => x.category === 'flow'), 'FS1: flow rules evaluated under the TARGET posture, not the branch\'s single-lane')

  // wrong subject: the tool's OWN pinned spelling is the matcher
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { subject: 'descriptor change' }), 'judgment, wrong subject')
  r = admitJson(w.clone)
  const d3b = r.j?.results.find(x => x.id === 'DESC-03')
  ok(r.status === 1 && /subject is 'descriptor change', not 'baseline\.repo\.json'/.test(d3b?.detail || ''), 'a near-miss subject refuses WITH the exact-spelling hint')

  // exact subject: admitted, judgment named
  commit(w.clone, 'records/judgments/JDG-0002.json', JDG('JDG-0002'), 'judgment, exact subject')
  r = admitJson(w.clone)
  const d3c = r.j?.results.find(x => x.id === 'DESC-03')
  ok(r.status === 0 && d3c?.tag === 'PASS' && /carries JDG-0002/.test(d3c?.detail || ''), `exact-subject judgment admits (got ${r.status}: ${d3c?.detail?.slice(0, 80)})`)

  // an EXPIRED judgment is honestly not a judgment
  const w2 = mkworld('descexp')
  git(w2.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w2.clone, 'baseline.repo.json', JSON.stringify({ ...BASE_DESC, anchoring: 'relaxed' }, null, 2) + '\n', 'tune anchoring')
  commit(w2.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2020-01-01' }), 'lapsed judgment')
  r = admitJson(w2.clone)
  ok(r.status === 1 && /no same-range judgment/.test(r.j?.results.find(x => x.id === 'DESC-03')?.detail || ''), 'a lapsed judgment does not satisfy DESC-03')

  // an INVALIDATED head descriptor is the ultimate weakening
  const w3 = mkworld('descinv')
  git(w3.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w3.clone, 'baseline.repo.json', '{ not json', 'break the descriptor on-branch')
  r = admitJson(w3.clone)
  ok(r.status === 1 && /descriptor invalidated/.test(r.j?.results.find(x => x.id === 'DESC-03')?.detail || ''), 'invalidating the descriptor on-branch is classified as weakening and refused')
}

// ---------- M7a: DESC-03 kind pin — break-glass never approves a descriptor change ----------
{
  const w = mkworld('desckind')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  logLane(w.clone, 'lane/7')
  const weak = { ...BASE_DESC, anchoring: 'relaxed' }
  commit(w.clone, 'baseline.repo.json', JSON.stringify(weak, null, 2) + '\n', 'descriptor change')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit' }), 'break-glass, right subject')
  const r = admitJson(w.clone)
  const d3 = r.j?.results.find(x => x.id === 'DESC-03')
  ok(r.status === 1 && d3?.tag === 'FAIL', `a right-subject BREAK-GLASS does not satisfy DESC-03 (kinds pinned at M7a) (got ${r.status}, ${d3?.tag})`)
  ok(/never descriptor-change approval/.test(d3?.detail || '') && /sign-off\|deviation\|risk-acceptance/.test(d3?.detail || ''), 'the refusal names the kind pin and the satisfying kinds')
  commit(w.clone, 'records/judgments/JDG-0002.json', JDG('JDG-0002', { kind: 'risk-acceptance' }), 'risk-acceptance, right subject')
  const r2 = admitJson(w.clone)
  ok(r2.status === 0 && r2.j?.results.find(x => x.id === 'DESC-03')?.tag === 'PASS', 'risk-acceptance (a pinned kind) satisfies')
}

// ---------- M7a: blocker-DIVERGED refuses AT ADMIT, verdict preserved ----------
{
  const w = mkworld('divrefuse')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w.clone, 'work.txt', 'w\n', 'lane work')
  logLane(w.clone, 'lane/7')
  git(w.clone, 'push', '-q', 'origin', 'lane/7')
  const tip = git(w.clone, 'rev-parse', 'lane/7')
  const replay = path.join(w.dir, 'replay'); fs.mkdirSync(replay)
  fs.writeFileSync(path.join(replay, 'lane-refs-refs_heads_lane_.json'), JSON.stringify({ data: { repository: { refs: { pageInfo: { hasNextPage: false }, nodes: [{ name: '7', target: { oid: tip, committedDate: new Date().toISOString(), message: 'claim lane/7: issue #7\n\nBaseline-Issue: #7\nBaseline-Agent: t', associatedPullRequests: { nodes: [] } } }] } } } }) + '\n')
  fs.writeFileSync(path.join(replay, 'issue-7.json'), JSON.stringify({ number: 7, state: 'closed', title: 'closed under the live lane' }) + '\n')
  const r = admitJson(w.clone, [], { BASELINE_FORGE_REPLAY: replay })
  const d1 = r.j?.results.find(x => x.id === 'DIV-01')
  ok(r.status === 1 && r.j?.verdict === 'REFUSED' && d1?.tag === 'DIVERGED', `blocker-DIVERGED refuses at admit with the verdict class preserved (got ${r.status}, ${d1?.tag})`)
  ok((r.j?.refusals || []).some(x => /DIV-01 \(DIVERGED\)/.test(x)), 'the refusal line carries the (DIVERGED) marker')
  ok(/reopen #7|resolution path/.test(d1?.detail || ''), 'the refusal detail carries the resolution recipe')
}

// ---------- the JDG-only admission path (the reachable relief valve) ----------
{
  const w = mkworld('jdgonly')
  git(w.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: 'admit outage relief' }), 'relief record only')
  const r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.jdgOnly === true && r.j?.jdgRelief === 'JDG-0001', `a pure-judgment range admits via the JDG-only path, naming its relief record (got ${r.status}, ${r.j?.jdgRelief})`)
  const f1 = r.j?.results.find(x => x.id === 'FLOW-01')
  ok(/forge not consulted \(JDG-only admission path\)/.test(f1?.detail || ''), `the forge closure is labeled with the PATH, not fake unreachability (got: ${f1?.detail?.slice(0, 90)})`)

  // staleness is data-plane truth — it refuses even on the privileged path (M7a pin)
  advanceMainAtOrigin(w)
  const rs = admitJson(w.clone)
  ok(rs.status === 1 && rs.j?.jdgOnly === true && (rs.j?.refusals || []).some(x => /stale:/.test(x)), 'a STALE jdg-only range still refuses on staleness (the carve-out empties only leg (b))')
  git(w.clone, 'fetch', '-q', 'origin'); git(w.clone, 'merge', '-q', '--no-edit', 'origin/main')

  // one extra non-judgment file breaks the shape — the normal path judges it
  commit(w.clone, 'src.txt', 'code\n', 'code rides along')
  const r2 = admitJson(w.clone)
  ok(r2.status === 1 && r2.j?.jdgOnly === false && (r2.j?.refusals || []).some(x => /FLOW-02/.test(x)), 'a mixed range is NOT the JDG-only path — the normal contract judges it (promoted FLOW-02 refuses the record-less lane)')

  // a judgment-only range WITHOUT a break-glass is just a normal (harmless) range
  const w2 = mkworld('jdgplain')
  git(w2.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w2.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { subject: 'unrelated sign-off scope', kind: 'sign-off' }), 'plain judgment')
  const r3 = admitJson(w2.clone)
  ok(r3.j?.jdgOnly === false && r3.status === 1 && (r3.j?.refusals || []).some(x => /FLOW-02/.test(x)), 'a judgment-only range without break-glass(gate:admit) is not the relief path — the normal (promoted) contract judges it')
}

// ---------- shallow ancestry: source-loss refusal + break-glass-from-MAIN relief ----------
{
  const w = mkworld('shallow')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  git(w.clone, 'push', '-q', 'origin', 'lane/7')
  const sh = path.join(w.dir, 'shallow')
  // file:// so --depth is honored (a plain local path silently ignores it), then the
  // single-branch clone maps main into remote-tracking explicitly (the M5a refspec class)
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'lane/7', 'file://' + w.bare, sh], { env: { ...process.env, ...GITENV } })
  git(sh, 'config', 'user.name', 'T'); git(sh, 'config', 'user.email', 't@t.t')
  git(sh, 'fetch', '-q', '--depth', '1', 'origin', '+main:refs/remotes/origin/main')
  let r = admitJson(sh)
  ok(r.status === 1 && r.j?.staleness.indeterminate === true && /fetch-depth: 0/.test((r.j?.refusals || [])[0] || ''), `shallow clone refuses as source-loss naming the CI fix (got ${r.status})`)
  // relief lands on MAIN (the target) — FS5: never honored from the incoming branch
  commit(w.seed, 'records/judgments/JDG-0009.json', JDG('JDG-0009', { kind: 'break-glass', gate: 'admit', subject: 'shallow CI relief' }), 'break-glass on main')
  git(w.seed, 'push', '-q', 'origin', 'main')
  git(sh, 'fetch', '-q', '--depth', '1', 'origin', '+main:refs/remotes/origin/main')
  r = admitJson(sh)
  ok(r.status === 0 && r.j?.breakGlass?.id === 'JDG-0009', `an unexpired break-glass ON THE TARGET relieves the source-loss refusal (got ${r.status}, ${r.j?.breakGlass?.id})`)
  ok(r.j?.verdict === 'ADMITTED' && r.j?.staleness.indeterminate === true, 'the relief admits WITHOUT faking the ancestry answer')
}

// ---------- FS5 direction: a break-glass on the BRANCH must not relieve ----------
{
  const w = mkworld('fs5dir')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  commit(w.clone, 'records/judgments/JDG-0005.json', JDG('JDG-0005', { kind: 'break-glass', gate: 'admit', subject: 'smuggled relief' }), 'branch-side break-glass + work')
  git(w.clone, 'push', '-q', 'origin', 'lane/7')
  const sh = path.join(w.dir, 'shallow2')
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'lane/7', 'file://' + w.bare, sh], { env: { ...process.env, ...GITENV } })
  git(sh, 'config', 'user.name', 'T'); git(sh, 'config', 'user.email', 't@t.t')
  git(sh, 'fetch', '-q', '--depth', '1', 'origin', '+main:refs/remotes/origin/main')
  const r = admitJson(sh)
  ok(r.status === 1 && !r.j?.breakGlass, 'a break-glass riding the INCOMING branch relieves nothing (FS5: main only) — and the mixed range is not JDG-only')
}

// ---------- MERGE-02: sister-lane dependencies + the declared stack ----------
{
  const w = mkworld('sister')
  // lane/9 does work off main; lane/8 stacks ON lane/9
  git(w.clone, 'checkout', '-q', '-b', 'lane/9'); commit(w.clone, 'nine.txt', '9\n', 'sister work')
  git(w.clone, 'checkout', '-q', '-b', 'lane/8'); commit(w.clone, 'eight.txt', '8\n', 'stacked work')
  git(w.clone, 'push', '-q', 'origin', 'lane/9', 'lane/8')
  const c2 = path.join(w.dir, 'c2')
  execFileSync('git', ['clone', '-q', w.bare, c2], { env: { ...process.env, ...GITENV } })
  git(c2, 'config', 'user.name', 'T'); git(c2, 'config', 'user.email', 't@t.t')
  git(c2, 'checkout', '-q', 'lane/8')
  let r = admitJson(c2)
  const m2 = r.j?.results.find(x => x.id === 'MERGE-02')
  ok(r.status === 1 && m2?.tag === 'FAIL' && /unmerged commits from lane\/9/.test(m2?.detail || '') && (r.j?.refusals || []).some(x => /MERGE-02/.test(x)), `an undeclared stack FAILs naming the sister — and REFUSES since M7a (got ${r.status}, ${m2?.tag})`)
  // declare the stack — the trailer lifts the finding
  commit(c2, 'more.txt', 'm\n', 'more\n\nBaseline-Stacked-On: lane/9')
  r = admitJson(c2)
  const m2b = r.j?.results.find(x => x.id === 'MERGE-02')
  ok(m2b?.tag === 'PASS' && /declared via Baseline-Stacked-On/.test(m2b?.detail || ''), `the whole-token trailer declares the stack (got ${m2b?.tag}: ${m2b?.detail?.slice(0, 80)})`)
  // sister lands in main → the dependency dissolves
  git(w.seed, 'fetch', '-q', 'origin', 'lane/9'); git(w.seed, 'merge', '-q', '--no-edit', 'FETCH_HEAD'); git(w.seed, 'push', '-q', 'origin', 'main')
  git(c2, 'fetch', '-q', 'origin'); git(c2, 'merge', '-q', '--no-edit', 'origin/main')
  r = admitJson(c2)
  const m2c = r.j?.results.find(x => x.id === 'MERGE-02')
  ok(m2c?.tag === 'PASS' && /no unmerged sister-lane dependencies/.test(m2c?.detail || ''), `a landed sister is no dependency (got ${m2c?.tag})`)
}

// ---------- panel hardening: the rename bypass, invalid riders, expired relief, near-miss trailers ----------
{
  // DESC-03 must survive `git mv baseline.repo.json away` (rename detection would
  // collapse the delete+add into one post-image name — the no-renames diff keeps it honest)
  const w = mkworld('rename')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  git(w.clone, 'mv', 'baseline.repo.json', 'renamed-away.json')
  git(w.clone, 'commit', '-qm', 'rename the descriptor away')
  const r = admitJson(w.clone)
  const d3 = r.j?.results.find(x => x.id === 'DESC-03')
  ok(r.status === 1 && d3?.tag === 'FAIL' && /descriptor invalidated/.test(d3?.detail || ''), `renaming the descriptor away is a caught weakening, not "untouched" (got ${r.status}, ${d3?.tag})`)
}
{
  // the JDG-only path is strict: ONE invalid rider and the range falls to the normal contract
  const w = mkworld('jdgrider')
  git(w.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: 'relief' }), 'valid relief')
  commit(w.clone, 'records/judgments/JDG-0002.json', '{ not json\n', 'garbage rider')
  const r = admitJson(w.clone)
  ok(r.status === 1 && r.j?.jdgOnly === false && r.j?.jdgRelief === null && (r.j?.refusals || []).some(x => /FLOW-02/.test(x)), `an invalid rider disqualifies the privileged path — the normal (promoted) contract judges it (got jdgOnly=${r.j?.jdgOnly})`)
  // a MISNAMED but valid judgment also disqualifies (id must be the filename, ledger discipline)
  const w2 = mkworld('jdgmisname')
  git(w2.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w2.clone, 'records/judgments/JDG-0007.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: 'relief' }), 'misnamed relief')
  const r2 = admitJson(w2.clone)
  ok(r2.j?.jdgOnly === false, 'an id/filename mismatch disqualifies the privileged path')
}
{
  // an EXPIRED break-glass on the target relieves nothing — the valve must lapse
  const w = mkworld('expiredbg')
  commit(w.seed, 'records/judgments/JDG-0009.json', JDG('JDG-0009', { kind: 'break-glass', gate: 'admit', subject: 'stale relief', review_by: '2020-01-01' }), 'lapsed break-glass on main')
  git(w.seed, 'push', '-q', 'origin', 'main')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  git(w.clone, 'push', '-q', 'origin', 'lane/7')
  const sh = path.join(w.dir, 'shallow')
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'lane/7', 'file://' + w.bare, sh], { env: { ...CLEAN_ENV, ...GITENV } })
  git(sh, 'config', 'user.name', 'T'); git(sh, 'config', 'user.email', 't@t.t')
  git(sh, 'fetch', '-q', '--depth', '1', 'origin', '+main:refs/remotes/origin/main')
  const r = admitJson(sh)
  ok(r.status === 1 && !r.j?.breakGlass, `an expired break-glass does not relieve (got ${r.status}, breakGlass=${JSON.stringify(r.j?.breakGlass)})`)
}
{
  // Baseline-Stacked-On is whole-token in BOTH directions: lane/99 never lifts lane/9
  const w = mkworld('nearmiss')
  git(w.clone, 'checkout', '-q', '-b', 'lane/9'); commit(w.clone, 'nine.txt', '9\n', 'sister work')
  git(w.clone, 'checkout', '-q', '-b', 'lane/8'); commit(w.clone, 'eight.txt', '8\n', 'stacked\n\nBaseline-Stacked-On: lane/99')
  git(w.clone, 'push', '-q', 'origin', 'lane/9', 'lane/8')
  const c2 = path.join(w.dir, 'c2')
  execFileSync('git', ['clone', '-q', w.bare, c2], { env: { ...CLEAN_ENV, ...GITENV } })
  git(c2, 'config', 'user.name', 'T'); git(c2, 'config', 'user.email', 't@t.t')
  git(c2, 'checkout', '-q', 'lane/8')
  const r = admitJson(c2)
  const m2 = r.j?.results.find(x => x.id === 'MERGE-02')
  ok(m2?.tag === 'FAIL' && /lane\/9\b/.test(m2?.detail || ''), `trailer 'lane/99' does not lift sister 'lane/9' (got ${m2?.tag})`)
}
{
  // FS1 under explicit --target: a NON-default target ref's descriptor governs, and the
  // declared-default switch must not fire
  const w = mkworld('exptarget')
  git(w.clone, 'checkout', '-q', '-b', 'release/next')
  commit(w.clone, 'baseline.repo.json', JSON.stringify({ ...BASE_DESC, anchoring: 'relaxed', lanes: { namespace: 'lane/*', lease_ttl: '7d', families: ['release/*'] } }, null, 2) + '\n', 'release posture')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001'), 'its judgment')
  git(w.clone, 'push', '-q', 'origin', 'release/next')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work off release')
  logLane(w.clone, 'lane/7')
  const r = admitJson(w.clone, ['--target', 'origin/release/next'])
  ok(r.status === 0 && r.j?.target.ref === 'origin/release/next' && r.j?.target.source === 'local-ref (explicit --target)', `an explicit non-default target governs, honestly labeled (got ${r.j?.target.source})`)
  const f1 = r.j?.results.find(x => x.id === 'FLOW-01')
  ok(/relaxed/.test(f1?.detail || '') || f1?.tag === 'PASS', `the TARGET ref's posture (anchoring relaxed) judged the run (got: ${f1?.detail?.slice(0, 60)})`)
}

// ---------- the context gate: admit-only rules are invisible to check ----------
{
  const w = mkworld('ctxgate')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  const c = cli(w.clone, ['check', '--json', '--no-exec'])
  let cj = null; try { cj = JSON.parse(c.stdout) } catch {}
  const ids = new Set((cj?.results || []).map(x => x.id))
  ok(cj && !ids.has('DESC-03') && !ids.has('MERGE-02'), 'DESC-03/MERGE-02 are EXCLUDED from check output (no wrong-context rows)')
  ok(ids.has('FLOW-01') && ids.has('DESC-01'), 'the shared-context rules still run in check')
  const a = admitJson(w.clone)
  const aids = new Set((a.j?.results || []).map(x => x.id))
  ok(aids.has('DESC-03') && aids.has('MERGE-02') && aids.has('FLOW-01') && !aids.has('BUILD-05'), 'admit runs the admit-context set (and never the exec crown)')
}

// ---------- --target explicit + detached-HEAD CI shape (GITHUB_HEAD_REF) ----------
{
  const w = mkworld('target')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  logLane(w.clone, 'lane/7')
  const sha = git(w.clone, 'rev-parse', 'origin/main')
  const r = admitJson(w.clone, ['--target', sha])
  ok(r.status === 0 && r.j?.target.sha === sha, '--target accepts an explicit SHA')
  // detached HEAD (the CI checkout shape): branch identity honestly null without env...
  git(w.clone, 'checkout', '-q', '--detach')
  const r2 = admitJson(w.clone)
  ok(r2.status === 0 && r2.j?.branch === null, 'detached HEAD: no branch identity invented')
  // ...and derived from the forge's own env when present (GITHUB_HEAD_REF)
  const r3 = admitJson(w.clone, [], { GITHUB_HEAD_REF: 'lane/7' })
  ok(r3.status === 0 && r3.j?.branch === 'lane/7' && (r3.j?.results || []).some(x => x.id === 'MERGE-02'), 'GITHUB_HEAD_REF restores lane identity in CI (branch_scope rules evaluate)')
}

// ---------- provenance (M6c): the printed half of the ruled surface ----------
{
  const w = mkworld('provenance')
  const r = admitJson(w.clone)
  const p = r.j?.provenance
  ok(!!p && /^[0-9a-f]{12}$/.test(p.digest), 'provenance: JSON carries a 12-hex inputs_digest')
  ok(p && p.checks === 'not-consulted' && /^[0-9a-f]{40}$/.test(p.descriptor_oid || ''), 'provenance: no-forge world digests checks as not-consulted; descriptor oid is the blob OID')
  // the {check_runs} unwrap path end-to-end: a replay fixture at HEAD's sha
  // flips checks from 'not-consulted' to a counted consult with a new digest
  const headSha = git(w.clone, 'rev-parse', 'HEAD')
  const replay = path.join(w.dir, 'replay'); fs.mkdirSync(replay)
  fs.writeFileSync(path.join(replay, `check-runs-${headSha}.json`), JSON.stringify({ check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success', head_sha: headSha }, { name: 'admit', status: 'completed', conclusion: 'success', head_sha: headSha }] }))
  const rr = admitJson(w.clone, [], { BASELINE_FORGE_REPLAY: replay })
  ok(rr.j?.provenance?.checks === 2 && rr.j.provenance.digest !== p.digest, 'a consulted forge digests differently: checks counted, hash moved')
  // refusal-inert: the same world REFUSED (stale) must still carry provenance untouched
  advanceMainAtOrigin(w)
  const r2 = admitJson(w.clone)
  ok(r2.j?.verdict === 'REFUSED' && /^[0-9a-f]{12}$/.test(r2.j?.provenance?.digest || ''), 'provenance rides a REFUSED verdict too (refusal-inert, both directions)')
  const human = cli(w.clone, ['admit'])
  ok(/provenance: inputs_digest [0-9a-f]{12} · head [0-9a-f]{7} → target [0-9a-f]{7}/.test(human.stdout), 'the human line prints in the ruled shape')
}

for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
console.log(fails ? `\n${fails} failing` : '\nall green')
process.exit(fails ? 1 : 0)
