#!/usr/bin/env node
// RED — PLAN.md §6 "Derive the scope from the repo": V17, V18, V19, V20.
//
// V17 is an absence invariant measured on the real output of a repo that has none of the
// tools; V19 proves the detector is a pure function of the tree by (a) putting a recording
// stub for `gh`/`curl` first on PATH and (b) re-running under a hostile ambient env.
//
// Two later decisions amend the reading of §6 and are applied here:
//   D4  (§10, V36) an n/a rule is absent from the HUMAN render and present in --json as
//       state "n/a" — so "absent" below means "not evaluated", never "not in the payload".
//   D13 (§11) a rule's tool requirement is an explicit rule field ("tool": "docker") that
//       `want` overrides — so the docker-subject set is derived from that field.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import * as lib from './_lib.mjs'
import {
  harness, loadRuleSet, mkrepo, checkJson, cli, rowOf, mktmp, stubBin,
  DOCS_ONLY, CLEAN_NODE, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('scope')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')

// §11 D8's always-on family. _lib may not export the list yet; the fallback is §11's own.
const PLUG_IDS = lib.PLUG_IDS ?? ['PLUG-01', 'PLUG-02', 'PLUG-03']

// D4: the payload carries n/a rows; only the evaluated ones count. (_lib's idsOf predates
// D4 and reads every row, so it is not used here.)
const isNA = (x) => x?.state === 'n/a' || x?.tag === 'n/a' || x?.tag === 'N/A'
const evalRows = (j) => (j?.results || []).filter(x => !isNA(x))
const evalIds = (j) => new Set(evalRows(j).map(x => x.id))
// D13: the subject of a tool-scoped rule is its own `tool` field. The check-shape regex is
// only a fallback for a rule set that has not grown the field yet, so the list is never
// empty and the assertions below cannot pass vacuously.
const toolRules = (tool, re) => rules.filter(x => x.tool === tool || re.test(JSON.stringify(x.check || {}))).map(x => base(x.id))

// PLAN §6's own bound. Stated in the plan, so it is the specification; every other
// number in this file is derived from the rule set or from the run.
//
// §11 D8 adds three always-on PLUG rows (plugin-presence: WARN or PASS, never n/a) that
// are evaluated on EVERY repo, docs-only included, so they spend 3 of the 35. The
// arithmetic still holds. Of the 76 rules (D11), the pack rules never run without config
// (V15); the tool-scoped ones (BUILD, TEST, QUAL, REPRO, the advanced SEC rules) are n/a
// with no package manager, test runner, CI or Dockerfile; GOV-01/02 are n/a under check
// (D12). What can remain on a docs-only tree, counted at the WORST case where §6 scopes
// nothing else out: CTX-03/05/06/08/09/11/12 (7) + SEC-01..07/11/12/14 (10) + GOV-03 (1)
// + COMM-01..03 (3) + REC-02/05 (2) + PLUG-01..03 (3) = 26 < 35.
const DOCS_RULE_BUDGET = 35

// ---------- V17: an absent tool resolves n/a and prints NOTHING ----------
{
  const dir = mkrepo('v17', DOCS_ONLY())
  const r = checkJson(dir)
  ok(!!r.j, 'V17 · the docs-only repo produced a JSON payload')

  // "not a counted result": an n/a row may sit in the payload (D4), but never as a SKIP
  // row, and never inside summary.total
  const skips = (r.j?.results || []).filter(x => x.tag === 'SKIP')
  ok(skips.length === 0,
    `V17 · no n/a rule is a SKIP row (${skips.length} skip rows; first: ${skips.slice(0, 4).map(x => x.id).join(', ') || '—'})`)

  ok(r.j && r.j.summary && r.j.summary.total === evalRows(r.j).length,
    `V17 · summary.total counts only evaluated rules (total ${r.j?.summary?.total} vs ${evalRows(r.j).length} evaluated of ${r.j?.results?.length} rows)`)
  ok(r.j && !('skip' in (r.j.summary || {})),
    'V17 · the summary has no skip bucket left to report')

  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  ok(!/\bSKIP\b/.test(human.stdout), 'V17 · the human render prints no SKIP line')
  ok(!/\bn\/a\b/.test(human.stdout), 'V17 · the human render prints no n/a tally')

  // the concrete case: no Dockerfile in the tree -> the docker-subject rules are absent.
  // D13: the subject is the rule's own field, and REPRO-04 is the exemplar (V36 keeps it
  // as the n/a exemplar too), so it is asserted by name before the set is used.
  const repro04 = rules.find(x => base(x.id) === 'REPRO-04')
  ok(repro04?.tool === 'docker',
    `V17 · REPRO-04 declares "tool": "docker" as a rule field (D13) — got ${JSON.stringify(repro04?.tool)}`)
  const dockerRules = toolRules('docker', /dockerfile/i)
  ok(dockerRules.length > 0, `V17 · the rule set has docker-subject rules to test with (${dockerRules.join(', ')})`)
  const leaked = [...evalIds(r.j)].filter(id => dockerRules.includes(base(id)))
  ok(leaked.length === 0, `V17 · docker rules are not evaluated with no Dockerfile (${leaked.join(', ') || '—'})`)

  // and a tool that IS present keeps its rules — n/a must not be a blanket mute
  const withDocker = mkrepo('v17-docker', { ...DOCS_ONLY(), Dockerfile: 'FROM node:22\n' })
  const rd = checkJson(withDocker)
  const kept = [...evalIds(rd.j)].filter(id => dockerRules.includes(base(id)))
  ok(kept.length === dockerRules.length,
    `V17 · a present Dockerfile brings its rules back (${kept.length}/${dockerRules.length})`)
}

// ---------- V18: a docs-only repo evaluates under 35 rules ----------
{
  const dir = mkrepo('v18', DOCS_ONLY())
  const r = checkJson(dir)
  // evaluated = not n/a (D4); the PLUG rows are always among them (D8) and are shown so
  // the number can be read against the arithmetic above
  const evaluated = r.j ? evalRows(r.j) : null
  const n = evaluated ? evaluated.length : Infinity
  const plug = (evaluated || []).filter(x => PLUG_IDS.includes(base(x.id))).length
  ok(n < DOCS_RULE_BUDGET, `V18 · docs-only evaluates ${n} rules (${plug} of them always-on PLUG rows), under the §6 budget of ${DOCS_RULE_BUDGET} (rule set holds ${rules.length})`)
  // the budget is only meaningful if the run is still doing something
  ok(n > 0, `V18 · and it is not zero — the docs repo is still scored (${n})`)
  // the human render must agree with the payload: one line per evaluated rule, no others
  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  const namedIds = new Set((human.stdout.match(/\b[A-Z]+-\d{2}(-[a-z0-9-]+)?\b/g) || []).map(base))
  ok(namedIds.size === new Set([...evalIds(r.j)].map(base)).size,
    `V18 · the render names exactly the evaluated rules (${namedIds.size} vs ${new Set([...evalIds(r.j)].map(base)).size})`)
}

// ---------- V19: detection reads the repo only ----------
{
  const dir = mkrepo('v19', { ...CLEAN_NODE(), 'baseline.repo.json': JSON.stringify({ schema_version: 1, type: 'node', lifecycle: 'production', maturity: 'released', workflow: 'multi-lane', anchoring: 'strict', ground_truth_boundary: { default_branch: 'main' }, lanes: { namespace: 'lane/*', lease_ttl: '7d' }, join_keys: ['Baseline-Agent'] }, null, 2) + '\n' })
  const box = mktmp('v19-bin')
  const sentinel = path.join(box, 'calls.log')
  let binDir = null
  for (const tool of ['gh', 'curl', 'wget']) binDir = stubBin(box, tool, sentinel)
  const withStubs = { PATH: `${binDir}${path.delimiter}${process.env.PATH}` }

  const r = checkJson(dir, [], withStubs)
  ok(!fs.existsSync(sentinel),
    `V19 · check spawned no network tool (calls: ${fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8').trim().replace(/\n/g, ' | ') : 'none'})`)

  // ambient env must not steer the run: the forge's own CI variables, an exported agent
  // name, and a time-travel knob all leave the verdict byte-identical
  const hostile = {
    ...withStubs,
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: 'lane/7',
    GITHUB_REF_NAME: 'lane/7', GITHUB_REF_TYPE: 'branch', GITHUB_WORKSPACE: dir,
    BASELINE_AGENT: 'ghost', BASELINE_LOG_NOW: '2030-01-01T00:00:00Z', CI: 'true',
  }
  const r2 = checkJson(dir, [], hostile)
  const strip = (j) => JSON.stringify((j?.results || []).map(x => ({ id: x.id, tag: x.tag })))
  ok(strip(r.j) === strip(r2.j), 'V19 · a hostile ambient env changes no rule verdict')
  ok(r.status === r2.status, `V19 · and no exit code (${r.status} vs ${r2.status})`)
  ok(!fs.existsSync(sentinel), 'V19 · still no network tool under the CI-shaped env')

  // detection is a function of the tree: same tree, different cwd, same answer
  const r3 = cli(path.dirname(dir), ['check', '--repo', dir, '--no-exec', '--json'], withStubs)
  let j3 = null; try { j3 = JSON.parse(r3.stdout) } catch {}
  ok(strip(j3) === strip(r.j), 'V19 · the answer does not depend on the process cwd')

  // D12 (§11, V42): the forge is closed under check, and the forge-sourced rules are not
  // MISSING from the payload — they are the n/a rows. plugins.mjs owns the reason string
  // and the orient half; this is the one check-side existence assertion, on a fixture
  // where the service pack is active so OPS-07 has a row to resolve at all.
  const forgeDir = mkrepo('v19-forge', { ...CLEAN_NODE(), 'baseline.config.json': JSON.stringify({ project_type: 'service' }, null, 2) + '\n' })
  const rf = checkJson(forgeDir, [], withStubs)
  const forgeRows = ['GOV-01', 'GOV-02', 'OPS-07'].map(id => [id, rowOf(rf.j, id)])
  ok(forgeRows.every(([, row]) => !!row && isNA(row)),
    `V19 · GOV-01/GOV-02/OPS-07 are the n/a rows, not missing (${forgeRows.map(([id, row]) => `${id}=${row ? (row.state ?? row.tag) : 'missing'}`).join(', ')})`)
}

// ---------- V20: declaring a tool you do not have activates its rules ----------
{
  // D13: `want` overrides the rule's `tool` field — that field is what "want":["docker"]
  // switches on, so every docker-subject rule must carry it or want cannot reach it
  const dockerRules = toolRules('docker', /dockerfile/i)
  const declared = rules.filter(x => x.tool === 'docker').map(x => base(x.id))
  ok(declared.length === dockerRules.length,
    `V20 · every docker-subject rule declares "tool": "docker" so want can reach it (${declared.length}/${dockerRules.length}: ${dockerRules.join(', ')})`)

  // D13: the field is "validated by selfcheck" — a value naming no known tool is rejected,
  // and rejected BY NAME. Proven on a throwaway copy of the tree (never the real rules/),
  // with REPRO-04's `tool` corrupted; the copy's own baseline.mjs loads the copy's rules.
  {
    let sc = { status: null, stdout: '', stderr: '' }, err = null
    try {
      const copy = mktmp('v20-selfcheck')
      for (const e of fs.readdirSync(lib.ROOT)) {
        if (/^(\.git|node_modules|test)$/.test(e)) continue
        fs.cpSync(path.join(lib.ROOT, e), path.join(copy, e), { recursive: true })
      }
      const rp = path.join(copy, 'rules', 'repro.json')
      const rj = JSON.parse(fs.readFileSync(rp, 'utf8'))
      const r04 = (rj.rules || []).find(x => base(x.id) === 'REPRO-04')
      if (r04) r04.tool = 'nosuchtool'
      fs.writeFileSync(rp, JSON.stringify(rj, null, 2) + '\n')
      const r = spawnSync(process.execPath, [path.join(copy, 'baseline.mjs'), 'check', '--self-check'],
        { cwd: copy, encoding: 'utf8', env: { ...lib.CLEAN_ENV, ...lib.GITENV } })
      sc = { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
    } catch (e) { err = e }
    ok(!err && sc.status !== 0 && /nosuchtool/.test(sc.stdout + sc.stderr),
      `V20 · selfcheck rejects an unknown "tool" field value by name (§11 D13) (exit ${sc.status}${err ? `; ${err.message}` : ''})`)
  }

  const noWant = mkrepo('v20-off', { ...DOCS_ONLY() })
  const rOff = checkJson(noWant)
  ok([...evalIds(rOff.j)].filter(id => dockerRules.includes(base(id))).length === 0,
    'V20 · docker rules are not evaluated when neither present nor declared')

  const want = mkrepo('v20-on', { ...DOCS_ONLY(), 'baseline.config.json': JSON.stringify({ want: ['docker'] }, null, 2) + '\n' })
  const rOn = checkJson(want)
  const rows = evalRows(rOn.j).filter(x => dockerRules.includes(base(x.id)))
  ok(rows.length === dockerRules.length,
    `V20 · "want":["docker"] evaluates the docker rules with no Dockerfile present (${rows.length}/${dockerRules.length})`)
  ok(rows.length > 0 && rows.every(x => x.tag !== 'SKIP'),
    `V20 · and they are really evaluated, not skipped (${rows.map(x => `${x.id}=${x.tag}`).join(', ') || '—'})`)

  // intent counts as presence, not as a pass: a declared tool that is missing is a finding
  ok(rows.some(x => x.tag === 'FAIL' || x.tag === 'WARN'),
    'V20 · declaring docker without a Dockerfile produces a finding, not a free pass')

  // an unknown want must not silently do nothing
  const bogus = mkrepo('v20-bogus', { ...DOCS_ONLY(), 'baseline.config.json': JSON.stringify({ want: ['nosuchtool'] }, null, 2) + '\n' })
  const rb = cli(bogus, ['check', '--repo', bogus, '--no-exec'])
  ok(/nosuchtool/.test(rb.stdout + rb.stderr),
    'V20 · an unrecognised "want" entry is named in the output ("nosuchtool"), never silently ignored')
}

cleanup()
process.exit(done() ? 1 : 0)
