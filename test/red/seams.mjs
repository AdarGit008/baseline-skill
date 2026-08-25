#!/usr/bin/env node
// RED — PLAN.md §1 "The four-part shape" (V1–V4) and §7 "The three seams" (V21–V28).
//
// One file, because these twelve invariants are one subject: what baseline may take from
// tdd-pi / okf-rag / graphify, and what it must still do when none of them is there.
//
// Seam contracts this file pins (PLAN.md names the seams but not their spellings; the
// test is the authority, so it fixes them):
//   · tdd.json      { schema:'tdd/1', source_commit, tests:[{id,state:'red'|'green',covers:[RULE-ID]}] }
//   · graphify-out/GRAPH_REPORT.md  carries a `Built from commit: <sha>` line (PLAN §7.2)
//   · the okf bundle is addressed by BASELINE_OKF_BUNDLE=<dir>, laid out by concept id
//     ("baseline/rules/<lowercased rule id>.json") — PLAN §7.3's own concept spelling
//   · `baseline explain <rule-id> [--json] [--audit] [--propose --out DIR]`
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, ROOT, mkrepo, checkJson, orientJson, cli, git, rowOf, idsOf,
  mktmp, stubBin, writeAll, CLEAN_NODE, SIGNOFF_FIVE, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('seams')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const fullId = (b) => (rules.find(r => base(r.id) === b) || {}).id || b
const conceptOf = (id) => `baseline/rules/${id.toLowerCase()}`

// a bundle laid out by concept id; `omit` drops one concept so V27 can prove the audit bites
function mkbundle(name, omit = null) {
  const dir = mktmp(name)
  for (const r of rules) {
    if (omit && base(r.id) === omit) continue
    const p = path.join(dir, conceptOf(r.id) + '.json')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ id: conceptOf(r.id), title: r.title, body: `Why ${r.id} matters, at length.` }, null, 2) + '\n')
  }
  return dir
}
const treeHash = (dir) => {
  const out = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(path.relative(dir, p) + ':' + fs.readFileSync(p, 'utf8').length) } }
  walk(dir); return out.join('\n')
}

// ======================================================== §1 the four-part shape
// ---------- V1: file contracts only; the runner stays zero-dependency ----------
{
  const srcFiles = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(\.git|node_modules|test|docs)$/.test(e.name)) walk(p) } else if (p.endsWith('.mjs')) srcFiles.push(p) } }
  walk(ROOT)
  // import specifiers only: a static `... from '<spec>'`, a bare `import '<spec>'`, or a
  // dynamic `import('<spec>')`. Anchored per line and quote-tight, so the word "from"
  // inside ordinary code can never be read as an import (it once matched src/jdg.mjs).
  const SPEC_RES = [/^\s*(?:import|export)\b[^'"\n]*\bfrom\s*['"]([^'"\n]+)['"]/, /^\s*import\s*['"]([^'"\n]+)['"]/, /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/]
  const specs = []
  for (const f of srcFiles) for (const line of fs.readFileSync(f, 'utf8').split('\n')) for (const re of SPEC_RES) { const m = line.match(re); if (m) specs.push([path.relative(ROOT, f), m[1]]) }

  const vendorImports = specs.filter(([, s]) => /tdd[-_]?pi|okf[-_]?rag|graphify/i.test(s))
  ok(vendorImports.length === 0,
    `V1 · no module imports vendor code (${vendorImports.map(x => x.join(' -> ')).join(', ') || '—'})`)

  const nonLocal = specs.filter(([, s]) => !s.startsWith('.') && !s.startsWith('node:'))
  ok(nonLocal.length === 0, `V1 · every import is relative or a node: builtin (${nonLocal.map(x => x.join(' -> ')).join(', ') || '—'})`)

  const pkgPath = path.join(ROOT, 'package.json')
  const deps = fs.existsSync(pkgPath) ? Object.keys(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies || {}) : []
  ok(deps.length === 0, `V1 · the runner declares no runtime dependencies (${deps.join(', ') || '—'})`)

  // the other half of the contract: the seams must actually be reached, and reached as FILES
  const corpus = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  ok(/['"]tdd\.json['"]/.test(corpus), "V1 · the tdd-pi seam is a file path ('tdd.json') in the runner")
  ok(/graphify-out/.test(corpus), "V1 · the graphify seam is a directory path ('graphify-out/') in the runner")
  ok(/BASELINE_OKF_BUNDLE|okf/i.test(corpus), 'V1 · the okf seam is addressed by path/env in the runner')
}

// ---------- V2: a complete, correct verdict with all three vendors absent ----------
{
  const dir = mkrepo('v2', CLEAN_NODE())
  for (const p of ['tdd.json', 'graphify-out', 'okf']) ok(!fs.existsSync(path.join(dir, p)), `V2 · fixture has no ${p}`)
  const r = checkJson(dir)
  ok(!!r.j, 'V2 · a payload is produced with every vendor absent')
  ok(r.j?.vendors && ['tdd', 'okf', 'graph'].every(k => r.j.vendors[k] === 'n/a'),
    `V2 · the payload reports every vendor n/a (got ${JSON.stringify(r.j?.vendors)})`)
  const noisy = (r.j?.results || []).filter(x => /tdd|okf|graphify|knowledge graph/i.test(`${x.id} ${x.detail}`))
  ok(noisy.length === 0, `V2 · absence is neither a failure nor a warning in any row (${noisy.map(x => x.id).join(', ') || '—'})`)
  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  ok(!/tdd\.json|graphify|okf/i.test(human.stdout), 'V2 · and the human render never mentions a missing vendor')
  ok(r.status === 0, `V2 · a clean repo with no vendors is build-ready (exit ${r.status})`)
}

// ---------- V3: a verdict never depends on a retrieval ----------
{
  const dir = mkrepo('v3', CLEAN_NODE())
  const bundle = mkbundle('v3-bundle')
  const strip = (j) => JSON.stringify((j?.results || []).map(x => ({ id: x.id, tag: x.tag, detail: x.detail })))
  const none = checkJson(dir)
  const withB = checkJson(dir, [], { BASELINE_OKF_BUNDLE: bundle })
  const broken = checkJson(dir, [], { BASELINE_OKF_BUNDLE: path.join(bundle, 'does-not-exist') })
  ok(strip(none.j) === strip(withB.j), 'V3 · a reachable okf bundle changes no verdict')
  ok(strip(none.j) === strip(broken.j), 'V3 · an unreachable okf bundle changes no verdict')
  ok(none.status === withB.status && none.status === broken.status,
    `V3 · and no exit code (${none.status}/${withB.status}/${broken.status})`)

  // the seam must nevertheless be real — if retrieval changes nothing anywhere, it is not wired
  const id = fullId('SEC-01')
  const e1 = cli(dir, ['explain', id])
  const e2 = cli(dir, ['explain', id], { BASELINE_OKF_BUNDLE: bundle })
  ok(e1.status === 0 && e2.status === 0, `V3 · explain exits 0 both ways (${e1.status}/${e2.status})`)
  ok(e1.stdout !== e2.stdout, 'V3 · retrieval DOES enrich the explanation (the seam is wired, it just cannot vote)')
}

// ---------- V4: baseline never writes to the OKF bundle ----------
{
  const dir = mkrepo('v4', CLEAN_NODE())
  const bundle = mkbundle('v4-bundle')
  const before = treeHash(bundle)
  const env = { BASELINE_OKF_BUNDLE: bundle }
  cli(dir, ['check', '--repo', dir, '--no-exec'], env)
  cli(dir, ['orient', '--repo', dir], env)
  cli(dir, ['explain', fullId('SEC-01')], env)
  ok(treeHash(bundle) === before, 'V4 · check/orient/explain leave the bundle byte-for-byte unchanged')

  const staging = path.join(mktmp('v4-staging'), 'proposed')
  const p = cli(dir, ['explain', fullId('CTX-12'), '--propose', '--out', staging], env)
  ok(p.status === 0, `V4 · a proposed concept can be staged (exit ${p.status}: ${(p.stderr || '').slice(0, 80)})`)
  // hand-rolled walk: recursive readdirSync is Node 20+, and the runner targets Node >= 18
  const filesUnder = (root) => { const out = []; const w = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? w(p) : out.push(path.relative(root, p)) } }; w(root); return out }
  const written = filesUnder(staging)
  ok(written.length === 1, `V4 · exactly one proposed concept file is written (${written.length}: ${written.join(', ') || '—'})`)
  ok(!path.resolve(staging).startsWith(path.resolve(bundle) + path.sep), 'V4 · the staging path is outside the bundle')
  ok(treeHash(bundle) === before, 'V4 · and --propose still writes nothing into the bundle')
}

// ======================================================== §7.1 tdd.json
const TDD = (sha, tests) => JSON.stringify({ schema: 'tdd/1', source_commit: sha, tests }, null, 2) + '\n'

// ---------- V21: a red test is the evidence; no ledger entry needed ----------
{
  const covers = SIGNOFF_FIVE
  const tests = covers.map((id, i) => ({ id: `T-${String(i + 1).padStart(3, '0')}`, state: 'red', covers: [id], title: `red test proving ${id}` }))
  const dir = mkrepo('v21', {
    ...CLEAN_NODE(),
    'docs/CLAIMS.json': JSON.stringify({ claims: [] }, null, 2) + '\n',
    'baseline.config.json': JSON.stringify({ makes_external_claims: true, profiles: ['advanced'] }, null, 2) + '\n',
    'tdd.json': TDD('PLACEHOLDER', tests),
  })
  const sha = git(dir, 'rev-parse', 'HEAD')
  writeAll(dir, { 'tdd.json': TDD(sha, tests) })
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'stamp tdd.json')
  ok(!fs.existsSync(path.join(dir, 'records')), 'V21 · the fixture carries no ledger at all')

  const r = checkJson(dir)
  for (const id of covers) {
    const row = rowOf(r.j, id)
    ok(!!row, `V21 · ${id} is evaluated when tdd.json covers it`)
    ok(row?.tag === 'PASS', `V21 · ${id} resolves by evidence, not by ledger (tag ${row?.tag})`)
    ok(row && row.tag !== 'SIGN-OFF', `V21 · ${id} is no longer a sign-off row`)
    ok(/T-\d{3}/.test(row?.detail || ''), `V21 · ${id} names the red test that proves it (${(row?.detail || '').slice(0, 70)})`)
  }
  ok(r.j?.vendors?.tdd && r.j.vendors.tdd !== 'n/a', `V21 · the payload reports the tdd seam as present (${r.j?.vendors?.tdd})`)
}

// ---------- V22: no tdd.json -> all five are n/a, never a WARN, never a nag ----------
{
  const dir = mkrepo('v22', {
    ...CLEAN_NODE(),
    'docs/CLAIMS.json': JSON.stringify({ claims: [] }, null, 2) + '\n',
    // packs deliberately ON, so the five are not silenced by V15 instead of by V22
    'baseline.config.json': JSON.stringify({ makes_external_claims: true, profiles: ['advanced'] }, null, 2) + '\n',
  })
  const r = checkJson(dir)
  const present = SIGNOFF_FIVE.filter(id => rowOf(r.j, id))
  ok(present.length === 0, `V22 · none of the five appears with no tdd.json (${present.join(', ') || '—'})`)
  const nag = (r.j?.results || []).filter(x => /tdd|sign[- ]off ledger|no evidence/i.test(x.detail || ''))
  ok(nag.length === 0, `V22 · and nothing nags about the missing DB (${nag.map(x => x.id).join(', ') || '—'})`)
  ok(r.j?.vendors?.tdd === 'n/a', `V22 · the vendor line says n/a (${r.j?.vendors?.tdd})`)
}

// ---------- V23: baseline never checks whether TDD was followed ----------
{
  const idsAndSlugs = rules.map(r => r.id.toLowerCase()).join(' ')
  ok(!/\btdd\b|red-test|test-first|wrote-the-test/.test(idsAndSlugs),
    'V23 · no rule id/slug asserts a red test as such')
  const kinds = new Set(rules.map(r => r.check?.kind).filter(Boolean))
  ok(![...kinds].some(k => /red-test|tdd/i.test(k)), `V23 · no evaluator kind is "a red test exists" (${[...kinds].filter(k => /red-test|tdd/i.test(k)).join(', ') || '—'})`)

  // the positive half: the five assert a falsifiable criterion, and a red test is ONE
  // accepted form among several
  for (const id of SIGNOFF_FIVE) {
    const r = rules.find(x => base(x.id) === id)
    ok(!!r, `V23 · ${id} survives`)
    const accepts = r?.check?.accepts
    ok(Array.isArray(accepts) && accepts.includes('red-test') && accepts.length > 1,
      `V23 · ${id} declares a red test as one accepted form among ${Array.isArray(accepts) ? accepts.length : 0} (${JSON.stringify(accepts)})`)
    ok(r?.check?.kind === 'falsifiable-criterion',
      `V23 · ${id} checks for a falsifiable criterion, not for a test file (kind ${r?.check?.kind})`)
  }
}

// ======================================================== §7.2 graphify-out/
// ---------- V24 / V25: fresh, stale, or absent — a suggestion, never a finding ----------
{
  const report = (sha) => `# GRAPH_REPORT\n\nBuilt from commit: ${sha}\n`
  const cases = []
  {
    const dir = mkrepo('v24-absent', CLEAN_NODE())
    cases.push(['absent', dir])
  }
  {
    const dir = mkrepo('v24-fresh', CLEAN_NODE())
    const sha = git(dir, 'rev-parse', 'HEAD')
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': report(sha) }) // gitignored in real life: never committed
    cases.push(['fresh', dir])
  }
  {
    const dir = mkrepo('v24-stale', CLEAN_NODE())
    writeAll(dir, { 'graphify-out/GRAPH_REPORT.md': report('0'.repeat(40)) })
    cases.push(['stale', dir])
  }
  for (const [want, dir] of cases) {
    const o = orientJson(dir)
    ok(o.status === 0, `V24 · orient exits 0 with a ${want} graph (got ${o.status})`)
    ok(o.j?.graph?.state === want, `V24 · orient reports the graph as '${want}' (got ${JSON.stringify(o.j?.graph)})`)
    const c = checkJson(dir)
    ok(c.j?.vendors?.graph === (want === 'absent' ? 'n/a' : want),
      `V24 · check's vendor line agrees (${c.j?.vendors?.graph})`)
    if (want !== 'fresh') {
      const sugg = (o.j?.suggestions || []).filter(s => /graph/i.test(typeof s === 'string' ? s : JSON.stringify(s)))
      ok(sugg.length > 0, `V25 · a ${want} graph produces a suggestion (${JSON.stringify(o.j?.suggestions || []).slice(0, 90)})`)
      const find = (o.j?.findings || []).filter(f => /graph/i.test(typeof f === 'string' ? f : JSON.stringify(f)))
      ok(find.length === 0, `V25 · and never a finding (${JSON.stringify(find).slice(0, 90)})`)
      const cRows = (c.j?.results || []).filter(x => /graph/i.test(`${x.id} ${x.detail}`))
      ok(cRows.length === 0, `V25 · nor a check result row (${cRows.map(x => x.id).join(', ') || '—'})`)
    }
  }
}

// ======================================================== §7.3 get_knowledge()
// ---------- V26: with okf-rag unreachable, explain prints the title and exits 0 ----------
{
  const dir = mkrepo('v26', CLEAN_NODE())
  const id = fullId('SEC-01')
  const rule = rules.find(r => base(r.id) === 'SEC-01')
  const gone = path.join(mktmp('v26-nobundle'), 'nope')

  for (const [label, env] of [['no bundle configured', {}], ['bundle path missing', { BASELINE_OKF_BUNDLE: gone }]]) {
    const e = cli(dir, ['explain', id], env)
    ok(e.status === 0, `V26 · explain exits 0 (${label}) — got ${e.status}: ${(e.stderr || '').slice(0, 80)}`)
    ok(rule && e.stdout.includes(rule.title), `V26 · and prints the rule's one-line title (${label})`)
    ok(e.stdout.split('\n').filter(Boolean).length <= 3, `V26 · the degrade path is terse (${label}: ${e.stdout.split('\n').filter(Boolean).length} lines)`)
  }

  // an okf helper that exists but fails must also degrade, not crash or hang
  const box = mktmp('v26-bin'); const sentinel = path.join(box, 'calls.log')
  const bin = stubBin(box, 'okf', sentinel)
  fs.writeFileSync(path.join(bin, 'okf'), '#!/bin/sh\nexit 7\n'); fs.chmodSync(path.join(bin, 'okf'), 0o755)
  const e3 = cli(dir, ['explain', id], { PATH: `${bin}${path.delimiter}${process.env.PATH}` })
  ok(e3.status === 0, `V26 · a failing okf helper still exits 0 (got ${e3.status})`)
}

// ---------- V27: every rule id resolves to an OKF concept id, offline ----------
{
  const dir = mkrepo('v27', CLEAN_NODE())
  const full = mkbundle('v27-full')
  const a = cli(dir, ['explain', '--audit', '--json'], { BASELINE_OKF_BUNDLE: full })
  let aj = null; try { aj = JSON.parse(a.stdout) } catch {}
  ok(a.status === 0, `V27 · the audit passes against a complete bundle (exit ${a.status}: ${(a.stderr || '').slice(0, 80)})`)
  ok(aj && Array.isArray(aj.missing) && aj.missing.length === 0, `V27 · nothing missing (${JSON.stringify(aj?.missing || null)})`)
  ok(aj && aj.map && Object.keys(aj.map).length === rules.length,
    `V27 · the map is total over the rule set (${Object.keys(aj?.map || {}).length}/${rules.length})`)
  const wrong = aj?.map ? Object.entries(aj.map).filter(([id, c]) => c !== conceptOf(id)) : [['(no map)', '']]
  ok(wrong.length === 0, `V27 · every rule maps to baseline/rules/<lowercased id> (${wrong.slice(0, 3).map(x => x.join('->')).join(', ')})`)
  ok(aj && new Set(Object.values(aj.map || {})).size === rules.length, 'V27 · and the mapping is injective')

  const holed = mkbundle('v27-holed', 'CTX-12')
  const b = cli(dir, ['explain', '--audit', '--json'], { BASELINE_OKF_BUNDLE: holed })
  let bj = null; try { bj = JSON.parse(b.stdout) } catch {}
  ok(b.status === 1, `V27 · a bundle with a hole fails the audit (exit ${b.status})`)
  ok(bj && (bj.missing || []).length === 1 && String(bj.missing[0]).includes('ctx-12'),
    `V27 · and names exactly the unresolved concept (${JSON.stringify(bj?.missing || null)})`)

  // offline: the audit spawns nothing
  const box = mktmp('v27-bin'); const sentinel = path.join(box, 'calls.log')
  let bin = null; for (const t of ['gh', 'curl', 'wget', 'okf']) bin = stubBin(box, t, sentinel)
  cli(dir, ['explain', '--audit', '--json'], { BASELINE_OKF_BUNDLE: full, PATH: `${bin}${path.delimiter}${process.env.PATH}` })
  ok(!fs.existsSync(sentinel), 'V27 · the audit is offline — no process spawned')
}

// ---------- V28: no get_knowledge result is read during check ----------
{
  const dir = mkrepo('v28', CLEAN_NODE())
  const bundle = mkbundle('v28-bundle')
  const box = mktmp('v28-bin'); const sentinel = path.join(box, 'calls.log')
  let bin = null; for (const t of ['okf', 'okf-rag', 'get_knowledge', 'gh', 'curl']) bin = stubBin(box, t, sentinel)
  const env = { BASELINE_OKF_BUNDLE: bundle, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  const r = checkJson(dir, [], env)
  ok(!fs.existsSync(sentinel),
    `V28 · check consulted no knowledge helper (${fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8').trim() : 'none'})`)
  ok(r.j?.provenance?.knowledge === 'not-consulted',
    `V28 · and says so on the record (provenance.knowledge = ${JSON.stringify(r.j?.provenance?.knowledge)})`)
  // explain, by contrast, is allowed to read it — otherwise 'not-consulted' is vacuous
  const e = cli(dir, ['explain', fullId('SEC-01'), '--json'], env)
  let ej = null; try { ej = JSON.parse(e.stdout) } catch {}
  ok(ej && ej.knowledge && ej.knowledge !== 'not-consulted',
    `V28 · explain DOES consult it (${JSON.stringify(ej?.knowledge)})`)
}

// ---------- V25: local optional state must not reach a blocker (agent C's finding) ----------
// CTX-05 (md-links) has no `tracked_only` in rules/ctx.json, so match() walks UNTRACKED
// files too. graphify-out/ is gitignored by design (both vendor repos ignore it), and
// GRAPH_REPORT.md links to per-community node pages that do not exist as files. Today
// that flips a BLOCKER to FAIL and the exit code to 1 — a local, optional, regenerable
// artifact gating CI is exactly the enforcer behaviour v3 exists to remove.
{
  const dir = mkrepo('graph-links', {
    ...CLEAN_NODE(),
    '.gitignore': '.env\nnode_modules/\ngraphify-out/\n',
  })
  writeAll(dir, {
    'graphify-out/GRAPH_REPORT.md':
      '# Graph Report\n\nBuilt from commit: ' + '0'.repeat(40) +
      '\n\n## Community Hubs\n\n- [digestor](communities/digestor.md)\n- [pipeline](communities/pipeline.md)\n',
  })
  const r = checkJson(dir)
  const ctx05 = rowOf(r.j, 'CTX-05')
  ok(!ctx05 || ctx05.tag !== 'FAIL',
    `V25 · a gitignored graphify-out/ never fails CTX-05 (tag ${ctx05 ? ctx05.tag : 'absent'})`)
  ok(r.status === 0,
    `V25 · and never changes the exit code (got ${r.status})`)
  const mentions = (r.j?.results || []).filter(x => /graphify-out/.test(String(x.detail || '')))
  ok(mentions.length === 0,
    `V25 · no finding cites a path inside graphify-out/ (${mentions.map(x => x.id).join(', ') || '—'})`)
}

cleanup()
process.exit(done() ? 1 : 0)
