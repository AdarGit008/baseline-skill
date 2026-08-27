#!/usr/bin/env node
// baseline admit — the M6a command contract, exercised against LOCAL bare origins
// (no network, no forge; forge-dependent rules degrade to labeled n/a rows exactly as
// designed). Covers: the C35 staleness refusal in both directions, FS1 target-ref
// descriptor reads (a branch cannot weaken the posture that judges it), DESC-03's
// same-range judgment contract (subject = the ONE spelling), the JDG-only admission
// path, break-glass-from-main relief for ancestry-unprovable (shallow) runs, and the
// context gate (admit-only rules are invisible to check).
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../src/rules.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')
const RULES_ALL = loadRules().rules

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
// v3 ids are PREFIX-NN-slug (PLAN §2). A test names a rule by its base prefix so a slug can
// be revised in review without touching the test; both the two- and three-part forms match.
const isId = (id, p) => id === p || String(id).startsWith(p + '-')
const tmps = []

const GITENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Admit Tester', GIT_AUTHOR_EMAIL: 'admit@test.invalid', GIT_COMMITTER_NAME: 'Admit Tester', GIT_COMMITTER_EMAIL: 'admit@test.invalid' }
// The ambient env must not steer the tool under test (the golden harness's lesson,
// test/golden/run.mjs): a dev's exported BASELINE_LOG_NOW would time-travel the
// review_by comparisons, and CI's pull_request events set GITHUB_HEAD_REF for every
// step — which admit deliberately reads on detached HEAD, so the detached-HEAD assert
// below would read the LEAKED branch. Strip them all; tests re-inject explicitly.
// GITHUB_WORKSPACE joined the list at #55: resolveLane refuses an event whose workspace
// is a different repo, so a leaked one would silence a re-injected GITHUB_HEAD_REF.
const CLEAN_ENV = { ...process.env }
for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD', 'BASELINE_AGENT', 'BASELINE_GOV_ADMIN', 'GITHUB_HEAD_REF', 'GITHUB_REF_NAME', 'GITHUB_REF_TYPE', 'GITHUB_EVENT_NAME', 'GITHUB_WORKSPACE']) delete CLEAN_ENV[k]
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...CLEAN_ENV, ...GITENV } }).trim()
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV, ...env } })
const admitJson = (cwd, args = [], env = {}) => {
  const r = cli(cwd, ['admit', '--json', ...args], env)
  let j = null; try { j = JSON.parse(r.stdout) } catch {}
  return { ...r, j }
}

const BASE_DESC = {
  schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype',
  workflow: 'multi-lane', anchoring: 'strict',
  ground_truth_boundary: { default_branch: 'main' },
  lanes: { namespace: 'lane/*', lease_ttl: '7d' },
  join_keys: ['Baseline-Agent', 'Baseline-Issue'],
}
const JDG = (id, over = {}) => JSON.stringify({
  record: 'judgment/1', id, kind: 'deviation', date: '2026-07-15', by: 'adar',
  subject: 'baseline.repo.json', reason: 'test judgment', review_by: '2099-12-31', ...over,
}, null, 2) + '\n'

// seed a bare origin + a working clone with main carrying the descriptor. Under v3 D13 a
// pack activates only by explicit config (no auto-arm from the tree, the descriptor, or a
// default), so the fixtures list the descriptor pack the way a governed repo would — the
// config rides the working tree (resolveConfig reads baseline.config.json from the checkout;
// only the DESCRIPTOR is read at the target ref, FS1), and every lane here forks from main.
const CONFIG = { profiles: ['descriptor'] }
function mkworld(name, desc = BASE_DESC) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `admit-${name}-`)); tmps.push(dir)
  const bare = path.join(dir, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: { ...process.env, ...GITENV } })
  const seed = path.join(dir, 'seed'); fs.mkdirSync(seed)
  git(seed, 'init', '-q', '-b', 'main')
  if (desc) fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  fs.writeFileSync(path.join(seed, 'baseline.config.json'), JSON.stringify(CONFIG, null, 2) + '\n')
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

// ---------- schema evolution at the target ref (M7b: the owner drop) ----------
// A target-branch descriptor written under an earlier schema may carry a field
// the current engine dropped (`owner`). The ref-read ignores unknown fields —
// otherwise the very PR that sheds the field could never be admitted (the M6
// relief-circularity class, re-created by a schema contraction).
{
  const legacy = { ...BASE_DESC, owner: 'legacy-team' }
  const w = mkworld('ownertarget', legacy)
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w.clone, 'work.txt', 'w\n', 'lane work')
  let r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.verdict === 'ADMITTED', `owner-bearing TARGET descriptor still admits — ref-reads ignore unknown fields (got ${r.status} ${r.j?.verdict})`)
  // the shedding PR itself: descriptor drops owner + same-PR judgment = the ceremony
  const w2 = mkworld('ownershed', legacy)
  git(w2.clone, 'checkout', '-q', '-b', 'lane/8')
  commit(w2.clone, 'baseline.repo.json', JSON.stringify(BASE_DESC, null, 2) + '\n', 'drop retired owner field')
  commit(w2.clone, 'records/judgments/JDG-0101.json', JDG('JDG-0101', { subject: 'baseline.repo.json', kind: 'deviation', reason: 'shed the retired owner field (M7b schema)' }), 'jdg')
  r = admitJson(w2.clone)
  ok(r.status === 0 && r.j?.verdict === 'ADMITTED', `the owner-shedding PR admits with its same-PR judgment (got ${r.status} ${r.j?.verdict})`)
  // DESC-03 (and the whole descriptor pack) is deleted by the v4 rule-set cut, so the
  // ceremony is no longer a RULE: the judgment record still rides the PR, and admit still
  // admits — it simply has no descriptor-change rule to satisfy.
  const d3 = (r.j?.results || []).find(x => isId(x.id, 'DESC-03'))
  ok(!d3, `DESC-03 is deleted — no descriptor-change row is produced (${d3?.tag ?? 'absent'})`)
}

// ---------- staleness: the C35 command contract ----------
{
  const w = mkworld('stale')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w.clone, 'work.txt', 'w\n', 'lane work')
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

// ---------- FS1: the target's posture judges — DESC-03's half REMOVED by the v4 cut ----------
// DESC-01/02/03 and the `descriptor`/`descriptor-valid`/`descriptor-change` kinds are all
// deleted. The descriptor is still READ (it supplies project_type and the default branch),
// but no rule judges a change to it, so an on-branch weakening no longer refuses. What is
// pinned here is that loss, explicitly, and that admit's other legs are unaffected.
{
  const w = mkworld('desc')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  const weak = { ...BASE_DESC, anchoring: 'off', workflow: 'single-lane' }
  commit(w.clone, 'baseline.repo.json', JSON.stringify(weak, null, 2) + '\n', 'weaken posture on-branch')
  let r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.verdict === 'ADMITTED', `an unjudged descriptor weakening now ADMITS — the rule that refused it is deleted (got ${r.status} ${r.j?.verdict})`)
  ok(!(r.j?.results || []).some(x => isId(x.id, 'DESC-03')), 'and no DESC-03 row is produced')

  // an INVALID head descriptor is likewise no longer a refusal — it is simply an invalid
  // descriptor, and the run falls back to auto-detection
  const w3 = mkworld('descinv')
  git(w3.clone, 'checkout', '-q', '-b', 'lane/7')
  commit(w3.clone, 'baseline.repo.json', '{ not json', 'break the descriptor on-branch')
  r = admitJson(w3.clone)
  ok(r.status === 0 && !(r.j?.results || []).some(x => isId(x.id, 'DESC-0')), `an invalidated descriptor produces no DESC row at all (got ${r.status})`)
}

// ---------- the JDG-only admission path (the reachable relief valve) ----------
{
  const w = mkworld('jdgonly')
  git(w.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: 'admit outage relief' }), 'relief record only')
  const r = admitJson(w.clone)
  ok(r.status === 0 && r.j?.jdgOnly === true && r.j?.jdgRelief === 'JDG-0001', `a pure-judgment range admits via the JDG-only path, naming its relief record (got ${r.status}, ${r.j?.jdgRelief})`)

  // staleness is data-plane truth — it refuses even on the privileged path (M7a pin)
  advanceMainAtOrigin(w)
  const rs = admitJson(w.clone)
  ok(rs.status === 1 && rs.j?.jdgOnly === true && (rs.j?.refusals || []).some(x => /stale:/.test(x)), 'a STALE jdg-only range still refuses on staleness (the carve-out empties only leg (b))')
  git(w.clone, 'fetch', '-q', 'origin'); git(w.clone, 'merge', '-q', '--no-edit', 'origin/main')

  // one extra non-judgment file breaks the shape — the normal path judges it
  commit(w.clone, 'src.txt', 'code\n', 'code rides along')
  const r2 = admitJson(w.clone)
  ok(r2.j?.jdgOnly === false && r2.j?.jdgRelief === null, `a mixed range is NOT the JDG-only path — the normal contract judges it (got jdgOnly=${r2.j?.jdgOnly})`)

  // a judgment-only range WITHOUT a break-glass is just a normal (harmless) range
  const w2 = mkworld('jdgplain')
  git(w2.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w2.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { subject: 'unrelated sign-off scope', kind: 'sign-off' }), 'plain judgment')
  const r3 = admitJson(w2.clone)
  ok(r3.j?.jdgOnly === false && r3.j?.jdgRelief === null, `a judgment-only range without break-glass(gate:admit) is not the relief path — the normal contract judges it (got jdgOnly=${r3.j?.jdgOnly})`)
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

// ---------- panel hardening: the rename bypass, invalid riders, expired relief ----------
{
  // DESC-03 must survive `git mv baseline.repo.json away` (rename detection would
  // collapse the delete+add into one post-image name — the no-renames diff keeps it honest)
  const w = mkworld('rename')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7')
  git(w.clone, 'mv', 'baseline.repo.json', 'renamed-away.json')
  git(w.clone, 'commit', '-qm', 'rename the descriptor away')
  const r = admitJson(w.clone)
  // was: DESC-03 caught `git mv baseline.repo.json away` as a weakening. The rule is
  // deleted, so the rename is no longer a refusal — but the no-renames diff that made it
  // VISIBLE is still what admit reads, and the changed-set must still name both paths.
  const d3 = r.j?.results.find(x => isId(x.id, 'DESC-03'))
  ok(!d3, 'no DESC-03 row — the descriptor-change rule is deleted')
  ok(r.status === 0, `renaming the descriptor away now admits (got ${r.status})`)
}
{
  // the JDG-only path is strict: ONE invalid rider and the range falls to the normal contract
  const w = mkworld('jdgrider')
  git(w.clone, 'checkout', '-q', '-b', 'lane/9')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: 'relief' }), 'valid relief')
  commit(w.clone, 'records/judgments/JDG-0002.json', '{ not json\n', 'garbage rider')
  const r = admitJson(w.clone)
  ok(r.j?.jdgOnly === false && r.j?.jdgRelief === null, `an invalid rider disqualifies the privileged path — the normal contract judges it (got jdgOnly=${r.j?.jdgOnly})`)
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
  // FS1 under explicit --target: a NON-default target ref's descriptor governs, and the
  // declared-default switch must not fire
  const w = mkworld('exptarget')
  git(w.clone, 'checkout', '-q', '-b', 'release/next')
  commit(w.clone, 'baseline.repo.json', JSON.stringify({ ...BASE_DESC, anchoring: 'relaxed', lanes: { namespace: 'lane/*', lease_ttl: '7d', families: ['release/*'] } }, null, 2) + '\n', 'release posture')
  commit(w.clone, 'records/judgments/JDG-0001.json', JDG('JDG-0001'), 'its judgment')
  git(w.clone, 'push', '-q', 'origin', 'release/next')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work off release')
  const r = admitJson(w.clone, ['--target', 'origin/release/next'])
  ok(r.status === 0 && r.j?.target.ref === 'origin/release/next' && r.j?.target.source === 'local-ref (explicit --target)', `an explicit non-default target governs, honestly labeled (got ${r.j?.target.source})`)
}

// ---------- the context gate: admit-only rules are invisible to check ----------
{
  const w = mkworld('ctxgate')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  const c = cli(w.clone, ['check', '--json', '--no-exec'])
  let cj = null; try { cj = JSON.parse(c.stdout) } catch {}
  const ids = new Set((cj?.results || []).map(x => x.id))
  ok(cj && ![...ids].some(i => isId(i, 'DESC-03')), 'DESC-03 is EXCLUDED from check output (the rule is deleted)')
  ok([...ids].some(i => isId(i, 'SEC-01')) && [...ids].some(i => isId(i, 'GOV-03')), 'the surviving rules run in check')
  const a = admitJson(w.clone)
  const aids = new Set((a.j?.results || []).map(x => x.id))
  // the v4 cut left NO rule declaring the admit context: DESC-03 was the last one. admit's
  // rule leg is therefore empty, and its verdict rests on staleness and the judgment ledger
  // alone. That is a real narrowing, pinned here rather than discovered later.
  ok(aids.size === 0, `no rule declares the admit context any more — admit's rule leg is empty (${[...aids].join(', ') || 'empty'})`)
  ok(RULES_ALL.every(r => !(r.contexts || []).includes('admit')), 'and the rule set agrees: no contexts:["admit"] anywhere')
}

// ---------- --target explicit + detached-HEAD CI shape (GITHUB_HEAD_REF) ----------
{
  const w = mkworld('target')
  git(w.clone, 'checkout', '-q', '-b', 'lane/7'); commit(w.clone, 'w.txt', 'w\n', 'work')
  const sha = git(w.clone, 'rev-parse', 'origin/main')
  const r = admitJson(w.clone, ['--target', sha])
  ok(r.status === 0 && r.j?.target.sha === sha, '--target accepts an explicit SHA')
  // detached HEAD (the CI checkout shape): branch identity honestly null without env...
  git(w.clone, 'checkout', '-q', '--detach')
  const r2 = admitJson(w.clone)
  ok(r2.status === 0 && r2.j?.branch === null, 'detached HEAD: no branch identity invented')
  // ...and derived from the forge's own env when present (GITHUB_HEAD_REF)
  const r3 = admitJson(w.clone, [], { GITHUB_HEAD_REF: 'lane/7' })
  ok(r3.status === 0 && r3.j?.branch === 'lane/7', 'GITHUB_HEAD_REF restores lane identity in CI')
}

// ---------- provenance (M6c): the printed half of the ruled surface ----------
{
  const w = mkworld('provenance')
  const r = admitJson(w.clone)
  const p = r.j?.provenance
  ok(!!p && /^[0-9a-f]{12}$/.test(p.digest), 'provenance: JSON carries a 12-hex inputs_digest')
  ok(p && p.checks === 'not-consulted' && /^[0-9a-f]{40}$/.test(p.descriptor_oid || ''), 'provenance: the check-run plane digests as not-consulted; descriptor oid is the blob OID')
  // v4 rule-set cut: admit's one marginal forge read (checkRuns at HEAD) is REMOVED with
  // the seam, so the plane is permanently 'not-consulted' — a replay fixture at HEAD's sha
  // no longer changes the digest, because nothing reads it. The canonicalization that made
  // ABSENT a VALUE is what keeps this honest rather than a hole (src/digest.mjs).
  const headSha = git(w.clone, 'rev-parse', 'HEAD')
  const replay = path.join(w.dir, 'replay'); fs.mkdirSync(replay)
  fs.writeFileSync(path.join(replay, `check-runs-${headSha}.json`), JSON.stringify({ check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success', head_sha: headSha }, { name: 'admit', status: 'completed', conclusion: 'success', head_sha: headSha }] }))
  const rr = admitJson(w.clone, [], { BASELINE_FORGE_REPLAY: replay })
  ok(rr.j?.provenance?.checks === 'not-consulted' && rr.j.provenance.digest === p.digest,
    `a check-run replay fixture changes nothing — admit consults no forge (checks ${JSON.stringify(rr.j?.provenance?.checks)}, digest ${rr.j?.provenance?.digest === p.digest ? 'stable' : 'moved'})`)
  ok(rr.j?.verdict === r.j?.verdict, 'and the verdict is unchanged')
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
