#!/usr/bin/env node
// RED — PLAN.md §11 "the plugin boundary": V38, V39, V40, V41, V42.
//
// The first round left the three seams reading plugin DATA (tdd.json's covers[], a
// source_commit, a `Built from commit:` line). D7 draws the line one step back: baseline
// may ask whether a plugin artifact exists, what it is, how old it is, and whether git
// ignores it — and never opens it. Each plugin is one always-on WARN (D8), asking git one
// question (D9), leaving one log (D10). The forge is closed under check/orient (D12).
//
//   V38  rules/plug.json holds exactly PLUG-01/02/03 — warn, plugin-presence, no pack, no blocker
//   V39  all three absent → three WARN rows naming an install command and a log that exists; exit 0
//   V40  present + gitignore state matches config → PASS, no log; differs → WARN + log
//   V41  no code path under check/orient opens an artifact for reading
//   V42  GOV-01/GOV-02/OPS-07 are n/a "forge not consulted" under check and orient; gh never spawned
//
// Contracts this file pins (the test is the authority — PLAN §0):
//   · a WARN row's `log` (--json) is the repo-relative `.baseline/log/<RULE-ID>.log`
//   · the install command and the mismatch are named in the row's `detail`/`fix`/`reason`
//   · baseline.config.json `plugins` is keyed by plugin name: tdd-pi | graphify | okf-rag
//   · every assertion is wrapped: a crash counts as red, never as a broken suite
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  harness, loadRuleSet, ROOT, mkrepo, mktmp, checkJson, orientJson, cli, git, rowOf, writeAll,
  stubBin, CLEAN_NODE, PREFIX_OF, PACK_OF, cleanup,
  PLUG_IDS, PLUG_FAMILY, PLUGIN_ARTIFACTS, PLUG_LOG, pluginsConfig, mkPreload, readSentinel,
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
    ok(r && r.severity !== 'blocker' && r.blocker !== true, `V38 · ${id} is not a blocker`)
    ok(r && !!inFile.find(x => x.id === r.id), `V38 · ${id} lives in ${PLUG_FAMILY.module}, not elsewhere`)
  }
  const foreign = inFile.filter(r => !base(r.id || '').startsWith('PLUG-')).map(r => r.id)
  ok(foreign.length === 0, `V38 · the module holds nothing but PLUG rules (${foreign.join(', ') || '—'})`)

  // the kind must be registered, or selfcheck would refuse the module
  let evals = ''; try { evals = fs.readFileSync(path.join(ROOT, 'src', 'evaluators.mjs'), 'utf8') } catch {}
  ok(new RegExp(`CHECK_KINDS[\\s\\S]{0,4000}'${PLUG_FAMILY.kind}'`).test(evals), `V38 · '${PLUG_FAMILY.kind}' is a registered check kind`)

  // "No other rule reads a plugin artifact path."
  const ART_RE = /tdd\.json|graphify-out|GRAPH_REPORT|BASELINE_OKF_BUNDLE|okf/i
  const readers = rules.filter(r => !base(r.id).startsWith('PLUG-') && ART_RE.test(JSON.stringify(r.check || {}))).map(r => r.id)
  ok(readers.length === 0, `V38 · no other rule's check names a plugin artifact path (${readers.join(', ') || '—'})`)
})

// ======================================================== D8 + D10 / V39: all absent → three WARNs, three logs, exit 0
section('V39', () => {
  const dir = mkrepo('v39', CLEAN_NODE())
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
  ok(r.status === 0, `V39 · exit code is 0 with every plugin absent (got ${r.status})`)

  const rows = plugRows(r.j)
  ok(rows.length === PLUG_IDS.length, `V39 · exactly ${PLUG_IDS.length} PLUG rows (got ${rows.length}: ${rows.map(x => x.id).join(', ') || '—'})`)
  ok(rows.length === PLUG_IDS.length && rows.every(x => x.tag === 'WARN'), `V39 · every PLUG row is WARN (${rows.map(x => `${base(x.id)}=${x.tag}`).join(' ') || '—'})`)
  for (const id of PLUG_IDS) {
    const mine = rows.filter(x => base(x.id) === id)
    ok(mine.length === 1, `V39 · ${id} produces exactly one row (got ${mine.length})`)
    const row = mine[0]
    ok(row?.tag === 'WARN', `V39 · ${id} is WARN when ${PLUGIN_ARTIFACTS[id].plugin} is absent (got ${row?.tag})`)
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
  ok(human.status === 0, `V39 · the human render exits 0 too (got ${human.status})`)
  for (const id of PLUG_IDS) {
    const line = (human.stdout.split('\n').filter(l => l.includes(id)) || []).join(' ')
    ok(line.length > 0, `V39 · the human render has a ${id} line`)
    ok(LOG_RE.test(line) || new RegExp(`${id}\\.log`).test(human.stdout), `V39 · and it names ${PLUG_LOG(id)}`)
    ok(line.length > 0 && INSTALL_RE.test(line), `V39 · and the ${id} line names an install command (${short(line)})`)
  }

  // D8: "The WARN is a `check` row (CI sees it), not an `orient` line"
  const oj = orientJson(dir); const oh = cli(dir, ['orient', '--repo', dir])
  ok(!(oj.j?.results || []).some(x => base(x.id).startsWith('PLUG-')) && !/PLUG-0[123]/.test(oh.stdout),
    'V39 · the plugin WARN is a check row, never an orient line (D8)')

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

// ======================================================== D9 + D10 / V40: present, matching → PASS; present, differing → WARN + log
section('V40', () => {
  const TDD = '{"schema":"tdd/1","tests":[]}\n'
  const GRAPH = '# GRAPH_REPORT\n\nBuilt from commit: ' + '0'.repeat(40) + '\n'

  // (a) tdd.json present and tracked; the default says tracked → PASS, no log
  {
    const dir = mkrepo('v40-tdd-tracked', { ...CLEAN_NODE(), 'tdd.json': TDD })
    ok(git(dir, 'ls-files', 'tdd.json') === 'tdd.json', 'V40 · fixture: tdd.json is tracked')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'PASS', `V40 · PLUG-01 is PASS with tdd.json present and tracked (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-01')), 'V40 · and no PLUG-01 log is written')
    ok(r.status === 0, `V40 · exit 0 (got ${r.status})`)
  }

  // (b) graphify-out/ present AND tracked; the default says ignored → WARN naming the mismatch
  {
    const dir = mkrepo('v40-graph-tracked', { ...CLEAN_NODE(), 'graphify-out/GRAPH_REPORT.md': GRAPH })
    ok((gitq(dir, 'ls-files', 'graphify-out') || '').length > 0, 'V40 · fixture: graphify-out/ is tracked')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-02')
    ok(row?.tag === 'WARN', `V40 · PLUG-02 is WARN when graphify-out/ is tracked but config says ignored (got ${row?.tag})`)
    ok(/tracked|ignored|mismatch/i.test(rowText(row)), `V40 · the row names the mismatch (${short(rowText(row))})`)
    ok(/tracked/i.test(rowText(row)) && /ignored/i.test(rowText(row)), 'V40 · naming both the expectation (ignored) and the finding (tracked)')
    ok(typeof row?.log === 'string' && LOG_RE.test(row.log), `V40 · the row carries the log path (${JSON.stringify(row?.log)})`)
    const log = readLog(dir, 'PLUG-02')
    ok(log !== null, `V40 · ${PLUG_LOG('PLUG-02')} exists`)
    ok(/graphify-out/.test(log || ''), 'V40 · the log records the path inspected')
    ok(/config/i.test(log || '') && /ignored/i.test(log || '') && /true/.test(log || ''), `V40 · the log records the config value (ignored: true) (${short(log, 100)})`)
    ok(/git/i.test(log || '') && /tracked/i.test(log || ''), 'V40 · the log records the git answer (tracked)')
    ok(r.status === 0, `V40 · a mismatch never changes the exit code (got ${r.status})`)
    ok(plugRows(r.j).filter(x => base(x.id) === 'PLUG-02').length === 1, 'V40 · and never a second row')
  }

  // (c) graphify-out/ present and gitignored; the default says ignored → PASS, no log
  {
    const dir = mkrepo('v40-graph-ignored', { ...CLEAN_NODE(), '.gitignore': '.env\nnode_modules/\ngraphify-out/\n' })
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': GRAPH })
    ok(gitq(dir, 'check-ignore', '-q', 'graphify-out/GRAPH_REPORT.md') === '' && gitq(dir, 'status', '--porcelain') === '', 'V40 · fixture: graphify-out/ is present and ignored')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-02')
    ok(row?.tag === 'PASS', `V40 · PLUG-02 is PASS with graphify-out/ present and gitignored (got ${row?.tag}: ${short(row?.detail)})`)
    ok(!!row && !fs.existsSync(logPath(dir, 'PLUG-02')), 'V40 · and no PLUG-02 log is written')
  }

  // (d) tdd.json present but gitignored; the default says tracked → WARN (the mismatch runs both ways)
  {
    const dir = mkrepo('v40-tdd-ignored', { ...CLEAN_NODE(), '.gitignore': '.env\nnode_modules/\ntdd.json\n' })
    writeAll(dir, { 'tdd.json': TDD })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'WARN', `V40 · PLUG-01 is WARN when tdd.json is ignored but config says tracked (got ${row?.tag})`)
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
      'baseline.config.json': pluginsConfig({ 'tdd-pi': { path: 'tools/tdd.json', ignored: false } }),
    })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'PLUG-01')
    ok(row?.tag === 'PASS', `V40 · PLUG-01 follows the configured path tools/tdd.json (got ${row?.tag}: ${short(row?.detail)})`)
  }

  // (g) D9: the okf bundle outside the repo — present, and the gitignore question is skipped → PASS
  {
    const dir = mkrepo('v40-okf-outside', CLEAN_NODE())
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
    const dir = mkrepo('v40-okf-inside', { ...CLEAN_NODE(), 'okf/baseline/rules/.keep': '' })
    const r = checkJson(dir, [], { BASELINE_OKF_BUNDLE: path.join(dir, 'okf') })
    const row = rowOf(r.j, 'PLUG-03')
    ok(row?.tag === 'WARN', `V40 · PLUG-03 is WARN with a tracked bundle inside the repo and config saying ignored (got ${row?.tag})`)
    const log = readLog(dir, 'PLUG-03') || ''
    ok(/okf/i.test(log) && /tracked/i.test(log), `V40 · the log records the bundle path and the git answer (${short(log, 100)})`)
  }
})

// ======================================================== D7 / V41: the artifact is never opened
section('V41', () => {
  // a byte-for-byte unparseable trio: not JSON, not markdown, not a bundle — only a reader would notice
  const GARBAGE = Buffer.from([0x00, 0xff, 0xfe, 0x7b, 0x01, 0x02, 0x00, 0x22, 0x5c, 0x0a, 0xc0, 0x80, 0x00, 0x7d, 0x7b, 0x7b])
  const bad = (name) => {
    const dir = mkrepo(name, { ...CLEAN_NODE(), '.gitignore': '.env\nnode_modules/\ngraphify-out/\n', 'tdd.json': GARBAGE })
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': GARBAGE })
    const bundle = mktmp(name + '-okf')
    fs.mkdirSync(path.join(bundle, 'baseline', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(bundle, 'baseline', 'rules', 'sec-01.json'), GARBAGE)
    fs.writeFileSync(path.join(bundle, 'index.json'), GARBAGE)
    return { dir, bundle }
  }
  const good = (name) => {
    const dir = mkrepo(name, { ...CLEAN_NODE(), '.gitignore': '.env\nnode_modules/\ngraphify-out/\n', 'tdd.json': '{"schema":"tdd/1","tests":[]}\n' })
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

// ======================================================== D12 / V42: the forge is closed under check and orient
section('V42', () => {
  const FORGE = ['GOV-01', 'GOV-02', 'OPS-07']
  // OPS-07 sits in the service pack (§5): activate it, so its n/a is D12's and not V15's
  const dir = mkrepo('v42', { ...CLEAN_NODE(), 'baseline.config.json': JSON.stringify({ project_type: 'service' }, null, 2) + '\n' })
  git(dir, 'remote', 'add', 'origin', 'https://github.com/red-fixture/does-not-exist.git')

  {
    const { sentinel, env } = ghBox('v42-check')
    const r = checkJson(dir, [], env)
    ok(!!r.j, `V42 · check --json produced a payload (exit ${r.status})`)
    for (const id of FORGE) {
      const row = rowOf(r.j, id)
      ok(!!row, `V42 · ${id} is carried in check --json`)
      ok(row?.state === 'n/a', `V42 · ${id} resolves state "n/a" under check (got ${JSON.stringify(row?.state ?? row?.tag)})`)
      ok(/forge not consulted/i.test(row?.reason || ''), `V42 · ${id} reason is "forge not consulted" (got ${JSON.stringify(row?.reason)})`)
      ok(row?.tag !== 'SKIP' && row?.tag !== 'WARN' && row?.tag !== 'FAIL', `V42 · ${id} is neither SKIP nor a finding under check (tag ${row?.tag})`)
    }
    ok(untouched(sentinel), `V42 · check never spawned gh (${short(readSentinel(sentinel).trim().replace(/\n/g, ' | ')) || 'none'})`)
    const human = cli(dir, ['check', '--repo', dir, '--no-exec'], env)
    ok(!FORGE.some(id => human.stdout.includes(id)), 'V42 · no forge rule is rendered to a human under check')
    ok(!/forge unreachable|\bgh not\b|\bgh auth\b/i.test(human.stdout), `V42 · and nothing pleads for gh (${short(human.stdout.match(/.*\bgh\b.*/)?.[0]) || '—'})`)
    ok(untouched(sentinel), 'V42 · the human render spawned no gh either')
  }

  {
    const { sentinel, env } = ghBox('v42-orient')
    const o = orientJson(dir, [], env)
    ok(o.status === 0, `V42 · orient exits 0 (got ${o.status})`)
    const rows = (o.j?.results || []).filter(x => FORGE.includes(base(x.id)))
    ok(rows.every(x => x.state === 'n/a' && /forge not consulted/i.test(x.reason || '')),
      `V42 · under orient the forge rules are absent or n/a "forge not consulted" (${rows.map(x => `${base(x.id)}=${x.state ?? x.tag}`).join(' ') || 'absent'})`)
    const forgeTouched = o.j?.planes?.forge?.available === true || o.j?.forgeAvailable === true || o.j?.source === 'forge'
    ok(!forgeTouched, `V42 · orient reports no forge plane (${JSON.stringify(o.j?.planes?.forge ?? o.j?.source ?? null).slice(0, 80)})`)
    ok(untouched(sentinel), `V42 · orient never spawned gh (${short(readSentinel(sentinel).trim().replace(/\n/g, ' | ')) || 'none'})`)
    const human = cli(dir, ['orient', '--repo', dir], env)
    ok(untouched(sentinel), 'V42 · nor does the human orient')
    ok(!/\bgh (pr|issue|auth)\b|forge unreachable/i.test(human.stdout), `V42 · orient never points at gh (${short(human.stdout.match(/.*\bgh\b.*/)?.[0]) || '—'})`)
  }

  // D12, second sentence: `admit` keeps the live probe — the forge is closed only under check/orient.
  // Its own fixture: admit refuses (usage, exit 2) before any probe unless a target resolves and a
  // descriptor sits at it, so the fixture carries both. `multi-lane` keeps the forge open (only
  // `multi-lane-local` closes it), and `--target main` resolves without a fetch.
  {
    const DESC = {
      schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype',
      workflow: 'multi-lane', anchoring: 'strict', ground_truth_boundary: { default_branch: 'main' },
      lanes: { namespace: 'lane/*', lease_ttl: '7d' }, join_keys: ['Baseline-Agent', 'Baseline-Issue'],
    }
    const adir = mkrepo('v42-admit', { ...CLEAN_NODE(), 'baseline.repo.json': JSON.stringify(DESC, null, 2) + '\n' })
    git(adir, 'remote', 'add', 'origin', 'https://github.com/red-fixture/does-not-exist.git')
    const { sentinel, env } = ghBox('v42-admit')
    const a = cli(adir, ['admit', '--repo', adir, '--target', 'main', '--json'], env)
    ok(!untouched(sentinel), `V42 · admit still consults the forge — gh is spawned there (D12) (${short(readSentinel(sentinel).trim().split('\n')[0]) || `nothing spawned; exit ${a.status}: ${short(a.stderr, 60)}`})`)
  }

  // the rules themselves say so: forge-sourced rules survive, and check/orient are not live contexts
  for (const id of FORGE) {
    const r = rules.find(x => base(x.id) === id)
    ok(!!r, `V42 · ${id} survives in the rule set`)
    ok(Array.isArray(r?.sources) && r.sources.includes('forge'), `V42 · ${id} is forge-sourced (${JSON.stringify(r?.sources)})`)
  }
})

cleanup()
process.exit(done() ? 1 : 0)
