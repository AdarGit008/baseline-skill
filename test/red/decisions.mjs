#!/usr/bin/env node
// RED — PLAN.md §10 "Decisions taken 2026-08-25": V34, V35, V36, V37.
//
// The five conflicts three independent RED-test authors surfaced, resolved by the
// maintainer. D1 (delete `json-field`) needs no assertion of its own — surface.mjs's
// V33 three-way equality already goes green exactly when it lands. The other four
// each describe a command surface that does not exist yet, so every assertion here
// is red by construction:
//
//   V34  `explain` grows no `--propose`; nothing writes into the OKF bundle
//   V35  `gen okf-concepts` is a deterministic extraction into .baseline/proposed/
//   V36  n/a is silent to humans, explicit (with a reason) to machines
//   V37  orient FETCHES as step 0, never pulls, and then touches no forge
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  harness, loadRuleSet, mkrepo, mktmp, checkJson, orientJson, cli, git,
  rowOf, stubBin, writeAll, CLEAN_NODE, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('decisions')
const { rules } = loadRuleSet()
const base = (id) => id.replace(/^([A-Z]+-\d{2}).*/, '$1')
const fullId = (b) => (rules.find(r => base(r.id) === b) || {}).id || b

const hashTree = (dir) => {
  if (!fs.existsSync(dir)) return null
  const out = []
  const walk = (rel) => {
    const abs = path.join(dir, rel)
    if (fs.statSync(abs).isDirectory()) { for (const e of fs.readdirSync(abs).sort()) walk(path.join(rel, e)); return }
    out.push(rel + ':' + crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'))
  }
  for (const e of fs.readdirSync(dir).sort()) walk(e)
  return out.join('\n')
}

// ======================================================== D3 / V34: no propose path
{
  const dir = mkrepo('v34', CLEAN_NODE())
  const bundle = mktmp('v34-bundle')
  writeAll(bundle, { 'baseline/rules/.keep': '' })
  const before = hashTree(bundle)
  const env = { BASELINE_OKF_BUNDLE: bundle }
  const id = fullId('SEC-01')

  // The prohibition is only meaningful once the surface it constrains exists. Today
  // `explain` is not a verb at all (baseline.mjs registers check/admit/reconcile/orient/
  // lane/log/jdg/gen/scrub), so "has no --propose" would pass vacuously. Ground it first:
  // explain must BE a command, and must have no --propose.
  const e0 = cli(dir, ['explain', id], env)
  ok(e0.status === 0, `V34 · \`explain <id>\` is a real command (exit ${e0.status})`)
  ok(e0.stdout.trim().length > 0 && !/unknown|usage/i.test(e0.stdout + e0.stderr),
    `V34 · and answers rather than refusing (${JSON.stringify((e0.stdout + e0.stderr).trim().slice(0, 70))})`)

  const p = cli(dir, ['explain', id, '--propose'], env)
  ok(p.status !== 0, `V34 · \`explain --propose\` is not a command (exit ${p.status})`)
  ok(/unknown|unrecognized|usage/i.test(p.stderr + p.stdout),
    `V34 · and says so rather than silently ignoring the flag (${JSON.stringify((p.stderr + p.stdout).slice(0, 80))})`)

  const help = cli(dir, ['help'], env)
  ok(!/--propose/.test(help.stdout + help.stderr), 'V34 · `--propose` appears nowhere in help')
  const explainHelp = cli(dir, ['explain', '--help'], env)
  ok(!/--propose/.test(explainHelp.stdout + explainHelp.stderr), 'V34 · nor in `explain --help`')

  // no verb, under any flag, may write into the bundle
  for (const args of [['check', '--repo', dir, '--no-exec'], ['orient', '--repo', dir], ['explain', id]]) {
    cli(dir, args, env)
  }
  ok(hashTree(bundle) === before, 'V34 · no command wrote into the OKF bundle')
}

// ======================================================== D2 / V35: the migration generator
{
  const dir = mkrepo('v35', CLEAN_NODE())
  const sentinel = path.join(mktmp('v35-net'), 'calls')
  const bin = stubBin(path.dirname(sentinel), 'gh', sentinel)
  for (const n of ['curl', 'wget']) stubBin(path.dirname(sentinel), n, sentinel)
  const env = { PATH: `${bin}:${process.env.PATH}` }
  const staging = path.join(dir, '.baseline', 'proposed')

  const g1 = cli(dir, ['gen', 'okf-concepts', '--repo', dir], env)
  ok(g1.status === 0, `V35 · \`gen okf-concepts\` is a command (exit ${g1.status})`)
  ok(fs.existsSync(staging), 'V35 · it writes into .baseline/proposed/')

  const h1 = hashTree(staging)
  const emitted = h1 ? h1.split('\n').length : 0
  ok(emitted === rules.length,
    `V35 · one concept per rule (${emitted} emitted, ${rules.length} rules)`)

  // byte-determinism: same input, same output
  fs.rmSync(staging, { recursive: true, force: true })
  cli(dir, ['gen', 'okf-concepts', '--repo', dir], env)
  ok(hashTree(staging) === h1 && h1 !== null, 'V35 · a second run is byte-identical')

  // nothing outside the staging path may move
  const dirty = git(dir, 'status', '--porcelain').split('\n')
    .map(s => s.trim()).filter(Boolean).filter(s => !/\.baseline\//.test(s))
  ok(dirty.length === 0, `V35 · it writes nothing outside .baseline/proposed/ (${dirty.slice(0, 3).join(' | ') || '—'})`)

  ok(!fs.existsSync(sentinel),
    `V35 · no network call (${fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8').trim().replace(/\n/g, ' | ') : 'none'})`)

  // OKF is markdown + YAML frontmatter (okf-rag's own store), never JSON
  const files = fs.existsSync(staging) ? fs.readdirSync(path.join(staging, 'baseline', 'rules'), { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name) : []
  ok(files.length > 0 && files.every(f => f.endsWith('.md')),
    `V35 · concepts are .md with frontmatter, not .json (${files.slice(0, 3).join(', ') || 'none emitted'})`)

  // extraction, not authorship: every concept names the shipped doc span it came from
  const sample = files.length ? fs.readFileSync(path.join(staging, 'baseline', 'rules', files[0]), 'utf8') : ''
  ok(/^---\n[\s\S]*?\bsource:/m.test(sample),
    'V35 · each concept carries a `source:` span in its frontmatter (extraction is traceable)')
}

// ======================================================== D4 / V36: n/a is silent, then explicit
{
  // REPRO-04 was the exemplar (no Dockerfile -> no subject). It is deleted, so the n/a
  // exemplar is now SEC-01: its grep is tracked_only over **/* excluding **/*.md, so a repo
  // whose every tracked file is markdown gives it nothing to scan. The v4 execution model
  // AND-gates every rule to exit 0 — an n/a rule must therefore be EXCLUDED from the gate,
  // which is asserted here alongside D4's silent/explicit split.
  const dir = mkrepo('v36', {
    'README.md': '# md only\n\nProse.\n',
    'docs/guide.md': '# guide\n\nMore prose.\n',
    'CODEOWNERS.md': 'not the real one\n',
  })

  const human = cli(dir, ['check', '--repo', dir, '--no-exec'])
  const na = fullId('SEC-01')
  ok(!human.stdout.includes(na) && !human.stdout.includes('SEC-01'),
    'V36 · an n/a rule is absent from human output entirely')
  ok(!/\bSKIP\b/.test(human.stdout), `V36 · and is not rendered as a SKIP row`)

  const j = checkJson(dir)
  const row = rowOf(j.j, 'SEC-01')
  ok(!!row, 'V36 · but --json still carries it')
  ok(row?.state === 'n/a' || row?.tag === 'n/a', `V36 · with state "n/a" (got ${JSON.stringify(row?.state ?? row?.tag)})`)
  ok(typeof (row?.reason) === 'string' && row.reason.trim().length > 0,
    `V36 · and a non-empty reason (${JSON.stringify(row?.reason)})`)
  ok(row?.tag !== 'SKIP' && row?.state !== 'SKIP', 'V36 · n/a is never spelled SKIP in the payload')

  // the gate: an n/a rule is a BLOCKER with no subject, and must not fail the build for it
  const rule = rules.find(r => base(r.id) === 'SEC-01')
  ok(rule?.severity === 'blocker', `V36 · the n/a exemplar is a blocker (got ${rule?.severity})`)
  const naRows = (j.j?.results || []).filter(x => x.state === 'n/a')
  const evaluatedFails = (j.j?.results || []).filter(x => x.tag === 'FAIL' || x.tag === 'DIVERGED')
  ok(naRows.length > 0, `V36 · the run really produced n/a rows (${naRows.map(x => x.id).join(', ') || '—'})`)
  ok(!naRows.some(x => evaluatedFails.includes(x)), 'V36 · an n/a row is never also a failing row')
  ok(!(j.j?.summary?.total >= 0) || j.j.summary.total === (j.j.results.length - naRows.length),
    `V36 · summary.total counts evaluated rows only, excluding the n/a ones (${j.j?.summary?.total} of ${j.j?.results?.length} rows, ${naRows.length} n/a)`)
}

// ======================================================== D5 / V37: orient fetches, never pulls
{
  // origin carries a commit the clone does not have yet. THE BOUNDARY: baseline never
  // changes your files, your branch or your history — so that commit must NOT arrive, and
  // orient must say how far behind you are instead of closing the gap for you.
  const origin = mktmp('v37-origin')
  git(origin, 'init', '-q', '-b', 'main')
  writeAll(origin, CLEAN_NODE())
  git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'first')
  const bare = mktmp('v37-bare')
  git(path.dirname(bare), 'clone', '-q', '--bare', origin, bare)
  const dir = mktmp('v37-work')
  git(path.dirname(dir), 'clone', '-q', bare, dir)
  writeAll(origin, { 'AHEAD.md': '# landed upstream after the clone\n' })
  git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'second')
  git(origin, 'push', '-q', bare, 'main')

  const sentinel = path.join(mktmp('v37-net'), 'calls')
  const bin = stubBin(path.dirname(sentinel), 'gh', sentinel)
  const env = { PATH: `${bin}:${process.env.PATH}` }

  const beforeHead = git(dir, 'rev-parse', 'HEAD').trim()
  const o = orientJson(dir, [], env)
  const afterHead = git(dir, 'rev-parse', 'HEAD').trim()

  ok(afterHead === beforeHead, `V37 · orient never moved HEAD (${beforeHead.slice(0, 7)} → ${afterHead.slice(0, 7)})`)
  ok(!fs.existsSync(path.join(dir, 'AHEAD.md')), 'V37 · and the upstream commit is NOT in the tree — orient does not pull')
  // it did fetch, though: the behind-count is only knowable from refs a fetch brought in
  ok(o.j?.repo?.behind === 1, `V37 · the fetch happened and the gap is reported (behind=${JSON.stringify(o.j?.repo?.behind)})`)
  ok(/behind/i.test(JSON.stringify(o.j?.notes ?? [])), `V37 · being behind is a warning note (${JSON.stringify(o.j?.notes ?? []).slice(0, 90)})`)
  ok(!fs.existsSync(sentinel),
    `V37 · orient never spawned gh (${fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8').trim().replace(/\n/g, ' | ') : 'none'})`)
  ok(o.status === 0, `V37 · orient exits 0 (got ${o.status})`)

  // no other git write: nothing staged, nothing stashed, no new local commit of its own
  const dirty = git(dir, 'status', '--porcelain').trim()
  ok(dirty === '', `V37 · orient leaves the worktree clean (${dirty.split('\n')[0] || '—'})`)
  const stash = git(dir, 'stash', 'list').trim()
  ok(stash === '', `V37 · and creates no stash (${stash.split('\n')[0] || '—'})`)

  // an unreachable origin degrades to a note, never a refusal
  const lone = mkrepo('v37-lone', CLEAN_NODE())
  git(lone, 'remote', 'add', 'origin', path.join(mktmp('v37-gone'), 'nope.git'))
  const o2 = orientJson(lone, [], env)
  ok(o2.status === 0, `V37 · an unreachable origin still exits 0 (got ${o2.status})`)
  const notes = JSON.stringify(o2.j?.notes ?? o2.j?.suggestions ?? [])
  ok(/pull|fetch|origin|offline/i.test(notes + o2.stdout),
    `V37 · and says the fetch did not happen (${notes.slice(0, 90)})`)
}

cleanup()
process.exit(done() ? 1 : 0)
