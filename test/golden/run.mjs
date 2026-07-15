#!/usr/bin/env node
// Golden corpus harness — structured-verdict pins over the fixture repos.
// The safety net for the V2 engine refactors: any behavior change in the runner
// shows up as a pin mismatch. Statuses are pinned exactly; volatile details
// (day counts, SHAs, temp paths) are normalized before pinning.
//
//   node test/golden/run.mjs --capture   # (re)write test/golden/pins.json
//   node test/golden/run.mjs --verify    # compare against pins; exit 1 on drift
//
// Zero-dependency, Node >= 18. Fixtures live in test/fixtures/<name>/; each may
// carry a _fixture.json manifest: { args: [...], commits: 1|2, stamp_file: "..." }.
// Placeholders in fixture files: {{TODAY}} -> run date, {{HEAD1}} -> short SHA of
// the first commit (written between commit 1 and commit 2 when commits: 2).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const CHECK = path.join(REPO_ROOT, 'check.mjs')
const FIXTURES = path.join(REPO_ROOT, 'test', 'fixtures')
const PINS = path.join(HERE, 'pins.json')

const MODE = process.argv.includes('--capture') ? 'capture' : process.argv.includes('--verify') ? 'verify' : null
if (!MODE) { console.error('usage: node test/golden/run.mjs --capture | --verify'); process.exit(2) }

const TODAY = new Date().toISOString().slice(0, 10)
// Isolate git from the host's global/system config: a user-level core.excludesFile
// ignoring `.env`/`*.exe` would silently untrack the planted fixture files and make
// pins machine-dependent. Applied to every git call AND the checker subprocess
// (whose internal git calls inherit this env).
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
// A dev with the tool's OWN record/replay vars exported (time-travel, forge replay) must
// not silently drift the pins the checker subprocess derives — or, under --capture, bless
// wrong ones. Strip them from the inherited env; the harness re-injects BASELINE_FORGE_REPLAY
// per-manifest exactly where a fixture wants it. (BASELINE_GOLDEN_CHECK stays a real knob.)
for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD', 'BASELINE_AGENT']) delete GIT_ENV[k]
// Override the runner under test (e.g. point at a pristine V1 monolith to prove a
// candidate runner reproduces the same pins): BASELINE_GOLDEN_CHECK=/path/check.mjs
const CHECK_UNDER_TEST = process.env.BASELINE_GOLDEN_CHECK || CHECK
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: GIT_ENV }).toString().trim()

// Fixture files are stored with a .golden suffix (and secret placeholders) so the
// skill repo's own baseline scan never mistakes planted fixture content — fake
// secrets, intentionally broken links, committed .env files — for the real thing.
// Both are undone here, at materialize time only.
const SECRETS = {
  '{{SECRET_AWS}}': 'wJalrXUtnFEMIK7MDENG' + 'bPxRfiCYEXAMPLEKEY',
  '{{SECRET_GHP}}': 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789',
  '{{SECRET_AKIA}}': 'AKIA' + 'IOSFODNN7REALKEY',
}
function copyTree(src, dst, { skipMeta = false } = {}) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    // _branch/ is committed later on the fixture's lane branch; _forge/ never enters the
    // repo tree at all — it materializes OUTSIDE as the checker's replay dir (M5c)
    if (skipMeta && (e.name === '_branch' || e.name === '_forge')) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name.endsWith('.golden') ? e.name.slice(0, -'.golden'.length) : e.name)
    if (e.isDirectory()) { copyTree(s, d); continue }
    let t = fs.readFileSync(s, 'latin1')
    for (const [tok, val] of Object.entries(SECRETS)) t = t.split(tok).join(val)
    fs.writeFileSync(d, t, 'latin1')
  }
}

function substitute(dir, token, value) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { substitute(full, token, value); continue }
    const t = fs.readFileSync(full, 'latin1')
    if (t.includes(token)) fs.writeFileSync(full, t.split(token).join(value), 'latin1')
  }
}

// Normalize the volatile parts of a detail string so pins stay stable across
// runs, machines, and dates — without losing the semantic content.
function normalizeDetail(s, tmp) {
  return String(s)
    .split(tmp).join('<REPO>')
    .replace(/baseline-golden-[a-z0-9-]+-[A-Za-z0-9]+/g, '<REPO>') // tmp-dir basename in the human header
    .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
    .replace(/\b\d+(\.\d+)?d\b/g, '<N>d')                 // "437d old (>180)" -> "<N>d old (>180)"
    .replace(/\b\d+h\b/g, '<N>h')                         // lease ages ("26h idle") — run-date volatile
    .replace(/\(\d+ commits? behind/g, '(<N> commits behind')
    .replace(/stamp \d+ commits behind/g, 'stamp <N> commits behind')
    // The forge-probe cause is MACHINE-dependent (gh absent vs unauthed vs authed-no-repo)
    // — check's lane SKIPs now name the specific cause honestly, but the PIN must collapse
    // the variants to one token, exactly like a SHA. Real runs still show the true cause.
    .replace(/gh not installed|gh not authenticated \(gh auth login\)|no forge repo resolves here \(or network\/API down\)/g, '<forge unreachable>')
}

function materialize(name) {
  const src = path.join(FIXTURES, name)
  const manifest = JSON.parse(fs.readFileSync(path.join(src, '_fixture.json'), 'utf8'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-golden-${name}-`))
  const extra = [] // side dirs (bare origin, replay dir) — cleaned with the repo
  try {
    return materializeInto(name, src, manifest, tmp, extra)
  } catch (e) {
    // a failure mid-materialize (git push, bare init, forge copy) must never leak a tree
    // carrying materialized fake secrets — clean up everything created so far, then rethrow
    for (const d of [tmp, ...extra]) { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
    throw e
  }
}

function materializeInto(name, src, manifest, tmp, extra) {
  copyTree(src, tmp, { skipMeta: true })
  fs.rmSync(path.join(tmp, '_fixture.json'))
  substitute(tmp, '{{TODAY}}', TODAY)
  git(tmp, 'init', '-q', '-b', 'main') // deterministic default-branch name — the M4c lane gates compare against it
  git(tmp, 'config', 'user.email', 'golden@fixture.local')
  git(tmp, 'config', 'user.name', 'Golden Fixture')
  git(tmp, 'config', 'commit.gpgsign', 'false')
  git(tmp, 'add', '-A')
  git(tmp, 'commit', '-q', '-m', 'fixture: initial state')
  if ((manifest.commits || 1) >= 2) {
    const head1 = git(tmp, 'rev-parse', '--short', 'HEAD')
    substitute(tmp, '{{HEAD1}}', head1)
    git(tmp, 'add', '-A')
    git(tmp, 'commit', '-q', '-m', 'fixture: stamp advance')
  }
  // manifest.branches (M6a): ORDERED branches created before the current one — each
  // checks out from the PREVIOUS tip, so a later entry (or manifest.branch itself)
  // stacks on an earlier sister (MERGE-02's shape).
  for (const b of manifest.branches || []) {
    git(tmp, 'checkout', '-q', '-b', b.name)
    fs.writeFileSync(path.join(tmp, b.file || `${b.name.replace(/\W+/g, '-')}.txt`), b.content || `${b.name}\n`)
    git(tmp, 'add', '-A')
    git(tmp, 'commit', '-q', '-m', b.message || `fixture: ${b.name} work`)
  }
  // manifest.branch: check out a lane branch and commit the fixture's _branch/ overlay
  // there — the FLOW/REC lane rules only evaluate off the default branch (M4c).
  // branch_message (M6a) controls the commit message — trailers ride fixtures too.
  if (manifest.branch) {
    git(tmp, 'checkout', '-q', '-b', manifest.branch)
    const bsrc = path.join(src, '_branch')
    if (fs.existsSync(bsrc)) {
      copyTree(bsrc, tmp)
      substitute(tmp, '{{TODAY}}', TODAY)
      git(tmp, 'add', '-A')
      git(tmp, 'commit', '-q', '-m', manifest.branch_message || 'fixture: lane work')
    }
  }
  // manifest.main_advance (M6a): the target moves AFTER the branch diverged — the
  // C35 staleness shape `baseline admit` refuses until re-derived.
  if (manifest.main_advance) {
    const back = manifest.branch || 'main'
    git(tmp, 'checkout', '-q', 'main')
    fs.writeFileSync(path.join(tmp, 'ADVANCED.md'), 'the target moved after this branch diverged\n')
    git(tmp, 'add', '-A')
    git(tmp, 'commit', '-q', '-m', 'fixture: main advances')
    git(tmp, 'checkout', '-q', back)
  }
  // manifest.bare_origin (M5c): a LOCAL bare origin so origin-coupled rules (FLOW-05's
  // push discipline, FLOW-07's git-plane lease fallback) evaluate — the push also lands
  // the remote-tracking refs the evaluators read. Lives OUTSIDE the repo tree.
  const env = {}
  if (manifest.bare_origin) {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-golden-${name}-origin-`))
    extra.push(bare)
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: GIT_ENV })
    git(tmp, 'remote', 'add', 'origin', bare)
    git(tmp, 'push', '-q', 'origin', '--all')
  }
  // manifest.forge_replay (M5c): the fixture's _forge/ dir becomes the checker's
  // BASELINE_FORGE_REPLAY — committed forge answers, zero network, deterministic verdicts.
  if (manifest.forge_replay) {
    const fsrc = path.join(src, manifest.forge_replay)
    const fdst = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-golden-${name}-forge-`))
    extra.push(fdst)
    copyTree(fsrc, fdst)
    env.BASELINE_FORGE_REPLAY = fdst
  }
  return { tmp, args: manifest.args || [], env, extra, manifest }
}

function runChecker(tmp, args, env = {}) {
  try {
    return { stdout: execFileSync(process.execPath, [CHECK_UNDER_TEST, '--repo', tmp, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...GIT_ENV, ...env } }).toString(), exitCode: 0 }
  } catch (e) {
    return { stdout: e.stdout ? e.stdout.toString() : '', exitCode: e.status ?? 1 }
  }
}

// M6a: fixtures may pin OTHER baseline commands (manifest.command: 'admit') — these run
// through baseline.mjs, not check.mjs, so BASELINE_GOLDEN_CHECK stays a check-only knob.
const BASELINE_CLI = path.join(REPO_ROOT, 'baseline.mjs')
function runCommand(tmp, command, args, env = {}) {
  try {
    return { stdout: execFileSync(process.execPath, [BASELINE_CLI, command, '--repo', tmp, '--json', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...GIT_ENV, ...env } }).toString(), exitCode: 0 }
  } catch (e) {
    return { stdout: e.stdout ? e.stdout.toString() : '', exitCode: e.status ?? 1 }
  }
}

function score(name) {
  const { tmp, args, env, extra, manifest } = materialize(name)
  try {
    if (manifest.command === 'admit') {
      const { stdout, exitCode } = runCommand(tmp, 'admit', args, env)
      let out
      try { out = JSON.parse(stdout) } catch { throw new Error(`${name}: admit did not emit JSON (exit ${exitCode}):\n${stdout.slice(0, 400)}`) }
      const rules = {}
      for (const r of out.results) rules[r.id] = { tag: r.tag, detail: normalizeDetail(r.detail, tmp) }
      return {
        exitCode, command: 'admit', verdict: out.verdict, staleness: out.staleness,
        jdgOnly: out.jdgOnly, breakGlass: out.breakGlass ? { id: out.breakGlass.id } : null,
        refusals: (out.refusals || []).map(s => normalizeDetail(s, tmp)),
        target: { ref: out.target?.ref }, summary: out.summary, rules,
      }
    }
    const { stdout, exitCode } = runChecker(tmp, ['--json', ...args], env)
    let out
    try { out = JSON.parse(stdout) } catch { throw new Error(`${name}: checker did not emit JSON (exit ${exitCode}):\n${stdout.slice(0, 400)}`) }
    const rules = {}
    for (const r of out.results) rules[r.id] = { tag: r.tag, detail: normalizeDetail(r.detail, tmp) }
    return { exitCode, project_type: out.project_type, profiles: out.profiles.sort(), summary: out.summary, rules }
  } finally {
    for (const d of [tmp, ...extra]) fs.rmSync(d, { recursive: true, force: true }) // never leak a tree with materialized fake secrets
  }
}

// Pin the human scorecard too (one fixture): the default CLI output and its own
// exit-code path live in src/report.mjs and are otherwise invisible to --json pins.
// Non-TTY subprocess -> color() is a no-op, so the text is ANSI-free and stable.
function scoreHuman(name) {
  const { tmp, args, env, extra } = materialize(name)
  try {
    const { stdout, exitCode } = runChecker(tmp, args, env)
    return { exitCode, text: normalizeDetail(stdout, tmp).split('\n') }
  } finally {
    for (const d of [tmp, ...extra]) fs.rmSync(d, { recursive: true, force: true })
  }
}

function selfCheck() {
  try {
    execFileSync(process.execPath, [CHECK_UNDER_TEST, '--self-check'], { stdio: ['ignore', 'pipe', 'pipe'], env: GIT_ENV })
    return { exitCode: 0 }
  } catch (e) { return { exitCode: e.status ?? 1 } }
}

const names = fs.readdirSync(FIXTURES).filter(n => fs.statSync(path.join(FIXTURES, n)).isDirectory()).sort()
const current = { self_check: selfCheck(), human_scorecard: scoreHuman('node-pass') }
for (const n of names) {
  process.stderr.write(`  scoring ${n}...\n`)
  current[n] = score(n)
}

if (MODE === 'capture') {
  fs.writeFileSync(PINS, JSON.stringify(current, null, 2) + '\n')
  const total = names.reduce((a, n) => a + Object.keys(current[n].rules).length, 0)
  console.log(`✓ captured ${names.length} fixtures, ${total} rule verdicts -> ${path.relative(REPO_ROOT, PINS)}`)
  process.exit(0)
}

// --verify
const pinned = JSON.parse(fs.readFileSync(PINS, 'utf8'))
const diffs = []
const cmp = (where, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${where}: pinned ${JSON.stringify(a)} != current ${JSON.stringify(b)}`) }
cmp('self_check.exitCode', pinned.self_check.exitCode, current.self_check.exitCode)
cmp('human_scorecard.exitCode', pinned.human_scorecard.exitCode, current.human_scorecard.exitCode)
{
  const p = pinned.human_scorecard.text, c = current.human_scorecard.text
  if (p.length !== c.length) diffs.push(`human_scorecard: line count ${p.length} != ${c.length}`)
  else for (let i = 0; i < p.length; i++) if (p[i] !== c[i]) diffs.push(`human_scorecard line ${i + 1}: ${JSON.stringify(p[i])} != ${JSON.stringify(c[i])}`)
}
for (const n of names) {
  const p = pinned[n], c = current[n]
  if (!p) { diffs.push(`${n}: fixture has no pins (run --capture)`); continue }
  cmp(`${n}.exitCode`, p.exitCode, c.exitCode)
  cmp(`${n}.project_type`, p.project_type, c.project_type)
  cmp(`${n}.profiles`, p.profiles, c.profiles)
  cmp(`${n}.summary`, p.summary, c.summary)
  const ids = new Set([...Object.keys(p.rules), ...Object.keys(c.rules)])
  for (const id of ids) {
    if (!p.rules[id]) { diffs.push(`${n}.${id}: new rule not in pins`); continue }
    if (!c.rules[id]) { diffs.push(`${n}.${id}: pinned rule missing from output`); continue }
    cmp(`${n}.${id}.tag`, p.rules[id].tag, c.rules[id].tag)
    cmp(`${n}.${id}.detail`, p.rules[id].detail, c.rules[id].detail)
  }
}
const META_KEYS = new Set(['self_check', 'human_scorecard'])
for (const n of Object.keys(pinned)) if (!META_KEYS.has(n) && !names.includes(n)) diffs.push(`${n}: pinned fixture no longer exists`)

if (diffs.length) {
  console.error(`✗ golden corpus drift — ${diffs.length} difference(s):`)
  for (const d of diffs.slice(0, 40)) console.error('   - ' + d)
  if (diffs.length > 40) console.error(`   ... +${diffs.length - 40} more`)
  process.exit(1)
}
console.log(`✓ golden corpus clean — ${names.length} fixtures identical to pins`)
process.exit(0)
