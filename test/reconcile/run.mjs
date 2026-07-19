#!/usr/bin/env node
// baseline reconcile — the M6b command contract, exercised against LOCAL bare
// origins + replay forges (no network). Covers: the pure lifecycle derivation
// (file/update/close/reopen/nudge, cap+rollup, truncation-suppresses-creates,
// human-close-is-judgment vs deterministic-integrity reopen), fingerprint
// stability over the ONE volatility spec, marker round-trips (bot-closed stamp,
// URI-encoded subjects), the mutation channel's replay assert-plan (plan AND
// normalized-argv equality; mismatch never relieved), the JDG sweep + landed
// re-scan + merged-while-red (merged-PR window, existence-clear), GOV ladder
// wiring (403-class SKIP is never a clear), the binding law (behind/dirty →
// report-only; off-line → exit 2; posture-closed → exit 2), and the exit
// contract incl. gate:reconcile relief for live outages only.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findingKey, marker, fingerprint, deriveLifecycle, parseManaged, rebodyClosed, issueTitle, issueBody, MARKER_RE } from '../../src/reconcile.mjs'
import { makeForge } from '../../src/facts/forge.mjs'
import { normalizeVolatile } from '../../src/util.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const tmps = []

const GITENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Rec Tester', GIT_AUTHOR_EMAIL: 'rec@test.invalid', GIT_COMMITTER_NAME: 'Rec Tester', GIT_COMMITTER_EMAIL: 'rec@test.invalid' }
const CLEAN_ENV = { ...process.env }
for (const k of ['BASELINE_LOG_NOW', 'BASELINE_FORGE_REPLAY', 'BASELINE_FORGE_RECORD', 'BASELINE_AGENT', 'BASELINE_GOV_ADMIN', 'GITHUB_HEAD_REF']) delete CLEAN_ENV[k]
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...CLEAN_ENV, ...GITENV } }).trim()
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [BASELINE, ...args], { cwd, encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV, ...env } })
const recJson = (cwd, args = [], env = {}) => {
  const r = cli(cwd, ['reconcile', '--json', ...args], env)
  let j = null; try { j = JSON.parse(r.stdout) } catch {}
  return { ...r, j }
}

const DESC = (over = {}) => ({
  schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype',
  workflow: 'multi-lane', anchoring: 'strict',
  ground_truth_boundary: { default_branch: 'main' },
  lanes: { namespace: 'lane/*', lease_ttl: '7d' },
  join_keys: ['Baseline-Agent', 'Baseline-Issue'], ...over,
})
const JDG = (id, over = {}) => JSON.stringify({
  record: 'judgment/1', id, kind: 'deviation', date: '2026-01-01', by: 'adar',
  subject: `subject-${id}`, reason: 'test judgment', review_by: '2099-12-31', ...over,
}, null, 2) + '\n'

function mkworld(name, desc = DESC()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rec-${name}-`)); tmps.push(dir)
  const bare = path.join(dir, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: { ...CLEAN_ENV, ...GITENV } })
  const seed = path.join(dir, 'seed'); fs.mkdirSync(seed)
  git(seed, 'init', '-q', '-b', 'main')
  if (desc) fs.writeFileSync(path.join(seed, 'baseline.repo.json'), JSON.stringify(desc, null, 2) + '\n')
  fs.writeFileSync(path.join(seed, 'README.md'), `# ${name}\n`)
  git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed')
  git(seed, 'remote', 'add', 'origin', bare)
  git(seed, 'push', '-q', 'origin', 'main')
  const clone = path.join(dir, 'clone')
  execFileSync('git', ['clone', '-q', bare, clone], { env: { ...CLEAN_ENV, ...GITENV } })
  git(clone, 'config', 'user.name', 'Rec Tester'); git(clone, 'config', 'user.email', 'rec@test.invalid')
  const replay = path.join(dir, 'replay'); fs.mkdirSync(replay)
  return { dir, bare, seed, clone, replay }
}
const commitSeed = (w, rel, content, msg) => { fs.mkdirSync(path.dirname(path.join(w.seed, rel)), { recursive: true }); fs.writeFileSync(path.join(w.seed, rel), content); git(w.seed, 'add', '-A'); git(w.seed, 'commit', '-qm', msg); git(w.seed, 'push', '-q', 'origin', 'main') }
const pull = (w) => git(w.clone, 'pull', '-q', '--ff-only', 'origin', 'main')
const fix = (w, key, val) => fs.writeFileSync(path.join(w.replay, `${key}.json`), JSON.stringify(val, null, 2) + '\n')
const mut = (w, seq, rec) => fs.writeFileSync(path.join(w.replay, `mut-${String(seq).padStart(3, '0')}.json`), JSON.stringify(rec, null, 2) + '\n')
const ENV = (w) => ({ BASELINE_FORGE_REPLAY: w.replay })
const issue = (number, state, key, fp, { botClosed = false, title = 't', extra = '' } = {}) =>
  ({ number, state, title, body: `${marker(key, fp, { botClosed })}\n${extra}body`, updatedAt: '2026-01-01T00:00:00Z' })
// A REAL repo always carries engine warns; scenarios isolate their key by pre-filing
// every OTHER probe finding as an open, fp-matching issue (no action derives for them).
const listingFor = (probeJ, except = []) => probeJ.findings.filter(f => !except.includes(f.key)).map((f, i) => issue(200 + i, 'open', f.key, f.fp))

console.log('\n# reconcile — pure core\n')
{
  // fingerprint: volatile classes collapse; content changes register
  ok(fingerprint('lease ABANDONED (9d idle of ttl 7d) at abc1234') === fingerprint('lease ABANDONED (12d idle of ttl 7d) at fee1bad'), 'fp: ages + shas collapse (no daily jitter)')
  ok(fingerprint('review_by 2026-01-01 has passed') === fingerprint('review_by 2026-06-30 has passed'), 'fp: dates collapse')
  ok(fingerprint('missing: strict checks') !== fingerprint('missing: conversation resolution'), 'fp: real content change registers')

  // marker round-trip incl. bot-closed + space/arrow-bearing subjects
  const k = findingKey('JDG-0001', 'a subject with spaces --> and arrows')
  const m1 = marker(k, 'abcdef123456').match(MARKER_RE)
  ok(m1 && m1[1] === k && m1[2] === 'abcdef123456' && !m1[3], 'marker: round-trips an encoded subject')
  const m2 = marker(k, 'abcdef123456', { botClosed: true }).match(MARKER_RE)
  ok(m2 && !!m2[3], 'marker: bot-closed stamp parses')
  ok(!k.includes('-->') && !/\s/.test(k), 'key: no marker-breaking bytes survive encoding')

  // parseManaged + rebodyClosed preserve the human's body, swap only the marker
  const iss = issue(7, 'open', k, 'abcdef123456', { extra: 'HUMAN EDIT\n' })
  const parsed = parseManaged([iss, { number: 8, state: 'open', title: 'x', body: 'no marker' }])
  ok(parsed.length === 1 && parsed[0].number === 7 && parsed[0].fp === 'abcdef123456', 'parseManaged: marker issues only')
  const re = rebodyClosed(k, parsed[0], 'deadbeef00')
  ok(re.includes('HUMAN EDIT') && MARKER_RE.exec(re)?.[3], 'rebodyClosed: body preserved, marker stamped bot-closed')

  // lifecycle matrix
  const F = (id, subject, fp, reopenAlways = false) => ({ key: findingKey(id, subject), id, subject, title: 't', detail: 'd', fp, reopenAlways })
  const acts = (args) => deriveLifecycle({ branch: 'main', sha: 'deadbeefcafe', ...args }).map(a => `${a.action}:${a.key}`)
  const f1 = F('A-01', 'main', 'aaaaaaaaaaaa')
  ok(acts({ present: [f1], cleared: new Set(), issues: [] }).join() === `file:${f1.key}`, 'lifecycle: absent → file')
  ok(acts({ present: [f1], cleared: new Set(), issues: [issue(1, 'open', f1.key, 'aaaaaaaaaaaa')].map(i => parseManaged([i])[0]) }).length === 0, 'lifecycle: open + same fp → no action')
  ok(acts({ present: [f1], cleared: new Set(), issues: parseManaged([issue(1, 'open', f1.key, 'bbbbbbbbbbbb')]) }).join() === `update:${f1.key}`, 'lifecycle: open + changed fp → update')
  ok(acts({ present: [], cleared: new Set([f1.key]), issues: parseManaged([issue(1, 'open', f1.key, 'aaaaaaaaaaaa')]) }).join() === `close:${f1.key}`, 'lifecycle: cleared → close')
  ok(acts({ present: [], cleared: new Set(), issues: parseManaged([issue(1, 'open', f1.key, 'aaaaaaaaaaaa')]) }).length === 0, 'lifecycle: not evaluated (SKIP) → never a close')
  ok(acts({ present: [f1], cleared: new Set(), issues: parseManaged([issue(1, 'closed', f1.key, 'aaaaaaaaaaaa', { botClosed: true })]) }).join() === `reopen:${f1.key}`, 'lifecycle: bot-closed recurrence → reopen')
  ok(acts({ present: [f1], cleared: new Set(), issues: parseManaged([issue(1, 'closed', f1.key, 'aaaaaaaaaaaa')]) }).length === 0, 'lifecycle: human-closed engine row, same content → silent (the close was judgment)')
  ok(acts({ present: [{ ...f1, fp: 'cccccccccccc' }], cleared: new Set(), issues: parseManaged([issue(1, 'closed', f1.key, 'aaaaaaaaaaaa')]) }).join() === `nudge:${f1.key}`, 'lifecycle: human-closed engine row, NEW content → one nudge, no reopen')
  const fj = F('JDG-0009', 's', 'aaaaaaaaaaaa', true)
  ok(acts({ present: [fj], cleared: new Set(), issues: parseManaged([issue(1, 'closed', fj.key, 'aaaaaaaaaaaa')]) }).join() === `reopen:${fj.key}`, 'lifecycle: deterministic-integrity class reopens over a human close')

  // a schema-valid subject with a lone surrogate must never crash the cron
  let surKey = null
  try { surKey = findingKey('JDG-0002', '\ud800 lone surrogate') } catch {}
  ok(typeof surKey === 'string' && surKey === findingKey('JDG-0002', '\ud800 lone surrogate'), 'findingKey: total + stable over a lone surrogate')

  // human REOPEN of a bot-closed issue: the clear must not re-close (no close-war)
  ok(acts({ present: [], cleared: new Set([f1.key]), issues: parseManaged([issue(1, 'open', f1.key, 'aaaaaaaaaaaa', { botClosed: true })]) }).length === 0, 'lifecycle: human reopen (bot-closed stamp on an OPEN issue) → no close-war')

  // rollup drains: overflow empty + open rollup → close
  const rollKey = findingKey('rollup', 'main')
  ok(acts({ present: [], cleared: new Set(), issues: parseManaged([issue(9, 'open', rollKey, 'abcdefabcdef')]) }).join() === `close:${rollKey}`, 'rollup: overflow drained → the rollup itself closes')

  // cap + rollup + truncation
  const many = Array.from({ length: 12 }, (_, i) => F('JDG-' + String(i).padStart(4, '0'), 's' + i, 'aaaaaaaaaaaa', true))
  const capped = deriveLifecycle({ present: many, cleared: new Set(), issues: [], branch: 'main', sha: 'deadbeefcafe' })
  ok(capped.filter(a => a.action === 'file' && a.key !== findingKey('rollup', 'main')).length === 10, 'cap: 10 filings')
  const roll = capped.find(a => a.key === findingKey('rollup', 'main'))
  ok(roll && roll.finding.detail.includes(many[10].key) && roll.finding.detail.includes('subsequent runs'), 'cap: overflow keys ride ONE rollup, self-drain noted')
  const trunc = deriveLifecycle({ present: [f1], cleared: new Set(), issues: [], branch: 'main', sha: 'deadbeefcafe', noCreate: true })
  ok(trunc.length === 1 && trunc[0].key === findingKey('rollup', 'main'), 'truncated scan: creates suppressed into the rollup')

  // deterministic ordering: files sorted by key, closes after
  const f2 = F('B-01', 'main', 'aaaaaaaaaaaa')
  const ordered = deriveLifecycle({ present: [f2, f1], cleared: new Set([findingKey('Z-01', 'main')]), issues: parseManaged([issue(3, 'open', findingKey('Z-01', 'main'), 'aaaaaaaaaaaa')]), branch: 'main', sha: 'deadbeefcafe' })
  ok(ordered.map(a => a.action).join() === 'file,file,close' && ordered[0].key === f1.key, 'ordering: sorted files, then closes')
}

console.log('\n# mutation channel — replay assert-plan\n')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-chan-')); tmps.push(dir)
  const replay = path.join(dir, 'replay'); fs.mkdirSync(replay)
  fs.writeFileSync(path.join(replay, 'mut-000.json'), JSON.stringify({ plan: { action: 'file', key: 'k' }, ghArgs: ['api', 'x', `body=at <sha>`], result: { number: 5 } }))
  process.env.BASELINE_FORGE_REPLAY = replay
  try {
    const f1 = makeForge({ REPO: dir }, { available: true, nwo: 'o/r' })
    const r1 = f1.mutate({ action: 'file', key: 'k' }, ['api', 'x', 'body=at deadbee'])
    ok(r1.ok && r1.result.number === 5, 'replay: matching plan + normalized argv → recorded result')
    const f2 = makeForge({ REPO: dir }, { available: true, nwo: 'o/r' })
    const r2 = f2.mutate({ action: 'file', key: 'OTHER' }, ['api', 'x', 'body=at deadbee'])
    ok(!r2.ok && r2.replayMismatch, 'replay: diverging plan → mismatch, surfaced')
    const f3 = makeForge({ REPO: dir }, { available: true, nwo: 'o/r' })
    f3.mutate({ action: 'file', key: 'k' }, ['api', 'x', 'body=at deadbee'])
    const r3 = f3.mutate({ action: 'file', key: 'k2' }, ['api'])
    ok(!r3.ok && r3.replayMismatch, 'replay: unrecorded extra write → mismatch')
    const fc = makeForge({ REPO: dir }, { available: true, nwo: 'o/r', posture: 'multi-lane-local' })
    ok(!fc.mutate({ action: 'file', key: 'k' }, ['api']).ok, 'closed forge: mutations refused in every mode')
    // argv negative: SAME plan, different invocation → mismatch (the ghArgs guard is live)
    fs.writeFileSync(path.join(replay, 'mut-000.json'), JSON.stringify({ plan: { action: 'file', key: 'k' }, ghArgs: ['api', 'x', 'body=at <sha>'], result: { number: 5 } }))
    const f4 = makeForge({ REPO: dir }, { available: true, nwo: 'o/r' })
    const r4 = f4.mutate({ action: 'file', key: 'k' }, ['api', 'DIFFERENT', 'body=at deadbee'])
    ok(!r4.ok && r4.replayMismatch, 'replay: same plan, different argv → mismatch (invocation is asserted)')
    // repo identity is ambient: recorded repos/<nwo> matches any live owner/repo
    fs.writeFileSync(path.join(replay, 'mut-000.json'), JSON.stringify({ plan: { action: 'file', key: 'k' }, ghArgs: ['api', 'repos/<nwo>/issues', 'body=at <sha>'], result: { number: 5 } }))
    const f5 = makeForge({ REPO: dir }, { available: true, nwo: 'o/r' })
    ok(f5.mutate({ action: 'file', key: 'k' }, ['api', 'repos/real-owner/real-repo/issues', 'body=at deadbee']).ok, 'replay: repos/<owner>/<repo> collapses — identity is ambient, endpoint shape is intent')
  } finally { delete process.env.BASELINE_FORGE_REPLAY }
}

console.log('\n# integration — environment refusals + binding law\n')
{
  const w = mkworld('posture', DESC({ workflow: 'multi-lane-local' }))
  const r = cli(w.clone, ['reconcile'])
  ok(r.status === 2 && r.stderr.includes('unrepresentable'), 'multi-lane-local posture → exit 2 (write surface closed by posture)')
}
{
  const w = mkworld('behind')
  commitSeed(w, 'MOVED.md', 'x\n', 'main advances')
  const { j, status } = recJson(w.clone, [], ENV(w))
  ok(status === 0 && j?.reportOnly && j.summary.mode === 'report-only' && (j.mutations || []).length === 0, 'behind the fetched tip → report-only, exit 0, zero mutations')
  ok(String(j?.reportOnly).includes('git switch'), 'report-only carries the runnable catch-up recipe')
}
{
  const w = mkworld('dirty')
  fs.appendFileSync(path.join(w.clone, 'README.md'), 'dirt\n')
  const { j, status } = recJson(w.clone, [], ENV(w))
  ok(status === 0 && j?.reportOnly && (j.mutations || []).length === 0, 'dirty worktree → report-only, exit 0, zero mutations')
}
{
  const w = mkworld('diverged')
  fs.appendFileSync(path.join(w.clone, 'README.md'), 'local\n')
  git(w.clone, 'commit', '-aqm', 'local divergence')
  commitSeed(w, 'MOVED.md', 'x\n', 'main advances')
  ok(cli(w.clone, ['reconcile'], ENV(w)).status === 2, 'HEAD off the target line → exit 2')
}

console.log('\n# integration — sweep, lifecycle, exits (replay forge)\n')
{
  // one expired judgment at main; empty labeled listing → ensure-label + file
  const w = mkworld('file')
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2020-01-01' }), 'expired judgment')
  pull(w)
  fix(w, 'issues-labeled-baseline', [])
  const key = findingKey('JDG-0001', 'subject-JDG-0001')
  // dry-run probe: plan printed, nothing needs recordings
  const probe = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(probe.status === 0 && probe.j.summary.mode === 'dry-run', 'dry-run: exit 0')
  ok(probe.j.findings.some(f => f.key === key), 'sweep: expired judgment is a finding')
  ok(probe.j.mutations.every(m => m.mode === 'dry'), 'dry-run: every mutation held (mode dry)')
  // isolate the key: every other finding pre-filed → the plan is exactly [file:key]
  fix(w, 'issues-labeled-baseline', listingFor(probe.j, [key]))
  const dry = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(dry.j.actions.length === 1 && dry.j.actions[0].action === 'file' && dry.j.actions[0].key === key, 'dry-run plan: exactly one file action for the isolated key')
  // live-against-recordings: ensure-label + file (the isolated single-action plan)
  mut(w, 0, { plan: { action: 'ensure-label', key: 'baseline' } })
  mut(w, 1, { plan: { action: 'file', key, title: `[baseline] JDG-0001: judgment expired: JDG-0001 (deviation)` }, result: { number: 101 } })
  const live = recJson(w.clone, [], ENV(w))
  ok(live.status === 0 && live.j.summary.delivered >= 1 && live.j.summary.failed === 0, 'replay-live: plan matches recordings → delivered, exit 0')
  // update flow (comment → refp) against recordings, WITH NO file actions in the
  // plan — proves ensure-label is skipped and seq numbering starts at the update
  fix(w, 'issues-labeled-baseline', [...listingFor(probe.j, [key]), issue(70, 'open', key, 'aaaaaaaaaaaa')])
  mut(w, 0, { plan: { action: 'comment', key, issue: 70 } })
  mut(w, 1, { plan: { action: 'refp', key, issue: 70 } })
  const upd = recJson(w.clone, [], ENV(w))
  ok(upd.status === 0 && upd.j.actions.length === 1 && upd.j.actions[0].action === 'update' && upd.j.summary.delivered === 1 && upd.j.summary.failed === 0, 'update flow: comment+refp pair matches recordings, no ensure-label, exit 0')
  fs.rmSync(path.join(w.replay, 'mut-000.json')); fs.rmSync(path.join(w.replay, 'mut-001.json'))
  fix(w, 'issues-labeled-baseline', [])
  // tampered recording → mismatch → exit 1, and gate:reconcile relief must NOT apply
  mut(w, 0, { plan: { action: 'ensure-label', key: 'baseline' } })
  mut(w, 1, { plan: { action: 'file', key, title: 'WRONG TITLE' } })
  const bad = recJson(w.clone, [], ENV(w))
  ok(bad.status === 1 && bad.j.deliveryFailure, 'replay mismatch → delivery failure, exit 1')
  commitSeed(w, 'records/judgments/JDG-0002.json', JDG('JDG-0002', { kind: 'break-glass', gate: 'reconcile', subject: 'delivery outage' }), 'relief judgment')
  pull(w)
  const bad2 = recJson(w.clone, [], ENV(w))
  ok(bad2.status === 1 && !bad2.j.relief, 'replay mismatch is a harness violation — never JDG-relieved')
}
{
  // unchanged / cleared / SKIP≠clear / bot-reopen in one world
  const w = mkworld('cycle')
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2020-01-01' }), 'expired judgment')
  pull(w)
  const key = findingKey('JDG-0001', 'subject-JDG-0001')
  // compute the REAL fp (and the ambient warn set) by asking a dry run first
  fix(w, 'issues-labeled-baseline', [])
  const probe = recJson(w.clone, ['--dry-run'], ENV(w))
  const realFp = probe.j.findings.find(f => f.key === key).fp
  // open issue, same fp (ambient warns pre-filed too) → no actions at all
  fix(w, 'issues-labeled-baseline', [...listingFor(probe.j, [key]), issue(70, 'open', key, realFp)])
  const same = recJson(w.clone, ['--dry-run'], ENV(w))
  ok((same.j.actions || []).length === 0, 'unchanged finding on an open issue → no action')
  // GOV skip ≠ clear: an open GOV-01 issue while GOV-01 SKIPs (no branch fixtures) must not close
  fix(w, 'issues-labeled-baseline', [...listingFor(probe.j, []), issue(71, 'open', findingKey('GOV-01', 'main'), 'aaaaaaaaaaaa')])
  const skip = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!(skip.j.actions || []).some(a => a.action === 'close'), 'SKIPped rule with an open filed issue → never closed (fail-open ban)')
  // cleared: judgment re-judged (valid now) → its old issue closes
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2099-12-31' }), 're-judged')
  pull(w)
  fix(w, 'issues-labeled-baseline', [...listingFor(probe.j, [key]), issue(70, 'open', key, realFp)])
  const clr = recJson(w.clone, ['--dry-run'], ENV(w))
  ok((clr.j.actions || []).some(a => a.action === 'close' && a.key === key), 'positively re-evaluated ok → close')
  // bot-closed + expired again → reopen
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2020-01-01' }), 'expired again')
  pull(w)
  fix(w, 'issues-labeled-baseline', [...listingFor(probe.j, [key]), issue(70, 'closed', key, realFp, { botClosed: true })])
  const re = recJson(w.clone, ['--dry-run'], ENV(w))
  ok((re.j.actions || []).some(a => a.action === 'reopen' && a.key === key), 'bot-closed + recurrence → reopen the same issue')
}
{
  // merged-while-red: red admit at a merged PR's HEAD sha; existence-clear
  const w = mkworld('mwr')
  pull(w)
  const headSha = 'a'.repeat(40), mergeSha = 'b'.repeat(40)
  fix(w, 'issues-labeled-baseline', [])
  fix(w, 'prs-merged-main', [{ number: 9, title: 'red merge', headRefOid: headSha, mergeCommit: { oid: mergeSha }, mergedAt: '2026-07-16T00:00:00Z' }])
  fix(w, `check-runs-${headSha}`, { check_runs: [{ name: 'baseline-admit', status: 'completed', conclusion: 'failure' }, { name: 'ci', status: 'completed', conclusion: 'success' }] })
  const key = findingKey('merged-while-red', mergeSha.slice(0, 7))
  const r1 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r1.j.findings.some(f => f.key === key), 'merged-while-red: red admit at the merged HEAD sha files')
  ok(r1.j.findings.find(f => f.key === key).detail.includes('break-glass'), 'the demand names the retroactive JDG recipe')
  // a schema-valid judgment naming the SHORT merge sha clears — even a lapsed one
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'admit', subject: mergeSha.slice(0, 7), review_by: '2020-01-02' }), 'retroactive judgment (lapsed)')
  pull(w)
  fix(w, 'issues-labeled-baseline', [issue(80, 'open', key, r1.j.findings.find(f => f.key === key).fp)])
  const r2 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!r2.j.findings.some(f => f.key === key), 'existence of the covering judgment ends the demand')
  ok((r2.j.actions || []).some(a => a.action === 'close' && a.key === key), '…and closes the filed demand (expiry policing is the sweep, not a zombie reopen)')
  // green admit merged PR: no merged-while-red state in either direction
  fix(w, `check-runs-${headSha}`, { check_runs: [{ name: 'baseline-admit', status: 'completed', conclusion: 'success' }] })
  git(w.clone, 'rm', '-q', 'records/judgments/JDG-0001.json'); git(w.clone, 'commit', '-qm', 'retire'); git(w.clone, 'push', '-q', 'origin', 'main')
  fix(w, 'issues-labeled-baseline', [])
  const r3 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!r3.j.findings.some(f => f.key === key) && !(r3.j.actions || []).some(a => a.key === key), 'green admit → no finding, no action for its key')
}
{
  // GOV wiring: rules []+protected false → both GOV rules file; 403-class → SKIP, absent
  const w = mkworld('gov')
  pull(w)
  fix(w, 'issues-labeled-baseline', [])
  fix(w, 'branch-rules-main', [])
  fix(w, 'branch-meta-main', { protected: false })
  const r1 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r1.j.findings.some(f => f.key === findingKey('GOV-01', 'main')) && r1.j.findings.some(f => f.key === findingKey('GOV-02', 'main')), 'no protection (both surfaces read) → GOV-01+02 file')
  fs.rmSync(path.join(w.replay, 'branch-rules-main.json'))
  const r2 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!r2.j.findings.some(f => f.id === 'GOV-01' || f.id === 'GOV-02'), '403-class (rules denied, meta readable) → SKIP, nothing filed')
  // …and a token downgrade must never bot-close a REAL protection issue (SKIP ≠ clear)
  fix(w, 'issues-labeled-baseline', [issue(90, 'open', findingKey('GOV-01', 'main'), 'aaaaaaaaaaaa')])
  const r2b = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!(r2b.j.actions || []).some(a => a.action === 'close' && a.key === findingKey('GOV-01', 'main')), '403-class with an open GOV filing → never closed on token downgrade')
  fix(w, 'issues-labeled-baseline', [])
  fix(w, 'branch-rules-main', [{ type: 'pull_request', parameters: { required_review_thread_resolution: true } }, { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true } }])
  const r3 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!r3.j.findings.some(f => f.id === 'GOV-01' || f.id === 'GOV-02'), 'enforcing ruleset → both PASS (cleared, nothing filed)')
  // a signatures-only ruleset is NOT merge protection — GOV-01 must still file
  fix(w, 'branch-rules-main', [{ type: 'required_signatures', parameters: {} }])
  const r4 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r4.j.findings.some(f => f.id === 'GOV-01' && f.detail.includes('none protects merges')), 'signatures-only ruleset → GOV-01 files (no merge-protective type)')
  // layered rulesets: the bits live in DIFFERENT rules of the same type — union wins
  fix(w, 'branch-rules-main', [{ type: 'pull_request', parameters: {} }, { type: 'pull_request', parameters: { required_review_thread_resolution: true } }, { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true } }])
  const r5 = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(!r5.j.findings.some(f => f.id === 'GOV-02'), 'layered rulesets: a later rule of the same type carries the bit — union enforced, no false FAIL')
}
{
  // reverse clears: a retired judgment and a rewritten secret close their filings
  const w = mkworld('reverse')
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { review_by: '2020-01-01' }), 'expired judgment')
  commitSeed(w, 'records/sessions/main/2026-01-01-1200-t.md', `note\ntoken AKIA${'IOSFODNN7REALKY'}A\n`, 'record with a planted secret shape')
  pull(w)
  fix(w, 'issues-labeled-baseline', [])
  const probe = recJson(w.clone, ['--dry-run'], ENV(w))
  const jdgKey = findingKey('JDG-0001', 'subject-JDG-0001')
  const scrubF = probe.j.findings.find(f => f.id === 'scrub')
  ok(!!scrubF && probe.j.findings.some(f => f.key === jdgKey), 'reverse world: secret + expired judgment both file')
  // retire the judgment; rewrite the record clean — both keys must CLOSE
  git(w.clone, 'rm', '-q', 'records/judgments/JDG-0001.json')
  fs.writeFileSync(path.join(w.clone, 'records/sessions/main/2026-01-01-1200-t.md'), 'note\nrotated, clean now\n')
  git(w.clone, 'add', '-A'); git(w.clone, 'commit', '-qm', 'retire + rotate'); git(w.clone, 'push', '-q', 'origin', 'main')
  fix(w, 'issues-labeled-baseline', [issue(60, 'open', jdgKey, 'aaaaaaaaaaaa'), issue(61, 'open', scrubF.key, scrubF.fp)])
  const r = recJson(w.clone, ['--dry-run'], ENV(w))
  ok((r.j.actions || []).some(a => a.action === 'close' && a.key === jdgKey), 'reverse clear: a RETIRED judgment closes its filing')
  ok((r.j.actions || []).some(a => a.action === 'close' && a.key === scrubF.key), 'reverse clear: a rotated/rewritten secret closes its filing (complete scan)')
}
{
  // detached HEAD at the tip — the EXACT cron state (actions/checkout)
  const w = mkworld('detached')
  pull(w)
  git(w.clone, 'checkout', '-q', '--detach')
  fix(w, 'issues-labeled-baseline', [])
  const r = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r.status === 0 && r.j?.summary.mode === 'dry-run' && !r.j.reportOnly, 'detached HEAD at the tip → full run (the cron state works)')
}
{
  // dead-cron guard + gate:reconcile relief for LIVE outages (no replay: forge unreachable)
  const w = mkworld('dead')
  pull(w)
  const r1 = recJson(w.clone) // no replay env → probe fails (file:// origin resolves no forge repo)
  ok(r1.status === 1 && r1.j.deliveryFailure?.includes('unreadable'), 'clean run, tracker unreachable → exit 1 (a dead cron must not stay green)')
  commitSeed(w, 'records/judgments/JDG-0001.json', JDG('JDG-0001', { kind: 'break-glass', gate: 'reconcile', subject: 'tracker outage' }), 'relief')
  pull(w)
  const r2 = recJson(w.clone)
  ok(r2.status === 0 && r2.j.relief?.id === 'JDG-0001', 'unexpired gate:reconcile break-glass at the tip relieves a live outage, labeled')
}

console.log('\n# M7c — JDG_PARSE_CAP parity (sweep + re-scan bounded, labeled)\n')
{
  const w = mkworld('caps')
  fs.mkdirSync(path.join(w.seed, 'records/judgments'), { recursive: true })
  // 501 ledger entries: first and last are EXPIRED — the in-cap one must file,
  // the out-of-cap one must NOT (bounded work, fail-closed, labeled — never
  // silently complete)
  for (let i = 1; i <= 501; i++) {
    const id = `JDG-${String(i).padStart(4, '0')}`
    const over = (i === 1 || i === 501) ? { review_by: '2020-01-01' } : {}
    fs.writeFileSync(path.join(w.seed, `records/judgments/${id}.json`), JDG(id, over))
  }
  git(w.seed, 'add', '-A'); git(w.seed, 'commit', '-qm', 'a 501-entry ledger'); git(w.seed, 'push', '-q', 'origin', 'main')
  pull(w)
  const r = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r.status === 0 && r.j.summary.jdg.records === 501 && r.j.summary.jdg.swept === 500, `caps: sweep evaluates exactly 500 of 501 (got swept=${r.j?.summary?.jdg?.swept})`)
  ok(/capped at 500 of 501/.test(r.j.summary.jdg.capped || ''), 'caps: the sweep truncation is LABELED in the summary')
  ok(r.j.summary.rescan.files === 501 && /capped at 500 of 501/.test(r.j.summary.rescan.capped || ''), 'caps: the re-scan cap is LABELED with the same ceiling')
  const expiredKeys = r.j.findings.filter(f => /expired/.test(f.title)).map(f => f.key)
  ok(expiredKeys.some(k => k.includes('JDG-0001')) && !expiredKeys.some(k => k.includes('JDG-0501')), 'caps: in-cap expiry files, out-of-cap expiry does not (its issue neither files nor clears this run)')
}

console.log('\n# M7c — OPS-07: the reconcile cron is alive at the forge\n')
{
  const w = mkworld('ops07')
  commitSeed(w, '.github/workflows/baseline-reconcile.yml', 'on:\n  schedule:\n    - cron: "17 5 * * *"\njobs:\n  reconcile:\n    steps:\n      - run: node tools/baseline/baseline.mjs reconcile --repo .\n', 'wire the cron')
  pull(w)
  // no workflow-state replay fixture → SKIP, labeled, never guessed
  let r = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r.status === 0 && !r.j.findings.some(f => f.key.includes('OPS-07')), 'OPS-07: unreadable state (no replay fixture) is a SKIP, never a finding')
  // disabled_inactivity — the named death mode — is a WARN finding with the re-enable recipe
  fix(w, 'workflow-state-baseline-reconcile.yml', { name: 'baseline-reconcile', state: 'disabled_inactivity' })
  r = recJson(w.clone, ['--dry-run'], ENV(w))
  const f = r.j.findings.find(x => x.key.includes('OPS-07'))
  ok(!!f && /disabled_inactivity/.test(f.detail) && /60-day/.test(f.detail) && /gh workflow enable/.test(f.detail), 'OPS-07: disabled_inactivity WARNs naming the death mode and the re-enable recipe')
  // active → healthy, no finding
  fix(w, 'workflow-state-baseline-reconcile.yml', { name: 'baseline-reconcile', state: 'active' })
  r = recJson(w.clone, ['--dry-run'], ENV(w))
  ok(r.status === 0 && !r.j.findings.some(x => x.key.includes('OPS-07')), 'OPS-07: an active cron is a clean PASS')
}

console.log('')
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
if (fails) { console.error(`✗ ${fails} reconcile assertion(s) failed`); process.exit(1) }
console.log('all green')
