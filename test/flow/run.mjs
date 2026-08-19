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
  schema_version: 1, type: 'docs', lifecycle: 'production', maturity: 'released',
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
  // a LICENSE clears COMM-01 so exit codes reflect ONLY the FLOW/DIV rules
  // under test (as the golden lanes-repo does)
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

// ---------- #54: the newest record is the newest RECORD, not the last filename ----------
// Three selections, one mechanism. `named` writes an arbitrary file name + record kind so a
// case can make the governing record sort FIRST — which is exactly what the old filename
// sort got wrong (mcgyvr lane/231: a same-day prereg outranked the session that governs).
const named = (w, lane, file, { record = 'session/1', next = '' } = {}) => {
  const dir = path.join(w, 'records', 'sessions', lane); fs.mkdirSync(dir, { recursive: true })
  const body = record.startsWith('session/')
    ? `## Did\nwork\n\n## Left open\nnext: ${next}\n`
    : '## Declared before dispatch\nthe prediction\n'
  fs.writeFileSync(path.join(dir, file), `---\nrecord: ${record}\nlane: ${lane}\nagent: t\nstarted: 2026-07-01T09:00:00Z\n---\n\n${body}`)
  git(w, 'add', '-A'); git(w, 'commit', '-qm', file)
}

// (a) a same-day PRE-REGISTRATION sorts last and must NOT be read as the session record
{
  const { w } = world('prereg-sorts-last')
  git(w, 'checkout', '-q', '-b', 'lane/231')
  named(w, 'lane/231', '2026-08-13-checks-under-the-gate.md', { record: 'session/3', next: 'build check 3' })
  named(w, 'lane/231', '2026-08-13-positive-control-prereg.md', { record: 'prereg' })  // 'c' < 'p': sorts LAST
  const out = checkJson(w)
  ok(tag(out, 'FLOW-03').tag === 'PASS' && /session\/3/.test(tag(out, 'FLOW-03').detail),
    'FLOW-03 reads the session record, not the later-sorting prereg (#54)')
  ok(/not considered/.test(tag(out, 'FLOW-03').detail), 'FLOW-03 says how many non-session records it set aside (#54)')
  ok(tag(out, 'DIV-02').tag !== 'SKIP', 'DIV-02 is no longer blinded by the wrong pick (#54)')
}

// (b) no `record:` ordinal anywhere -> COMMIT order decides, not the alphabet
{
  const { w } = world('commit-order-fallback')
  git(w, 'checkout', '-q', '-b', 'lane/7')
  const dir = path.join(w, 'records', 'sessions', 'lane/7'); fs.mkdirSync(dir, { recursive: true })
  // written first, sorts LAST: 'z' > 'a'
  fs.writeFileSync(path.join(dir, 'z-first-written.md'), '## Did\nwork\n\n## Left open\nnext: the stale plan\n')
  git(w, 'add', '-A'); git(w, 'commit', '-qm', 'first')
  fs.writeFileSync(path.join(dir, 'a-last-written.md'), '## Did\nwork\n\n## Left open\nnext: \n')
  git(w, 'add', '-A'); git(w, 'commit', '-qm', 'second')
  const out = checkJson(w)
  ok(tag(out, 'FLOW-03').tag === 'FAIL' && /a-last-written\.md/.test(tag(out, 'FLOW-03').detail),
    'FLOW-03 reads the last-COMMITTED record when no ordinal exists, though it sorts first (#54)')
  ok(/commit order/.test(tag(out, 'FLOW-03').detail), 'FLOW-03 states the basis it selected on (#54)')
}

// (c) the ordinal beats commit order: session/2 committed BEFORE session/1
{
  const { w } = world('ordinal-beats-commit-order')
  git(w, 'checkout', '-q', '-b', 'lane/7')
  named(w, 'lane/7', 'a-second-session.md', { record: 'session/2', next: 'the live plan' })
  named(w, 'lane/7', 'b-backfilled-first.md', { record: 'session/1', next: '' })  // committed later, ordinal lower
  const out = checkJson(w)
  ok(tag(out, 'FLOW-03').tag === 'PASS' && /session\/2/.test(tag(out, 'FLOW-03').detail),
    'FLOW-03 prefers the highest record: ordinal over commit order (#54)')
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

// ---------- DIV-03 sees a SIDEBAR-linked closure (no closing keyword in the body) ----------
{
  // PR #41's body has no closing keyword; the forge's closingIssuesReferences is the
  // ONLY place the #5 closure is visible. The body regex alone would report "none closes".
  const replay = {
    'issue-9.json': { number: 9, state: 'OPEN', title: 'the live anchor' },
    'issue-5.json': { number: 5, state: 'CLOSED', title: 'already done' },
    'issues-open.json': [{ number: 9, title: 'the live anchor', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 41, title: 'sidebar closer', headRefName: 'lane/9', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Work toward #5.' }],
    'pr-closers-41.json': { data: { repository: { pullRequest: { number: 41, closingIssuesReferences: { nodes: [{ number: 5 }] } } } } },
  }
  const { w, replayDir } = world('sidebar', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/9'); logRecord(w, 'lane/9', 'ship it')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'DIV-03').tag === 'DIVERGED' && /#5/.test(tag(out, 'DIV-03').detail), 'DIV-03 DIVERGED: PR #41 closes already-closed #5 via a sidebar link (no keyword in the body)')
}

// ---------- FLOW-08 warns when an open PR will close its OWN lane anchor (sidebar link) ----------
{
  // The trap from #46: a lane PR whose body disclaims the close, but the anchor was
  // linked in the sidebar — it closes on merge regardless. FLOW-08 is the preventive
  // twin of DIV-01 (which fires AFTER the close and deadlocks the lane).
  const replay = {
    'issue-112.json': { number: 112, state: 'OPEN', title: 'the continuing lane' },
    'issues-open.json': [{ number: 112, title: 'the continuing lane', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 124, title: 'lane tip PR', headRefName: 'lane/112', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'First line: this PR does not close its anchor issue. The lane continues past this merge.' }],
    'pr-closers-124.json': { data: { repository: { pullRequest: { number: 124, closingIssuesReferences: { nodes: [{ number: 112 }] } } } } },
  }
  const { w, replayDir } = world('ownanchor', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/112'); logRecord(w, 'lane/112', 'keep going')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'FLOW-08').tag === 'WARN' && /will close its own anchor #112/.test(tag(out, 'FLOW-08').detail) && /via linked reference, not body text/.test(tag(out, 'FLOW-08').detail),
    `FLOW-08 WARN: PR #124 will close its own anchor #112 via sidebar (got ${tag(out, 'FLOW-08').tag}: ${tag(out, 'FLOW-08').detail?.slice(0, 80)})`)
  ok(tag(out, 'DIV-01').tag === 'PASS' && tag(out, 'DIV-03').tag === 'PASS', 'DIV-01/03 stay PASS — the anchor is still open (FLOW-08 is the pre-merge warning, not a divergence)')
}

// ---------- FLOW-08 distinguishes a closing KEYWORD from a sidebar link ----------
{
  const replay = {
    'issue-113.json': { number: 113, state: 'OPEN', title: 'keyword anchor' },
    'issues-open.json': [{ number: 113, title: 'keyword anchor', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 125, title: 'keyword closer', headRefName: 'lane/113', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Closes #113.' }],
    'pr-closers-125.json': { data: { repository: { pullRequest: { number: 125, closingIssuesReferences: { nodes: [{ number: 113 }] } } } } },
  }
  const { w, replayDir } = world('ownanchor-kw', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/113'); logRecord(w, 'lane/113', 'keep going')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'FLOW-08').tag === 'WARN' && /via closing keyword/.test(tag(out, 'FLOW-08').detail) && !/via linked reference/.test(tag(out, 'FLOW-08').detail),
    `FLOW-08 names the keyword source when the body declares it (got ${tag(out, 'FLOW-08').detail?.slice(0, 80)})`)
}

// ---------- FLOW-08 PASS: an open PR that closes a DIFFERENT issue, not its own anchor ----------
{
  const replay = {
    'issue-9.json': { number: 9, state: 'OPEN', title: 'live anchor' },
    'issue-5.json': { number: 5, state: 'OPEN', title: 'other live issue' },
    'issues-open.json': [
      { number: 9, title: 'live anchor', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' },
      { number: 5, title: 'other live issue', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' },
    ],
    'prs-open.json': [{ number: 126, title: 'closes a sibling', headRefName: 'lane/9', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Closes #5.' }],
    'pr-closers-126.json': { data: { repository: { pullRequest: { number: 126, closingIssuesReferences: { nodes: [{ number: 5 }] } } } } },
  }
  const { w, replayDir } = world('ownanchor-pass', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/9'); logRecord(w, 'lane/9', 'keep going')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'FLOW-08').tag === 'PASS' && /no open PR closes its own lane anchor/.test(tag(out, 'FLOW-08').detail),
    'FLOW-08 PASS: PR #126 closes #5, not its own anchor #9')
}

// ---------- an EMPTY forge closing set is authoritative — it does NOT fall back to the body ----------
{
  // forge succeeds with nodes: [] while the body carries a closing keyword: the forge
  // answer (closes nothing) governs. The body regex is the fallback only on query
  // FAILURE (null), never on an empty success — pins the `??` (not `||`) contract.
  const replay = {
    'issue-9.json': { number: 9, state: 'OPEN', title: 'live' },
    'issue-5.json': { number: 5, state: 'CLOSED', title: 'already done' },
    'issues-open.json': [{ number: 9, title: 'live', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 42, title: 'empty closer', headRefName: 'lane/9', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Closes #5.' }],
    'pr-closers-42.json': { data: { repository: { pullRequest: { number: 42, closingIssuesReferences: { nodes: [] } } } } },
  }
  const { w, replayDir } = world('emptyclosers', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/9'); logRecord(w, 'lane/9', 'ship')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'DIV-03').tag === 'PASS' && /none closes an already-closed issue/.test(tag(out, 'DIV-03').detail),
    `DIV-03 PASS: an EMPTY forge closing set is authoritative — the body keyword is NOT consulted (got ${tag(out, 'DIV-03').tag}: ${tag(out, 'DIV-03').detail?.slice(0, 60)})`)
}

// ---------- FLOW-08 fallback: the forge closers query fails, the body keyword still warns ----------
{
  const replay = {
    'issue-114.json': { number: 114, state: 'OPEN', title: 'fallback anchor' },
    'issues-open.json': [{ number: 114, title: 'fallback anchor', labels: [], milestone: null, updatedAt: '2026-07-01T00:00:00Z' }],
    'prs-open.json': [{ number: 127, title: 'keyword fallback', headRefName: 'lane/114', isDraft: false, updatedAt: '2026-07-01T00:00:00Z', body: 'Closes #114.' }],
    // NO pr-closers-127.json — the per-PR query fails (null); the body regex is the fallback
  }
  const { w, replayDir } = world('fallback', { replay })
  git(w, 'checkout', '-q', '-b', 'lane/114'); logRecord(w, 'lane/114', 'keep going')
  const out = checkJson(w, { replayDir })
  ok(tag(out, 'FLOW-08').tag === 'WARN' && /via closing keyword/.test(tag(out, 'FLOW-08').detail),
    `FLOW-08 WARN via the body-regex fallback when the forge closers query fails (got ${tag(out, 'FLOW-08').tag}: ${tag(out, 'FLOW-08').detail?.slice(0, 60)})`)
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
  for (const id of ['FLOW-01', 'DIV-01', 'DIV-03', 'FLOW-08']) ok(tag(out, id).tag === 'SKIP' && /forge not consulted \(multi-lane-local posture\)/.test(tag(out, id).detail), `${id} SKIPs naming the posture, never faked unreachability`)
  ok(tag(out, 'FLOW-03').tag === 'PASS' && tag(out, 'FLOW-05').tag === 'PASS', 'git-plane rules (FLOW-03/05) still evaluate under multi-lane-local')
}

// ---------- a schema-hostile families glob is refused (ReDoS defense), no hang ----------
{
  const { w } = world('redos', { desc: { lanes: { families: ['*'.repeat(80)] } } })
  const out = checkJson(w)
  ok(tag(out, 'DESC-02').tag === 'FAIL' && /at most 64 characters/.test(tag(out, 'DESC-02').detail), 'an over-long families glob is refused at the schema (bounded before globMatcher; invalidity is DESC-02\'s since M7c)')
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

// ---------- #55: the lane rules run on the event that gates the merge ----------
// `actions/checkout` leaves refs/pull/N/merge DETACHED on a pull_request, so a gate that
// reads the checkout alone was n/a on exactly the event a branch-protection ruleset
// requires. The whole branch-scoped family is the subject, not one rule.
const LANE_FAMILY = ['FLOW-02', 'FLOW-03', 'FLOW-04', 'DIV-02']
{
  const { w } = world('prevent', { desc: { workflow: 'multi-lane-local', anchoring: 'off' } })
  git(w, 'checkout', '-q', '-b', 'lane/1'); logRecord(w, 'lane/1', 'y'); git(w, 'push', '-q', 'origin', 'lane/1')
  const push = checkJson(w) // the branch IS checked out: the push-event shape
  git(w, 'checkout', '-q', '--detach', 'HEAD') // what actions/checkout does on pull_request

  const bare = checkJson(w)
  for (const id of LANE_FAMILY) ok(tag(bare, id).tag === 'SKIP' && /no branch resolved/.test(tag(bare, id).detail),
    `${id}: a detached checkout with NO CI event still SKIPs — a bisect is not a lane`)

  const pr = checkJson(w, { env: { GITHUB_HEAD_REF: 'lane/1', GITHUB_EVENT_NAME: 'pull_request' } })
  for (const id of LANE_FAMILY) ok(tag(pr, id).tag === tag(push, id).tag && tag(pr, id).tag !== 'SKIP',
    `${id}: pull_request and push agree on one commit (push ${tag(push, id).tag} / pr ${tag(pr, id).tag}) — the merge gate evaluates the lane`)
  ok(pr.lane?.name === 'lane/1' && pr.lane.basis === 'GITHUB_HEAD_REF' && pr.lane.event === 'pull_request',
    `the run names the lane and the basis it resolved on (got ${JSON.stringify(pr.lane)})`)
  ok(push.lane?.basis === 'checkout', 'a checked-out branch reports basis=checkout, not an environment claim')

  // On a pull_request GITHUB_REF_NAME is the useless 'N/merge' AND its REF_TYPE is
  // 'branch', so the type guard alone would not save it — what saves it is order:
  // HEAD_REF is consulted first and is set on no other event.
  const merge = checkJson(w, { env: { GITHUB_HEAD_REF: 'lane/1', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: '7/merge', GITHUB_EVENT_NAME: 'pull_request' } })
  ok(merge.lane?.name === 'lane/1' && merge.lane.basis === 'GITHUB_HEAD_REF', `a PR's 'N/merge' REF_NAME never wins — HEAD_REF is read first (got ${JSON.stringify(merge.lane)})`)
  const tagpush = checkJson(w, { env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.2.3', GITHUB_EVENT_NAME: 'push' } })
  for (const id of LANE_FAMILY) ok(tag(tagpush, id).tag === 'SKIP', `${id}: a tag push is not a lane (REF_TYPE=tag is refused)`)
  const detpush = checkJson(w, { env: { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'lane/1', GITHUB_EVENT_NAME: 'push' } })
  ok(detpush.lane?.basis === 'GITHUB_REF_NAME' && tag(detpush, 'FLOW-02').tag === 'PASS', 'a push-event run that checked out detached resolves from GITHUB_REF_NAME')
  const junk = checkJson(w, { env: { GITHUB_HEAD_REF: '   ', GITHUB_EVENT_NAME: 'pull_request' } })
  ok(junk.lane?.name == null && tag(junk, 'FLOW-02').tag === 'SKIP', 'an environment naming nothing resolves to null, never to a lane called ""')

  // the checkout always wins: a stale exported HEAD_REF cannot redirect a real branch
  git(w, 'checkout', '-q', 'lane/1')
  const stale = checkJson(w, { env: { GITHUB_HEAD_REF: 'lane/999', GITHUB_EVENT_NAME: 'pull_request' } })
  ok(stale.lane?.name === 'lane/1' && stale.lane.basis === 'checkout', 'the checked-out branch beats the environment (stale GITHUB_HEAD_REF ignored)')
}

for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
console.log(fails ? `\n✗ ${fails} FLOW/DIV check(s) failed\n` : '\n✓ FLOW/DIV behavioral matrix pass\n')
process.exit(fails ? 1 : 0)
