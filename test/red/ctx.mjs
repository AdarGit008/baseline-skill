#!/usr/bin/env node
// RED — V45: the v4/ctx rules. The context system, gated.
//
// The v4 review scratched all twelve original CTX rules and commissioned five new ones.
// Four of them grade the CONTEXT SYSTEM a repo has adopted (graphify's graph, obsidian-tdd's
// test state, okf-rag's knowledge bundle, my-onto's ontology); the fifth grades baseline's
// OWN wiring. The four live on the trust-circle side of the rule set and the fifth on the
// baseline-layer side, and that split is the whole safety property: a tool a repo never
// adopted can never fail its build, while a repo that DID adopt one is held to it.
//
// The invariants this file pins, in the order they matter:
//   (a) DETERMINISM BY CONSTRUCTION. No mtime, no wall clock, no day threshold anywhere.
//       `git clone` stamps every file's mtime with the checkout time, so an mtime
//       comparison reads as maximally fresh on the one machine that matters most; a day
//       count is a policy baseline has no standing to pick for someone else's repo. What
//       is left is git committer dates and the stamps baseline itself commits.
//   (b) MEMBERSHIP IS THE GATE. Non-member ⇒ n/a ⇒ out of the exit code, with the artifact
//       sitting right there in the tree. Member + stale ⇒ exit 1.
//   (c) SAME-COMMIT PASSES. Updating the code and the artifact together is the discipline
//       these rules exist to protect; it must never read as a finding.
//   (d) FROZEN IS SILENT. CTX-18 emits nothing to a human and n/a to a machine, and claims
//       no severity at all.
//   (e) CTX-19 IS AN IDENTITY CHECK. It fails on DRIFT — an edited copy — and not merely on
//       absence, because a repo that was never wired has made no claim to check.
//   (f) THE PLUGIN BOUNDARY STILL HOLDS (D7). CTX-15 stands for the graph and never opens
//       it: its evidence is the committed stamp, which is baseline's file, not graphify's.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  harness, loadRuleSet, ROOT, mktmp, mkrepo, writeAll, checkJson, cli, rowOf,
  CLEAN_NODE, pluginsConfig, mkPreload, readSentinel, cleanup,
  CTX_IDS, CTX_MEMBER_OF, CTX_KIND_OF, CTX_SOURCE_KEYS, FROZEN_IDS, FROZEN_KIND, FROZEN_SEVERITY,
  ORIENT_ENTRYPOINT_REL, ORIENT_ENTRYPOINT_SHIPPED, CLEAN_ENV, GITENV,
} from './_lib.mjs'

const { ok, done } = harness('ctx')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const byBase = new Map(rules.map(r => [base(r.id), r]))
const short = (s, n = 130) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
const isNA = (x) => x?.state === 'n/a'
const attempt = (label, fn) => { try { return fn() } catch (e) { ok(false, `${label} (threw: ${short(e?.stack || e, 160)})`); return undefined } }

// git with a CHOSEN committer date: the ordering rules read committer dates, so a fixture
// that wants "the code moved after the artifact" has to be able to say when each landed.
// _lib's GITENV pins one date for every commit on purpose (reproducibility); here each
// commit names its own, which is the only way to build an ordering at all.
const gitAt = (dir, when, ...a) => execFileSync('git', ['-C', dir, ...a], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...CLEAN_ENV, ...GITENV, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
}).trim()
const commitAt = (dir, when, msg) => { gitAt(dir, when, 'add', '-A'); gitAt(dir, when, 'commit', '-qm', msg) }

// ======================================================== V45a: the five rules, as data
attempt('V45a', () => {
  ok(CTX_IDS.every(id => byBase.has(id)), `V45 · the five v4/ctx rules are shipped (${CTX_IDS.filter(id => !byBase.has(id)).join(', ') || 'all present'})`)
  const ctx = rules.filter(r => r.category === 'context')
  ok(ctx.length === CTX_IDS.length && ctx.every(r => CTX_IDS.includes(base(r.id))),
    `V45 · the context category is exactly them (${ctx.map(r => base(r.id)).join(', ') || '—'})`)

  for (const id of CTX_IDS) {
    const r = byBase.get(id)
    ok(r?.check?.kind === CTX_KIND_OF[id], `V45 · ${id} is kind '${CTX_KIND_OF[id]}' (got ${r?.check?.kind})`)
    ok(r?.certainty === 'deterministic', `V45 · ${id} is deterministic — same repo state, same verdict on every machine (got ${r?.certainty})`)
    ok(Array.isArray(r?.contexts) && r.contexts.includes('check'), `V45 · ${id} runs in the check context (${JSON.stringify(r?.contexts)})`)
    ok(!r?.pack, `V45 · ${id} is in no pack — the packs are gone (${r?.pack ?? '—'})`)
  }

  // the two halves of the rule set, told apart exactly as the runner tells them apart
  const isPlugin = (r) => typeof r?.check?.plugin === 'string' && !!r.check.plugin
  for (const [id, member] of Object.entries(CTX_MEMBER_OF)) {
    const r = byBase.get(id)
    ok(isPlugin(r) && r.check.plugin === member, `V45 · ${id} is a TRUST-CIRCLE rule, standing for ${member} (check.plugin ${JSON.stringify(r?.check?.plugin)})`)
  }
  ok(!isPlugin(byBase.get('CTX-19')), `V45 · CTX-19 is a BASELINE-LAYER rule — it is about baseline's own wiring, not a plugin (check.plugin ${JSON.stringify(byBase.get('CTX-19')?.check?.plugin ?? null)})`)

  // (d) frozen: no severity claim, and the vocabulary bound both ways by the tool itself
  for (const id of FROZEN_IDS) {
    const r = byBase.get(id)
    ok(r?.severity === FROZEN_SEVERITY, `V45 · ${id} claims NO severity ('${FROZEN_SEVERITY}', not a weaker tier) — got ${r?.severity}`)
    ok(r?.check?.kind === FROZEN_KIND, `V45 · ${id} is the '${FROZEN_KIND}' kind, which cannot produce a verdict (got ${r?.check?.kind})`)
  }
  const blockers = CTX_IDS.filter(id => !FROZEN_IDS.includes(id))
  ok(blockers.every(id => byBase.get(id)?.severity === 'blocker'), `V45 · every other v4/ctx rule is a blocker (${blockers.map(id => `${id}:${byBase.get(id)?.severity}`).join(' ')})`)

  // (a) no day threshold survives anywhere in the data — the review retired them outright
  const dayish = rules.filter(r => /_days\b|stale_days|lag_days/.test(JSON.stringify(r.check || {}))).map(r => r.id)
  ok(dayish.length === 0, `V45 · not one shipped rule reads a day threshold (${dayish.join(', ') || '—'})`)
  for (const [id, key] of Object.entries(CTX_SOURCE_KEYS)) {
    ok(byBase.get(id)?.check?.sources_from_config === key, `V45 · ${id} reads its source scope from "${key}" (got ${JSON.stringify(byBase.get(id)?.check?.sources_from_config)})`)
  }
  // the config keys exist as DEFAULTS, empty — opt-in by emptiness, so an unconfigured
  // repo gets n/a rather than a verdict built on a guess about what a store covers
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'src', 'config.mjs'), 'utf8')
  for (const key of Object.values(CTX_SOURCE_KEYS)) ok(new RegExp(`${key}\\s*:\\s*\\[\\]`).test(cfgSrc), `V45 · "${key}" defaults to [] in buildDefaults (opt-in by emptiness)`)
  // a KEY, not the word: the file says in prose that the *_stale_days twins are retired,
  // and that sentence must not be what satisfies the assertion
  const staleKeys = [...cfgSrc.matchAll(/^\s*([A-Za-z_][\w]*stale_days)\s*:/gm)].map(m => m[1])
  ok(staleKeys.length === 0, `V45 · and no *_stale_days key came back with them (${staleKeys.join(', ') || '—'})`)

  // the shipped entrypoint CTX-19 compares against is a real, shipped file
  const shipped = path.join(ROOT, ORIENT_ENTRYPOINT_SHIPPED)
  ok(fs.existsSync(shipped), `V45 · this baseline ships ${ORIENT_ENTRYPOINT_SHIPPED} — the identity CTX-19 compares against`)
  ok(/baseline-orient-entrypoint:\s*\S+/.test(fs.readFileSync(shipped, 'utf8')),
    'V45 · and it carries its own contract version, so an ordinary release does not make a wired repo look edited')
  const installSh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
  ok(/for d in [^\n]*\btemplates\b/.test(installSh), 'V45 · templates/ is copied by install.sh, so every install can answer CTX-19')
})

// ======================================================== V45b: CTX-16 — ordering, no threshold
attempt('V45b', () => {
  const mk = (name, cfg) => {
    const dir = mktmp(name)
    gitAt(dir, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
    writeAll(dir, { ...CLEAN_NODE(), 'tdd.json': '{"schema":"tdd/1"}\n', 'baseline.config.json': cfg })
    commitAt(dir, '2026-01-01T00:00:00Z', 'init')
    return dir
  }
  const SCOPE = { [CTX_SOURCE_KEYS['CTX-16']]: ['src/**/*.js'] }

  // (b) NOT a member — and the artifact is right there, so this is membership doing the work
  const sug = mk('v45-16-suggested', JSON.stringify(SCOPE, null, 2) + '\n')
  writeAll(sug, { 'src/index.js': 'export const hi = () => 2\n' })
  commitAt(sug, '2026-06-01T00:00:00Z', 'code moves alone')
  const rs = checkJson(sug)
  const rowS = rowOf(rs.j, 'CTX-16')
  ok(isNA(rowS) && /suggested, not adopted/.test(String(rowS?.reason)),
    `V45 · a NON-MEMBER's CTX-16 is n/a even with the artifact present and the code newer (${short(rowS?.reason ?? rowS?.tag)})`)
  ok(rs.status === 0, `V45 · and it cannot fail the build (exit ${rs.status})`)

  // (c) member, code and artifact in the SAME commit -> PASS
  const same = mk('v45-16-same', pluginsConfig({ 'obsidian-tdd': {} }, SCOPE))
  writeAll(same, { 'src/index.js': 'export const hi = () => 2\n', 'tdd.json': '{"schema":"tdd/1","tests":["hi"]}\n' })
  commitAt(same, '2026-02-01T00:00:00Z', 'code and tests together')
  const rowSame = rowOf(checkJson(same).j, 'CTX-16')
  ok(rowSame?.tag === 'PASS', `V45 · code and test state in the SAME commit PASSes — no threshold, and equal is not behind (${short(rowSame?.detail ?? rowSame?.reason)})`)

  // (b) member, code moves alone -> FAIL, exit 1
  writeAll(same, { 'src/index.js': 'export const hi = () => 3\n' })
  commitAt(same, '2026-03-01T00:00:00Z', 'code only')
  const rStale = checkJson(same)
  const rowStale = rowOf(rStale.j, 'CTX-16')
  ok(rowStale?.tag === 'FAIL', `V45 · a MEMBER whose code moved without the test state FAILs (${short(rowStale?.detail ?? rowStale?.reason)})`)
  ok(rStale.status === 1, `V45 · and it reaches the exit code (got ${rStale.status})`)
  ok(!/\bdays?\b|\d+d\b/.test(String(rowStale?.detail || '')), `V45 · the finding names an ORDER, never a number of days (${short(rowStale?.detail)})`)

  // no scope configured -> n/a, not a guess
  const noScope = mk('v45-16-noscope', pluginsConfig({ 'obsidian-tdd': {} }))
  writeAll(noScope, { 'src/index.js': 'export const hi = () => 4\n' })
  commitAt(noScope, '2026-09-01T00:00:00Z', 'code only')
  const rowNo = rowOf(checkJson(noScope).j, 'CTX-16')
  ok(isNA(rowNo) && new RegExp(CTX_SOURCE_KEYS['CTX-16']).test(String(rowNo?.reason)),
    `V45 · an unset source scope is n/a and names the key to set (${short(rowNo?.reason ?? rowNo?.tag)})`)
})

// ======================================================== V45c: CTX-17 — a RECORDED claim, ordered
attempt('V45c', () => {
  const bundle = mktmp('v45-bundle'); writeAll(bundle, { 'index.json': '{}\n' })
  const SCOPE = { [CTX_SOURCE_KEYS['CTX-17']]: ['src/**/*.js'] }
  const dir = mktmp('v45-17')
  gitAt(dir, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
  writeAll(dir, { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'okf-rag': { path: bundle } }, SCOPE) })
  commitAt(dir, '2026-01-01T00:00:00Z', 'init')

  const before = rowOf(checkJson(dir).j, 'CTX-17')
  ok(isNA(before) && /trust stamp --member okf-rag/.test(String(before?.reason)),
    `V45 · an adopted-but-unstamped bundle is n/a and names the command that records it (${short(before?.reason ?? before?.tag)})`)

  const st = cli(dir, ['trust', 'stamp', '--repo', dir, '--member', 'okf-rag'])
  ok(st.status === 0, `V45 · \`trust stamp --member okf-rag\` writes the stamp (exit ${st.status}: ${short(st.stderr)})`)
  commitAt(dir, '2026-02-01T00:00:00Z', 'commit the stamp')
  const fresh = rowOf(checkJson(dir).j, 'CTX-17')
  ok(fresh?.tag === 'PASS', `V45 · a recorded claim that is not behind the code PASSes (${short(fresh?.detail ?? fresh?.reason)})`)
  ok(/RECORDED ONLY/.test(String(fresh?.detail || '')),
    `V45 · and the PASS still says it is RECORDED ONLY — a claim someone made, never a verified fact (${short(fresh?.detail)})`)
  ok(/cannot verify/.test(String(fresh?.detail || '')), 'V45 · in those words: baseline cannot verify it')

  writeAll(dir, { 'src/index.js': 'export const hi = () => 9\n' })
  commitAt(dir, '2026-08-01T00:00:00Z', 'code moves past the recorded commit')
  const r = checkJson(dir)
  const stale = rowOf(r.j, 'CTX-17')
  ok(stale?.tag === 'FAIL', `V45 · code committed after the recorded commit FAILs (${short(stale?.detail ?? stale?.reason)})`)
  ok(r.status === 1, `V45 · and reaches the exit code (got ${r.status})`)
  ok(/RECORDED-ONLY|RECORDED ONLY/.test(String(stale?.detail || '')),
    `V45 · the finding keeps the tier visible too — even the claim is behind, and the claim is all there is (${short(stale?.detail)})`)

  // an untracked stamp is a finding: CI clones tracked files, so nothing else would see it
  const un = mktmp('v45-17-untracked')
  gitAt(un, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
  writeAll(un, { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'okf-rag': { path: bundle } }, SCOPE) })
  commitAt(un, '2026-01-01T00:00:00Z', 'init')
  cli(un, ['trust', 'stamp', '--repo', un, '--member', 'okf-rag'])
  const rowUn = rowOf(checkJson(un).j, 'CTX-17')
  ok(rowUn?.tag === 'FAIL' && /not tracked/.test(String(rowUn?.detail)),
    `V45 · a stamp that was written but never committed is a finding, not a pass (${short(rowUn?.detail ?? rowUn?.reason)})`)
})

// ======================================================== V45d: CTX-15 — hashes, not clocks
attempt('V45d', () => {
  const dir = mktmp('v45-15')
  gitAt(dir, '2026-01-01T00:00:00Z', 'init', '-q', '-b', 'main')
  writeAll(dir, { ...CLEAN_NODE(), '.gitignore': '.env\nnode_modules/\ngraphify-out/\n' })
  commitAt(dir, '2026-01-01T00:00:00Z', 'init')
  // graphify's manifest, as graphify writes it: one row per file, carrying an ast_hash
  const buildManifest = () => {
    const files = gitAt(dir, '2026-01-01T00:00:00Z', 'ls-files').split('\n').filter(f => f.endsWith('.js'))
    const m = {}
    for (const f of files) m[f] = { ast_hash: createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex') }
    writeAll(dir, { 'graphify-out/manifest.json': JSON.stringify(m, null, 2) + '\n' })
    return files.length
  }
  const n = buildManifest()
  ok(n > 0, `V45 · the fixture's manifest covers ${n} tracked code file(s)`)

  // NOT a member, with the graph AND the manifest sitting there
  const rowSug = rowOf(checkJson(dir).j, 'CTX-15')
  ok(isNA(rowSug) && /suggested, not adopted/.test(String(rowSug?.reason)),
    `V45 · a NON-MEMBER's CTX-15 is n/a with the graph present (${short(rowSug?.reason ?? rowSug?.tag)})`)

  writeAll(dir, { 'baseline.config.json': pluginsConfig({ graphify: {} }) })
  commitAt(dir, '2026-01-02T00:00:00Z', 'adopt graphify')
  const rowUnstamped = rowOf(checkJson(dir).j, 'CTX-15')
  ok(isNA(rowUnstamped) && /trust stamp/.test(String(rowUnstamped?.reason)),
    `V45 · adopted but unstamped is n/a and names the command (${short(rowUnstamped?.reason ?? rowUnstamped?.tag)})`)

  ok(cli(dir, ['trust', 'stamp', '--repo', dir]).status === 0, 'V45 · `trust stamp` writes the verifiable stamp')
  commitAt(dir, '2026-01-03T00:00:00Z', 'commit the stamp')
  const rowOk = rowOf(checkJson(dir).j, 'CTX-15')
  ok(rowOk?.tag === 'PASS', `V45 · a stamp that matches the tree PASSes (${short(rowOk?.detail ?? rowOk?.reason)})`)

  // the code changes and the graph is NOT rebuilt: the HASHES disagree, and no clock was
  // consulted to find that out — the commit below is deliberately dated BEFORE the stamp's
  // own commit, so a timestamp comparison would have called this fresh.
  writeAll(dir, { 'src/index.js': 'export const hi = () => 42\n' })
  commitAt(dir, '2025-06-01T00:00:00Z', 'back-dated code change')
  const r = checkJson(dir)
  const rowStale = rowOf(r.j, 'CTX-15')
  ok(rowStale?.tag === 'FAIL', `V45 · a MEMBER whose code changed without a graph rebuild FAILs (${short(rowStale?.detail ?? rowStale?.reason)})`)
  ok(r.status === 1, `V45 · and reaches the exit code (got ${r.status})`)
  ok(/changed since the graph was built/.test(String(rowStale?.detail || '')),
    `V45 · by CONTENT: the finding names the changed file, not a date (${short(rowStale?.detail)})`)

  // (f) D7 — the rule stands for the graph and never opens it. Under the read-recorder,
  // a full check must touch no plugin artifact: its evidence is the committed stamp, which
  // is baseline's own file. The recorder is shown to bite first, as V41 does.
  const box = mktmp('v45-preload'); const sentinel = path.join(box, 'reads')
  const penv = mkPreload(box, sentinel, 'manifest\\.json|GRAPH_REPORT|graphify-out|tdd\\.json')
  const probe = path.join(box, 'probe.mjs')
  fs.writeFileSync(probe, `import fs from 'node:fs'\nfs.readFileSync(process.argv[2])\n`)
  const pr = execFileSync(process.execPath, [probe, path.join(dir, 'graphify-out', 'manifest.json')], { encoding: 'utf8', env: { ...process.env, ...penv } })
  ok(/manifest\.json/.test(readSentinel(sentinel)), `V45 · (harness) the read-recorder bites on a real manifest read (${short(readSentinel(sentinel)) || 'nothing recorded'})`)
  try { fs.rmSync(sentinel, { force: true }) } catch {}
  const rc = checkJson(dir, [], penv)
  ok(rowOf(rc.j, 'CTX-15')?.tag === 'FAIL', 'V45 · check still reaches the same verdict under the recorder')
  ok(readSentinel(sentinel).trim() === '',
    `V45 · and opened graphify-out/ not once — CTX-15's evidence is the stamp, which is baseline's file (${short(readSentinel(sentinel).trim().split('\n').slice(0, 3).join(' | '), 160) || 'none'})`)

  // rebuilding the graph and restamping clears it — the fix in the rule is the real fix
  buildManifest()
  cli(dir, ['trust', 'stamp', '--repo', dir])
  commitAt(dir, '2026-04-01T00:00:00Z', 'rebuild + restamp')
  const after = checkJson(dir)
  ok(rowOf(after.j, 'CTX-15')?.tag === 'PASS' && after.status === 0,
    `V45 · rebuild + \`trust stamp\` + commit clears it (${short(rowOf(after.j, 'CTX-15')?.detail)}; exit ${after.status})`)
})

// ======================================================== V45e: CTX-18 — frozen, and silent
attempt('V45e', () => {
  // every shape of repo answers the same way, because the rule cannot answer any other way
  const plain = mkrepo('v45-18-plain', CLEAN_NODE())
  const adopted = mkrepo('v45-18-adopted', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'my-onto': {} }) })
  for (const [label, dir] of [['nothing adopted', plain], ['my-onto DECLARED in the config', adopted]]) {
    const r = checkJson(dir)
    const row = rowOf(r.j, 'CTX-18')
    ok(isNA(row), `V45 · CTX-18 is n/a with ${label} (got ${row ? (row.tag ?? row.state) : 'no row'})`)
    ok(row?.severity === FROZEN_SEVERITY, `V45 · and --json carries its severity as '${FROZEN_SEVERITY}' (${JSON.stringify(row?.severity)})`)
    ok(/FROZEN/.test(String(row?.reason || '')), `V45 · the machine row says why (${short(row?.reason)})`)
    const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
    ok(!human.stdout.includes('CTX-18') && !/my-onto/.test(human.stdout),
      `V45 · and the human render says NOTHING about it — not a row, not a name (${label})`)
    ok(!(r.j?.trust?.suggested || []).includes('my-onto') && !(r.j?.trust?.members || []).includes('my-onto'),
      `V45 · the trust summary never offers a tool that cannot be installed (${JSON.stringify(r.j?.trust)})`)
  }
  // it can never be counted, either: n/a rows are outside summarize()
  const r = checkJson(plain)
  const evaluated = (r.j?.results || []).filter(x => !isNA(x)).map(x => x.id)
  ok(!evaluated.some(id => id.startsWith('CTX-18')), `V45 · CTX-18 is never an evaluated row, so it can never move a count (${evaluated.join(', ')})`)
})

// ======================================================== V45f: CTX-19 — identity, not existence
attempt('V45f', () => {
  const dir = mkrepo('v45-19', CLEAN_NODE())
  const abs = path.join(dir, ORIENT_ENTRYPOINT_REL)
  const shipped = fs.readFileSync(path.join(ROOT, ORIENT_ENTRYPOINT_SHIPPED), 'utf8')

  // (e) absence is NOT a finding — a repo that was never wired has made no claim to check.
  // It is not silent either: the n/a names the command that wires it.
  const r0 = checkJson(dir)
  const row0 = rowOf(r0.j, 'CTX-19')
  ok(isNA(row0), `V45 · with no entrypoint at all CTX-19 is n/a — absence is not drift (got ${row0 ? (row0.tag ?? row0.state) : 'no row'})`)
  ok(/trust wire/.test(String(row0?.reason || '')), `V45 · and the n/a is not silence: it names \`baseline trust wire\` (${short(row0?.reason)})`)
  ok(r0.status === 0, `V45 · an unwired repo is not failed (exit ${r0.status})`)

  // the install side, on the trust CLI beside setup/add/remove/stamp/verify
  const wire = cli(dir, ['trust', 'wire', '--repo', dir])
  ok(wire.status === 0, `V45 · \`baseline trust wire\` installs it (exit ${wire.status}: ${short(wire.stderr)})`)
  ok(fs.readFileSync(abs, 'utf8') === shipped, 'V45 · byte-identical to the copy this baseline ships')
  const untracked = checkJson(dir)
  ok(rowOf(untracked.j, 'CTX-19')?.tag === 'FAIL' && /not tracked|git add/.test(String(rowOf(untracked.j, 'CTX-19')?.detail)),
    `V45 · written but not committed is a finding — CI clones tracked files (${short(rowOf(untracked.j, 'CTX-19')?.detail)})`)
  commitAt(dir, '2026-01-06T00:00:00Z', 'wire')

  // a DIFFERENT script at the same committed path is not an entrypoint: existence proves
  // nothing, which is the whole reason this is an identity check
  fs.writeFileSync(abs, '#!/bin/sh\necho "I am totally the orient script"\n')
  commitAt(dir, '2026-01-05T12:00:00Z', 'a lookalike')
  const rFake = checkJson(dir)
  ok(rowOf(rFake.j, 'CTX-19')?.tag === 'FAIL' && rFake.status === 1,
    `V45 · a lookalike at the right path FAILs — an IDENTITY check, not an existence check (${short(rowOf(rFake.j, 'CTX-19')?.detail)}; exit ${rFake.status})`)
  cli(dir, ['trust', 'wire', '--repo', dir])
  commitAt(dir, '2026-01-05T13:00:00Z', 'restore')
  const wired = checkJson(dir)
  ok(rowOf(wired.j, 'CTX-19')?.tag === 'PASS' && wired.status === 0,
    `V45 · committed and identical PASSes (${short(rowOf(wired.j, 'CTX-19')?.detail)}; exit ${wired.status})`)

  // idempotent: a second wire on a correct copy writes nothing at all
  const again = cli(dir, ['trust', 'wire', '--repo', dir])
  ok(again.status === 0 && fs.readFileSync(abs, 'utf8') === shipped && gitAt(dir, '2026-01-06T00:00:00Z', 'status', '--porcelain') === '',
    `V45 · a rerun on a correct copy is a no-op — a wired repo never shows a churn diff (${short(again.stdout)})`)

  // (e) DRIFT: one appended line, nothing else changed
  fs.writeFileSync(abs, shipped + '\n# a local edit\n')
  commitAt(dir, '2026-01-07T00:00:00Z', 'edit the entrypoint')
  const drifted = checkJson(dir)
  const rowD = rowOf(drifted.j, 'CTX-19')
  ok(rowD?.tag === 'FAIL', `V45 · an EDITED copy FAILs — drift is the failure mode (${short(rowD?.detail)})`)
  ok(drifted.status === 1, `V45 · and reaches the exit code (got ${drifted.status})`)
  ok(/edited|differs/.test(String(rowD?.detail || '')) && /trust wire/.test(String(rowD?.detail || '')),
    `V45 · the finding says it was edited and how to restore it (${short(rowD?.detail)})`)

  // VERSION SKEW is a different diagnosis from drift, and says so
  const skewed = shipped.replace(/baseline-orient-entrypoint:\s*\S+/, 'baseline-orient-entrypoint: 0')
  ok(skewed !== shipped, 'V45 · (harness) the fixture really changed the version marker')
  fs.writeFileSync(abs, skewed)
  commitAt(dir, '2026-01-08T00:00:00Z', 'an older entrypoint')
  const rowSkew = rowOf(checkJson(dir).j, 'CTX-19')
  ok(rowSkew?.tag === 'FAIL' && /THIS baseline ships/.test(String(rowSkew?.detail || '')),
    `V45 · an older entrypoint is named as SKEW against the version this baseline ships, not as an edit (${short(rowSkew?.detail)})`)

  // and it is a BASELINE-LAYER rule: the layer's opt-out covers a repo that wants none of it
  fs.writeFileSync(abs, shipped + '\n# edited again\n')
  writeAll(dir, { 'baseline.config.json': JSON.stringify({ baseline_rules: false }, null, 2) + '\n' })
  commitAt(dir, '2026-01-09T00:00:00Z', 'opt the layer out')
  const opted = checkJson(dir)
  ok(isNA(rowOf(opted.j, 'CTX-19')) && opted.status === 0,
    `V45 · with the baseline layer opted OUT it is n/a and cannot fail (${short(rowOf(opted.j, 'CTX-19')?.reason)}; exit ${opted.status})`)
  ok((opted.j?.baseline?.rules || []).some(id => id.startsWith('CTX-19')),
    `V45 · and --json names it among the rules the layer governs (${JSON.stringify(opted.j?.baseline?.rules)})`)
})

cleanup()
process.exit(done() ? 1 : 0)
