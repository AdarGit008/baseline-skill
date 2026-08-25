// Shared harness for the v3 RED suite (docs/v3/PLAN.md).
//
// Repo style is one self-contained file per suite (test/admit, test/flow, test/golden).
// The red suite is nine files that all need the SAME two things — the rule set read as
// DATA, and a throwaway git world to run the CLI in — so those two live here once instead
// of seven times. Everything else (the `ok`/`fails` idiom, the GITENV hygiene, execFileSync
// over spawnSync) is copied from test/admit/run.mjs deliberately, not abstracted away.
//
// Nothing here asserts. Assertions live in the per-area files so a failure names its area.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// These files are authored at <repo>/test/red/, but the red suite is deliberately NOT
// wired into CI and may be run from a staging copy. BASELINE_RED_ROOT points the whole
// suite at the repo under test; the default is the repo these files sit in.
export const ROOT = path.resolve(process.env.BASELINE_RED_ROOT || path.resolve(HERE, '..', '..'))
export const BASELINE = path.join(ROOT, 'baseline.mjs')
export const CHECK = path.join(ROOT, 'check.mjs')

// ---------------------------------------------------------------- assertion idiom
export function harness(area) {
  let fails = 0, total = 0
  const ok = (c, m) => { total++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
  const done = () => {
    console.log(fails ? `\n[${area}] ${fails}/${total} still red` : `\n[${area}] all green (${total})`)
    return fails
  }
  return { ok, done, count: () => ({ fails, total }) }
}

// ---------------------------------------------------------------- env hygiene
// Same law as test/golden/run.mjs and test/admit/run.mjs: the ambient env must never
// steer the tool under test. A dev (or CI) with GITHUB_HEAD_REF, BASELINE_LOG_NOW or a
// forge replay dir exported would make these results machine-dependent — and V19 asserts
// precisely that ambient env changes nothing, so a leak both masks and invents failures.
export const GITENV = {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Red Tester', GIT_AUTHOR_EMAIL: 'red@test.invalid',
  GIT_COMMITTER_NAME: 'Red Tester', GIT_COMMITTER_EMAIL: 'red@test.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
}
export const CLEAN_ENV = (() => {
  const e = { ...process.env }
  for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD',
    'BASELINE_AGENT', 'BASELINE_GOV_ADMIN', 'BASELINE_OKF_BUNDLE', 'BASELINE_GRAPH_DIR',
    'GITHUB_HEAD_REF', 'GITHUB_REF_NAME', 'GITHUB_REF_TYPE', 'GITHUB_EVENT_NAME',
    'GITHUB_WORKSPACE', 'GITHUB_ACTIONS', 'CI']) delete e[k]
  return e
})()

const tmps = []
export const cleanup = () => { for (const t of tmps) { try { fs.rmSync(t, { recursive: true, force: true }) } catch {} } }
export const mktmp = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-red-${name}-`)); tmps.push(d); return d }

// ---------------------------------------------------------------- git worlds
export const git = (cwd, ...a) =>
  execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...CLEAN_ENV, ...GITENV } }).trim()

export function writeAll(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
  }
}

/** A committed git repo containing exactly `files`. No origin, no forge, no vendors. */
export function mkrepo(name, files = {}) {
  const dir = mktmp(name)
  git(dir, 'init', '-q', '-b', 'main')
  writeAll(dir, files)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'red fixture')
  return dir
}

/** Fixture bodies that clear the nine always-on blockers, so an exit code reflects only
 *  what the test under way planted. Kept as a function so callers can spread + override. */
export const CLEAN_NODE = () => ({
  'package.json': JSON.stringify({ name: 'red-fixture', version: '0.0.0', private: true, scripts: { test: 'true' } }, null, 2) + '\n',
  '.github/workflows/ci.yml': 'name: ci\non: [push]\npermissions: read-all\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n',
  'test/basic.test.js': "// a test exists\n",
  'src/index.js': 'export const hi = () => 1\n',
  '.gitignore': '.env\nnode_modules/\n',
  LICENSE: 'MIT-ish red fixture (not a real grant).\n',
  'README.md': '# red fixture\n\nNo links, no counts, nothing to break.\n',
})

/** A repo with no code at all — the docs-only shape V18 measures. */
export const DOCS_ONLY = () => ({
  'README.md': '# docs only\n\nProse.\n',
  LICENSE: 'MIT-ish red fixture (not a real grant).\n',
  'docs/guide.md': '# guide\n\nMore prose.\n',
})

// ---------------------------------------------------------------- running the CLI
export function cli(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [BASELINE, ...args], {
    cwd, encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV, ...env },
  })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}
export function checkJson(cwd, args = [], env = {}) {
  const r = cli(cwd, ['check', '--repo', cwd, '--no-exec', '--json', ...args], env)
  let j = null; try { j = JSON.parse(r.stdout) } catch {}
  return { ...r, j }
}
export function orientJson(cwd, args = [], env = {}) {
  const r = cli(cwd, ['orient', '--repo', cwd, '--json', ...args], env)
  let j = null; try { j = JSON.parse(r.stdout) } catch {}
  return { ...r, j }
}
/** ids of EVERY row in a check --json payload, n/a rows included (D4/V36). Pack-inactive rules
 *  are absent (V15/V16); tool-absent rules are present as state "n/a" (V17/V36) — filter on
 *  state when only evaluated rows matter. */
export const idsOf = (j) => new Set((j?.results || []).map(r => r.id))
export const rowOf = (j, idOrPrefix) => (j?.results || []).find(r => r.id === idOrPrefix || r.id.startsWith(idOrPrefix + '-'))

// ---------------------------------------------------------------- the rule set, as data
export function loadRuleSet(root = ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'rules.json'), 'utf8'))
  const rules = []
  for (const m of manifest.modules || []) rules.push(...JSON.parse(fs.readFileSync(path.join(root, m), 'utf8')).rules)
  return { manifest, rules }
}

/** The rule set as it stood at a git tag — V7's only honest source for "unchanged from v2.5.0". */
export function loadRuleSetAt(ref, root = ROOT) {
  const show = (p) => execFileSync('git', ['-C', root, 'show', `${ref}:${p}`], { encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV } })
  const manifest = JSON.parse(show('rules.json'))
  const rules = []
  for (const m of manifest.modules || []) rules.push(...JSON.parse(show(m)).rules)
  return { manifest, rules }
}

// ---------------------------------------------------------------- PLAN.md, encoded
// These are the plan's own tables. They are literals HERE on purpose: the test is the
// authority (PLAN.md §0), so the plan's list is the specification, and every count the
// tests compare against is DERIVED from these lists (never a spelled-out number).

/** PLAN §3 — the 15 rules v3 deletes, expressed the way the table expresses them — PLUS
 *  §11 D11's six: the five `signoff` rules (a human ledger entry was their only evidence,
 *  and D7 forbids the tdd.json reading §7.1 offered instead) and REC-06 (`vendored-lock`,
 *  replaced by the three PLUG rules). 94 − 15 − 6 + 3 = 76 (EXPECTED_RULE_COUNT). */
export const DELETED_PREFIXES = ['FLOW', 'DIV', 'MERGE']
export const DELETED_IDS = ['REC-01', 'REC-04', 'REC-06', 'TEST-03', 'TEST-04', 'TEST-06', 'CLAIM-05', 'CTX-04']
export const isDeleted = (id) => DELETED_PREFIXES.some(p => id.startsWith(p + '-')) || DELETED_IDS.includes(id)

/** PLAN §11 D11 — "the rule set is therefore 76 rules (79 − 6 + 3)". V11 reads 76. The
 *  literal lives HERE, once, as the plan's own arithmetic; tests compare against it. */
export const EXPECTED_RULE_COUNT = 76

/** PLAN §3 — "The 9 always-on blockers". */
export const ALWAYS_ON_BLOCKERS = ['BUILD-01', 'BUILD-03', 'BUILD-05', 'TEST-01', 'SEC-01', 'SEC-02', 'COMM-01', 'CTX-05', 'CTX-12']

/** PLAN §5 — the five opt-in packs and the rules each owns. */
export const PACKS = {
  claims: ['CLAIM-00', 'CLAIM-01', 'CLAIM-02', 'CLAIM-03', 'CLAIM-04', 'CLAIM-06', 'CLAIM-07'], // CLAIM-05 deleted by §11 D11
  decisions: ['CTX-02', 'CTX-07', 'CTX-13', 'CTX-14'],
  descriptor: ['DESC-01', 'DESC-02', 'DESC-03'],
  service: ['OPS-01', 'OPS-02', 'OPS-03', 'OPS-04', 'OPS-05', 'OPS-06', 'OPS-07'],
  // 'advanced' is named by topic in §5; its members are v2.5.0's advanced profile minus §11 D11's deletions
  advanced: ['BUILD-09', 'TEST-05', 'TEST-07', 'CTX-10', 'SEC-08', 'SEC-09', 'SEC-10', 'SEC-13'],
}
export const PACK_OF = (() => { const m = new Map(); for (const [p, ids] of Object.entries(PACKS)) for (const id of ids) m.set(id, p); return m })()

/** PLAN §7.1 — the five sign-off rules that flip to evidence. Superseded by §11 D11 (they
 *  are deleted, and sit in DELETED_IDS); kept exported so the deletions test can name them. */
export const SIGNOFF_FIVE = ['TEST-03', 'TEST-04', 'TEST-06', 'CLAIM-05', 'CTX-04']

// ---------------------------------------------------------------- PLAN §11 — the plugin boundary
/** D8 — one rule per plugin, in the always-on PLUG family (rules/plug.json). */
export const PLUG_IDS = ['PLUG-01', 'PLUG-02', 'PLUG-03']
export const PLUG_FAMILY = { module: 'rules/plug.json', category: 'plugins', severity: 'warn', kind: 'plugin-presence' }
/** D9 — id → the plugin it stands for, its DEFAULT artifact path, and the DEFAULT gitignore
 *  expectation. The okf bundle is env-derived ($BASELINE_OKF_BUNDLE); when that path is
 *  outside the repo the gitignore question is skipped. `plugin` is also the key under the
 *  `plugins` config object (the test is the authority on that spelling — PLAN §0). */
export const PLUGIN_ARTIFACTS = {
  'PLUG-01': { plugin: 'tdd-pi', path: 'tdd.json', kind: 'file', ignored: false },
  'PLUG-02': { plugin: 'graphify', path: 'graphify-out', kind: 'dir', ignored: true },
  'PLUG-03': { plugin: 'okf-rag', path: '$BASELINE_OKF_BUNDLE', env: 'BASELINE_OKF_BUNDLE', kind: 'dir', ignored: true },
}
/** D10 — the log a WARN leaves, relative to the repo. Overwritten each run. */
export const PLUG_LOG = (id) => path.posix.join('.baseline', 'log', `${id}.log`)
/** D9 — a baseline.config.json body carrying a `plugins` key. `overrides` is keyed by
 *  plugin name ('tdd-pi' | 'graphify' | 'okf-rag') → { path?, ignored? }; anything not
 *  overridden is left to the defaults so the fixture states only the non-default value. */
export function pluginsConfig(overrides = {}, extra = {}) {
  return JSON.stringify({ ...extra, plugins: overrides }, null, 2) + '\n'
}

/** V41 — a CJS preload (NODE_OPTIONS=--require) that records every CONTENT read of a plugin
 *  artifact into `sentinel`: fs open/read (sync, callback, promise, stream) and any child
 *  process whose argv reaches for the content (git cat-file blob / show / grep / diff …).
 *  Metadata is allowed by D7 — stat/exists/readdir/check-ignore/ls-files are NOT recorded.
 *  Returns the env to spread into cli(); read the sentinel back with readSentinel(). */
export function mkPreload(box, sentinel, pattern = 'tdd\\.json|GRAPH_REPORT|okf|bundle') {
  fs.mkdirSync(box, { recursive: true })
  const p = path.join(box, 'red-preload.cjs')
  fs.writeFileSync(p, `'use strict'
try {
  const fs = require('fs'), cp = require('child_process')
  const SENT = process.env.BASELINE_RED_SENTINEL
  const RE = new RegExp(process.env.BASELINE_RED_PATTERN || ${JSON.stringify(pattern)}, 'i')
  const hit = (how, what) => { try { require('fs').appendFileSync(SENT, how + ' ' + what + '\\n') } catch {} }
  const str = (x) => { try { return typeof x === 'string' ? x : Buffer.isBuffer(x) ? x.toString() : (x && x.href) ? x.href : String(x) } catch { return '' } }
  const seen = (how, x) => { const s = str(x); if (RE.test(s)) hit(how, s) }
  const wrap = (obj, name, how) => { const o = obj[name]; if (typeof o !== 'function') return; obj[name] = function (...a) { seen(how, a[0]); return o.apply(this, a) } }
  for (const n of ['readFileSync', 'openSync', 'readFile', 'open', 'createReadStream', 'readSync']) wrap(fs, n, 'fs.' + n)
  if (fs.promises) for (const n of ['readFile', 'open']) wrap(fs.promises, n, 'fs.promises.' + n)
  // content reads that go through git rather than fs
  const META = /^(check-ignore|ls-files|status|rev-parse|ls-tree|log|diff-tree|name-status|add|commit|pull|fetch|remote|config|init|stash|for-each-ref|symbolic-ref|describe|branch|tag|rev-list|merge-base|update-index|hash-object)$/
  const argvHit = (file, args) => {
    const argv = [str(file), ...(Array.isArray(args) ? args.map(str) : [])]
    const joined = argv.join(' ')
    if (!RE.test(joined)) return
    if (/(^|\\/)git$/.test(argv[0])) {
      const sub = argv.slice(1).find(a => !a.startsWith('-') && a !== 'git') || ''
      if (META.test(sub)) return
      if (sub === 'cat-file' && argv.includes('-e')) return
    }
    hit('spawn', joined)
  }
  for (const n of ['execFileSync', 'execFile', 'spawnSync', 'spawn']) { const o = cp[n]; if (typeof o === 'function') cp[n] = function (file, args, ...rest) { argvHit(file, Array.isArray(args) ? args : []); return o.call(this, file, args, ...rest) } }
  for (const n of ['execSync', 'exec']) { const o = cp[n]; if (typeof o === 'function') cp[n] = function (cmd, ...rest) { argvHit(String(cmd), []); return o.call(this, cmd, ...rest) } }
  try { require('module').syncBuiltinESMExports() } catch {}
} catch {}
`)
  try { fs.rmSync(sentinel, { force: true }) } catch {}
  return { NODE_OPTIONS: `--require ${p}`, BASELINE_RED_SENTINEL: sentinel, BASELINE_RED_PATTERN: pattern }
}
/** The sentinel's content, '' when it was never touched. Never throws. */
export const readSentinel = (sentinel) => { try { return fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8') : '' } catch { return '' } }

/** PLAN §2 — the v3 id grammar. */
export const ID_RE = /^[A-Z]+-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/
export const PREFIX_OF = (id) => (id.match(/^[A-Z]+-\d{2}/) || [null])[0]
export const SLUG_OF = (id) => id.replace(/^[A-Z]+-\d{2}-?/, '')

// ---------------------------------------------------------------- shipped surface
/** What install.sh actually copies — derived from install.sh, never a second hand-kept list. */
export function shippedPaths(root = ROOT) {
  const sh = fs.readFileSync(path.join(root, 'install.sh'), 'utf8')
  const files = (sh.match(/^for f in ([^\n;]+); do/m) || [, ''])[1].trim().split(/\s+/).filter(Boolean)
  const dirs = (sh.match(/^for d in ([^\n;]+); do/m) || [, ''])[1].trim().split(/\s+/).filter(Boolean)
  const out = []
  const walk = (rel) => {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) return
    if (fs.statSync(abs).isDirectory()) { for (const e of fs.readdirSync(abs).sort()) walk(path.join(rel, e)); return }
    out.push(rel)
  }
  for (const f of files) walk(f)
  for (const d of dirs) walk(d)
  return out
}

/** A fake executable on PATH that records every invocation into `sentinel`. */
export function stubBin(dir, name, sentinel) {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const p = path.join(bin, name)
  fs.writeFileSync(p, `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> ${JSON.stringify(sentinel)}\nexit 0\n`)
  fs.chmodSync(p, 0o755)
  return bin
}

/** Fake secrets are built at RUNTIME so this file never carries a secret shape at rest
 *  (the .golden/placeholder discipline of test/golden/run.mjs, applied to a live harness). */
export const FAKE_SECRET = 'AKIA' + 'IOSFODNN7REDTEST1'
export const FAKE_TOKEN = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'
