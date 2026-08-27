#!/usr/bin/env node
// RED — PLAN.md §11 "the plugin boundary": V38, V39, V40, V41, V42.
//
// The first round left the three seams reading plugin DATA (tdd.json's covers[], a
// source_commit, a `Built from commit:` line). D7 draws the line one step back: baseline
// may ask whether a plugin artifact exists, what it is, how old it is, and whether git
// ignores it — and never opens it. Each plugin is one always-on rule (D8), asking git one
// question (D9), leaving one log (D10).
//
// v4 rule-set cut, restated here: the trust circle IS the opt-in, so a plugin a repo has
// adopted is GATED — every PLUG rule is a blocker and a finding fails the build. And the
// forge is not "closed" any more, it is GONE: no rule declares sources:["forge"], and no
// src/ file on the check/orient path can reach gh.
//
// v4 MEMBERSHIP (V43), which is the half that keeps baseline an ENABLER: "adopted" is a
// fact about baseline.config.json, not about the tree. The plugin table is what baseline
// SUPPORTS; the `plugins` keys are what this repo CHOSE. Support without choice is a
// SUGGESTION — n/a, out of the exit gate, no log, incapable of failing a build. Every
// fixture below that expects a PLUG verdict therefore declares its members first
// (trustedConfig / pluginsConfig); one that declares nothing is asserting the n/a half.
//
//   V38  rules/plug.json holds exactly PLUG-01/02/03 — blocker, plugin-presence, no pack
//   V39  all three absent → three FAIL rows naming an install command and a log that exists; exit 1
//   V40  present + gitignore state matches config → PASS, no log; differs → FAIL + log
//   V41  no code path under check/orient opens an artifact for reading
//   V42  the forge seam is deleted: no forge-sourced rule survives, and gh is never spawned
//   V43  MEMBERSHIP: a suggestion is n/a and never fails a build; a declared member does
//
// Contracts this file pins (the test is the authority — PLAN §0):
//   · a finding row's `log` (--json) is the repo-relative `.baseline/log/<RULE-ID>.log`
//   · the install command and the mismatch are named in the row's `detail`/`fix`/`reason`
//   · baseline.config.json `plugins` is keyed by plugin name: obsidian-tdd | graphify | okf-rag
//   · every assertion is wrapped: a crash counts as red, never as a broken suite
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  harness, loadRuleSet, ROOT, mkrepo, mktmp, checkJson, orientJson, cli, git, rowOf, writeAll,
  stubBin, CLEAN_NODE, TRUSTED_NODE, plantGraph, okfEnv, PREFIX_OF, PACK_OF, cleanup,
  PLUG_IDS, PLUG_FAMILY, PLUGIN_ARTIFACTS, PLUG_LOG, pluginsConfig, trustedConfig, mkPreload, readSentinel,
  FORGE_SOURCED_DELETED, SURVIVING_IDS,
} from './_lib.mjs'

const { ok, done } = harness('plugins')
let rules = []; try { rules = loadRuleSet().rules } catch {}
const base = (id) => PREFIX_OF(id) || id
const plugRows = (j) => (j?.results || []).filter(r => base(r.id).startsWith('PLUG-'))
const rowText = (row) => row ? [row.detail, row.fix, row.reason, row.suggest, row.hint].filter(Boolean).join(' ') : ''
const INSTALL_RE = /install|npm|npx|pip|brew/i
const LOG_RE = /\.baseline\/log\/PLUG-0[123]\.log/
const logPath = (dir, id) => path.join(dir, PLUG_LOG(id))
const readLog = (dir, id) => { try { return fs.readFileSync(logPath(dir, id), 'utf8') } catch { return null } }
const short = (s, n = 90) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)

/** a section never crashes the file: an exception is one red assertion that names it */
const section = (label, fn) => { try { fn() } catch (e) { ok(false, `${label} · section threw — ${short(e && e.stack || e, 160)}`) } }
const ghBox = (name) => {
  const box = mktmp(name); const sentinel = path.join(box, 'calls')
  const bin = stubBin(box, 'gh', sentinel)
  return { sentinel, env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } }
}
const untouched = (sentinel) => !fs.existsSync(sentinel) || fs.readFileSync(sentinel, 'utf8').trim() === ''
/** git that answers null instead of throwing — a fixture probe must never abort its section */
const gitq = (dir, ...a) => { try { return git(dir, ...a) } catch { return null } }

// ======================================================== D8 / V38: the PLUG family, as data
section('V38', () => {
  const modPath = path.join(ROOT, PLUG_FAMILY.module)
  ok(fs.existsSync(modPath), `V38 · ${PLUG_FAMILY.module} exists`)
  let mod = null; try { mod = JSON.parse(fs.readFileSync(modPath, 'utf8')) } catch {}
  const inFile = Array.isArray(mod?.rules) ? mod.rules : []
  ok(inFile.length === PLUG_IDS.length, `V38 · the module holds exactly ${PLUG_IDS.length} rules (got ${inFile.length})`)

  let manifest = null; try { manifest = loadRuleSet().manifest } catch {}
  ok((manifest?.modules || []).includes(PLUG_FAMILY.module), `V38 · rules.json lists ${PLUG_FAMILY.module}`)

  const plug = rules.filter(r => base(r.id).startsWith('PLUG-'))
  ok(plug.length === PLUG_IDS.length, `V38 · the loaded rule set carries exactly ${PLUG_IDS.length} PLUG rules (got ${plug.length}: ${plug.map(r => r.id).join(', ') || '—'})`)
  const got = plug.map(r => base(r.id)).sort()
  ok(JSON.stringify(got) === JSON.stringify([...PLUG_IDS].sort()), `V38 · they are ${PLUG_IDS.join(', ')} (got ${got.join(', ') || '—'})`)
  for (const id of PLUG_IDS) {
    const r = plug.find(x => base(x.id) === id)
    ok(!!r, `V38 · ${id} exists`)
    ok(r?.severity === PLUG_FAMILY.severity, `V38 · ${id} is severity ${PLUG_FAMILY.severity} (got ${r?.severity})`)
    ok(r?.check?.kind === PLUG_FAMILY.kind, `V38 · ${id} is kind ${PLUG_FAMILY.kind} (got ${r?.check?.kind})`)
    ok(r?.category === PLUG_FAMILY.category, `V38 · ${id} is category ${PLUG_FAMILY.category} (got ${r?.category})`)
    ok(r && !r.pack && (!r.profile || r.profile === 'core') && !PACK_OF.has(id),
      `V38 · ${id} is in no pack (pack ${r?.pack ?? '—'}, profile ${r?.profile ?? '—'})`)
    ok(r?.severity === 'blocker', `V38 · ${id} IS a blocker — the trust circle is the opt-in, and an adopted plugin is gated (got ${r?.severity})`)
    ok(r && !!inFile.find(x => x.id === r.id), `V38 · ${id} lives in ${PLUG_FAMILY.module}, not elsewhere`)
  }
  const foreign = inFile.filter(r => !base(r.id || '').startsWith('PLUG-')).map(r => r.id)
  ok(foreign.length === 0, `V38 · the module holds nothing but PLUG rules (${foreign.join(', ') || '—'})`)

  // the kind must be registered, or selfcheck would refuse the module
  let evals = ''; try { evals = fs.readFileSync(path.join(ROOT, 'src', 'evaluators.mjs'), 'utf8') } catch {}
  ok(new RegExp(`CHECK_KINDS[\\s\\S]{0,4000}'${PLUG_FAMILY.kind}'`).test(evals), `V38 · '${PLUG_FAMILY.kind}' is a registered check kind`)

  // "No other rule reads a plugin artifact path." The v4/ctx rules sharpened what that
  // sentence has to mean: four of them DO stand for a roster member, and they say so the
  // only legal way — the closed `plugin` name key the runner resolves through the plugin
  // table. That is a membership declaration, not a path. So the check is split rather than
  // relaxed: no rule outside PLUG may name an artifact PATH anywhere in its check, and any
  // rule that names a member at all must do it through `plugin`, with a name the roster
  // knows. (A path smuggled into `plugin` would still be caught: it is matched too.)
  const ART_RE = /tdd\.json|graphify-out|GRAPH_REPORT|BASELINE_OKF_BUNDLE/i
  const NAME_RE = /okf|graphify|obsidian|onto/i
  const withoutPluginKey = (c) => { const { plugin, ...rest } = c || {}; return JSON.stringify(rest) }
  const nonPlug = rules.filter(r => !base(r.id).startsWith('PLUG-'))
  const readers = nonPlug.filter(r => ART_RE.test(JSON.stringify(r.check || {})) || NAME_RE.test(withoutPluginKey(r.check))).map(r => r.id)
  ok(readers.length === 0, `V38 · no other rule's check names a plugin artifact path (${readers.join(', ') || '—'})`)
  const ROSTER = Object.values(PLUGIN_ARTIFACTS).map(a => a.plugin).concat('my-onto')
  const namers = nonPlug.filter(r => typeof r.check?.plugin === 'string')
  const offRoster = namers.filter(r => !ROSTER.includes(r.check.plugin)).map(r => `${r.id}:${r.check.plugin}`)
  ok(offRoster.length === 0, `V38 · a rule outside PLUG names a member only by a roster name (${offRoster.join(', ') || '—'})`)
})

// ======================================================== D8 + D10 / V39: all absent → three FAILs, three logs, exit 1
section('V39', () => {
  // the repo ADOPTED all three and has none of them: that is what makes this a finding at
  // all. The same tree without the config declaration is V43's n/a case.
  const dir = mkrepo('v39', { ...CLEAN_NODE(), 'baseline.config.json': trustedConfig() })
  for (const id of PLUG_IDS) {
    const a = PLUGIN_ARTIFACTS[id]
    if (!a.env) ok(!fs.existsSync(path.join(dir, a.path)), `V39 · fixture has no ${a.path}`)
  }
  const r = checkJson(dir)
  ok(!!r.j, `V39 · check --json produced a payload (exit ${r.status}: ${short(r.stderr)})`)
  // D6: the install command is printed, never run — every installer on PATH is a recorder
  const ibox = mktmp('v39-installers'); const isent = path.join(ibox, 'calls'); let ibin = null
  for (const t of ['npm', 'npx', 'pip', 'pip3', 'brew', 'uv']) ibin = stubBin(ibox, t, isent)
  checkJson(dir, [], { PATH: `${ibin}${path.delimiter}${process.env.PATH}` })
  ok(untouched(isent), `V39 · check names the install command but never spawns an installer (D6) (${short(readSentinel(isent).trim().replace(/\n/g, ' | ')) || 'none'})`)
  ok(r.status === 1, `V39 · exit code is 1 with every plugin absent — a blocker in the trust circle fails the build (got ${r.status})`)

  const rows = plugRows(r.j)
  ok(rows.length === PLUG_IDS.length, `V39 · exactly ${PLUG_IDS.length} PLUG rows (got ${rows.length}: ${rows.map(x => x.id).join(', ') || '—'})`)
  ok(rows.length === PLUG_IDS.length && rows.every(x => x.tag === 'FAIL'), `V39 · every PLUG row is FAIL (${rows.map(x => `${base(x.id)}=${x.tag}`).join(' ') || '—'})`)
  for (const id of PLUG_IDS) {
    const mine = rows.filter(x => base(x.id) === id)
    ok(mine.length === 1, `V39 · ${id} produces exactly one row (got ${mine.length})`)
    const row = mine[0]
    ok(row?.tag === 'FAIL', `V39 · ${id} is FAIL when ${PLUGIN_ARTIFACTS[id].plugin} is absent (got ${row?.tag})`)
    ok(INSTALL_RE.test(rowText(row)), `V39 · ${id} names an install command (${short(rowText(row))})`)
    ok(/install/i.test(rowText(row)) && !/\brunning\b|\bran\b|installed for you/i.test(rowText(row)),
      `V39 · ${id} prints the command; it never ran it (D6)`)
    ok(typeof row?.log === 'string' && LOG_RE.test(row.log), `V39 · ${id} --json carries a log path (${JSON.stringify(row?.log)})`)
    ok(typeof row?.log === 'string' && row.log.includes(`${id}.log`), `V39 · the log is named after the rule (${JSON.stringify(row?.log)})`)
    const want = logPath(dir, id)
    const got = typeof row?.log === 'string' ? path.resolve(dir, row.log) : null
    ok(got === want, `V39 · the log path is ${PLUG_LOG(id)}, repo-relative (got ${got ? path.relative(dir, got) : '—'})`)
    ok(fs.existsSync(want), `V39 · ${PLUG_LOG(id)} exists after the run`)
    const log = readLog(dir, id) || ''
    ok(log.trim().length > 0, `V39 · the log is non-empty`)
    const a = PLUGIN_ARTIFACTS[id]
    const pathRe = a.env ? new RegExp(`${a.env}|okf|bundle`, 'i') : new RegExp(a.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    ok(pathRe.test(log), `V39 · the log records the path inspected for ${id} (${short(log, 80)})`)
    ok(/config|default/i.test(log), `V39 · the log records the config value used for ${id}`)
  }

  // the human render carries the same facts: the command and the log path
  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  ok(human.status === 1, `V39 · the human render exits 1 too (got ${human.status})`)
  for (const id of PLUG_IDS) {
    const line = (human.stdout.split('\n').filter(l => l.includes(id)) || []).join(' ')
    ok(line.length > 0, `V39 · the human render has a ${id} line`)
    ok(LOG_RE.test(line) || new RegExp(`${id}\\.log`).test(human.stdout), `V39 · and it names ${PLUG_LOG(id)}`)
    ok(line.length > 0 && INSTALL_RE.test(line), `V39 · and the ${id} line names an install command (${short(line)})`)
  }

  // D8: "The WARN is a `check` row (CI sees it), not an `orient` line"
  const oj = orientJson(dir); const oh = cli(dir, ['orient', '--repo', dir])
  ok(!(oj.j?.results || []).some(x => base(x.id).startsWith('PLUG-')) && !/PLUG-0[123]/.test(oh.stdout),
    'V39 · the plugin finding is a check row, never an orient line (D8)')

  // D10: `.baseline/log/` joins `.baseline/cache/` in the shipped gitignore template
  let gi = ''; try { gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') } catch {}
  ok(/^\.baseline\/cache\/?$/m.test(gi) && /^\.baseline\/log\/?$/m.test(gi),
    'V39 · the shipped .gitignore template ignores .baseline/log/ alongside .baseline/cache/')

  // D10: overwritten each run — a second run leaves one log per rule, not an appended history
  const first = PLUG_IDS.map(id => readLog(dir, id))
  checkJson(dir)
  const second = PLUG_IDS.map(id => readLog(dir, id))
  ok(first.every((l, i) => l !== null && second[i] !== null && second[i].length <= l.length + 64),
    'V39 · a second run overwrites the logs rather than appending')
})

// ======================================================== D9 + D10 / V40: present, matching → PASS; present, differing → FAIL + log
section('V40', () => {
  const TDD = '{"schema":"tdd/1","tests":[]}\n'
  const GRAPH = '# GRAPH_REPORT\n\nBuilt from commit: ' + '0'.repeat(40) + '\n'

  // (a) tdd.json present and tracked; the default says tracked → PASS, no log
  {
    const dir = mkrepo('v40-tdd-tracked', { ...TRUSTED_NODE(), 'tdd.json': TDD }); plantGraph(dir)
    ok(git(dir, 'ls-files', 'tdd.json') === 'tdd.json', 'V40 · fixture: tdd.json is tracked')
    const r = checkJson(dir, [], okfEnv('v40-tdd-tracked'))
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'PASS', `V40 · PLUG-01 is PASS with tdd.json present and tracked (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-01')), 'V40 · and no PLUG-01 log is written')
    ok(r.status === 0, `V40 · a fully-stocked trust circle exits 0 (got ${r.status})`)
  }

  // (b) graphify-out/ present AND tracked; the default says ignored → WARN naming the mismatch
  {
    const dir = mkrepo('v40-graph-tracked', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ graphify: {} }), 'graphify-out/GRAPH_REPORT.md': GRAPH })
    ok((gitq(dir, 'ls-files', 'graphify-out') || '').length > 0, 'V40 · fixture: graphify-out/ is tracked')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-02')
    ok(row?.tag === 'FAIL', `V40 · PLUG-02 is FAIL when graphify-out/ is tracked but config says ignored (got ${row?.tag})`)
    ok(/tracked|ignored|mismatch/i.test(rowText(row)), `V40 · the row names the mismatch (${short(rowText(row))})`)
    ok(/tracked/i.test(rowText(row)) && /ignored/i.test(rowText(row)), 'V40 · naming both the expectation (ignored) and the finding (tracked)')
    ok(typeof row?.log === 'string' && LOG_RE.test(row.log), `V40 · the row carries the log path (${JSON.stringify(row?.log)})`)
    const log = readLog(dir, 'PLUG-02')
    ok(log !== null, `V40 · ${PLUG_LOG('PLUG-02')} exists`)
    ok(/graphify-out/.test(log || ''), 'V40 · the log records the path inspected')
    ok(/config/i.test(log || '') && /ignored/i.test(log || '') && /true/.test(log || ''), `V40 · the log records the config value (ignored: true) (${short(log, 100)})`)
    ok(/git/i.test(log || '') && /tracked/i.test(log || ''), 'V40 · the log records the git answer (tracked)')
    ok(r.status === 1, `V40 · a mismatch DOES change the exit code — the circle is gated (got ${r.status})`)
    ok(plugRows(r.j).filter(x => base(x.id) === 'PLUG-02').length === 1, 'V40 · and never a second row')
  }

  // (c) graphify-out/ present and gitignored; the default says ignored → PASS, no log
  {
    const dir = mkrepo('v40-graph-ignored', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ graphify: {} }), '.gitignore': '.env\nnode_modules/\ngraphify-out/\n' })
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': GRAPH })
    ok(gitq(dir, 'check-ignore', '-q', 'graphify-out/GRAPH_REPORT.md') === '' && gitq(dir, 'status', '--porcelain') === '', 'V40 · fixture: graphify-out/ is present and ignored')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-02')
    ok(row?.tag === 'PASS', `V40 · PLUG-02 is PASS with graphify-out/ present and gitignored (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-02')), 'V40 · and no PLUG-02 log is written')
  }

  // (d) tdd.json present but gitignored; the default says tracked → WARN (the mismatch runs both ways)
  {
    const dir = mkrepo('v40-tdd-ignored', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'obsidian-tdd': {} }), '.gitignore': '.env\nnode_modules/\ntdd.json\n' })
    writeAll(dir, { 'tdd.json': TDD })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'FAIL', `V40 · PLUG-01 is FAIL when tdd.json is ignored but config says tracked (got ${row?.tag})`)
    ok(/ignored/i.test(rowText(row)) && /tracked/i.test(rowText(row)), `V40 · the row names the mismatch (${short(rowText(row))})`)
    const log = readLog(dir, 'PLUG-01') || ''
    ok(/tdd\.json/.test(log) && /ignored/i.test(log), `V40 · the log records the path and the git answer (${short(log, 100)})`)
  }

  // (e) D9: the user's setup wins — config says graphify-out/ is tracked, and it is → PASS
  {
    const dir = mkrepo('v40-graph-config', {
      ...CLEAN_NODE(),
      'graphify-out/GRAPH_REPORT.md': GRAPH,
      'baseline.config.json': pluginsConfig({ graphify: { path: 'graphify-out', ignored: false } }),
    })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-02')
    ok(row?.tag === 'PASS', `V40 · PLUG-02 is PASS when config says tracked and graphify-out/ is tracked (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-02')), 'V40 · and no log is written when config and git agree')
  }

  // (f) D9: a configured non-default path is the path inspected
  {
    const dir = mkrepo('v40-tdd-path', {
      ...CLEAN_NODE(),
      'tools/tdd.json': TDD,
      'baseline.config.json': pluginsConfig({ 'obsidian-tdd': { path: 'tools/tdd.json', ignored: false } }),
    })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'PASS', `V40 · PLUG-01 follows the configured path tools/tdd.json (got ${row?.tag}: ${short(row?.detail)})`)
  }

  // (g) D9: the okf bundle outside the repo — present, and the gitignore question is skipped → PASS
  {
    const dir = mkrepo('v40-okf-outside', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'okf-rag': {} }) })
    const bundle = mktmp('v40-okf')
    writeAll(bundle, { 'baseline/rules/.keep': '' })
    const r = checkJson(dir, [], { BASELINE_OKF_BUNDLE: bundle })
    const row = rowOf(r.j, 'PLUG-03')
    ok(row?.tag === 'PASS', `V40 · PLUG-03 is PASS with a bundle outside the repo (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-03')), 'V40 · and no PLUG-03 log is written')
    ok(!!row && !/tracked|ignored/i.test(rowText(row)), `V40 · the gitignore question is not asked of a path outside the repo (${short(rowText(row))})`)
  }

  // (h) the okf bundle inside the repo and tracked; the default says ignored → WARN
  {
    const dir = mkrepo('v40-okf-inside', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ 'okf-rag': {} }), 'okf/baseline/rules/.keep': '' })
    const r = checkJson(dir, [], { BASELINE_OKF_BUNDLE: path.join(dir, 'okf') })
    const row = rowOf(r.j, 'PLUG-03')
    ok(row?.tag === 'FAIL', `V40 · PLUG-03 is FAIL with a tracked bundle inside the repo and config saying ignored (got ${row?.tag})`)
    const log = readLog(dir, 'PLUG-03') || ''
    ok(/okf/i.test(log) && /tracked/i.test(log), `V40 · the log records the bundle path and the git answer (${short(log, 100)})`)
  }
})

// ======================================================== D7 / V41: the artifact is never opened
section('V41', () => {
  // a byte-for-byte unparseable trio: not JSON, not markdown, not a bundle — only a reader would notice
  const GARBAGE = Buffer.from([0x00, 0xff, 0xfe, 0x7b, 0x01, 0x02, 0x00, 0x22, 0x5c, 0x0a, 0xc0, 0x80, 0x00, 0x7d, 0x7b, 0x7b])
  const bad = (name) => {
    const dir = mkrepo(name, { ...TRUSTED_NODE(), 'tdd.json': GARBAGE })
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': GARBAGE })
    const bundle = mktmp(name + '-okf')
    fs.mkdirSync(path.join(bundle, 'baseline', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(bundle, 'baseline', 'rules', 'sec-01.json'), GARBAGE)
    fs.writeFileSync(path.join(bundle, 'index.json'), GARBAGE)
    return { dir, bundle }
  }
  const good = (name) => {
    const dir = mkrepo(name, { ...TRUSTED_NODE() })
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': '# GRAPH_REPORT\n\nBuilt from commit: ' + '0'.repeat(40) + '\n' })
    const bundle = mktmp(name + '-okf')
    writeAll(bundle, { 'baseline/rules/sec-01.json': '{"id":"baseline/rules/sec-01","title":"t"}\n', 'index.json': '{}\n' })
    return { dir, bundle }
  }
  const verdicts = (j) => PLUG_IDS.map(id => `${id}=${rowOf(j, id)?.tag ?? '—'}`).join(' ')

  const g = good('v41-well-formed'); const b = bad('v41-garbage')
  const rg = checkJson(g.dir, [], { BASELINE_OKF_BUNDLE: g.bundle })
  const rb = checkJson(b.dir, [], { BASELINE_OKF_BUNDLE: b.bundle })
  ok(rb.status === 0, `V41 · check exits 0 with unparseable artifacts (got ${rb.status}: ${short(rb.stderr)})`)
  ok(!!rb.j, 'V41 · and still produces a payload')
  ok(PLUG_IDS.every(id => rowOf(rb.j, id)?.tag === 'PASS'), `V41 · every PLUG row is PASS on garbage that merely exists (${verdicts(rb.j)})`)
  ok(PLUG_IDS.every(id => rowOf(rg.j, id)) && verdicts(rg.j) === verdicts(rb.j), `V41 · garbage and well-formed artifacts give the same PLUG verdicts (${verdicts(rg.j)} vs ${verdicts(rb.j)})`)
  ok(rg.status === rb.status, `V41 · and the same exit code (${rg.status}/${rb.status})`)
  const ob = orientJson(b.dir, [], { BASELINE_OKF_BUNDLE: b.bundle })
  ok(ob.status === 0, `V41 · orient exits 0 with unparseable artifacts (got ${ob.status}: ${short(ob.stderr)})`)
  ok(!/parse|unexpected token|invalid json|malformed/i.test(rb.stderr + ob.stderr), `V41 · nothing complains about the content, because nothing read it (${short(rb.stderr + ob.stderr)})`)

  // the recorder: prove it bites before trusting its silence
  const box = mktmp('v41-preload'); const sentinel = path.join(box, 'reads')
  const penv = mkPreload(box, sentinel)
  {
    const probe = path.join(box, 'probe.mjs')
    fs.writeFileSync(probe, `import fs from 'node:fs'\nfs.readFileSync(process.argv[2])\n`)
    const pr = spawnSync(process.execPath, [probe, path.join(g.dir, 'tdd.json')], { encoding: 'utf8', env: { ...process.env, ...penv } })
    ok(pr.status === 0 && /tdd\.json/.test(readSentinel(sentinel)), `V41 · (harness) the preload records a real content read (${short(readSentinel(sentinel)) || 'nothing recorded'})`)
    try { fs.rmSync(sentinel, { force: true }) } catch {}
  }

  // check: silence
  const rc = checkJson(g.dir, [], { ...penv, BASELINE_OKF_BUNDLE: g.bundle })
  ok(rc.status === 0 && !!rc.j, `V41 · check runs under the recorder (exit ${rc.status})`)
  const seenCheck = readSentinel(sentinel)
  ok(seenCheck.trim() === '', `V41 · check opened no plugin artifact for reading (${short(seenCheck.trim().split('\n').slice(0, 3).join(' | '), 160) || 'none'})`)
  try { fs.rmSync(sentinel, { force: true }) } catch {}

  // orient: silence — it reports presence and mtime age, and reads no content (V24/V25 as amended)
  const ro = orientJson(g.dir, [], { ...penv, BASELINE_OKF_BUNDLE: g.bundle })
  ok(ro.status === 0, `V41 · orient runs under the recorder (exit ${ro.status})`)
  const seenOrient = readSentinel(sentinel)
  ok(seenOrient.trim() === '', `V41 · orient opened no plugin artifact for reading (${short(seenOrient.trim().split('\n').slice(0, 3).join(' | '), 160) || 'none'})`)
  try { fs.rmSync(sentinel, { force: true }) } catch {}

  // the rule set agrees: no PLUG check declares a content expectation
  const plug = rules.filter(r => base(r.id).startsWith('PLUG-'))
  const contentful = plug.filter(r => /covers|source_commit|Built from|pattern|regex|contains|json-field|content|parse/i.test(JSON.stringify(r.check || {}))).map(r => r.id)
  ok(plug.length > 0 && contentful.length === 0, `V41 · no PLUG check declares a content expectation (${contentful.join(', ') || '—'})`)
})

// ======================================================== V42: the forge seam is DELETED
// D12 closed the forge under check/orient with a flag. The v4 cut removed the seam: the
// three forge-sourced rules (GOV-01, GOV-02, OPS-07) are gone, and with them the lane
// world check/orient used to assemble. There is nothing left to close — which is a
// stronger claim, and this is where it is pinned.
section('V42', () => {
  const dir = mkrepo('v42', { ...TRUSTED_NODE(), 'baseline.config.json': trustedConfig({ project_type: 'service' }) })
  plantGraph(dir)
  const OKF = okfEnv('v42-okf')
  git(dir, 'remote', 'add', 'origin', 'https://github.com/red-fixture/does-not-exist.git')

  // (1) the rule set: not one forge-sourced rule, and the three deleted ids are really gone
  for (const id of FORGE_SOURCED_DELETED) {
    ok(!rules.some(x => base(x.id) === id), `V42 · ${id} is deleted from the rule set`)
  }
  const forgeSourced = rules.filter(r => Array.isArray(r.sources) && r.sources.includes('forge')).map(r => r.id)
  ok(forgeSourced.length === 0, `V42 · no rule declares sources:["forge"] (${forgeSourced.join(', ') || '—'})`)
  // v4/ctx: two rules ORDER git committer dates (CTX-16, CTX-17), which is the `history`
  // plane, declared exactly as CTX-11 declared it at v2.5.0 — and history is LOCAL: it is
  // the clone CI already has, reachable by no network call, so V42's closure (the FORGE) is
  // untouched. The assertion is SPLIT rather than relaxed: nothing anywhere declares a
  // plane outside {tree, history}, and `history` is confined BY KIND to the two ordering
  // rules in both directions, so it cannot spread to a rule that never reads a git date.
  const HISTORY_KINDS = ['artifact-not-lagging', 'stamp-not-lagging']
  const offPlane = rules.filter(r => !Array.isArray(r.sources) || r.sources.some(s => s !== 'tree' && s !== 'history')).map(r => `${r.id}:${JSON.stringify(r.sources)}`)
  ok(offPlane.length === 0, `V42 · every surviving rule reads the local planes and nothing else (${offPlane.join(', ') || '—'})`)
  const historyRules = rules.filter(r => (r.sources || []).includes('history'))
  const strayHistory = historyRules.filter(r => !HISTORY_KINDS.includes(r.check?.kind)).map(r => `${r.id}:${r.check?.kind}`)
  ok(strayHistory.length === 0, `V42 · only the git-date ordering kinds declare 'history' (${strayHistory.join(', ') || '—'})`)
  const undeclared = rules.filter(r => HISTORY_KINDS.includes(r.check?.kind) && !(r.sources || []).includes('history')).map(r => r.id)
  ok(undeclared.length === 0, `V42 · and every ordering rule declares it — a git date is history, not the tree at rest (${undeclared.join(', ') || '—'})`)
  const treeOnly = rules.filter(r => !HISTORY_KINDS.includes(r.check?.kind) && JSON.stringify(r.sources) !== JSON.stringify(['tree'])).map(r => r.id)
  ok(treeOnly.length === 0, `V42 · every other rule reads the tree and nothing else (${treeOnly.join(', ') || '—'})`)

  // (2) check: a payload, no forge rows, no gh
  {
    const { sentinel, env } = ghBox('v42-check')
    const r = checkJson(dir, [], { ...OKF, ...env })
    ok(!!r.j, `V42 · check --json produced a payload (exit ${r.status})`)
    const ids = new Set((r.j?.results || []).map(x => base(x.id)))
    ok(FORGE_SOURCED_DELETED.every(id => !ids.has(id)), `V42 · no forge rule is carried in check --json (${[...ids].filter(i => FORGE_SOURCED_DELETED.includes(i)).join(', ') || 'none'})`)
    ok([...ids].every(id => SURVIVING_IDS.includes(id)), `V42 · check carries the eight surviving rules and nothing else (${[...ids].filter(i => !SURVIVING_IDS.includes(i)).join(', ') || 'none extra'})`)
    ok(untouched(sentinel), `V42 · check never spawned gh (${short(readSentinel(sentinel).trim().replace(/\n/g, ' | ')) || 'none'})`)
    const human = cli(dir, ['check', '--repo', dir, '--no-exec'], { ...OKF, ...env })
    ok(!FORGE_SOURCED_DELETED.some(id => human.stdout.includes(id)), 'V42 · no forge rule is rendered to a human under check')
    ok(!/forge unreachable|\bgh not\b|\bgh auth\b/i.test(human.stdout), `V42 · and nothing pleads for gh (${short(human.stdout.match(/.*\bgh\b.*/)?.[0]) || '—'})`)
    ok(untouched(sentinel), 'V42 · the human render spawned no gh either')
  }

  // (3) orient: same, and no forge plane in the payload
  {
    const { sentinel, env } = ghBox('v42-orient')
    const o = orientJson(dir, [], { ...OKF, ...env })
    ok(o.status === 0, `V42 · orient exits 0 (got ${o.status})`)
    const rows = (o.j?.results || []).filter(x => FORGE_SOURCED_DELETED.includes(base(x.id)))
    ok(rows.length === 0, `V42 · orient carries no forge rule at all (${rows.map(x => base(x.id)).join(' ') || 'none'})`)
    const forgeTouched = o.j?.planes?.forge?.available === true || o.j?.forgeAvailable === true || o.j?.source === 'forge'
    ok(!forgeTouched, `V42 · orient reports no forge plane (${JSON.stringify(o.j?.planes?.forge ?? o.j?.source ?? null).slice(0, 80)})`)
    ok(untouched(sentinel), `V42 · orient never spawned gh (${short(readSentinel(sentinel).trim().replace(/\n/g, ' | ')) || 'none'})`)
    const human = cli(dir, ['orient', '--repo', dir], { ...OKF, ...env })
    ok(untouched(sentinel), 'V42 · nor does the human orient')
    ok(!/\bgh (pr|issue|auth)\b|forge unreachable/i.test(human.stdout), `V42 · orient never points at gh (${short(human.stdout.match(/.*\bgh\b.*/)?.[0]) || '—'})`)
  }

  // (4) the seam itself: the check/orient pipeline no longer even assembles a lane world
  {
    let cr = ''; try { cr = fs.readFileSync(path.join(ROOT, 'src', 'check-run.mjs'), 'utf8') } catch {}
    ok(!/makeLaneWorld/.test(cr), 'V42 · src/check-run.mjs no longer assembles a lane world')
    let ev = ''; try { ev = fs.readFileSync(path.join(ROOT, 'src', 'evaluators.mjs'), 'utf8') } catch {}
    ok(!/forge-protection|workflow-state|LANEWORLD/.test(ev), 'V42 · the forge check kinds are gone from src/evaluators.mjs')
  }
})

// ======================================================== v4 / V43: MEMBERSHIP is the gate
// The enabler property, pinned from both sides. baseline SUPPORTS four tools and this repo
// ADOPTED none of them — so nothing here may fail its build. Adopt one and the same tree,
// unchanged, must fail. The difference between the two runs is one key in one JSON file.
section('V43', () => {
  const TDD = '{"schema":"tdd/1","tests":[]}\n'

  // (a) no config file at all: every PLUG row is n/a, no log, exit 0
  {
    const dir = mkrepo('v43-suggested', CLEAN_NODE())
    ok(!fs.existsSync(path.join(dir, 'baseline.config.json')), 'V43 · fixture has no baseline.config.json — nothing is adopted')
    for (const id of PLUG_IDS) {
      const a = PLUGIN_ARTIFACTS[id]
      if (!a.env) ok(!fs.existsSync(path.join(dir, a.path)), `V43 · and no ${a.path}`)
    }
    const r = checkJson(dir)
    ok(r.status === 0, `V43 · a repo that adopted nothing exits 0 with every artifact absent — a suggestion never fails a build (got ${r.status})`)
    const rows = plugRows(r.j)
    ok(rows.length === PLUG_IDS.length, `V43 · all ${PLUG_IDS.length} PLUG rules still produce a row (got ${rows.length})`)
    for (const id of PLUG_IDS) {
      const row = rows.find(x => base(x.id) === id)
      ok(row?.state === 'n/a' && row.tag == null, `V43 · ${id} is n/a, not a tag (got ${row?.state ?? row?.tag ?? '—'})`)
      ok(/suggest|not.*adopt|trust circle/i.test(String(row?.reason || '')), `V43 · ${id} says why: it is suggested, not adopted (${short(row?.reason)})`)
      ok(!fs.existsSync(logPath(dir, id)), `V43 · ${id} leaves no ${PLUG_LOG(id)} — a suggestion is not a finding`)
    }
    const s = r.j?.summary || {}
    ok((s.blockers ?? 1) === 0 && (s.fail ?? 1) === 0, `V43 · and the summary counts none of them (blockers ${s.blockers}, fail ${s.fail})`)
    ok(PLUG_IDS.every(id => (r.j?.trust?.suggested || []).includes(PLUGIN_ARTIFACTS[id].plugin)) && (r.j?.trust?.members || []).length === 0,
      `V43 · --json names the circle: members ${JSON.stringify(r.j?.trust?.members)}, suggested ${JSON.stringify(r.j?.trust?.suggested)}`)
    const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
    ok(human.status === 0 && /suggest/i.test(human.stdout), `V43 · the human render OFFERS them instead of failing (exit ${human.status})`)
    ok(!/\bFAIL\b/.test(human.stdout), `V43 · and prints no FAIL row (${short(human.stdout.split('\n').filter(l => /FAIL/.test(l)).join(' | '))})`)
  }

  // (b) the SAME tree, one plugin declared: that one — and only that one — fails
  {
    const dir = mkrepo('v43-member', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ graphify: {} }) })
    ok(!fs.existsSync(path.join(dir, 'graphify-out')), 'V43 · fixture: graphify is declared and its artifact is absent')
    const r = checkJson(dir)
    ok(r.status === 1, `V43 · a DECLARED member with a missing artifact fails the build (got ${r.status})`)
    const g = rowOf(r.j, 'PLUG-02')
    ok(g?.tag === 'FAIL', `V43 · PLUG-02 is FAIL for the member (got ${g?.state ?? g?.tag ?? '—'})`)
    ok(INSTALL_RE.test(rowText(g)), `V43 · naming the install command (${short(rowText(g))})`)
    ok(typeof g?.log === 'string' && fs.existsSync(logPath(dir, 'PLUG-02')), `V43 · and leaving ${PLUG_LOG('PLUG-02')} (${JSON.stringify(g?.log)})`)
    ok(/member/i.test(readLog(dir, 'PLUG-02') || ''), `V43 · the log records the membership fact (${short(readLog(dir, 'PLUG-02'), 120)})`)
    for (const id of ['PLUG-01', 'PLUG-03']) {
      const row = rowOf(r.j, id)
      ok(row?.state === 'n/a', `V43 · ${id} stays n/a — declaring one tool adopts one tool (got ${row?.state ?? row?.tag ?? '—'})`)
    }
    ok((r.j?.summary?.blockers ?? 0) === 1, `V43 · exactly one blocker, the adopted one (got ${r.j?.summary?.blockers})`)
    ok(JSON.stringify(r.j?.trust?.members) === JSON.stringify(['graphify']), `V43 · --json names graphify as the only member (${JSON.stringify(r.j?.trust?.members)})`)
  }

  // (c) membership is a fact about the CONFIG, not about the tree: an artifact present
  //     without a declaration is still not a member, and still cannot fail anything
  {
    const dir = mkrepo('v43-present-unadopted', { ...CLEAN_NODE(), 'tdd.json': TDD })
    ok(git(dir, 'ls-files', 'tdd.json') === 'tdd.json', 'V43 · fixture: tdd.json is present and tracked, and nothing declares it')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.state === 'n/a', `V43 · a present artifact does not adopt itself — PLUG-01 is n/a (got ${row?.state ?? row?.tag ?? '—'})`)
    ok(r.status === 0, `V43 · exit 0 (got ${r.status})`)
  }

  // (d) a member at DEFAULT values is still a member — the fact is the key, not the values
  {
    const dir = mkrepo('v43-default-valued', {
      ...CLEAN_NODE(),
      'baseline.config.json': pluginsConfig({ 'obsidian-tdd': { path: 'tdd.json', ignored: false } }),
    })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'FAIL', `V43 · a member declared at the shipped defaults still gates (got ${row?.state ?? row?.tag ?? '—'})`)
    ok(r.status === 1, `V43 · and fails the build (got ${r.status})`)
  }

  // (e) `false` is a decision recorded, not an adoption
  {
    const dir = mkrepo('v43-declined', { ...CLEAN_NODE(), 'baseline.config.json': pluginsConfig({ graphify: false }) })
    const r = checkJson(dir)
    ok(rowOf(r.j, 'PLUG-02')?.state === 'n/a', `V43 · plugins.graphify:false declines — n/a (got ${rowOf(r.j, 'PLUG-02')?.state ?? rowOf(r.j, 'PLUG-02')?.tag ?? '—'})`)
    ok(r.status === 0, `V43 · and never fails the build (got ${r.status})`)
  }

  // (f) the roster changes over a project's life: `trust add` / `trust remove` are the
  //     ONLY thing that moves a tool across the line, and they move the exit code with it
  {
    const dir = mkrepo('v43-add-remove', CLEAN_NODE())
    ok(checkJson(dir).status === 0, 'V43 · before: nothing adopted, exit 0')
    const add = cli(dir, ['trust', 'add', 'graphify', '--repo', dir])
    ok(add.status === 0, `V43 · \`trust add graphify\` succeeds (exit ${add.status}: ${short(add.stderr)})`)
    let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8')) } catch {}
    ok(!!cfg?.plugins && Object.prototype.hasOwnProperty.call(cfg.plugins, 'graphify'),
      `V43 · it wrote the membership into baseline.config.json (${JSON.stringify(cfg?.plugins)})`)
    ok(checkJson(dir).status === 1, 'V43 · after adding, the same tree fails — the member is gated')
    const rm = cli(dir, ['trust', 'remove', 'graphify', '--repo', dir])
    ok(rm.status === 0, `V43 · \`trust remove graphify\` succeeds (exit ${rm.status}: ${short(rm.stderr)})`)
    let cfg2 = null; try { cfg2 = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8')) } catch {}
    ok(!!cfg2?.plugins && !Object.prototype.hasOwnProperty.call(cfg2.plugins, 'graphify'),
      `V43 · it deleted the key (${JSON.stringify(cfg2?.plugins)})`)
    ok(checkJson(dir).status === 0, 'V43 · and the tree is green again — removal is the whole undo')
    ok(cli(dir, ['trust', 'add', 'not-a-tool', '--repo', dir]).status === 2, 'V43 · an unknown tool is refused against the roster, never written')
  }

  // (g) the suggestion surface: with no members baseline offers every supported tool AND
  //     the config to adopt them. Output only — `trust setup` never gates anything.
  {
    const dir = mkrepo('v43-suggest-surface', CLEAN_NODE())
    const setup = cli(dir, ['trust', 'setup', '--repo', dir])
    ok(setup.status === 0, `V43 · \`trust setup\` exits 0 on a repo that adopted nothing (got ${setup.status}: ${short(setup.stderr)})`)
    for (const id of PLUG_IDS) {
      ok(setup.stdout.includes(PLUGIN_ARTIFACTS[id].plugin), `V43 · it suggests ${PLUGIN_ARTIFACTS[id].plugin}`)
    }
    ok(/suggested/i.test(setup.stdout), 'V43 · marking them suggested, not adopted')
    ok(/"plugins"/.test(setup.stdout), 'V43 · and printing a recommended baseline.config.json to copy')
    ok(/AST|no LLM|deterministic/i.test(setup.stdout), `V43 · the graphify recommendation says it is the deterministic one (AST, no LLM)`)
    ok(/gitignored|\.gitignore/i.test(setup.stdout), 'V43 · and that graphify-out/ stays gitignored')
    let sj = null; const sr = cli(dir, ['trust', 'setup', '--repo', dir, '--json'])
    try { sj = JSON.parse(sr.stdout) } catch {}
    ok(!!sj && Array.isArray(sj.members) && sj.members.length === 0, `V43 · --json reports an empty circle (${JSON.stringify(sj?.members)})`)
    ok(!!sj?.recommended?.plugins && PLUG_IDS.every(id => PLUGIN_ARTIFACTS[id].plugin in sj.recommended.plugins),
      `V43 · and carries the recommended plugins map (${JSON.stringify(Object.keys(sj?.recommended?.plugins || {}))})`)
    ok(!fs.existsSync(path.join(dir, 'baseline.config.json')), 'V43 · setup only SUGGESTS — it wrote nothing')
  }
})

cleanup()
process.exit(done() ? 1 : 0)
