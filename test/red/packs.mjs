#!/usr/bin/env node
// RED — PLAN.md §5 "Five opt-in packs": V15, V16 — SUPERSEDED by the v4 rule-set cut.
//
// §5 gave five opt-in packs, each activated by an explicit config switch. The v4 execution
// model deletes them: CI runs ONE script over repo files and AND-gates every rule to a
// single exit code, so a rule is either in the set or it is not. Two opt-ins survive, and
// neither is a pack: the trust circle (the plugins a repo has adopted — PLUG-01..03,
// always-on blockers gated by membership) and the baseline rules layer (every other rule,
// in by default, opted out as one layer — layer.mjs V44).
//
// So V15 and V16 invert. V15: no pack rule exists to leak, and no amount of pack BAIT in
// the tree changes what runs. V16: no config switch — makes_external_claims, decision_globs,
// project_type, profiles, packs, --profile — activates anything, because there is nothing
// to activate; the rule set is identical under every one of them.
import * as lib from './_lib.mjs'
import {
  harness, loadRuleSet, ROOT, mkrepo, checkJson, cli, idsOf, rowOf,
  PACKS, PACK_OF, CLEAN_NODE, TRUSTED_NODE, plantGraph, okfEnv, SURVIVING_IDS, cleanup,
} from './_lib.mjs'
import fs from 'node:fs'
import path from 'node:path'

const { ok, done } = harness('packs')
const { rules, manifest } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const byBase = new Map(rules.map(r => [base(r.id), r]))
const PLUG_IDS = lib.PLUG_IDS ?? ['PLUG-01', 'PLUG-02', 'PLUG-03']
const isNA = (x) => x?.state === 'n/a' || x?.tag === 'n/a' || x?.tag === 'N/A'

// ---------- the pack mechanism is gone from the data ----------
{
  ok(Object.keys(PACKS).length === 0, `§5 · the suite's pack table is empty (${Object.keys(PACKS).join(', ') || '—'})`)
  ok(PACK_OF.size === 0, '§5 · and no id maps to a pack')
  const packed = rules.filter(r => r.pack != null).map(r => `${r.id}:${r.pack}`)
  ok(packed.length === 0, `§5 · no rule declares a pack (${packed.join(', ') || '—'})`)
  ok(manifest && manifest.packs && Object.keys(manifest.packs).length === 0,
    `§5 · rules.json's packs map is empty (${JSON.stringify(Object.keys(manifest?.packs ?? {}))})`)
  // the pack-only categories went with their packs
  for (const dead of ['claim', 'desc', 'ops', 'qual', 'rec', 'repro', 'test', 'comm']) {
    ok(!fs.existsSync(path.join(ROOT, 'rules', `${dead}.json`)), `§5 · rules/${dead}.json is deleted`)
    ok(!(manifest?.modules || []).includes(`rules/${dead}.json`), `§5 · rules.json no longer registers rules/${dead}.json`)
  }
  // rules/ctx.json is the one deleted module whose FILENAME came back — the v4 review
  // scratched all twelve CTX rules and then commissioned five new ones under the same
  // category. So the assertion moves from "the file is gone" to the thing the file being
  // gone was standing in for: not one of the deleted CTX rules is back, and the module
  // holds the five new ids and nothing else. That is strictly harder to satisfy than an
  // absent file, which any typo could have produced.
  {
    const ctxRel = 'rules/ctx.json'
    const onDisk = fs.existsSync(path.join(ROOT, ctxRel))
    ok(onDisk && (manifest?.modules || []).includes(ctxRel), `§5 · ${ctxRel} is back — as the v4/ctx module, registered in rules.json (disk ${onDisk}, manifest ${(manifest?.modules || []).includes(ctxRel)})`)
    let mod = null; try { mod = JSON.parse(fs.readFileSync(path.join(ROOT, ctxRel), 'utf8')) } catch {}
    const got = (mod?.rules || []).map(r => base(r.id)).sort()
    ok(JSON.stringify(got) === JSON.stringify([...lib.CTX_IDS].sort()), `§5 · and it holds exactly ${lib.CTX_IDS.join(', ')} (got ${got.join(', ') || '—'})`)
    const resurrected = got.filter(id => Number(id.slice(-2)) <= 14)
    ok(resurrected.length === 0, `§5 · not one of the twelve scratched CTX rules is back (${resurrected.join(', ') || '—'})`)
    ok((mod?.rules || []).every(r => r.category === 'context'), `§5 · every rule in the module is category 'context'`)
  }
}

// ---------- V15: pack BAIT in the tree changes nothing ----------
{
  const BAIT = {
    'docs/decisions/0001-a.md': '# ADR-0001: a\n\nStatus: Accepted\n',
    'docs/decisions/0001-b.md': '# ADR-0001: b\n\nStatus: Draft\n',
    'docs/CLAIMS.json': '{}\n',
    'records/claims/CLM-0001.json': '{"record":"claim/1"}\n',
    'services/api/server.js': 'export const s = 1\n',
    'Dockerfile': 'FROM node:22\n',
  }
  const bait = mkrepo('v15', { ...TRUSTED_NODE(), ...BAIT }); plantGraph(bait)
  const OKF = okfEnv('v15-okf')
  const r = checkJson(bait, [], OKF)
  ok(!!r.j, 'V15 · the bait repo produced a JSON payload')
  const seen = [...idsOf(r.j)].map(base)
  const stranger = seen.filter(id => !SURVIVING_IDS.includes(id))
  ok(stranger.length === 0, `V15 · every row is one of the eight surviving rules — bait activates nothing (${stranger.join(', ') || '—'})`)

  // The trust circle is an opt-in, and it is NOT a pack: a PLUG rule declares no
  // pack and no --profile reaches it. What decides whether it is evaluated is membership —
  // this fixture's baseline.config.json names all three (TRUSTED_NODE), so all three are
  // evaluated. The unadopted half (n/a, no exit code) is pinned by plugins.mjs V43.
  for (const id of PLUG_IDS) {
    const rule = byBase.get(id)
    const row = rowOf(r.j, id)
    ok(!!rule && rule.pack == null && !!row && !isNA(row),
      `V15 · ${id} is in no pack and is evaluated because the config ADOPTED it (rule ${rule ? 'present' : 'missing'}, row ${row ? (row.state ?? row.tag) : 'missing'})`)
  }

  const human = cli(bait, ['check', '--repo', bait, '--no-exec'], OKF)
  const ghosts = ['CLAIM-', 'CTX-', 'DESC-', 'OPS-', 'QUAL-', 'REPRO-', 'TEST-', 'COMM-', 'REC-'].filter(p => human.stdout.includes(p))
  ok(ghosts.length === 0, `V15 · the human render names no deleted family (${ghosts.join(', ') || '—'})`)
  ok(r.status === 0, `V15 · a fully-stocked repo carrying nothing but bait exits 0 (got ${r.status})`)
}

// ---------- V16: no config switch activates anything ----------
{
  const BAIT = {
    'docs/decisions/0001-a.md': '# ADR-0001: a\n\nStatus: Accepted\n',
    'services/api/server.js': 'export const s = 1\n',
    'Dockerfile': 'FROM node:22\n',
  }
  // the reference: the ids a fully-stocked repo evaluates with NO config file
  const refDir = mkrepo('v16-ref', { ...TRUSTED_NODE(), ...BAIT }); plantGraph(refDir)
  const refEnv = okfEnv('v16-ref-okf')
  const refRun = checkJson(refDir, [], refEnv)
  const REF = [...idsOf(refRun.j)].map(base).sort()
  ok(REF.length > 0 && refRun.status === 0, `V16 · the reference run is green and non-empty (${REF.length} rows, exit ${refRun.status})`)

  const cases = [
    ['makes_external_claims:true', { makes_external_claims: true }],
    ['decision_globs', { decision_globs: ['docs/decisions/*.md'] }],
    ['project_type:service', { project_type: 'service' }],
    ['profiles:["descriptor"]', { profiles: ['descriptor'] }],
    ['profiles:["advanced"]', { profiles: ['advanced'] }],
    ['profiles:["claims"]', { profiles: ['claims'] }],
    ['packs:["service"]', { packs: ['service'] }],
    ['profiles:["decisions"]', { profiles: ['decisions'] }],
  ]
  for (const [label, cfg] of cases) {
    const dir = mkrepo(`v16-${label.replace(/[^a-z0-9]+/gi, '-')}`, {
      ...TRUSTED_NODE(), ...BAIT, 'baseline.config.json': JSON.stringify(cfg, null, 2) + '\n',
    })
    plantGraph(dir)
    const r = checkJson(dir, [], okfEnv('v16-okf'))
    const got = [...idsOf(r.j)].map(base).sort()
    // project_type narrows applies_to, so compare on the surviving-set membership, not equality
    const stranger = got.filter(id => !SURVIVING_IDS.includes(id))
    ok(stranger.length === 0, `V16 · ${label} activates no rule outside the eight (${stranger.join(', ') || '—'})`)
    ok(r.status === 0, `V16 · ${label} does not change the exit code (got ${r.status})`)
  }

  // `--profile <pack>` is now a no-op flag: it must not add a row and must not error
  {
    const dir = mkrepo('v16-profile-flag', { ...TRUSTED_NODE(), ...BAIT }); plantGraph(dir)
    const r = checkJson(dir, ['--profile', 'claims'], okfEnv('v16-flag-okf'))
    const got = [...idsOf(r.j)].map(base).sort()
    ok(JSON.stringify(got) === JSON.stringify(REF), `V16 · --profile claims changes nothing (${got.join(',')} vs ${REF.join(',')})`)
    ok(r.status === 0, `V16 · --profile claims is accepted and exits 0 (got ${r.status})`)
  }

  // a valid descriptor declaring type:service activates nothing either
  {
    const desc = {
      schema_version: 1, type: 'service', lifecycle: 'production', maturity: 'released',
      workflow: 'trunk', anchoring: 'strict', ground_truth_boundary: { default_branch: 'main' },
    }
    const dir = mkrepo('v16-desc-type', {
      ...TRUSTED_NODE(), 'services/api/server.js': 'export const s = 1\n',
      'baseline.repo.json': JSON.stringify(desc, null, 2) + '\n',
    })
    plantGraph(dir)
    const r = checkJson(dir, [], okfEnv('v16-desc-okf'))
    const stranger = [...idsOf(r.j)].map(base).filter(id => !SURVIVING_IDS.includes(id))
    ok(!!r.j && stranger.length === 0, `V16 · a descriptor type activates nothing (${stranger.slice(0, 4).join(', ') || '—'})`)
  }
}

cleanup()
process.exit(done() ? 1 : 0)
