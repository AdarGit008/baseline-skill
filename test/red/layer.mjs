#!/usr/bin/env node
// RED — V44: THE BASELINE RULES LAYER (v4).
//
// The rule set has two kinds of rule and they are opted into from opposite ends. V43
// (plugins.mjs) pins the opt-IN half: a plugin this repo never adopted is a suggestion,
// n/a, out of the exit gate. This file pins the opt-OUT half.
//
// Every rule that is NOT a plugin rule is one LAYER — the tree reads any repo can answer —
// opted in or out at setup time, DEFAULT IN. So:
//   · absent key   -> IN. The layer gates, which is today's behaviour unchanged: a repo
//                    that never heard of `baseline_rules` scores exactly as it did before.
//   · false        -> OUT. Those rules resolve n/a: no finding, no log, excluded from the
//                    AND-gate, incapable of an exit code — the SAME treatment an unadopted
//                    plugin gets, and for the same reason (not-chosen is not failed).
//   · anything else -> IN. Only the literal `false` opts out, because IN is the safe
//                    direction: no typo can quietly stop a rule from gating.
// And the property that keeps the whole thing honest: opting out is never SILENT. The
// layer's state is on the human render and in --json (`baseline`) on every run, in or out,
// with every muted rule named. An opt-out is a decision on the record, not a hiding place.
//
// The layer governs the BASELINE rules only. A trust-circle member's rule is not part of
// the layer and must keep gating with the layer out — otherwise one config key would mute
// the whole rule set, which is precisely the silent hole this design refuses.
import {
  harness, loadRuleSet, mkrepo, mktrusted, checkJson, cli, rowOf, idsOf,
  CLEAN_NODE, TRUSTED_NODE, trustedConfig, plantGraph, okfEnv, cleanup,
} from './_lib.mjs'
import fs from 'node:fs'
import path from 'node:path'

const { ok, done } = harness('layer')
const { rules } = loadRuleSet()

// The layer's membership, read from the rule DATA the same way the runner reads it: a
// PLUGIN rule names the trust-circle member it stands for (check.plugin); every other rule
// is a baseline rule. Derived, so a rule added tomorrow lands on the right side by itself.
const isPlugin = (r) => typeof r?.check?.plugin === 'string' && !!r.check.plugin
const LAYER_IDS = rules.filter(r => !isPlugin(r)).map(r => r.id)
const PLUGIN_IDS = rules.filter(isPlugin).map(r => r.id)
const KEY = 'baseline_rules'
const isNA = (x) => x?.state === 'n/a'

// A tree that FAILS the layer: CODEOWNERS gone (GOV-03), no CI workflow (BUILD-03), no env
// template (BUILD-04). Nothing here touches a plugin artifact.
const BROKEN = () => {
  const f = { ...CLEAN_NODE() }
  delete f['CODEOWNERS']; delete f['.github/workflows/ci.yml']; delete f['.env.example']
  return f
}

// ---------- the layer is a real division of the rule set ----------
{
  ok(LAYER_IDS.length > 0, `V44 · the baseline layer is non-empty (${LAYER_IDS.join(', ') || '—'})`)
  ok(PLUGIN_IDS.length > 0, `V44 · and the plugin half is non-empty (${PLUGIN_IDS.join(', ') || '—'})`)
  const both = LAYER_IDS.filter(id => PLUGIN_IDS.includes(id))
  ok(both.length === 0, `V44 · no rule is in both halves (${both.join(', ') || '—'})`)
  ok(LAYER_IDS.length + PLUGIN_IDS.length === rules.length,
    `V44 · every shipped rule is in exactly one half (${LAYER_IDS.length} + ${PLUGIN_IDS.length} vs ${rules.length})`)
}

// ---------- V44a: the DEFAULT is IN, and IN gates ----------
{
  const dir = mkrepo('v44-default', BROKEN())
  const r = checkJson(dir)
  ok(r.j?.baseline?.layer === 'in', `V44 · with no ${KEY} key the layer is IN (got ${JSON.stringify(r.j?.baseline?.layer)})`)
  ok(r.j?.baseline?.source === 'default', `V44 · and it says so honestly: source 'default' (got ${JSON.stringify(r.j?.baseline?.source)})`)
  const gov = rowOf(r.j, 'GOV-03')
  ok(!!gov && gov.tag === 'FAIL', `V44 · a missing CODEOWNERS FAILs by default (got ${gov ? (gov.tag ?? gov.state) : 'no row'})`)
  ok(r.status === 1, `V44 · and the default layer reaches the exit code (got ${r.status})`)
  ok((r.j?.summary?.blockers ?? 0) > 0, `V44 · counted as blocker(s) (${r.j?.summary?.blockers})`)
}

// ---------- V44b: `true` is exactly the default — same rows, same exit ----------
{
  const ref = mkrepo('v44-true-ref', BROKEN())
  const dir = mkrepo('v44-true', { ...BROKEN(), 'baseline.config.json': JSON.stringify({ [KEY]: true }, null, 2) + '\n' })
  const a = checkJson(ref), b = checkJson(dir)
  const shape = (j) => (j?.results || []).map(x => `${x.id}:${x.tag ?? x.state}`).join('|')
  ok(shape(a.j) === shape(b.j), `V44 · "${KEY}": true scores identically to an absent key`)
  ok(a.status === b.status && b.status === 1, `V44 · and exits the same (${a.status} vs ${b.status})`)
  ok(b.j?.baseline?.source === 'config' && b.j?.baseline?.layer === 'in',
    `V44 · an explicit true is reported as a config-stated IN (${JSON.stringify(b.j?.baseline)})`)
}

// ---------- V44c: OUT produces no finding and cannot fail a build ----------
{
  const dir = mkrepo('v44-out', { ...BROKEN(), 'baseline.config.json': JSON.stringify({ [KEY]: false }, null, 2) + '\n' })
  const r = checkJson(dir)
  ok(r.j?.baseline?.layer === 'out', `V44 · "${KEY}": false reads as OUT (got ${JSON.stringify(r.j?.baseline?.layer)})`)
  ok(r.j?.baseline?.source === 'config', `V44 · sourced from the config, never guessed (got ${JSON.stringify(r.j?.baseline?.source)})`)
  for (const id of LAYER_IDS) {
    const row = rowOf(r.j, id.replace(/^([A-Z]+-\d{2}).*/, '$1'))
    // a layer rule is either absent from this run (off-type) or present as n/a — never tagged
    ok(!row || isNA(row), `V44 · ${id} produces no finding with the layer OUT (got ${row ? (row.tag ?? row.state) : 'no row'})`)
  }
  ok((r.j?.summary?.fail ?? 0) === 0 && (r.j?.summary?.blockers ?? 0) === 0,
    `V44 · nothing failed and nothing blocked (${r.j?.summary?.fail} fail, ${r.j?.summary?.blockers} blockers)`)
  ok(r.status === 0, `V44 · a repo that would fail three baseline rules exits 0 with the layer OUT (got ${r.status})`)
  // the muted rows carry the REASON — a machine reader can tell "muted" from "passed"
  const muted = (r.j?.results || []).filter(x => isNA(x) && /baseline rules layer is opted OUT/.test(String(x.reason)))
  ok(muted.length > 0, `V44 · every muted row names the layer as the reason (${muted.length} row(s))`)
}

// ---------- V44d: the layer's state is VISIBLE, in and out ----------
{
  const inDir = mkrepo('v44-vis-in', CLEAN_NODE())
  const outDir = mkrepo('v44-vis-out', { ...BROKEN(), 'baseline.config.json': JSON.stringify({ [KEY]: false }, null, 2) + '\n' })
  const hIn = cli(inDir, ['check', '--repo', inDir, '--no-exec'])
  const hOut = cli(outDir, ['check', '--repo', outDir, '--no-exec'])
  ok(/Baseline layer\s+IN/.test(hIn.stdout), 'V44 · the human render states the layer IN')
  ok(/Baseline layer\s+OUT/.test(hOut.stdout), 'V44 · and states it OUT — an opted-out layer is never silent')
  const named = LAYER_IDS.filter(id => hOut.stdout.includes(id))
  ok(named.length > 0, `V44 · the OUT render names the muted rule(s) (${named.join(', ') || 'none'})`)
  // and the machine surface carries it next to the trust circle, on both settings
  for (const [label, j] of [['in', checkJson(inDir).j], ['out', checkJson(outDir).j]]) {
    ok(!!j?.baseline && !!j?.trust, `V44 · --json carries baseline and trust together (${label})`)
    ok(j?.baseline?.key === KEY, `V44 · --json names the config key it read (${label}: ${JSON.stringify(j?.baseline?.key)})`)
    ok(Array.isArray(j?.baseline?.rules) && j.baseline.rules.length > 0,
      `V44 · --json lists the rules the layer governs (${label}: ${JSON.stringify(j?.baseline?.rules)})`)
  }
}

// ---------- V44e: only the literal `false` opts out ----------
{
  for (const [label, v] of [['"false"', 'false'], ['0', 0], ['"out"', 'out'], ['[]', []]]) {
    const dir = mkrepo(`v44-strict-${label.replace(/\W+/g, '')}`, {
      ...BROKEN(), 'baseline.config.json': JSON.stringify({ [KEY]: v }, null, 2) + '\n',
    })
    const r = checkJson(dir)
    ok(r.j?.baseline?.layer === 'in' && r.status === 1,
      `V44 · ${KEY}: ${label} leaves the layer IN — a typo cannot mute a rule (layer ${r.j?.baseline?.layer}, exit ${r.status})`)
  }
}

// ---------- V44f: the layer does not reach the trust circle ----------
{
  // every plugin ADOPTED, tdd.json removed, and the layer opted OUT: the baseline rules go
  // quiet, and PLUG-01 still fails the build. One key must never mute the whole rule set.
  const files = { ...TRUSTED_NODE(), 'baseline.config.json': trustedConfig({ [KEY]: false }) }
  delete files['tdd.json']
  const dir = mkrepo('v44-circle', files); plantGraph(dir)
  const r = checkJson(dir, [], okfEnv('v44-circle-okf'))
  const plug = rowOf(r.j, 'PLUG-01')
  ok(!!plug && plug.tag === 'FAIL', `V44 · an adopted member with no artifact still FAILs with the layer OUT (got ${plug ? (plug.tag ?? plug.state) : 'no row'})`)
  ok(r.status === 1, `V44 · the trust circle still reaches the exit code (got ${r.status})`)
  const layerRows = (r.j?.results || []).filter(x => LAYER_IDS.some(id => x.id === id))
  ok(layerRows.length > 0 && layerRows.every(isNA), `V44 · while every baseline rule is n/a (${layerRows.map(x => `${x.id}:${x.tag ?? x.state}`).join(', ')})`)
}

// ---------- V44g: setup is where the choice is made, and it writes exactly one key ----------
{
  const { dir } = mktrusted('v44-setup')
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8'))
  ok(!(KEY in before), `V44 · the fixture config starts with no ${KEY} key`)

  const out = cli(dir, ['trust', 'setup', '--repo', dir, '--baseline-rules', 'out'])
  const afterOut = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8'))
  ok(out.status === 0 && afterOut[KEY] === false, `V44 · \`trust setup --baseline-rules out\` writes ${KEY}:false (exit ${out.status}, value ${JSON.stringify(afterOut[KEY])})`)
  ok(JSON.stringify(afterOut.plugins) === JSON.stringify(before.plugins), 'V44 · and leaves the trust circle untouched')
  ok(/OUT/.test(out.stdout), 'V44 · setup prints the layer state it left behind')

  const back = cli(dir, ['trust', 'setup', '--repo', dir, '--baseline-rules', 'in'])
  const afterIn = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8'))
  ok(back.status === 0 && !(KEY in afterIn), `V44 · opting IN DELETES the key — absent IS the default (exit ${back.status}, key present: ${KEY in afterIn})`)

  // setup with no flag reports the state and changes nothing
  const readOnly = cli(dir, ['trust', 'setup', '--repo', dir])
  const afterRead = fs.readFileSync(path.join(dir, 'baseline.config.json'), 'utf8')
  ok(readOnly.status === 0 && /baseline rules layer — IN/.test(readOnly.stdout), 'V44 · plain `trust setup` reports the layer without changing it')
  ok(afterRead === JSON.stringify(afterIn, null, 2) + '\n', 'V44 · and the config is byte-identical after a read-only setup')

  // the closed vocabulary: a typo is named, never read as "out"
  const bad = cli(dir, ['trust', 'setup', '--repo', dir, '--baseline-rules', 'off'])
  ok(bad.status === 2 && /--baseline-rules takes in or out/.test(bad.stderr), `V44 · --baseline-rules off is refused by name (exit ${bad.status})`)

  // --json carries the same fact for a machine reader
  const j = cli(dir, ['trust', 'setup', '--repo', dir, '--json'])
  let parsed = null; try { parsed = JSON.parse(j.stdout) } catch {}
  ok(parsed?.baseline?.layer === 'in' && parsed?.baseline?.key === KEY,
    `V44 · trust setup --json states the layer (${JSON.stringify(parsed?.baseline?.layer)}, key ${JSON.stringify(parsed?.baseline?.key)})`)
  ok(Array.isArray(parsed?.baseline?.rules) && LAYER_IDS.every(id => parsed.baseline.rules.includes(id)),
    `V44 · and names every rule the layer governs (${JSON.stringify(parsed?.baseline?.rules)})`)
}

cleanup()
process.exit(done() ? 1 : 0)
