#!/usr/bin/env node
// RED — PLAN.md §4 "Retarget three REC rules, delete the ledger": V13 — as amended by §11.
//
// §11 (D11) withdraws V14 and deletes REC-06 outright: reading a source commit out of a
// vendor artifact is the plugin-data parse D7 forbids, and the three PLUG rules replace
// it (V38-V41 live in the plugins area; REC-06's non-existence is V9 in deletions.mjs).
// What survives of §4 is the retarget of REC-02 and REC-05: the subject widens from
// `records/` to anything you commit. So every fixture here deliberately has NO records/
// directory: if a rule still needs one, the retarget did not happen.
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, mkrepo, checkJson, rowOf,
  CLEAN_NODE, FAKE_SECRET, FAKE_TOKEN, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('retarget')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const rule = (id) => rules.find(r => base(r.id) === id)

// ---------- the two survive, with their §4 severities ----------
{
  for (const id of ['REC-02', 'REC-05']) ok(!!rule(id), `§4 · ${id} survives the contraction`)
  ok(rule('REC-02')?.severity === 'warn', `§4 · REC-02 keeps its severity (got ${rule('REC-02')?.severity})`)
  ok(rule('REC-05')?.severity === 'warn', `§4 · REC-05 keeps its severity (got ${rule('REC-05')?.severity})`)
  // the retarget must show in the DATA, not only in behaviour: no surviving REC rule may
  // still scope itself to records/
  const stuck = ['REC-02', 'REC-05'].filter(id => /records\//.test(JSON.stringify(rule(id)?.check || {})))
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

cleanup()
process.exit(done() ? 1 : 0)
