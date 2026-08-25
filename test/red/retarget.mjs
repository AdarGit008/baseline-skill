#!/usr/bin/env node
// RED — PLAN.md §4 "Retarget three REC rules, delete the ledger": V13, V14.
//
// The point of the retarget is that the subject widens from `records/` to the whole tree
// (REC-02, REC-05) and from the vendored toolkit to the three vendor artifacts (REC-06).
// So every fixture here deliberately has NO records/ directory: if a rule still needs one,
// the retarget did not happen.
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, mkrepo, checkJson, git, rowOf, idsOf, writeAll,
  CLEAN_NODE, FAKE_SECRET, FAKE_TOKEN, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('retarget')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const rule = (id) => rules.find(r => base(r.id) === id)

// ---------- the three survive, with their §4 severities ----------
{
  for (const id of ['REC-02', 'REC-05', 'REC-06']) ok(!!rule(id), `§4 · ${id} survives the contraction`)
  ok(rule('REC-02')?.severity === 'warn', `§4 · REC-02 keeps its severity (got ${rule('REC-02')?.severity})`)
  ok(rule('REC-05')?.severity === 'warn', `§4 · REC-05 keeps its severity (got ${rule('REC-05')?.severity})`)
  ok(rule('REC-06')?.severity === 'warn', `§4 · REC-06 is the warn-severity freshness check (got ${rule('REC-06')?.severity})`)
  // the retarget must show in the DATA, not only in behaviour: no surviving REC rule may
  // still scope itself to records/
  const stuck = ['REC-02', 'REC-05', 'REC-06'].filter(id => /records\//.test(JSON.stringify(rule(id)?.check || {})))
  ok(stuck.length === 0, `§4 · no surviving REC rule still scopes itself to records/ (${stuck.join(', ') || '—'})`)
}

// ---------- V13: REC-02 / REC-05 fire on a secret committed OUTSIDE records/ ----------
{
  const dir = mkrepo('v13', {
    ...CLEAN_NODE(),
    'src/config.js': `export const AWS_ACCESS_KEY_ID = '${FAKE_SECRET}'\n`,
    'deploy/notes.md': `token: ${FAKE_TOKEN}\n`,
  })
  ok(!fs.existsSync(path.join(dir, 'records')), 'V13 · the fixture has no records/ directory at all')

  const r = checkJson(dir)
  const rec02 = rowOf(r.j, 'REC-02')
  ok(!!rec02, 'V13 · REC-02 is evaluated on a repo with no records/')
  ok(rec02 && rec02.tag !== 'SKIP' && rec02.tag !== 'PASS',
    `V13 · REC-02 fires on the secret outside records/ (tag ${rec02?.tag})`)
  ok(/src\/config\.js/.test(rec02?.detail || ''),
    `V13 · and names the committed file (detail: ${(rec02?.detail || '').slice(0, 90)})`)

  const rec05 = rowOf(r.j, 'REC-05')
  ok(!!rec05, 'V13 · REC-05 is evaluated with no records/ — anything you commit is the subject')
  ok(rec05 && rec05.tag !== 'SKIP' && rec05.tag !== 'PASS',
    `V13 · REC-05 fires: this repo commits code and has no push-time secret gate (tag ${rec05?.tag})`)

  // REC-05 passes on the same tree once a push-time gate is visible at rest
  const gated = mkrepo('v13-gated', {
    ...CLEAN_NODE(),
    'src/config.js': "export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID\n",
    '.gitleaks.toml': "title = 'red fixture'\n",
  })
  const rg = checkJson(gated)
  ok(rowOf(rg.j, 'REC-05')?.tag === 'PASS',
    `V13 · REC-05 passes with a committed gate and no records/ (tag ${rowOf(rg.j, 'REC-05')?.tag})`)
  ok(rowOf(rg.j, 'REC-02')?.tag === 'PASS',
    `V13 · REC-02 passes on a clean tree with no records/ (tag ${rowOf(rg.j, 'REC-02')?.tag})`)
}

// ---------- V14: REC-06 — a present vendor artifact must declare its source commit ----------
{
  // the two artifacts PLAN.md locates by name. (The OKF bundle is the third; the plan does
  // not say where it lives in the tree, so its location is asserted in seams.mjs instead.)
  const artifacts = {
    'tdd.json': (sha) => JSON.stringify({ schema: 'tdd/1', ...(sha ? { source_commit: sha } : {}), tests: [] }, null, 2) + '\n',
    'graphify-out/GRAPH_REPORT.md': (sha) => `# Graph report\n\n${sha ? `Built from commit: ${sha}\n` : 'Built from commit: (unknown)\n'}`,
  }

  // (a) absent -> n/a: no row at all
  {
    const dir = mkrepo('v14-absent', CLEAN_NODE())
    const r = checkJson(dir)
    ok(!rowOf(r.j, 'REC-06'), 'V14 · REC-06 is absent (n/a) when no vendor artifact is present')
    ok(r.status === 0, `V14 · and absence is never a failure (exit ${r.status})`)
  }

  // (b) present without a source commit -> a finding that names the artifact
  for (const [rel, body] of Object.entries(artifacts)) {
    const dir = mkrepo(`v14-bare-${rel.replace(/\W+/g, '-')}`, { ...CLEAN_NODE(), [rel]: body(null) })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'REC-06')
    ok(!!row, `V14 · REC-06 is evaluated when ${rel} is present`)
    ok(row && row.tag !== 'PASS' && row.tag !== 'SKIP',
      `V14 · REC-06 fails on ${rel} with no source commit (tag ${row?.tag})`)
    ok(new RegExp(rel.split('/').pop().replace('.', '\\.')).test(row?.detail || ''),
      `V14 · and the finding names ${rel} (detail: ${(row?.detail || '').slice(0, 90)})`)
  }

  // (c) present WITH a resolvable source commit -> PASS
  {
    const dir = mkrepo('v14-stamped', { ...CLEAN_NODE(), 'tdd.json': artifacts['tdd.json'](null) })
    const sha = git(dir, 'rev-parse', 'HEAD')
    writeAll(dir, { 'tdd.json': artifacts['tdd.json'](sha) })
    git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'stamp tdd.json')
    const r = checkJson(dir)
    const row = rowOf(r.j, 'REC-06')
    ok(row?.tag === 'PASS', `V14 · a stamped tdd.json passes REC-06 (tag ${row?.tag}: ${(row?.detail || '').slice(0, 80)})`)
  }

  // (d) a stamp pointing at a commit this repo does not have is not a stamp
  {
    const dir = mkrepo('v14-bogus', { ...CLEAN_NODE(), 'tdd.json': artifacts['tdd.json']('0'.repeat(40)) })
    const r = checkJson(dir)
    const row = rowOf(r.j, 'REC-06')
    ok(row && row.tag !== 'PASS', `V14 · an unresolvable source commit does not satisfy REC-06 (tag ${row?.tag})`)
  }
}

cleanup()
process.exit(done() ? 1 : 0)
