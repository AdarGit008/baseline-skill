#!/usr/bin/env node
// RED — PLAN.md §3 "Delete 15 rules": V8, V9, V10, V11, V12.
//
// Every count here is DERIVED: 79 is (v2.5.0 rule count − the rules the §3 table drops),
// 9 is the length of §3's own named list. No spelled-out literal is compared against.
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, loadRuleSetAt, ROOT, cli, mkrepo, checkJson, idsOf,
  DELETED_PREFIXES, DELETED_IDS, isDeleted, ALWAYS_ON_BLOCKERS, PACK_OF, cleanup, FAKE_SECRET,
} from './_lib.mjs'

const { ok, done } = harness('deletions')
const { rules } = loadRuleSet()
const ids = rules.map(r => r.id)
let v25 = null; try { v25 = loadRuleSetAt('v2.5.0') } catch {}

// The pre-v3 rule set: the v2.5.0 tag PLUS whatever landed unreleased on top of it (CTX-13,
// CTX-14, FLOW-08, FLOW-09 at the time of writing). Deriving from the tag alone would
// under-count the deletion; deriving from HEAD alone goes tautological the moment v3 lands.
// The union is stable in both directions, so every count below can be checked forever.
const PRE = (() => {
  const byPrefix = new Map()
  for (const r of (v25?.rules || [])) byPrefix.set(r.id, r)
  for (const r of rules) byPrefix.set(r.id.replace(/^([A-Z]+-\d{2}).*/, '$1'), r)
  return [...byPrefix.values()].map(r => ({ ...r, id: r.id.replace(/^([A-Z]+-\d{2}).*/, '$1') }))
})()
const PRE_IDS = [...new Set(PRE.map(r => r.id))]

// ---------- V8: no FLOW-/DIV-/MERGE- rule exists ----------
{
  for (const p of DELETED_PREFIXES) {
    const hits = ids.filter(id => id.startsWith(p + '-'))
    ok(hits.length === 0, `V8 · no '${p}-' rule survives (${hits.length} found: ${hits.slice(0, 4).join(', ') || '—'})`)
  }
  // the module files themselves must be gone from the manifest too, or a re-add is one
  // line away and the loader's orphan guard (src/rules.mjs) would re-run them
  const { manifest } = loadRuleSet()
  const deadModules = (manifest.modules || []).filter(m => /\/(flow|div|merge)\.json$/.test(m))
  ok(deadModules.length === 0, `V8 · rules.json lists no flow/div/merge module (${deadModules.join(', ') || '—'})`)
  const onDisk = fs.existsSync(path.join(ROOT, 'rules'))
    ? fs.readdirSync(path.join(ROOT, 'rules')).filter(f => /^(flow|div|merge)\.json$/.test(f)) : []
  ok(onDisk.length === 0, `V8 · rules/ carries no flow/div/merge module on disk (${onDisk.join(', ') || '—'})`)
}

// ---------- V9: REC-01 and REC-04 do not exist ----------
{
  for (const id of DELETED_IDS) {
    const hit = ids.filter(x => x === id || x.startsWith(id + '-'))
    ok(hit.length === 0, `V9 · ${id} does not exist (${hit.join(', ') || '—'})`)
  }
}

// ---------- V10: deleting the rules deletes their machinery ----------
{
  // (a) the evaluator kinds that ONLY the deleted rules used, derived from v2.5.0
  const kindsOf = (c, out = []) => {
    if (!c || typeof c !== 'object') return out
    if (c.kind) out.push(c.kind)
    for (const s of c.checks || []) kindsOf(s, out)
    if (c.when) kindsOf(c.when, out)
    if (c.then) kindsOf(c.then, out)
    return out
  }
  let orphanKinds = []
  {
    const dead = new Set(), live = new Set()
    for (const r of PRE) for (const k of kindsOf(r.check)) (isDeleted(r.id) ? dead : live).add(k)
    orphanKinds = [...dead].filter(k => !live.has(k)).sort()
  }
  ok(orphanKinds.length > 0, `V10 · the deletion actually orphans evaluator kinds (derived ${orphanKinds.length} from the pre-v3 set)`)

  let CHECK_KINDS = null
  try { ({ CHECK_KINDS } = await import(path.join(ROOT, 'src', 'evaluators.mjs'))) } catch {}
  const stillRegistered = CHECK_KINDS ? orphanKinds.filter(k => CHECK_KINDS.has(k)) : orphanKinds
  ok(stillRegistered.length === 0,
    `V10 · no orphaned evaluator kind is still registered (${stillRegistered.length}: ${stillRegistered.slice(0, 5).join(', ') || '—'})`)

  // (b) and no src/ file still carries their implementation
  const srcFiles = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith('.mjs') && srcFiles.push(p) } }
  walk(path.join(ROOT, 'src'))
  const carriers = srcFiles.filter(f => { const t = fs.readFileSync(f, 'utf8'); return orphanKinds.some(k => t.includes(`'${k}'`)) })
  ok(carriers.length === 0,
    `V10 · no src/ module implements an orphaned kind (${carriers.map(f => path.relative(ROOT, f)).slice(0, 5).join(', ') || '—'})`)

  // (c) no src/ module is left unreachable from the two entry points — that is what
  //     "exists solely to serve a deleted rule" looks like after the rule is gone
  const entries = [path.join(ROOT, 'baseline.mjs'), path.join(ROOT, 'check.mjs')]
  const seen = new Set()
  const visit = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return
    seen.add(f)
    const t = fs.readFileSync(f, 'utf8')
    for (const m of t.matchAll(/from\s+'(\.[^']+)'|import\(\s*'(\.[^']+)'/g)) {
      const rel = m[1] || m[2]
      visit(path.resolve(path.dirname(f), rel))
    }
    // baseline.mjs's dynamic verb imports use `./src/x.mjs` literals; the regex above
    // catches them. A verb whose module vanished must also lose its branch (asserted below).
  }
  entries.forEach(visit)
  const unreachable = srcFiles.filter(f => !seen.has(f)).map(f => path.relative(ROOT, f))
  ok(unreachable.length === 0, `V10 · every src/ module is reachable from an entry point (dead: ${unreachable.join(', ') || '—'})`)

  // (d) the CLI verbs of the deleted workflow are gone. `lane claim/reclaim` exists to
  //     drive the lane namespace FLOW-04/06/07 policed; with those rules deleted it has
  //     no consumer left.
  const help = cli(ROOT, ['help'])
  ok(!/^\s*lane\s/m.test(help.stdout), 'V10 · `lane` is not an advertised verb')
  const laneRun = cli(ROOT, ['lane', 'claim', '7'])
  ok(laneRun.status === 2 && /unknown command/.test(laneRun.stderr), `V10 · \`baseline lane\` is an unknown command (got ${laneRun.status})`)
}

// ---------- V11: exactly 79 rules, exactly 9 always-on blockers, all counts derived ----------
{
  // the surviving set is exactly the pre-v3 set minus §3's fifteen — no survivor lost,
  // nothing extra crept in. The count follows from the sets; it is never typed in.
  const survivors = PRE_IDS.filter(id => !isDeleted(id)).sort()
  const nowPrefixes = [...new Set(rules.map(r => r.id.replace(/^([A-Z]+-\d{2}).*/, '$1')))].sort()
  const lost = survivors.filter(id => !nowPrefixes.includes(id))
  const crept = nowPrefixes.filter(id => !survivors.includes(id))
  ok(lost.length === 0 && crept.length === 0,
    `V11 · the rule set is exactly (pre-v3 ${PRE_IDS.length}) − (deleted ${PRE_IDS.filter(isDeleted).length}) = ${survivors.length}; got ${rules.length} (lost: ${lost.join(',') || '—'}; extra: ${crept.join(',') || '—'})`)
  ok(rules.length === survivors.length, `V11 · and the count agrees (${rules.length} vs ${survivors.length})`)
  // cross-check against PLAN §3's own arithmetic (94 − 15 = 79): two independent
  // derivations of the same number must land on the same answer.
  ok(PRE_IDS.length - PRE_IDS.filter(isDeleted).length === survivors.length && survivors.length === 79,
    `V11 · PLAN §3's arithmetic and the set derivation agree on ${survivors.length} (plan says 79)`)

  const alwaysOnBlockers = rules.filter(r => r.severity === 'blocker' && !r.pack).map(r => r.id)
  ok(alwaysOnBlockers.length === ALWAYS_ON_BLOCKERS.length,
    `V11 · always-on blockers = ${ALWAYS_ON_BLOCKERS.length} (got ${alwaysOnBlockers.length}: ${alwaysOnBlockers.slice(0, 12).join(' ')})`)

  // "every count printed anywhere is derived from the rule set, never literal"
  const sc = cli(ROOT, ['check', '--self-check'])
  const printed = (sc.stdout.match(/(\d+)\s+rules/) || [])[1]
  ok(printed !== undefined && Number(printed) === rules.length,
    `V11 · --self-check prints the derived rule count (printed ${printed}, set has ${rules.length})`)
  const installSh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
  ok(/loadRules\(\)\.rules\.length/.test(installSh), 'V11 · install.sh derives its rule count from loadRules(), never a literal')
}

// ---------- V12: only the 9 can produce a non-zero exit with no opt-in packs active ----------
{
  // data half — the always-on blocker set IS the §3 list, by id
  // (deleted rules are filtered out here only so the message stays legible — V8/V9 own them)
  const derived = new Set(rules.filter(r => r.severity === 'blocker' && !r.pack)
    .map(r => r.id.replace(/^([A-Z]+-\d{2}).*/, '$1')).filter(id => !isDeleted(id)))
  const missing = ALWAYS_ON_BLOCKERS.filter(id => !derived.has(id))
  const extra = [...derived].filter(id => !ALWAYS_ON_BLOCKERS.includes(id))
  ok(missing.length === 0 && extra.length === 0,
    `V12 · the always-on blocker set is exactly §3's nine (missing: ${missing.join(',') || '—'}; extra: ${extra.join(',') || '—'})`)

  // behavior half — a repo that trips several PACK blockers, with NO config file at all,
  // must still exit 0: nothing outside the nine may reach the exit code.
  const dir = mkrepo('v12', {
    'README.md': '# packs off\n',
    LICENSE: 'MIT-ish red fixture (not a real grant).\n',
    'package.json': '{"name":"v12","version":"0.0.0","private":true}\n',
    '.github/workflows/ci.yml': 'name: ci\non: [push]\npermissions: read-all\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n',
    'test/t.test.js': '// test\n',
    '.gitignore': '.env\n',
    // decisions pack bait: two records claiming the same number (CTX-14, a pack blocker)
    'docs/decisions/0001-first.md': '# ADR-0001: first\n\nStatus: Accepted\n',
    'docs/decisions/0001-again.md': '# ADR-0001: again\n\nStatus: Accepted\n',
    // claims pack bait: a register that is present but empty (CLAIM-00..03, pack blockers)
    'docs/CLAIMS.json': '{}\n',
    // descriptor pack bait: an invalid descriptor (DESC-02, a pack blocker)
    'baseline.repo.json': '{ not json\n',
  })
  const r = checkJson(dir)
  const blocking = (r.j?.results || []).filter(x => x.severity === 'blocker' && (x.tag === 'FAIL' || x.tag === 'DIVERGED'))
  const outside = blocking.filter(x => !ALWAYS_ON_BLOCKERS.includes(x.id.replace(/^([A-Z]+-\d{2}).*/, '$1')))
  ok(outside.length === 0,
    `V12 · with no config, no rule outside the nine blocks (offenders: ${outside.map(x => x.id).join(', ') || '—'})`)
  ok(r.status === 0, `V12 · the pack-bait repo exits 0 with every pack off (got ${r.status})`)
  const seen = idsOf(r.j)
  ok(![...seen].some(id => PACK_OF.get(id.replace(/^([A-Z]+-\d{2}).*/, '$1'))),
    'V12 · and no pack rule appears in the payload at all')

  // the nine themselves must still be able to block: same repo, one always-on blocker broken
  const dir2 = mkrepo('v12b', { 'README.md': '# no license\n', 'package.json': '{"name":"x","private":true}\n', 'src/keys.js': `export const K = '${FAKE_SECRET}'\n` })
  const r2 = checkJson(dir2)
  ok(r2.status === 1, `V12 · an always-on blocker still fails CI (got ${r2.status})`)
}

cleanup()
process.exit(done() ? 1 : 0)
