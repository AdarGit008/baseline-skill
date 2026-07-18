#!/usr/bin/env node
// M5c FLOW/DIV behavioral suite — `baseline check`'s lane-world rules across the
// branch-state matrix that STATIC golden fixtures can't reach (a fixture scores one
// branch of one repo; these need family vs stray vs lane, committed vs draft records,
// firing vs passing, and posture/degradation shapes). Every run is against a LOCAL bare
// origin + a committed forge REPLAY dir — zero network, deterministic. Node >= 18.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')
let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const tmps = []
const GITENV = { GIT_AUTHOR_NAME: 'Flow', GIT_AUTHOR_EMAIL: 'flow@t.invalid', GIT_COMMITTER_NAME: 'Flow', GIT_COMMITTER_EMAIL: 'flow@t.invalid', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...GITENV } }).trim()

const DESC = {
  schema_version: 1, type: 'docs', lifecycle: 'production', maturity: 'released', owner: 't',
  workflow: 'multi-lane', anchoring: 'strict',
  lanes: { namespace: 'lane/*', lease_ttl: '7d', families: ['release/*'] },
  join_keys: ['Baseline-Agent', 'Baseline-Issue'],
  ground_truth_boundary: { forge: 'github', default_branch: 'main' },
}
const REC = (next) => `---\nrecord: session/1\nlane: LANE\nagent: t\nstarted: 2026-07-01T09:00:00Z\n---\n\n## Did\nwork\n\n## Left open\nnext: ${next}\n`

// a repo on a bare origin; desc overrides merge into DESC; returns paths
function world(name, { desc = {}, replay = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-flow-${name}-`)); tmps.push(dir)
  const bare = path.join(dir, 'origin.git'); execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: { ...process.env, ...GITENV } })
  const w = path.join(dir, 'work'); fs.mkdirSync(w)
  git(w, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(w, 'baseline.repo.json'), JSON.stringify({ ...DESC, ...desc, lanes: { ...DESC.lanes, ...(desc.lanes || {}) } }, null, 2) + '\n')
  fs.writeFileSync(path.join(w, 'README.md'), '# flow fixture\n')
  // status_file:false (honored with a valid descriptor) + a LICENSE clear CTX-01/COMM-01
  // so exit codes reflect ONLY the FLOW/DIV rules under test (as the golden lanes-repo does)
  fs.writeFileSync(path.join(w, 'baseline.config.json'), JSON.stringify({ status_file: false }, null, 2) + '\n')
  fs.writeFileSync(path.join(w, 'LICENSE'), 'MIT-ish flow fixture (not a real grant).\n')
  git(w, 'add', '-A'); git(w, 'commit', '-qm', 'init'); git(w, 'remote', 'add', 'origin', bare); git(w, 'push', '-q', 'origin', 'main')
  let replayDir = null
  if (replay) { replayDir = path.join(dir, 'forge'); fs.mkdirSync(replayDir); for (const [f, v] of Object.entries(replay)) fs.writeFileSync(path.join(replayDir, f), JSON.stringify(v) + '\n') }
  return { dir, bare, w, replayDir }
}
function checkJson(w, { replayDir = null, env = {} } = {}) {
  const r = spawnSync(process.execPath, [BASELINE, 'check', '--repo', w, '--no-exec', '--json'],
    { encoding: 'utf8', env: { ...process.env, ...GITENV, ...(replayDir ? { BASELINE_FORGE_REPLAY: replayDir } : {}), ...env } })
  let out; try { out = JSON.parse(r.stdout) } catch { throw new Error(`check emitted no JSON: ${r.stdout.slice(0, 200)} ${r.stderr.slice(0, 200)}`) }
  out.exitCode = r.status ?? 0 // the real process exit (check --json's payload carries summary, not the code)
  return out
}
const tag = (out, id) => out.results.find(r => r.id === id) || {}
// commit a session record on the current branch under its lane path
function logRecord(w, lane, next) {
  const dir = path.join(w, 'records', 'sessions', lane); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '2026-07-01-090000-t.md'), REC(next).replace(/LANE/g, lane))
  git(w, 'add', '-A'); git(w, 'commit', '-qm', 'session record')
}

// ---------- declared-family branch: FLOW-04 PASS, per-lane discipline SKIPs (no wallpaper) ----------
{
  const { w } = world('family')
  git(w, 'checkout', '-q', '-b', 'release/1.2'); fs.appendFileSync(path.join(w, 'README.md'), 'x\n'); git(w, 'commit', '-qam', 'release work')
  const out = checkJson(w)
  ok(tag(out, 'FLOW-04').tag === 'PASS' && /declared family 'release\/\*'/.test(tag(out, 'FLOW-04').detail), 'FLOW-04 PASS: release/1.2 sits in a declared family')
  for (const id of ['FLOW-01', 'FLOW-02', 'FLOW-03', 'FLOW-05']) ok(tag(out, id).tag === 'SKIP' && /declared-family/.test(tag(out, id).detail), `${id} SKIPs a declared-family branch (no wallpaper)`)
  ok(out.exitCode === 0, 'exit 0 on the family branch')
}

// ---------- stray branch: FLOW-04 is the SINGLE finding, not four ----------
{
  const { w } = world('stray')
  git(w, 'checkout', '-q', '-b', 'wip/experiment'); fs.appendFileSync(path.join(w, 'README.md'), 'x\n'); git(w, 'commit', '-qam', 'wip')
  const out = checkJson(w)
  ok(tag(out, 'FLOW-04').tag === 'FAIL' && /outside every declared family/.test(tag(out, 'FLOW-04').detail), 'FLOW-04 FAILs (blocker since M7a): a stray branch is outside every family')
  ok(['FLOW-01', 'FLOW-02', 'FLOW-03', 'FLOW-05'].every(id => tag(out, id).tag === 'SKIP'), 'a stray gets FLOW-04 as its ONE placement finding, not four warns')
}

// ---------- an UNCOMMITTED draft record must not make FLOW-02/03/05 contradict ----------
{
  const { w } = world('draft')
  git(w, 'checkout', '-q', '-b', 'lane/7'); fs.appendFileSync(path.join(w, 'README.md'), 'x\n'); git(w, 'commit', '-qam', 'lane work')
  const dir = path.join(w, 'records', 'sessions', 'lane', '7'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'draft.md'), REC('').replace(/LANE/g, 'lane/7')) // written, NOT committed
  const out = checkJson(w)
  ok(tag(out, 'FLOW-02').tag === 'FAIL', 'FLOW-02 FAILs (blocker since M7a): no COMMITTED record rides the lane')
  ok(['FLOW-03', 'FLOW-05', 'DIV-02'].every(id => tag(out, id).tag === 'SKIP' && /committed/.test(tag(out, id).detail)),
    'FLOW-03/05/DIV-02 SKIP on the uncommitted draft — one predicate, no self-contradiction')
}

// ---------- a committed record with an EMPTY next: → FLOW-03 warns (present-record only) ----------
{
  const { w } = world('emptynext')
  git(w, 'checkout', '-q', '-b', 'lane/7'); logRecord(w, 'lane/7', '')
  const out = checkJson(w)
  ok(tag(out, 'FLOW-03').tag === 'FAIL' && /empty next:/.test(tag(out, 'FLOW-03').detail), 'FLOW-03 FAILs (blocker since M7a): a committed record with an empty next:')
}

// ---------- FLOW-05 WARN: origin has the lane but NOT the newest record (the real gap) ----------
{
  const { w } = world('unpushed')
  git(w, 'checkout', '-q', '-b', 'lane/7'); fs.appendFileSync(path.join(w, 'README.md'), 'x\n'); git(w, 'commit', '-qam', 'lane work')
  git(w, 'push', '-q', 'origin', 'lane/7')          // origin/lane/7 exists...
  logRecord(w, 'lane/7', 'the next thing')          // ...but the newest record is committed AFTER, not pushed
  const out = checkJson(w)
  ok(tag(out, 'FLOW-05').tag === 'FAIL' && /absent at origin/.test(tag(out, 'FLOW-05').detail), 'FLOW-05 FAILs (blocker since M7a): newest record exists locally, absent at origin')
}

// ---------- FLOW-05 PASS once the record is pushed ----------
{
  const { w } = world('pushed')
  git(w, 'checkout', '-q', '-b', 'lane/7'); logRecord(w, 'lane/7', 'do the next thing'); git(w, 'push', '-q', 'origin', 'lane/7')
  const out = checkJson(w)
  ok(tag(out, 'FLOW-03').tag === 'PASS' && tag(out, 'FLOW-05').tag === 'PASS', 'FLOW-03/05 PASS: filled next:, pushed')
}

// ---------- DIV-01/02/03 all fire as DIVERGED on a closed-issue world (replay) ----------
{
  const replay = {
    'issue-9.json': { number: 9, state: 'OPEN', title: 'the live anchor' },
    'issue-5.json': { number: 5, state: 'CLOSED', title: 'already done' },
    'issues-open.json': [{ number: 9, title: 'the live anchor', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 40, title: 'stale closer', headRefName: 'lane/9', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Closes #5.' }],
  }
  const { w, replayDir } = world('diverge', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/9'); logRecord(w, 'lane/9', 'wrap up #5 then ship')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'FLOW-01').tag === 'PASS' && /anchored to #9 \(open\)/.test(tag(out, 'FLOW-01').detail), 'FLOW-01 PASS: anchor #9 resolves open (open-ness is DIV-01\'s, not FLOW-01\'s)')
  ok(tag(out, 'DIV-01').tag === 'PASS', 'DIV-01 PASS: the anchor is open — no divergence')
  ok(tag(out, 'DIV-02').tag === 'DIVERGED' && /#5/.test(tag(out, 'DIV-02').detail), 'DIV-02 DIVERGED: next: names closed #5')
  ok(tag(out, 'DIV-03').tag === 'DIVERGED' && /#5/.test(tag(out, 'DIV-03').detail), 'DIV-03 DIVERGED: open PR #40 closes closed #5')
  ok(out.summary.diverged === 2 && out.exitCode === 1 && out.summary.blockers === 2, 'two blocker-DIVERGED: verdict class preserved, EXIT 1, counted as blockers (M7a)')
}

// ---------- DIV-01 fires when the anchor issue is closed under an active lane ----------
{
  const replay = { 'issue-7.json': { number: 7, state: 'CLOSED', title: 'closed under the lane' }, 'issues-open.json': [], 'prs-open.json': [] }
  const { w, replayDir } = world('anchorclosed', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/7'); fs.appendFileSync(path.join(w, 'README.md'), 'x\n'); git(w, 'commit', '-qam', 'work')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'DIV-01').tag === 'DIVERGED' && /anchor #7 is closed/.test(tag(out, 'DIV-01').detail), 'DIV-01 DIVERGED: lane/7 active, anchor #7 closed')
  ok(tag(out, 'FLOW-01').tag === 'PASS', 'FLOW-01 still PASSes (anchor exists + resolves) — no overlap with DIV-01')
}

// ---------- multi-lane-local: forge-dependent rules SKIP naming the posture, git-plane rules run ----------
{
  const { w } = world('mll', { desc: { workflow: 'multi-lane-local' } })
  git(w, 'checkout', '-q', '-b', 'lane/7'); logRecord(w, 'lane/7', 'next step'); git(w, 'push', '-q', 'origin', 'lane/7')
  const out = checkJson(w)
  for (const id of ['FLOW-01', 'DIV-01', 'DIV-03']) ok(tag(out, id).tag === 'SKIP' && /forge not consulted \(multi-lane-local posture\)/.test(tag(out, id).detail), `${id} SKIPs naming the posture, never faked unreachability`)
  ok(tag(out, 'FLOW-03').tag === 'PASS' && tag(out, 'FLOW-05').tag === 'PASS', 'git-plane rules (FLOW-03/05) still evaluate under multi-lane-local')
}

// ---------- a schema-hostile families glob is refused (ReDoS defense), no hang ----------
{
  const { w } = world('redos', { desc: { lanes: { families: ['*'.repeat(80)] } } })
  const out = checkJson(w)
  ok(tag(out, 'DESC-01').tag === 'WARN' && /at most 64 characters/.test(tag(out, 'DESC-01').detail), 'an over-long families glob is refused at the schema (bounded before globToRe)')
}

// ---------- M7a: the merged-lane COMPLETED exemption (the promotion's hostage guard) ----------
{
  // a lane whose tip is merged into main, anchor CLOSED at the forge: without the
  // exemption this is a blocker-DIVERGED hostage on every post-merge checkout
  const { w, replayDir } = world('completed', {
    replay: {
      'lane-refs-refs_heads_lane_.json': { data: { repository: { refs: { pageInfo: { hasNextPage: false }, nodes: [{ name: '7', target: { oid: 'SELFTIP', committedDate: '2026-07-01T00:00:00Z', message: 'claim lane/7: issue #7\n\nBaseline-Issue: #7\nBaseline-Agent: t', associatedPullRequests: { nodes: [] } } }] } } } },
      'issue-7.json': { number: 7, state: 'closed', title: 'done thing' },
    },
  })
  git(w, 'checkout', '-q', '-b', 'lane/7')
  logRecord(w, 'lane/7', 'push')
  git(w, 'push', '-q', 'origin', 'lane/7')
  // merge the lane into main and push — the tip is now an ancestor of origin/main
  git(w, 'checkout', '-q', 'main'); git(w, 'merge', '-q', '--no-ff', '--no-edit', 'lane/7'); git(w, 'push', '-q', 'origin', 'main')
  git(w, 'checkout', '-q', 'lane/7')
  const tip = git(w, 'rev-parse', 'lane/7')
  const raw = fs.readFileSync(path.join(replayDir, 'lane-refs-refs_heads_lane_.json'), 'utf8').replace('SELFTIP', tip)
  fs.writeFileSync(path.join(replayDir, 'lane-refs-refs_heads_lane_.json'), raw)
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'DIV-01').tag === 'PASS' && /lane complete/.test(tag(out, 'DIV-01').detail), `COMPLETED lane + closed anchor = agreement, never divergence (got ${tag(out, 'DIV-01').tag}: ${tag(out, 'DIV-01').detail?.slice(0, 60)})`)
  ok(tag(out, 'FLOW-07').tag === 'SKIP' && /lane complete/.test(tag(out, 'FLOW-07').detail), 'FLOW-07: a completed lane has no lease to police')
  ok(out.exitCode === 0, 'the merged lane checkout exits 0 — no promotion hostage')
}

for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
console.log(fails ? `\n✗ ${fails} FLOW/DIV check(s) failed\n` : '\n✓ FLOW/DIV behavioral matrix pass\n')
process.exit(fails ? 1 : 0)
