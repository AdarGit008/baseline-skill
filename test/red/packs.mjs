#!/usr/bin/env node
// RED — PLAN.md §5 "Five opt-in packs": V15, V16; §11 D13 (any pack activates from
// `profiles` / `packs` / `--profile <pack>`; a descriptor `type` never activates one).
//
// V15 is an ABSENCE invariant, so the fixture is a repo with plenty of pack BAIT and no
// config file at all — the assertion is on what the real output does NOT contain, in the
// JSON payload and in the human render alike. §11 D8 adds the one family that MUST be
// there with no config at all — the always-on PLUG rules — and that is asserted in the
// same block, on the same run, as V15's counter-example.
import * as lib from './_lib.mjs'
import {
  harness, loadRuleSet, loadRuleSetAt, mkrepo, checkJson, cli, idsOf, rowOf,
  PACKS, PACK_OF, CLEAN_NODE, cleanup, isDeleted,
} from './_lib.mjs'

const { ok, done } = harness('packs')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const byBase = new Map(rules.map(r => [base(r.id), r]))

// §11 D8's always-on family. _lib may not export the list yet; the fallback is §11's own.
const PLUG_IDS = lib.PLUG_IDS ?? ['PLUG-01', 'PLUG-02', 'PLUG-03']
// D4 (§10 V36): an n/a row may sit in the payload; "appears" here means evaluated
const isNA = (x) => x?.state === 'n/a' || x?.tag === 'n/a' || x?.tag === 'N/A'

// ---------- the pack table is DATA on the rule, not a table in prose ----------
{
  for (const [pack, memberIds] of Object.entries(PACKS)) {
    const wrong = memberIds.filter(id => byBase.get(id)?.pack !== pack)
    ok(wrong.length === 0, `§5 · every ${pack}-pack rule declares pack:'${pack}' (off: ${wrong.join(', ') || '—'})`)
  }
  // 'advanced' is the one pack the plan names by topic rather than by id — derive its
  // membership from v2.5.0's advanced profile, minus whatever §3 deleted.
  let v25 = null; try { v25 = loadRuleSetAt('v2.5.0') } catch {}
  if (v25) {
    const want = v25.rules.filter(r => r.profile === 'advanced' && !isDeleted(r.id)).map(r => r.id).sort()
    const got = rules.filter(r => r.pack === 'advanced').map(r => base(r.id)).sort()
    ok(JSON.stringify(want) === JSON.stringify(got),
      `§5 · the advanced pack is v2.5.0's advanced profile (want ${want.length}: ${want.join(',')}; got ${got.length}: ${got.join(',')})`)
  }
  const unpacked = rules.filter(r => r.pack !== undefined && r.pack !== null && !(r.pack in PACKS) && r.pack !== 'advanced').map(r => r.id)
  ok(unpacked.length === 0, `§5 · no rule declares a pack outside the five (${unpacked.join(', ') || '—'})`)
}

// ---------- V15: no config file at all -> no pack rule is evaluated or printed ----------
{
  const bait = mkrepo('v15', {
    ...CLEAN_NODE(),
    // decisions bait
    'docs/decisions/0001-a.md': '# ADR-0001: a\n\nStatus: Accepted\n',
    'docs/decisions/0001-b.md': '# ADR-0001: b\n\nStatus: Draft\n',
    // claims bait — a register present is NOT an opt-in under v3
    'docs/CLAIMS.json': '{}\n',
    'records/claims/CLM-0001.json': '{"record":"claim/1"}\n',
    // descriptor bait
    'baseline.repo.json': '{ not json\n',
    // service bait — a services/ tree used to auto-detect project_type=service
    'services/api/server.js': 'export const s = 1\n',
    // advanced bait
    'Dockerfile': 'FROM node:22\n',
  })
  const r = checkJson(bait)
  ok(!!r.j, 'V15 · the bait repo produced a JSON payload')
  const seen = idsOf(r.j)
  const leaked = [...seen].filter(id => PACK_OF.get(base(id)))
  ok(leaked.length === 0, `V15 · no pack rule appears in results — not WARN, not SKIP (leaked: ${leaked.join(', ') || '—'})`)

  const advLeak = (r.j?.results || []).filter(x => byBase.get(base(x.id))?.pack === 'advanced').map(x => x.id)
  ok(advLeak.length === 0, `V15 · no advanced-pack rule appears either (${advLeak.join(', ') || '—'})`)

  // D8 (§11, V38): one rule per plugin, in no pack, evaluated with no config file at all —
  // the rows that MUST be there when nothing is configured (WARN or PASS, never n/a)
  for (const id of PLUG_IDS) {
    const rule = byBase.get(id)
    const row = rowOf(r.j, id)
    ok(!!rule && rule.pack == null && !!row && !isNA(row),
      `V15 · ${id} is in no pack and appears with no config file (rule ${rule ? 'present' : 'missing'}, pack ${JSON.stringify(rule?.pack ?? null)}, row ${row ? (row.state ?? row.tag) : 'missing'})`)
  }

  // and the human render must not mention them either — a SKIP line is still output
  const human = cli(bait, ['check', '--repo', bait, '--no-exec'])
  const printed = Object.values(PACKS).flat().concat(rules.filter(r2 => r2.pack === 'advanced').map(r2 => base(r2.id)))
    .filter(id => human.stdout.includes(id))
  ok(printed.length === 0, `V15 · the human render names no pack rule (${printed.slice(0, 5).join(', ') || '—'})`)
  ok(r.status === 0, `V15 · a repo whose only faults are pack faults exits 0 with no config (got ${r.status})`)
}

// ---------- V16: a pack blocker fails CI when its pack is active, never when it is not ----------
{
  // (a) claims pack ACTIVE via the declared opt-in, register missing -> CLAIM-00 blocks
  const on = mkrepo('v16-on', { ...CLEAN_NODE(), 'baseline.config.json': JSON.stringify({ makes_external_claims: true }, null, 2) + '\n' })
  const ron = checkJson(on)
  const c00on = rowOf(ron.j, 'CLAIM-00')
  ok(!!c00on, 'V16 · CLAIM-00 is evaluated when makes_external_claims:true')
  ok(c00on?.tag === 'FAIL' && ron.status === 1,
    `V16 · CLAIM-00 fails CI with the pack active (tag ${c00on?.tag}, exit ${ron.status})`)

  // (b) same fault, pack OFF (no config) -> CLAIM-00 is not even a row, exit unaffected
  const off = mkrepo('v16-off', { ...CLEAN_NODE() })
  const roff = checkJson(off)
  ok(!rowOf(roff.j, 'CLAIM-00'), 'V16 · CLAIM-00 is absent with the pack off')
  ok(roff.status === 0, `V16 · exit is unaffected by the inactive pack (got ${roff.status})`)

  // (c) the explicit opt-OUT must also silence it, register present or not
  const optout = mkrepo('v16-optout', {
    ...CLEAN_NODE(), 'docs/CLAIMS.json': '{}\n',
    'baseline.config.json': JSON.stringify({ makes_external_claims: false }, null, 2) + '\n',
  })
  const rout = checkJson(optout)
  ok(!rowOf(rout.j, 'CLAIM-00') && rout.status === 0,
    `V16 · an explicit opt-out keeps the pack silent and non-blocking (row=${!!rowOf(rout.j, 'CLAIM-00')}, exit ${rout.status})`)
}

// ---------- each pack's activation switch is the one §5 names ----------
{
  const bait = {
    'docs/decisions/0001-a.md': '# ADR-0001: a\n\nStatus: Accepted\n',
    'baseline.repo.json': '{ not json\n',
    'services/api/server.js': 'export const s = 1\n',
    'Dockerfile': 'FROM node:22\n',
  }
  // §5's shortcut switches first; then §11 D13's general path — a `profiles` list, its
  // `packs` alias — for the packs whose §5 switch is something else.
  const cases = [
    ['decisions', { decision_globs: ['docs/decisions/*.md'] }],
    ['descriptor', { profiles: ['descriptor'] }],
    ['service', { project_type: 'service' }],
    ['advanced', { profiles: ['advanced'] }],
    ['claims', { profiles: ['claims'] }],
    ['service', { packs: ['service'] }],
    ['decisions', { profiles: ['decisions'] }],
  ]
  for (const [pack, cfg] of cases) {
    const tag = Object.keys(cfg)[0] === 'profiles' || Object.keys(cfg)[0] === 'packs' ? `§11 D13` : `§5`
    const dir = mkrepo(`v15-${pack}-${Object.keys(cfg)[0]}`, { ...CLEAN_NODE(), ...bait, 'baseline.config.json': JSON.stringify(cfg, null, 2) + '\n' })
    const r = checkJson(dir)
    const members = rules.filter(x => x.pack === pack).map(x => base(x.id))
    const present = [...idsOf(r.j)].filter(id => members.includes(base(id)))
    ok(present.length > 0, `V16 · the ${pack} pack activates on ${JSON.stringify(cfg)} (${tag}; ${present.length}/${members.length} rules evaluated)`)

    // and activating one pack must not activate another
    const others = [...idsOf(r.j)].filter(id => { const p = byBase.get(base(id))?.pack; return p && p !== pack })
    ok(others.length === 0, `V16 · activating ${pack} via ${JSON.stringify(cfg)} activates nothing else (${others.slice(0, 4).join(', ') || '—'})`)
  }

  // §11 D13: `--profile <pack>` on the command line activates a pack with no config file at all
  {
    const dir = mkrepo('v15-profile-flag', { ...CLEAN_NODE(), ...bait })
    const r = checkJson(dir, ['--profile', 'claims'])
    const present = [...idsOf(r.j)].filter(id => byBase.get(base(id))?.pack === 'claims')
    ok(present.length > 0, `V16 · --profile claims activates the claims pack (§11 D13; ${present.length} rows, exit ${r.status})`)
    const others = [...idsOf(r.j)].filter(id => { const p = byBase.get(base(id))?.pack; return p && p !== 'claims' })
    ok(others.length === 0, `V16 · --profile claims activates nothing else (§11 D13; ${others.slice(0, 4).join(', ') || '—'})`)
  }

  // §11 D13: a descriptor `type` never activates a pack — `type: service` in a valid
  // baseline.repo.json, with a services/ tree as extra bait, and no config file
  {
    const desc = {
      schema_version: 1, type: 'service', lifecycle: 'production', maturity: 'released',
      workflow: 'trunk', anchoring: 'strict', ground_truth_boundary: { default_branch: 'main' },
    }
    const dir = mkrepo('v15-desc-type', {
      ...CLEAN_NODE(),
      'services/api/server.js': 'export const s = 1\n',
      'baseline.repo.json': JSON.stringify(desc, null, 2) + '\n',
    })
    const r = checkJson(dir)
    // membership by the §5 table (PACK_OF) as well as by the rule's own `pack` field, so the
    // assertion is not vacuous while no rule declares a pack yet
    const packOf = (id) => byBase.get(base(id))?.pack ?? PACK_OF.get(base(id))
    const leaked = [...idsOf(r.j)].filter(id => packOf(id) === 'service')
    ok(!!r.j && leaked.length === 0, `V15 · a descriptor type never activates a pack (§11 D13; leaked: ${leaked.slice(0, 4).join(', ') || '—'})`)
    const anyPack = [...idsOf(r.j)].filter(id => packOf(id))
    ok(!!r.j && anyPack.length === 0, `V15 · a valid descriptor alone activates no pack at all (§11 D13; ${anyPack.slice(0, 4).join(', ') || '—'})`)
  }
}

cleanup()
process.exit(done() ? 1 : 0)
