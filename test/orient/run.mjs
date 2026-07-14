#!/usr/bin/env node
// orient availability behavior. orient is a non-deterministic agent helper (live forge,
// relative ages), never a gate — so we don't pin its output; we assert it NEVER crashes and
// NEVER hard-refuses, degrading each unreachable plane to a labelled note (C33 / FS9). Forge
// is forced unreachable by running orient with a PATH that has git but no gh.
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')
const NODE = process.execPath

// A bin dir with git but no gh -> forge is deterministically "not installed", regardless of
// whether the host (or CI) has gh installed and authed.
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-bin-'))
fs.symlinkSync(execSync('command -v git').toString().trim(), path.join(BIN, 'git'))
const NOFORGE = { ...process.env, PATH: BIN }
const GITENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

function orient(args, cwd, env = {}) {
  try { return { code: 0, out: execFileSync(NODE, [BASELINE, 'orient', ...args], { cwd, env: { ...NOFORGE, ...env }, encoding: 'utf8' }) } }
  catch (e) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
}
let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

// 1 — non-git dir, no gh: every remote plane down, still prints a survey and exits 0
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-bare-'))
let r = orient([], bare)
ok(r.code === 0, 'non-git + no-gh: exit 0 (never hard-refuses)')
ok(/TREE ✓/.test(r.out) && /HISTORY ✗/.test(r.out) && /FORGE ✗/.test(r.out), 'non-git: header degrades history + forge to notes')

// 2 — git repo with a descriptor, no gh
const g = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-git-'))
execSync('git init -q', { cwd: g, env: GITENV })
execSync('git config user.email t@t.t && git config user.name t && git config commit.gpgsign false', { cwd: g, env: GITENV })
fs.writeFileSync(path.join(g, 'baseline.repo.json'), JSON.stringify({ schema_version: 1, type: 'library', lifecycle: 'production', maturity: 'released', owner: 't', workflow: 'single-lane', anchoring: 'off' }))
execSync('git add -A && git commit -qm init', { cwd: g, env: GITENV })
r = orient([], g)
ok(r.code === 0, 'git + no-gh: exit 0')
ok(/HISTORY ✓/.test(r.out), 'git: history plane available')
ok(/Descriptor: library/.test(r.out), 'git: descriptor type surfaced')
ok(/forge unreachable/.test(r.out), 'git + no-gh: lanes/backlog note forge unreachable')

// 3 — --strict with forge down -> exit 1 (refusal is reserved for --strict, FS9)
ok(orient(['--strict'], g).code === 1, '--strict + forge down: exit 1')

// 4 — --json valid, forge flagged unavailable (derived-status shape: planes / forgeAvailable)
r = orient(['--json'], bare)
let j = null; try { j = JSON.parse(r.out) } catch {}
ok(!!j && j.planes.forge.available === false && j.forgeAvailable === false, '--json: valid; forge unavailable')

// 5 — M5b lane lines from the GIT PLANE alone (forge down, origin = a local bare repo):
// claimed lanes appear with state/age/agent even with no PR and no forge (C31)
const IDENT = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t.t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t.t' }
const LANE_DESC = { schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype', owner: 't', workflow: 'multi-lane', anchoring: 'strict', ground_truth_boundary: { default_branch: 'main' }, lanes: { namespace: 'lane/*', lease_ttl: '7d' }, join_keys: ['Baseline-Agent', 'Baseline-Issue'] }
function mkLaneWorld(desc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orient-lanes-'))
  const bareO = path.join(dir, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bareO])
  const seed = path.join(dir, 'seed'); fs.mkdirSync(seed)
  execFileSync('git', ['init', '-q', '-b', 'main', seed])
  fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  execFileSync('git', ['-C', seed, 'add', '-A'], { env: { ...process.env, ...IDENT } })
  execFileSync('git', ['-C', seed, 'commit', '-qm', 'seed'], { env: { ...process.env, ...IDENT } })
  execFileSync('git', ['-C', seed, 'remote', 'add', 'origin', bareO])
  execFileSync('git', ['-C', seed, 'push', '-q', 'origin', 'main'])
  const clone = path.join(dir, 'clone'); execFileSync('git', ['clone', '-q', bareO, clone])
  return { dir, clone }
}
const w = mkLaneWorld(LANE_DESC)
const claim = (n, agent) => execFileSync(NODE, [BASELINE, 'lane', 'claim', String(n), '--agent', agent], { cwd: w.clone, env: { ...NOFORGE, ...IDENT }, encoding: 'utf8' })
claim(7, 'alice'); claim(9, 'bob')
r = orient([], w.clone)
ok(r.code === 0, 'lanes(git plane): exit 0')
ok(/## Lanes \(`lane\/\*` · ttl 7d\)/.test(r.out), 'lanes section headlines the namespace + ttl')
ok(/● `lane\/7` → #7 — LIVE · just now · agent alice · no PR yet/.test(r.out), `fresh claim renders LIVE with agent, PR-less lane APPEARS (got: ${(r.out.match(/● .*lane\/7.*/) || ['<missing>'])[0]})`)
ok(/git plane, committer clock \(low confidence\)/.test(r.out), 'git-plane freshness label rides the line')

// 6 — time-travel 8d: ABANDONED headlines first with the reclaim recipe
r = orient([], w.clone, { BASELINE_LOG_NOW: '2026-07-22T09:00:00Z' })
ok(/✗ `lane\/7` → #7 — ABANDONED/.test(r.out) && /reclaimable: {2}baseline lane reclaim 7/.test(r.out), 'abandoned lane names the reclaim recipe')

// 7 — multi-lane-local: the forge sections carry the POSTURE, never fake unreachability;
// lanes still derive (git plane is the posture's normal mode)
const w2 = mkLaneWorld({ ...LANE_DESC, workflow: 'multi-lane-local' })
execFileSync(NODE, [BASELINE, 'lane', 'claim', '3', '--agent', 'solo'], { cwd: w2.clone, env: { ...NOFORGE, ...IDENT }, encoding: 'utf8' })
r = orient([], w2.clone)
ok(r.code === 0 && /forge not consulted \(multi-lane-local posture\)/.test(r.out), 'multi-lane-local: sections name the posture')
ok(/● `lane\/3` → #3 — LIVE/.test(r.out), 'multi-lane-local: lanes derive from the git plane alone')

// 8 — --json carries the derived lane view
r = orient(['--json'], w.clone, { BASELINE_LOG_NOW: '2026-07-22T09:00:00Z' })
j = null; try { j = JSON.parse(r.out) } catch {}
ok(!!j && Array.isArray(j.lanes) && j.lanes.length === 2 && j.lanes.every(l => l.state === 'ABANDONED') && j.lanesMeta?.namespace === 'lane/*', '--json: lanes view derived, meta named')
ok(!!j && Array.isArray(j.prs), '--json: the open-PR list lives under prs now (M5b re-home)')

// 9 — the middle state renders too: +4d of a 7d ttl is STALE (◐), not a binary live/dead
r = orient([], w.clone, { BASELINE_LOG_NOW: '2026-07-18T09:00:00Z' })
ok(/◐ `lane\/7` → #7 — STALE/.test(r.out), `+4d of ttl 7d renders the STALE icon/line (got: ${(r.out.match(/[◐●✗?] `lane\/7`.*/) || ['<missing>'])[0]})`)

// 10 — lanes declared but BOTH planes down: the section says underived + why, exit stays 0
const w3 = mkLaneWorld(LANE_DESC)
execFileSync('git', ['-C', w3.clone, 'remote', 'set-url', 'origin', path.join(w3.dir, 'gone.git')])
r = orient([], w3.clone)
ok(r.code === 0 && /_underived: .*origin unreachable \(ls-remote failed\)/.test(r.out), 'both planes down → underived + both causes named, never a crash or a fake "none claimed"')

// 11 — replay dedup: a lane's open PR rides its lane line and leaves the Open PRs section
const SCENARIO = path.resolve(ROOT, 'test', 'forge-fixtures', 'scenario')
r = orient([], w.clone, { BASELINE_FORGE_REPLAY: SCENARIO })
ok(/· PR #40/.test(r.out), 'the lane line carries its open PR (#40 on lane/7, from the replay)')
ok(/## Open PRs \(non-lane branches\)/.test(r.out) && !/^- #40 /m.test(r.out), 'PR #40 is NOT double-listed under Open PRs — the lane line owns it')

for (const d of [BIN, bare, g, w.dir, w2.dir, w3.dir]) fs.rmSync(d, { recursive: true, force: true })
console.log(fails ? `\n✗ ${fails} orient check(s) failed\n` : '\n✓ orient availability checks pass\n')
process.exit(fails ? 1 : 0)
