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

function orient(args, cwd) {
  try { return { code: 0, out: execFileSync(NODE, [BASELINE, 'orient', ...args], { cwd, env: NOFORGE, encoding: 'utf8' }) } }
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

for (const d of [BIN, bare, g]) fs.rmSync(d, { recursive: true, force: true })
console.log(fails ? `\n✗ ${fails} orient check(s) failed\n` : '\n✓ orient availability checks pass\n')
process.exit(fails ? 1 : 0)
