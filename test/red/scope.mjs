#!/usr/bin/env node
// RED — PLAN.md §6 "Derive the scope from the repo": V17, V18, V19, V20.
//
// V17 is an absence invariant measured on the real output of a repo that has none of the
// tools; V19 proves the detector is a pure function of the tree by (a) putting a recording
// stub for `gh`/`curl` first on PATH and (b) re-running under a hostile ambient env.
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, mkrepo, checkJson, cli, idsOf, rowOf, mktmp, stubBin,
  DOCS_ONLY, CLEAN_NODE, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('scope')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')

// PLAN §6's own bound. Stated in the plan, so it is the specification; every other
// number in this file is derived from the rule set or from the run.
const DOCS_RULE_BUDGET = 35

// ---------- V17: an absent tool resolves n/a and prints NOTHING ----------
{
  const dir = mkrepo('v17', DOCS_ONLY())
  const r = checkJson(dir)
  ok(!!r.j, 'V17 · the docs-only repo produced a JSON payload')

  const skips = (r.j?.results || []).filter(x => x.tag === 'SKIP' || x.tag === 'N/A' || x.tag === 'n/a')
  ok(skips.length === 0,
    `V17 · no n/a rule is a counted result (${skips.length} skip rows; first: ${skips.slice(0, 4).map(x => x.id).join(', ') || '—'})`)

  ok(r.j && r.j.summary && r.j.summary.total === r.j.results.length,
    `V17 · summary.total counts only evaluated rules (total ${r.j?.summary?.total} vs ${r.j?.results?.length} rows)`)
  ok(r.j && !('skip' in (r.j.summary || {})),
    'V17 · the summary has no skip bucket left to report')

  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  ok(!/\bSKIP\b/.test(human.stdout), 'V17 · the human render prints no SKIP line')
  ok(!/\bn\/a\b/.test(human.stdout), 'V17 · the human render prints no n/a tally')

  // the concrete case: no Dockerfile in the tree -> the docker-subject rules are absent
  const dockerRules = rules.filter(x => /dockerfile/i.test(JSON.stringify(x.check || {}))).map(x => base(x.id))
  ok(dockerRules.length > 0, `V17 · the rule set has docker-subject rules to test with (${dockerRules.join(', ')})`)
  const leaked = [...idsOf(r.j)].filter(id => dockerRules.includes(base(id)))
  ok(leaked.length === 0, `V17 · docker rules are absent with no Dockerfile (${leaked.join(', ') || '—'})`)

  // and a tool that IS present keeps its rules — n/a must not be a blanket mute
  const withDocker = mkrepo('v17-docker', { ...DOCS_ONLY(), Dockerfile: 'FROM node:22\n' })
  const rd = checkJson(withDocker)
  const kept = [...idsOf(rd.j)].filter(id => dockerRules.includes(base(id)))
  ok(kept.length === dockerRules.length,
    `V17 · a present Dockerfile brings its rules back (${kept.length}/${dockerRules.length})`)
}

// ---------- V18: a docs-only repo evaluates under 35 rules ----------
{
  const dir = mkrepo('v18', DOCS_ONLY())
  const r = checkJson(dir)
  const n = r.j?.results?.length ?? Infinity
  ok(n < DOCS_RULE_BUDGET, `V18 · docs-only evaluates ${n} rules, under the §6 budget of ${DOCS_RULE_BUDGET} (rule set holds ${rules.length})`)
  // the budget is only meaningful if the run is still doing something
  ok(n > 0, `V18 · and it is not zero — the docs repo is still scored (${n})`)
  // the human render must agree with the payload: one line per evaluated rule, no others
  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  const namedIds = new Set((human.stdout.match(/\b[A-Z]+-\d{2}(-[a-z0-9-]+)?\b/g) || []).map(base))
  ok(namedIds.size === new Set([...idsOf(r.j)].map(base)).size,
    `V18 · the render names exactly the evaluated rules (${namedIds.size} vs ${new Set([...idsOf(r.j)].map(base)).size})`)
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
}

// ---------- V20: declaring a tool you do not have activates its rules ----------
{
  const dockerRules = rules.filter(x => /dockerfile/i.test(JSON.stringify(x.check || {}))).map(x => base(x.id))
  const noWant = mkrepo('v20-off', { ...DOCS_ONLY() })
  const rOff = checkJson(noWant)
  ok([...idsOf(rOff.j)].filter(id => dockerRules.includes(base(id))).length === 0,
    'V20 · docker rules are absent when neither present nor declared')

  const want = mkrepo('v20-on', { ...DOCS_ONLY(), 'baseline.config.json': JSON.stringify({ want: ['docker'] }, null, 2) + '\n' })
  const rOn = checkJson(want)
  const rows = (rOn.j?.results || []).filter(x => dockerRules.includes(base(x.id)))
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
    'V20 · an unrecognised "want" entry is reported, never silently ignored')
}

cleanup()
process.exit(done() ? 1 : 0)
