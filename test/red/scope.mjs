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

  // The concrete case USED to be docker: no Dockerfile -> REPRO-04 n/a. The v4 cut deleted
  // REPRO-04, and with it the only member of the tool vocabulary, so the scope mechanism is
  // now proven EMPTY rather than exercised — the stronger claim to pin while it has no
  // members, and the one that catches a rule quietly re-growing a `tool` field.
  const repro04 = rules.find(x => base(x.id) === 'REPRO-04')
  ok(!repro04, `V17 · REPRO-04 is deleted — the docker category went with it (${repro04?.id ?? 'gone'})`)
  const dockerRules = toolRules('docker', /dockerfile/i)
  ok(dockerRules.length === 0, `V17 · no rule is docker-subject any more (${dockerRules.join(', ') || '—'})`)
  const scoped = rules.filter(x => x.tool != null).map(x => `${x.id}:${x.tool}`)
  ok(scoped.length === 0, `V17 · no rule declares a "tool" at all — the vocabulary is empty (${scoped.join(', ') || '—'})`)
  const leaked = [...evalIds(r.j)].filter(id => dockerRules.includes(base(id)))
  ok(leaked.length === 0, `V17 · docker rules are not evaluated with no Dockerfile (${leaked.join(', ') || '—'})`)

  // and a Dockerfile in the tree brings nothing back, because nothing is keyed on it
  const withDocker = mkrepo('v17-docker', { ...DOCS_ONLY(), Dockerfile: 'FROM node:22\n' })
  const rd = checkJson(withDocker)
  const kept = [...evalIds(rd.j)].filter(id => dockerRules.includes(base(id)))
  ok(kept.length === dockerRules.length && kept.length === 0,
    `V17 · a present Dockerfile brings nothing back — there is no rule to bring (${kept.length}/${dockerRules.length})`)
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

  // D12 closed the forge under check; the v4 cut DELETED the seam. The forge-sourced rules
  // are not n/a rows any more, they are not rows at all — and no rule declares the plane.
  // plugins.mjs (V42) owns the orient half and the src/-level assertions.
  const forgeDir = mkrepo('v19-forge', { ...CLEAN_NODE(), 'baseline.config.json': JSON.stringify({ project_type: 'service' }, null, 2) + '\n' })
  const rf = checkJson(forgeDir, [], withStubs)
  const forgeRows = ['GOV-01', 'GOV-02', 'OPS-07'].map(id => [id, rowOf(rf.j, id)])
  ok(forgeRows.every(([, row]) => !row),
    `V19 · GOV-01/GOV-02/OPS-07 are gone from the payload entirely (${forgeRows.map(([id, row]) => `${id}=${row ? (row.state ?? row.tag) : 'absent'}`).join(', ')})`)
  ok(rules.every(x => !(Array.isArray(x.sources) && x.sources.includes('forge'))),
    'V19 · and no rule declares sources:["forge"] to reopen it')
}

// ---------- V20: the `want` override survives, with an empty vocabulary ----------
{
  // D13 made a rule's tool requirement an explicit field that `want` overrides. The v4 cut
  // deleted the only rule that carried one, so the mechanism is intact and unpopulated:
  // there is nothing to want, and asking for something anyway is still REPORTED by name.
  const dockerRules = toolRules('docker', /dockerfile/i)
  const declared = rules.filter(x => x.tool === 'docker').map(x => base(x.id))
  ok(declared.length === 0 && dockerRules.length === 0,
    `V20 · no docker-subject rule remains for want to reach (${[...new Set([...declared, ...dockerRules])].join(', ') || '—'})`)

  // the closed set itself is empty, stated once in src/selfcheck.mjs
  let sc = ''; try { sc = fs.readFileSync(path.join(lib.ROOT, 'src', 'selfcheck.mjs'), 'utf8') } catch {}
  ok(/export const TOOLS = Object\.freeze\(\[\s*\]\)/.test(sc),
    'V20 · the tool vocabulary (src/selfcheck.mjs TOOLS) is empty')

  // D13: the field is still "validated by selfcheck" — an unknown tool value is rejected
  // BY NAME. Proven on a throwaway copy with a SURVIVING rule corrupted (rules/build.json,
  // since rules/repro.json no longer exists); the copy's baseline.mjs loads the copy's rules.
  {
    let scr = { status: null, stdout: '', stderr: '' }, err = null
    try {
      const copy = mktmp('v20-selfcheck')
      for (const e of fs.readdirSync(lib.ROOT)) {
        if (/^(\.git|node_modules|test)$/.test(e)) continue
        fs.cpSync(path.join(lib.ROOT, e), path.join(copy, e), { recursive: true })
      }
      const rp = path.join(copy, 'rules', 'build.json')
      const rj = JSON.parse(fs.readFileSync(rp, 'utf8'))
      if (rj.rules?.[0]) rj.rules[0].tool = 'nosuchtool'
      fs.writeFileSync(rp, JSON.stringify(rj, null, 2) + '\n')
      const r = spawnSync(process.execPath, [path.join(copy, 'baseline.mjs'), 'check', '--self-check'],
        { cwd: copy, encoding: 'utf8', env: { ...lib.CLEAN_ENV, ...lib.GITENV } })
      scr = { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
    } catch (e) { err = e }
    ok(!err && scr.status !== 0 && /nosuchtool/.test(scr.stdout + scr.stderr),
      `V20 · selfcheck rejects an unknown "tool" field value by name (§11 D13) (exit ${scr.status}${err ? `; ${err.message}` : ''})`)
  }

  const noWant = mkrepo('v20-off', { ...DOCS_ONLY() })
  const rOff = checkJson(noWant)
  ok([...evalIds(rOff.j)].filter(id => dockerRules.includes(base(id))).length === 0,
    'V20 · docker rules are not evaluated when neither present nor declared')

  const want = mkrepo('v20-on', { ...DOCS_ONLY(), 'baseline.config.json': JSON.stringify({ want: ['docker'] }, null, 2) + '\n' })
  const rOn = checkJson(want)
  const rows = evalRows(rOn.j).filter(x => dockerRules.includes(base(x.id)))
  ok(rows.length === dockerRules.length && rows.length === 0,
    `V20 · "want":["docker"] evaluates nothing — the vocabulary is empty (${rows.length}/${dockerRules.length})`)
  // and 'docker' is now itself an unknown want, so it must be REPORTED, not swallowed
  const hOn = cli(want, ['check', '--repo', want, '--no-exec'])
  ok(/docker/.test(hOn.stdout + hOn.stderr),
    'V20 · wanting a tool the vocabulary no longer knows is named in the output, never a free pass')

  // an unknown want must not silently do nothing
  const bogus = mkrepo('v20-bogus', { ...DOCS_ONLY(), 'baseline.config.json': JSON.stringify({ want: ['nosuchtool'] }, null, 2) + '\n' })
  const rb = cli(bogus, ['check', '--repo', bogus, '--no-exec'])
  ok(/nosuchtool/.test(rb.stdout + rb.stderr),
    'V20 · an unrecognised "want" entry is named in the output ("nosuchtool"), never silently ignored')
}

cleanup()
process.exit(done() ? 1 : 0)
