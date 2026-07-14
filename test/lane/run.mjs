#!/usr/bin/env node
// M5 lane suite — `baseline lane claim` (M5a: the atomic branch-creation claim, FS2/S3)
// and `baseline lane reclaim` + `derive/lanes` (M5b: derived leases, C31/FS10-as-amended).
// Every test runs against a LOCAL bare origin (file transport) — the ref-transaction
// atomicity under test is git's own, identical over file and smart-HTTP transports,
// so no network and no forge are ever needed. Lease time-travel rides BASELINE_LOG_NOW
// (the one clock shared with the record tooling) — commit dates are real, "now" moves.
// Zero-dependency, Node >= 18.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deriveLanes, parseTtlMs, STALE_FRACTION, DEFAULT_LEASE_TTL } from '../../src/derive/lanes.mjs'
import { issueOf } from '../../src/util.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const tmps = []

// git identity rides the environment — one place, zero per-repo config spawns
const GITENV = { GIT_AUTHOR_NAME: 'Lane Tester', GIT_AUTHOR_EMAIL: 'lane@test.invalid', GIT_COMMITTER_NAME: 'Lane Tester', GIT_COMMITTER_EMAIL: 'lane@test.invalid' }
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...GITENV } }).trim()
const gitOk = (cwd, ...a) => { try { return git(cwd, ...a) } catch { return null } }
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GITENV, ...env } })

const BASE_DESC = {
  schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype',
  owner: 'tester', workflow: 'multi-lane', anchoring: 'strict',
  ground_truth_boundary: { forge: 'github', default_branch: 'main' },
  lanes: { namespace: 'lane/*', lease_ttl: '7d' },
  join_keys: ['Baseline-Agent', 'Baseline-Issue'],
}

// bare origin (HEAD -> main) + a seeded main carrying the descriptor; desc=null seeds no descriptor
function mkorigin(name, desc = BASE_DESC) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-lane-${name}-`)); tmps.push(dir)
  const bare = path.join(dir, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  const seed = path.join(dir, 'seed'); fs.mkdirSync(seed)
  execFileSync('git', ['init', '-q', '-b', 'main', seed])
  if (desc) fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  fs.writeFileSync(path.join(seed, 'README.md'), '# lane test fixture\n')
  git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'seed')
  git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'main')
  return { dir, bare }
}
const mkclone = (o, name, ...flags) => { const c = path.join(o.dir, name); execFileSync('git', ['clone', '-q', ...flags, o.bare, c]); return c }
// refusals that never reach origin need no origin: a plain repo + a descriptor file
function mklocal(name, desc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-lane-${name}-`)); tmps.push(dir)
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  if (desc) fs.writeFileSync(path.join(dir, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  return dir
}

// ---------- the claim wins: ref at origin, trailers stamped, winner checked out ----------
{
  const o = mkorigin('win')
  const A = mkclone(o, 'A')
  const r = cli(A, ['lane', 'claim', '7', '--agent', 'Alice Agent', '--json'])
  ok(r.status === 0, `claim exits 0 (got ${r.status}${r.stderr ? ` — ${r.stderr.split('\n')[0]}` : ''})`)
  const j = JSON.parse(r.stdout || '{}')
  ok(j.claimed === true && j.ref === 'lane/7' && j.issue === 7 && j.pushed === true, `json: claimed=true ref=lane/7 issue=7 pushed=true (got ${r.stdout.slice(0, 100)})`)
  ok(j.agent === 'alice-agent', `agent rides the ONE slug chain (got '${j.agent}')`)
  ok(gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/7') !== null, 'origin has refs/heads/lane/7')
  const body = git(o.bare, 'log', '-1', '--format=%B', 'lane/7')
  ok(body.includes('Baseline-Issue: #7') && body.includes('Baseline-Agent: alice-agent'), 'claim commit carries both descriptor-declared trailers (C38)')
  ok(git(o.bare, 'rev-parse', 'lane/7^') === git(o.bare, 'rev-parse', 'main'), 'claim commit sits on the default-branch tip (empty commit, no tree change)')
  ok(git(A, 'rev-parse', '--abbrev-ref', 'HEAD') === 'lane/7', 'winner is checked out on the lane')
  ok(j.checkout === true, 'json reports the checkout')

  // re-running the SAME claim is idempotent, never a fake loss (crash-recovery path)
  const r2 = cli(A, ['lane', 'claim', '7', '--agent', 'Alice Agent', '--json'])
  const j2 = JSON.parse(r2.stdout || '{}')
  ok(r2.status === 0 && j2.claimed === true && j2.pushed === false, `own re-claim exits 0 with pushed=false (got ${r2.status}, ${r2.stdout.slice(0, 80)})`)
  ok((j2.notes || []).some(n => /own trailer — idempotent/.test(n)), 'the idempotent settle is named in notes')
  ok(git(o.bare, 'rev-parse', 'lane/7') === j.sha, 'origin tip unchanged by the re-claim')
}

// ---------- a second agent loses cleanly: exit 3, zero local residue ----------
{
  const o = mkorigin('lose')
  const A = mkclone(o, 'A'), B = mkclone(o, 'B')
  ok(cli(A, ['lane', 'claim', '7', '--agent', 'alice']).status === 0, 'first claim wins')
  const r = cli(B, ['lane', 'claim', '7', '--agent', 'bob', '--json'])
  ok(r.status === 3, `second agent exits 3 (got ${r.status})`)
  const j = JSON.parse(r.stdout || '{}')
  ok(j.claimed === false && typeof j.existing === 'string' && j.existing.length >= 8, 'json: claimed=false + existing tip named')
  ok(gitOk(B, 'show-ref', '--verify', 'refs/heads/lane/7') === null, 'loser has NO local lane branch')
  ok(git(B, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', 'loser HEAD untouched')
  ok(git(B, 'status', '--porcelain') === '', 'loser worktree clean — no partial state')
}

// ---------- checkbox 1, structurally: two SIMULTANEOUS agents, exactly one winner ----------
{
  const o = mkorigin('race')
  const A = mkclone(o, 'RA'), B = mkclone(o, 'RB')
  const go = (cwd, who) => new Promise(res => {
    const p = spawn(process.execPath, [BASELINE, 'lane', 'claim', '9', '--agent', who, '--json'], { cwd, env: { ...process.env, ...GITENV } })
    let out = ''; p.stdout.on('data', d => { out += d }); p.on('close', code => res({ code, out }))
  })
  const [ra, rb] = await Promise.all([go(A, 'racer-a'), go(B, 'racer-b')])
  const codes = [ra.code, rb.code].sort()
  ok(codes[0] === 0 && codes[1] === 3, `exactly one winner, one clean loser (got exits ${ra.code}/${rb.code})`)
  ok(gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/9') !== null, 'origin has exactly the one claimed ref')
  const loser = ra.code === 3 ? A : B
  ok(gitOk(loser, 'show-ref', '--verify', 'refs/heads/lane/9') === null, 'the losing clone holds no lane branch')
}

// ---------- refusals: descriptor is the only source of a lane name (never guess) ----------
{
  const r = cli(mklocal('nodesc', null), ['lane', 'claim', '3'])
  ok(r.status === 2 && /no baseline\.repo\.json/.test(r.stderr), 'no descriptor → refuse (exit 2), names the fix')

  const r2 = cli(mklocal('badns', { ...BASE_DESC, lanes: { namespace: 'lane/x-*-*', lease_ttl: '7d' } }), ['lane', 'claim', '3'])
  ok(r2.status === 2 && /INVALID|invalid/.test(r2.stderr), `two-star namespace → schema-invalid descriptor refused (pattern is schema-enforced now)`)

  const r3 = cli(mklocal('nolanes', (({ lanes, ...rest }) => rest)(BASE_DESC)), ['lane', 'claim', '3'])
  ok(r3.status === 2 && /lanes\.namespace/.test(r3.stderr), 'no lanes.namespace → refuse, names the field')

  const r4 = cli(mklocal('badjk', { ...BASE_DESC, join_keys: ['Baseline-Agent'] }), ['lane', 'claim', '3'])
  ok(r4.status === 2 && /join_keys omits Baseline-Issue/.test(r4.stderr), 'join_keys missing a claim trailer → refuse with the exact declaration to add (C38)')

  const r5 = cli(mklocal('nojk', (({ join_keys, ...rest }) => rest)(BASE_DESC)), ['lane', 'claim', '3'])
  ok(r5.status === 2 && /declares no join_keys/.test(r5.stderr), 'ABSENT join_keys refuses like an incomplete one — undeclared trailers are never stamped')
}

// ---------- forge consultation: posture-gated, replay-deterministic ----------
{
  // multi-lane: a replayed CLOSED issue refuses the claim (divergence at birth)
  const o = mkorigin('closed')
  const A = mkclone(o, 'A')
  const replay = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-lane-replay-')); tmps.push(replay)
  fs.writeFileSync(path.join(replay, 'issue-12.json'), JSON.stringify({ number: 12, state: 'CLOSED', title: 'done thing' }) + '\n')
  const r = cli(A, ['lane', 'claim', '12'], { BASELINE_FORGE_REPLAY: replay })
  ok(r.status === 2 && /divergence at birth/.test(r.stderr) && /reopen/i.test(r.stderr), `closed issue → refuse naming the reopen path (got ${r.status})`)
  ok(gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/12') === null, 'refused claim created nothing at origin')

  // a stateless issue answer is UNVERIFIED, never announced open (no silent gate bypass)
  fs.writeFileSync(path.join(replay, 'issue-14.json'), JSON.stringify({ number: 14, title: 'stateless answer' }) + '\n')
  const rs = cli(A, ['lane', 'claim', '14', '--json'], { BASELINE_FORGE_REPLAY: replay })
  const js = JSON.parse(rs.stdout || '{}')
  ok(rs.status === 0 && (js.notes || []).some(n => /unverified \(forge returned no state\)/.test(n)), `missing state → labeled unverified, the push decides (got ${rs.status})`)

  // multi-lane-local: the SAME closed fixture is irrelevant — the forge is never consulted
  const o2 = mkorigin('local', { ...BASE_DESC, workflow: 'multi-lane-local' })
  const B = mkclone(o2, 'B')
  fs.writeFileSync(path.join(replay, 'issue-13.json'), JSON.stringify({ number: 13, state: 'CLOSED', title: 'closed but unconsulted' }) + '\n')
  const r2 = cli(B, ['lane', 'claim', '13'], { BASELINE_FORGE_REPLAY: replay })
  ok(r2.status === 0 && r2.stdout.includes('forge not consulted (multi-lane-local posture)'), `multi-lane-local claims without asking the forge — the posture is named, not faked as unreachable (got ${r2.status})`)
  ok(gitOk(o2.bare, 'show-ref', '--verify', 'refs/heads/lane/13') !== null, 'multi-lane-local claim landed at origin (git plane alone suffices — CF5)')
}

// ---------- argument forms + surface ----------
{
  const o = mkorigin('args')
  const A = mkclone(o, 'A')
  ok(cli(A, ['lane', 'claim', '#15']).status === 0 && gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/15') !== null, `'#15' form claims lane/15`)
  ok(cli(A, ['lane', 'claim', 'abc']).status === 2, 'non-numeric issue → usage (exit 2)')
  ok(cli(A, ['lane', 'claim']).status === 2, 'missing issue → usage (exit 2)')
  const bare = cli(A, ['lane'])
  ok(bare.status === 2 && /which action|claim/.test(bare.stderr), 'bare `lane` → usage on STDERR (exit 2), like every other refusal')
  ok(cli(A, ['lane', '--help']).status === 0, 'lane --help exits 0')
  const r = cli(A, ['lane', 'reclaim', 'lane/15'])
  ok(r.status === 2 && /derives LIVE/.test(r.stderr), 'reclaim of the just-claimed lane refuses: derived LIVE, not ABANDONED')
  ok(cli(A, ['lane', 'frobnicate']).status === 2, 'unknown action → usage (exit 2)')
}

// ---------- a stale LOCAL branch with the lane's name is never adopted as the claim ----------
{
  const o = mkorigin('stale')
  const A = mkclone(o, 'A')
  git(A, 'branch', 'lane/6') // stale local branch, not a claim
  const r = cli(A, ['lane', 'claim', '6', '--json'])
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.claimed === true, 'claim still wins at origin')
  ok(j.checkout === false && (j.notes || []).some(n => /already existed here/.test(n)), 'pre-existing local branch is left untouched and named — never checked out as if it were the claim')
  ok(git(A, 'rev-parse', 'lane/6') === git(A, 'rev-parse', 'main'), 'the stale local branch tip is unchanged')
  const rh = cli(A, ['lane', 'claim', '6']) // human output on the same state (idempotent settle)
  ok(!rh.stdout.includes(`git checkout lane/6`), 'no printed recipe points at the stale local tip')
}

// ---------- single-branch clone: tracking ref + upstream still land (refspec-proof) ----------
{
  const o = mkorigin('sb')
  const A = mkclone(o, 'SB', '--single-branch', '-b', 'main')
  const r = cli(A, ['lane', 'claim', '11', '--agent', 'solo', '--json'])
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.checkout === true, `single-branch clone claims fine (got ${r.status})`)
  ok(gitOk(A, 'rev-parse', '--verify', 'refs/remotes/origin/lane/11') === j.sha, 'remote-tracking ref written directly (a plain fetch would never create it here)')
  ok(gitOk(A, 'rev-parse', '--abbrev-ref', 'lane/11@{upstream}') === 'origin/lane/11', 'upstream configured — the next push/pull just works')
}

// ---------- base resolution: undeclared default branch is ASKED of origin, not guessed ----------
{
  const o = mkorigin('nodef', (({ ground_truth_boundary, ...rest }) => rest)(BASE_DESC))
  const A = mkclone(o, 'A')
  const r = cli(A, ['lane', 'claim', '4', '--json'])
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.base === 'main', `no declared default branch → origin HEAD answers (got base '${j.base}')`)
  ok((j.notes || []).some(n => /origin HEAD says 'main'/.test(n)), 'the fallback is labeled, with the descriptor fix named')
}

// ---------- environment refusals stay honest ----------
{
  const solo = mklocal('noorigin', BASE_DESC)
  const r = cli(solo, ['lane', 'claim', '3'])
  ok(r.status === 2 && /no origin remote/.test(r.stderr), 'no origin → refuse: origin push IS the rendezvous')

  const dead = mklocal('deadorigin', BASE_DESC)
  git(dead, 'remote', 'add', 'origin', path.join(dead, 'nowhere.git'))
  const rd = cli(dead, ['lane', 'claim', '3'])
  ok(rd.status === 2 && /cannot reach origin/.test(rd.stderr), 'unreachable origin → refuse before building anything')

  // a rejecting origin (policy hook) is a transport failure, not a race: exit 2, says why
  const o2 = mkorigin('reject')
  const hook = path.join(o2.bare, 'hooks', 'pre-receive')
  fs.writeFileSync(hook, '#!/bin/sh\necho "lane creation forbidden by policy" >&2\nexit 1\n'); fs.chmodSync(hook, 0o755)
  const A = mkclone(o2, 'A')
  const r2 = cli(A, ['lane', 'claim', '8'])
  ok(r2.status === 2 && /push failed/.test(r2.stderr), `rejected push (ref still absent) → exit 2 with git's reason, never a fake lost-race (got ${r2.status})`)
  ok(gitOk(A, 'show-ref', '--verify', 'refs/heads/lane/8') === null && git(A, 'status', '--porcelain') === '', 'failed claim leaves no local residue either')
}

// ================= M5b — derive/lanes: the pure lease derivation (C31) =================
{
  const T0 = '2026-07-14T12:00:00Z'
  const at = (iso, over = {}) => deriveLanes({ lanes: [{ ref: 'lane/7', tip: 'aaaa', committedDate: iso, source: 'forge', ...over }], ttlMs: parseTtlMs('7d'), now: T0, namespace: 'lane/*' })[0]
  ok(parseTtlMs('7d') === 7 * 86400000 && parseTtlMs('36h') === 36 * 3600000 && parseTtlMs('x') === null && parseTtlMs() === null, 'parseTtlMs: 7d · 36h · junk→null · absent→null')
  ok(DEFAULT_LEASE_TTL === '7d' && STALE_FRACTION === 0.5, 'the D2 default and the provisional STALE constant are pinned names')
  ok(issueOf('lane/*', 'lane/7') === 7 && issueOf('lane/*', 'lane/abc') === null && issueOf('agents/l-*', 'agents/l-42') === 42 && issueOf('lane/*', 'other/7') === null, 'issueOf inverts the namespace substitution — numbers only, namespace-anchored')

  ok(at(T0).state === 'LIVE' && at(T0).age_ms === 0, 'fresh claim derives LIVE at age 0 (the pinned birth state)')
  ok(at('2026-07-10T00:00:00Z').state === 'STALE', 'past ttl/2 → STALE')
  ok(at('2026-07-11T00:00:00.001Z').state === 'LIVE' && at('2026-07-11T00:00:00Z').state === 'STALE', 'STALE begins exactly at ttl/2 (boundary is ≥)')
  ok(at('2026-07-07T12:00:00Z').state === 'ABANDONED' && at('2026-07-07T12:00:00.001Z').state === 'STALE', 'ABANDONED begins exactly at ttl (boundary is ≥)')

  const prWins = at('2026-07-01T00:00:00Z', { prUpdatedAt: '2026-07-14T00:00:00Z' })
  ok(prWins.state === 'LIVE' && prWins.basis === 'pr-update', 'freshness = max(committedDate, PR updatedAt) — PR activity revives an old tip (erring toward LIVE)')
  const commitWins = at('2026-07-14T00:00:00Z', { prUpdatedAt: '2026-07-01T00:00:00Z' })
  ok(commitWins.basis === 'tip-commit' && commitWins.state === 'LIVE', 'the later signal wins in the other direction too')

  const skew = at('2026-07-14T13:00:00Z')
  ok(skew.age_ms === 0 && skew.state === 'LIVE' && skew.labels.some(l => /clock skew clamped/.test(l)), 'freshness ahead of now clamps to age 0, labeled — never negative, never reclaim-biased')
  const und = at(null)
  ok(und.state === null && und.labels.some(l => /unresolvable/.test(l)), 'no resolvable freshness → state underived + labeled (never guessed)')
  ok(at(T0, { source: 'git' }).labels.some(l => /git plane, committer clock \(low confidence\)/.test(l)), 'git-plane freshness carries the low-confidence label')

  const sorted = deriveLanes({
    lanes: [
      { ref: 'lane/1', committedDate: T0, source: 'forge' },                      // LIVE
      { ref: 'lane/2', committedDate: '2026-07-01T00:00:00Z', source: 'forge' },  // ABANDONED
      { ref: 'lane/3', committedDate: '2026-07-10T00:00:00Z', source: 'forge' },  // STALE
    ], ttlMs: parseTtlMs('7d'), now: T0, namespace: 'lane/*',
  }).map(l => l.state)
  ok(JSON.stringify(sorted) === JSON.stringify(['ABANDONED', 'STALE', 'LIVE']), `ABANDONED/STALE sort first (got ${sorted.join(',')})`)

  const anch = deriveLanes({ lanes: [{ ref: 'lane/5', committedDate: T0, source: 'forge' }], ttlMs: parseTtlMs('7d'), now: T0, namespace: 'lane/*', issueStates: { 5: { state: 'closed' } } })[0]
  ok(anch.anchor?.state === 'closed' && anch.labels.some(l => /anchor #5 is closed/.test(l)), 'anchor resolution: a closed issue under a live lane is surfaced (DIV-01 preview)')
}

// ================= M5b — reclaim: takeover of a DERIVED-ABANDONED lane only =================
const FUTURE = { BASELINE_LOG_NOW: '2026-07-22T09:00:00Z' } // +8d past any real commit date in this run → ABANDONED at ttl 7d
{
  const o = mkorigin('reclaim')
  const A = mkclone(o, 'A'), B = mkclone(o, 'B')
  ok(cli(A, ['lane', 'claim', '7', '--agent', 'alice']).status === 0, 'alice claims lane/7')
  const oldTip = git(o.bare, 'rev-parse', 'lane/7')

  // fresh lane refuses without a judgment — and origin is untouched by the refusal
  const rl = cli(B, ['lane', 'reclaim', '7', '--agent', 'bob'])
  ok(rl.status === 2 && /derives LIVE/.test(rl.stderr) && /deviation judgment/.test(rl.stderr), `LIVE lane refuses reclaim, names the escape hatch (got ${rl.status})`)
  ok(git(o.bare, 'rev-parse', 'lane/7') === oldTip, 'refused reclaim moved nothing at origin')

  // time-travel 8 days: derived ABANDONED → takeover
  const r = cli(B, ['lane', 'reclaim', '7', '--agent', 'bob', '--json'], FUTURE)
  ok(r.status === 0, `abandoned lane reclaims (got ${r.status}${r.stderr ? ` — ${r.stderr.split('\n')[0]}` : ''})`)
  const j = JSON.parse(r.stdout || '{}')
  ok(j.reclaimed === true && j.ref === 'lane/7' && j.from === 'alice' && j.agent === 'bob' && j.state === 'ABANDONED', `json: reclaimed from alice by bob at ABANDONED (got ${r.stdout.slice(0, 120)})`)
  const newTip = git(o.bare, 'rev-parse', 'lane/7')
  ok(newTip === j.sha && newTip !== oldTip, 'origin tip is the takeover commit')
  ok(git(o.bare, 'rev-parse', 'lane/7^') === oldTip, 'the takeover is a CHILD of the old tip — the lane continues, nothing rewritten')
  ok(git(o.bare, 'rev-parse', 'lane/7^{tree}') === git(o.bare, 'rev-parse', `${oldTip}^{tree}`), 'takeover commit is empty (same tree) — ownership changed, content did not')
  const body = git(o.bare, 'log', '-1', '--format=%B', 'lane/7')
  ok(body.includes('Baseline-Issue: #7') && body.includes('Baseline-Agent: bob'), 'takeover carries the new agent trailer (the newest trailer IS the owner)')
  ok(typeof j.record === 'string' && j.record.startsWith('records/sessions/lane/7/'), `dated takeover record written through baseline log (got ${j.record})`)
  const rec = fs.readFileSync(path.join(B, j.record), 'utf8')
  ok(/Reclaimed lane\/7 .*from alice/.test(rec) && /ABANDONED/.test(rec), 'the record names the takeover: from whom, derived state')
  ok(/^agent: bob$/m.test(rec) && /^lane: lane\/7$/m.test(rec), 'record frontmatter joins on the SAME lane/agent keys')
  ok(String(j.comment).startsWith('skipped'), `issue comment honestly skipped off-forge (got '${j.comment}')`)
  ok(git(B, 'rev-parse', '--abbrev-ref', 'HEAD') === 'lane/7', 'reclaimer lands on the lane')

  // reclaiming a lane that was never claimed
  const rn = cli(B, ['lane', 'reclaim', '99', '--agent', 'bob'], FUTURE)
  ok(rn.status === 2 && /no claim exists at origin/.test(rn.stderr), 'reclaim of an unclaimed lane → exit 2, points at claim')

  // usage refusals
  ok(cli(B, ['lane', 'reclaim'], FUTURE).status === 2, 'reclaim without a target → usage')
  ok(cli(B, ['lane', 'reclaim', 'not-a-lane'], FUTURE).status === 2 && /neither an issue number/.test(cli(B, ['lane', 'reclaim', 'not-a-lane'], FUTURE).stderr), 'a ref outside the namespace refuses — reclaim never invents an issue anchor')
  ok(cli(B, ['lane', 'reclaim', '7', '--jdg'], FUTURE).status === 2, '--jdg without a value → usage')
}

// ---------- the --jdg escape hatch: a live takeover exists only through the ledger ----------
{
  const o = mkorigin('jdg')
  const A = mkclone(o, 'A'), B = mkclone(o, 'B')
  ok(cli(A, ['lane', 'claim', '7', '--agent', 'alice']).status === 0, 'alice claims lane/7 (fresh = LIVE)')
  const jdgDir = path.join(B, 'records', 'judgments'); fs.mkdirSync(jdgDir, { recursive: true })
  const writeJdg = (id, over = {}) => fs.writeFileSync(path.join(jdgDir, `${id}.json`), JSON.stringify({
    record: 'judgment/1', id, kind: 'deviation', date: '2026-07-14', by: 'adar',
    subject: 'lane/7 live takeover (alice is on leave)', reason: 'sanctioned live takeover for the test', review_by: '2099-12-31', ...over,
  }, null, 2) + '\n')

  writeJdg('JDG-0001')
  const r = cli(B, ['lane', 'reclaim', '7', '--agent', 'bob', '--jdg', 'JDG-0001', '--json'])
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.reclaimed === true && j.state === 'LIVE', `unexpired deviation naming the lane authorizes a LIVE takeover (got ${r.status})`)
  ok((j.notes || []).some(n => /live takeover honored by JDG-0001/.test(n)), 'the honoring is named in notes (auditable)')
  ok(/Baseline-Agent: bob/.test(git(o.bare, 'log', '-1', '--format=%B', 'lane/7')), 'the sanctioned takeover landed')

  // every refusal direction of the hatch
  const o2 = mkorigin('jdg2')
  const C = mkclone(o2, 'C'), D = mkclone(o2, 'D')
  ok(cli(C, ['lane', 'claim', '7', '--agent', 'alice']).status === 0, 'fresh lane again')
  const jd2 = path.join(D, 'records', 'judgments'); fs.mkdirSync(jd2, { recursive: true })
  const wj = (id, over) => fs.writeFileSync(path.join(jd2, `${id}.json`), JSON.stringify({
    record: 'judgment/1', id, kind: 'deviation', date: '2026-07-14', by: 'adar',
    subject: 'lane/7 takeover', reason: 'r', review_by: '2099-12-31', ...over,
  }, null, 2) + '\n')
  wj('JDG-0001', { review_by: '2020-01-01' })
  ok(cli(D, ['lane', 'reclaim', '7', '--jdg', 'JDG-0001']).status === 2 && /lapsed/.test(cli(D, ['lane', 'reclaim', '7', '--jdg', 'JDG-0001']).stderr), 'an expired judgment authorizes nothing')
  wj('JDG-0002', { subject: 'lane/70 takeover' })
  ok(/names 'lane\/70 takeover', not this lane/.test(cli(D, ['lane', 'reclaim', '7', '--jdg', 'JDG-0002']).stderr), `a judgment naming lane/70 does not cover lane/7 (whole-token match, no prefix bleed)`)
  wj('JDG-0003', { kind: 'sign-off' })
  ok(/honors only kind: deviation/.test(cli(D, ['lane', 'reclaim', '7', '--jdg', 'JDG-0003']).stderr), 'only a deviation opens the hatch')
  ok(/does not resolve/.test(cli(D, ['lane', 'reclaim', '7', '--jdg', 'JDG-9999']).stderr), 'an unknown id refuses')
}

// ---------- two rival reclaims: exactly one takeover, the loser told the truth ----------
{
  const o = mkorigin('rerace')
  const A = mkclone(o, 'RA'), B = mkclone(o, 'RB')
  ok(cli(A, ['lane', 'claim', '9', '--agent', 'alice']).status === 0, 'alice claims lane/9')
  const go = (cwd, who) => new Promise(res => {
    const p = spawn(process.execPath, [BASELINE, 'lane', 'reclaim', '9', '--agent', who, '--json'], { cwd, env: { ...process.env, ...GITENV, ...FUTURE } })
    let out = ''; p.stdout.on('data', d => { out += d }); p.on('close', code => res({ code, out }))
  })
  const [ra, rb] = await Promise.all([go(A, 'racer-a'), go(B, 'racer-b')])
  const codes = [ra.code, rb.code].sort()
  ok(codes[0] === 0 && codes[1] === 3, `exactly one rival takes over, one loses honestly (got exits ${ra.code}/${rb.code})`)
  const winner = ra.code === 0 ? 'racer-a' : 'racer-b'
  ok(git(o.bare, 'log', '-1', '--format=%B', 'lane/9').includes(`Baseline-Agent: ${winner}`), 'origin carries exactly the winning rival\'s trailer')
  const loser = ra.code === 3 ? JSON.parse(ra.out) : JSON.parse(rb.out)
  ok(loser.reclaimed === false && typeof loser.existing === 'string', 'the loser names the tip that beat it')
}

// ---------- multi-lane-local: reclaim from the git plane alone, the posture named ----------
{
  const o = mkorigin('mll', { ...BASE_DESC, workflow: 'multi-lane-local' })
  const A = mkclone(o, 'A'), B = mkclone(o, 'B')
  ok(cli(A, ['lane', 'claim', '4', '--agent', 'alice']).status === 0, 'multi-lane-local claim')
  const r = cli(B, ['lane', 'reclaim', '4', '--agent', 'bob', '--json'], FUTURE)
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.reclaimed === true, `multi-lane-local reclaim works forge-free (got ${r.status})`)
  ok((j.notes || []).some(n => /forge not consulted \(multi-lane-local posture\)/.test(n)), 'the posture is named, never faked as unreachability')
  ok(/skipped: forge not consulted/.test(j.comment), 'issue comment skipped WITH the posture reason')
}

// ---------- renewing your own abandoned lane refreshes the lease ----------
{
  const o = mkorigin('renew')
  const A = mkclone(o, 'A')
  ok(cli(A, ['lane', 'claim', '3', '--agent', 'alice']).status === 0, 'alice claims lane/3')
  const r = cli(A, ['lane', 'reclaim', '3', '--agent', 'alice', '--json'], FUTURE)
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.from === 'alice' && j.agent === 'alice', `own abandoned lane renews (got ${r.status})`)
  ok((j.notes || []).some(n => /renewing this agent's own abandoned lane/.test(n)), 'the renewal is named — not a hostile takeover')
}

for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
console.log(fails ? `\n${fails} failing` : '\nall green')
process.exit(fails ? 1 : 0)
