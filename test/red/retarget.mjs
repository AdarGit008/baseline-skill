#!/usr/bin/env node
// RED — PLAN.md §4 "Retarget three REC rules, delete the ledger": V13 — as amended by §11,
// then SUPERSEDED by the v4 rule-set cut.
//
// §4 widened REC-02 and REC-05 from `records/` to anything you commit. The v4 review
// scratched both (records category eliminated entirely), along with REC-01/04/06 before
// them. The duty they carried did not vanish: a secret committed anywhere in the tree is
// SEC-01's subject, and SEC-01 is a blocker. So this file now pins the END STATE of §4 —
// the ledger is gone, the REC family is gone, the records-scrub kind is gone, and the one
// rule left standing over the same fixture still fires.
import fs from 'node:fs'
import path from 'node:path'
import {
  harness, loadRuleSet, ROOT, mkrepo, checkJson, rowOf,
  TRUSTED_NODE, plantGraph, okfEnv, FAKE_SECRET, FAKE_TOKEN, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('retarget')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const rule = (id) => rules.find(r => base(r.id) === id)

// ---------- the REC family is gone, ledger and all ----------
{
  const rec = rules.filter(r => base(r.id).startsWith('REC-')).map(r => r.id)
  ok(rec.length === 0, `§4 · no REC rule survives the v4 cut (${rec.join(', ') || '—'})`)
  ok(!fs.existsSync(path.join(ROOT, 'rules', 'rec.json')), '§4 · rules/rec.json is deleted')
  let manifest = null; try { manifest = loadRuleSet().manifest } catch {}
  ok(!(manifest?.modules || []).includes('rules/rec.json'), '§4 · rules.json no longer registers rules/rec.json')

  // the machinery goes with the rules: records-scrub was REC-02's kind and nothing else's
  let ev = ''; try { ev = fs.readFileSync(path.join(ROOT, 'src', 'evaluators.mjs'), 'utf8') } catch {}
  ok(!/records-scrub/.test(ev), '§4 · the records-scrub check kind is gone from src/evaluators.mjs')
  const stuck = rules.filter(r => /records\//.test(JSON.stringify(r.check || {}))).map(r => r.id)
  ok(stuck.length === 0, `§4 · no surviving rule scopes itself to records/ (${stuck.join(', ') || '—'})`)
}

// ---------- V13: the duty survives its rules — a secret anywhere is SEC-01's subject ----------
{
  const dir = mkrepo('v13', {
    ...TRUSTED_NODE(),
    'src/config.js': `export const AWS_ACCESS_KEY_ID = '${FAKE_SECRET}'\n`,
    'deploy/notes.md': `token: ${FAKE_TOKEN}\n`,
  })
  plantGraph(dir)
  ok(!fs.existsSync(path.join(dir, 'records')), 'V13 · the fixture has no records/ directory at all')

  const r = checkJson(dir, [], okfEnv('v13-okf'))
  ok(!rowOf(r.j, 'REC-02') && !rowOf(r.j, 'REC-05'), 'V13 · neither REC rule is carried in the payload any more')

  const sec01 = rowOf(r.j, 'SEC-01')
  ok(!!sec01, 'V13 · SEC-01 is evaluated on a repo with no records/')
  ok(sec01?.tag === 'FAIL', `V13 · SEC-01 fires on the secret committed outside records/ (tag ${sec01?.tag})`)
  ok(rule('SEC-01')?.severity === 'blocker', `V13 · and it is a blocker (got ${rule('SEC-01')?.severity})`)
  ok(r.status === 1, `V13 · so the committed secret fails the build (exit ${r.status})`)

  // the same tree without the secret: SEC-01 passes and the run is green
  const clean = mkrepo('v13-clean', {
    ...TRUSTED_NODE(),
    'src/config.js': 'export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID\n',
  })
  plantGraph(clean)
  const rc = checkJson(clean, [], okfEnv('v13-clean-okf'))
  ok(rowOf(rc.j, 'SEC-01')?.tag === 'PASS', `V13 · SEC-01 passes on a clean tree with no records/ (tag ${rowOf(rc.j, 'SEC-01')?.tag})`)
  ok(rc.status === 0, `V13 · and the run is green (exit ${rc.status})`)
}

cleanup()
process.exit(done() ? 1 : 0)
