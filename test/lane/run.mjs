#!/usr/bin/env node
// M5a suite — `baseline lane claim`: the atomic branch-creation claim (FS2/S3).
// Every test runs against a LOCAL bare origin (file transport) — the ref-transaction
// atomicity under test is git's own, identical over file and smart-HTTP transports,
// so no network and no forge are ever needed. Zero-dependency, Node >= 18.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const tmps = []

const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const gitOk = (cwd, ...a) => { try { return git(cwd, ...a) } catch { return null } }
const cfg = c => { git(c, 'config', 'user.name', 'Lane Tester'); git(c, 'config', 'user.email', 'lane@test.invalid') }
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })

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
  execFileSync('git', ['init', '-q', '-b', 'main', seed]); cfg(seed)
  if (desc) fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  fs.writeFileSync(path.join(seed, 'README.md'), '# lane test fixture\n')
  git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'seed')
  git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'main')
  return { dir, bare }
}
const mkclone = (o, name) => { const c = path.join(o.dir, name); execFileSync('git', ['clone', '-q', o.bare, c]); cfg(c); return c }

// ---------- the claim wins: ref at origin, trailers stamped, winner checked out ----------
{
  const o = mkorigin('win')
  const A = mkclone(o, 'A')
  const r = cli(A, ['lane', 'claim', '7', '--agent', 'Alice Agent', '--json'])
  ok(r.status === 0, `claim exits 0 (got ${r.status}${r.stderr ? ` — ${r.stderr.split('\n')[0]}` : ''})`)
  const j = JSON.parse(r.stdout || '{}')
  ok(j.claimed === true && j.ref === 'lane/7' && j.issue === 7, `json: claimed=true ref=lane/7 issue=7 (got ${r.stdout.slice(0, 80)})`)
  ok(j.agent === 'alice-agent', `agent rides the ONE slug chain (got '${j.agent}')`)
  ok(gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/7') !== null, 'origin has refs/heads/lane/7')
  const body = git(o.bare, 'log', '-1', '--format=%B', 'lane/7')
  ok(body.includes('Baseline-Issue: #7') && body.includes('Baseline-Agent: alice-agent'), 'claim commit carries both descriptor-declared trailers (C38)')
  ok(git(o.bare, 'rev-parse', 'lane/7^') === git(o.bare, 'rev-parse', 'main'), 'claim commit sits on the default-branch tip (empty commit, no tree change)')
  ok(git(A, 'rev-parse', '--abbrev-ref', 'HEAD') === 'lane/7', 'winner is checked out on the lane')
  ok(j.checkout === true, 'json reports the checkout')
}

// ---------- the second claim loses cleanly: exit 3, zero local residue ----------
{
  const o = mkorigin('lose')
  const A = mkclone(o, 'A'), B = mkclone(o, 'B')
  ok(cli(A, ['lane', 'claim', '7']).status === 0, 'first claim wins')
  const r = cli(B, ['lane', 'claim', '7', '--json'])
  ok(r.status === 3, `second claim exits 3 (got ${r.status})`)
  const j = JSON.parse(r.stdout || '{}')
  ok(j.claimed === false && typeof j.existing === 'string' && j.existing.length >= 8, 'json: claimed=false + existing tip named')
  ok(gitOk(B, 'show-ref', '--verify', 'refs/heads/lane/7') === null, 'loser has NO local lane branch')
  ok(git(B, 'rev-parse', '--abbrev-ref', 'HEAD') === 'main', 'loser HEAD untouched')
  ok(git(B, 'status', '--porcelain') === '', 'loser worktree clean — no partial state')
}

// ---------- checkbox 1, structurally: two SIMULTANEOUS claims, exactly one winner ----------
{
  const o = mkorigin('race')
  const A = mkclone(o, 'RA'), B = mkclone(o, 'RB')
  const go = cwd => new Promise(res => {
    const p = spawn(process.execPath, [BASELINE, 'lane', 'claim', '9', '--json'], { cwd, env: process.env })
    let out = ''; p.stdout.on('data', d => { out += d }); p.on('close', code => res({ code, out }))
  })
  const [ra, rb] = await Promise.all([go(A), go(B)])
  const codes = [ra.code, rb.code].sort()
  ok(codes[0] === 0 && codes[1] === 3, `exactly one winner, one clean loser (got exits ${ra.code}/${rb.code})`)
  ok(gitOk(o.bare, 'show-ref', '--verify', 'refs/heads/lane/9') !== null, 'origin has exactly the one claimed ref')
  const loser = ra.code === 3 ? A : B
  ok(gitOk(loser, 'show-ref', '--verify', 'refs/heads/lane/9') === null, 'the losing clone holds no lane branch')
}

// ---------- refusals: descriptor is the only source of a lane name (never guess) ----------
{
  const o = mkorigin('nodesc', null)
  const A = mkclone(o, 'A')
  const r = cli(A, ['lane', 'claim', '3'])
  ok(r.status === 2 && /no baseline\.repo\.json/.test(r.stderr), 'no descriptor → refuse (exit 2), names the fix')

  const o2 = mkorigin('badns', { ...BASE_DESC, lanes: { namespace: 'lane/fixed', lease_ttl: '7d' } })
  const r2 = cli(mkclone(o2, 'A'), ['lane', 'claim', '3'])
  ok(r2.status === 2 && /exactly one '\*'/.test(r2.stderr), `namespace without '*' → refuse: one deterministic ref per issue is the race`)

  const o3 = mkorigin('nolanes', (({ lanes, ...rest }) => rest)(BASE_DESC))
  const r3 = cli(mkclone(o3, 'A'), ['lane', 'claim', '3'])
  ok(r3.status === 2 && /lanes\.namespace/.test(r3.stderr), 'no lanes.namespace → refuse, names the field')

  const o4 = mkorigin('badjk', { ...BASE_DESC, join_keys: ['Baseline-Agent'] })
  const r4 = cli(mkclone(o4, 'A'), ['lane', 'claim', '3'])
  ok(r4.status === 2 && /join_keys omits Baseline-Issue/.test(r4.stderr), 'join_keys missing a claim trailer → refuse with the exact declaration to add (C38)')
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
  ok(cli(A, ['lane']).status === 2, 'bare `lane` → usage (exit 2)')
  ok(cli(A, ['lane', '--help']).status === 0, 'lane --help exits 0')
  const r = cli(A, ['lane', 'reclaim', 'lane/15'])
  ok(r.status === 2 && /claim/.test(r.stderr), 'unknown action (reclaim is M5b) → usage naming what exists')
}

// ---------- a stale LOCAL branch with the lane's name is never adopted as the claim ----------
{
  const o = mkorigin('stale')
  const A = mkclone(o, 'A')
  git(A, 'branch', 'lane/6')  // stale local branch, not a claim
  const r = cli(A, ['lane', 'claim', '6', '--json'])
  const j = JSON.parse(r.stdout || '{}')
  ok(r.status === 0 && j.claimed === true, 'claim still wins at origin')
  ok(j.checkout === false && (j.notes || []).some(n => /already existed here/.test(n)), 'pre-existing local branch is left untouched and named — never checked out as if it were the claim')
  ok(git(A, 'rev-parse', 'lane/6') === git(A, 'rev-parse', 'main'), 'the stale local branch tip is unchanged')
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
  const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-lane-noorigin-')); tmps.push(solo)
  execFileSync('git', ['init', '-q', '-b', 'main', solo]); cfg(solo)
  fs.writeFileSync(path.join(solo, 'baseline.repo.json'), JSON.stringify(BASE_DESC, null, 2))
  const r = cli(solo, ['lane', 'claim', '3'])
  ok(r.status === 2 && /no origin remote/.test(r.stderr), 'no origin → refuse: origin push IS the rendezvous')

  // a rejecting origin (policy hook) is a transport failure, not a race: exit 2, says why
  const o2 = mkorigin('reject')
  const hook = path.join(o2.bare, 'hooks', 'pre-receive')
  fs.writeFileSync(hook, '#!/bin/sh\necho "lane creation forbidden by policy" >&2\nexit 1\n'); fs.chmodSync(hook, 0o755)
  const A = mkclone(o2, 'A')
  const r2 = cli(A, ['lane', 'claim', '8'])
  ok(r2.status === 2 && /push failed/.test(r2.stderr), `rejected push (ref still absent) → exit 2 with git's reason, never a fake lost-race (got ${r2.status})`)
  ok(gitOk(A, 'show-ref', '--verify', 'refs/heads/lane/8') === null && git(A, 'status', '--porcelain') === '', 'failed claim leaves no local residue either')
}

for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
console.log(fails ? `\n${fails} failing` : '\nall green')
process.exit(fails ? 1 : 0)
