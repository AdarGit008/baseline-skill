#!/usr/bin/env node
// gen index + gen --check (M6c) — the generated-view contract — and the
// inputs_digest stability proofs. Covers: marker round-trip + prefix detection,
// deterministic output (double-gen byte-equal, sorted everything), the union
// discovery pool (a just-written untracked view is seen), drift + the
// verbatim-runnable remedy + the predates-this-PR clause, unknown-kind causes,
// the hand-file overwrite refusal (uncapped probe — a >512KB hand file still
// refuses), BOM/CRLF tolerance in DETECTION with byte-drift still loud, link
// form relative to the out dir (CTX-05's resolver semantics), docs-map
// exclusions (generated views, session bases), zero-views trivially green,
// digest canonicalization (full-tuple sort, absent-as-value, anchor none).
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inputsDigest, provenanceLine } from '../../src/digest.mjs'
import { MARKER_OF, MARKER_DETECT_RE, generateIndex, remedyCommand } from '../../src/gen.mjs'
import { indexRepo } from '../../src/repo.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const BASELINE = path.join(ROOT, 'baseline.mjs')

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }
const tmps = []
const GITENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Gen Tester', GIT_AUTHOR_EMAIL: 'gen@test.invalid', GIT_COMMITTER_NAME: 'Gen Tester', GIT_COMMITTER_EMAIL: 'gen@test.invalid' }
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...GITENV } }).trim()
const cli = (cwd, args) => spawnSync(process.execPath, [BASELINE, 'gen', ...args, '--repo', cwd], { cwd, encoding: 'utf8', env: { ...process.env, ...GITENV } })

function mkrepo(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gen-${name}-`)); tmps.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  fs.mkdirSync(path.join(dir, 'records/judgments'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'records/sessions/lane/7'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'records/judgments/JDG-0001.json'), JSON.stringify({ record: 'judgment/1', id: 'JDG-0001', kind: 'deviation', date: '2026-01-01', by: 't', subject: 'a thing', reason: 'r', review_by: '2099-01-01' }, null, 2) + '\n')
  fs.writeFileSync(path.join(dir, 'records/sessions/lane/7/2026-02-03-1200-t.md'), '---\nlane: lane/7\n---\n## Did\nx\n')
  fs.writeFileSync(path.join(dir, 'records/sessions/lane/7/2026-01-01-0900-t.md'), '---\nlane: lane/7\n---\n## Did\ny\n')
  fs.writeFileSync(path.join(dir, 'docs/start-here.md'), '# Start Here\ncontent\n')
  fs.writeFileSync(path.join(dir, 'docs/notitle.md'), 'no heading here\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'seed')
  return dir
}

console.log('\n# digest — canonicalization stability\n')
{
  const base = { head: 'a'.repeat(40), target: 'b'.repeat(40), descriptorOid: 'c'.repeat(40), rulesVersion: '2.3.0', checkRuns: [{ name: 'ci', conclusion: 'success', head_sha: '1'.repeat(40) }, { name: 'ci', conclusion: 'success', head_sha: '0'.repeat(40) }, { name: 'admit', conclusion: 'failure', head_sha: '1'.repeat(40) }], anchor: { issue: 7, state: 'open' } }
  ok(inputsDigest(base) === inputsDigest({ ...base, checkRuns: [...base.checkRuns].reverse() }), 'tuple permutation stable — incl. same-name-same-conclusion ties (full-tuple sort)')
  ok(inputsDigest({ ...base, checkRuns: null }) !== inputsDigest({ ...base, checkRuns: [] }), 'not-consulted is a VALUE — null forge ≠ zero runs')
  ok(inputsDigest({ ...base, checkRuns: undefined }) === inputsDigest({ ...base, checkRuns: null }), 'undefined ≡ null (both mean not consulted)')
  ok(inputsDigest({ ...base, anchor: null }) !== inputsDigest(base), 'anchor none is first-class')
  ok(inputsDigest({ ...base, checkRuns: [{ name: 'ci', conclusion: null, head_sha: '1'.repeat(40) }] }) !== inputsDigest({ ...base, checkRuns: [{ name: 'ci', conclusion: 'success', head_sha: '1'.repeat(40) }] }), 'in-progress (null conclusion) digests distinctly')
  ok(/^[0-9a-f]{12}$/.test(inputsDigest(base)), '12-hex digest')
  const line = provenanceLine({ digest: inputsDigest(base), ...base })
  ok(line.startsWith('provenance: inputs_digest ') && line.includes('3 check run(s)') && line.includes('anchor #7 open'), 'provenance line shape')
  ok(provenanceLine({ digest: 'd', ...base, checkRuns: null, anchor: null }).includes('checks not consulted') && provenanceLine({ digest: 'd', ...base, checkRuns: null, anchor: null }).includes('anchor none'), 'degradations are words, never omissions')
}

console.log('\n# gen index — determinism, marker, links, exclusions\n')
{
  const dir = mkrepo('gen')
  const r1 = cli(dir, ['index'])
  ok(r1.status === 0, 'gen index writes (exit 0)')
  const out = fs.readFileSync(path.join(dir, 'docs/INDEX.md'), 'utf8')
  ok(out.split('\n', 1)[0] === MARKER_OF('index'), 'line 1 is the marker, exactly')
  ok(MARKER_DETECT_RE.test(out.split('\n', 1)[0]), 'the marker matches its own detection RE')
  ok(out.includes('| JDG-0001 | deviation | a thing | 2099-01-01 |'), 'judgments table renders')
  ok(out.includes('`lane/7` — 2 record(s), newest 2026-02-03'), 'sessions grouped by lane, newest date from the FILENAME')
  ok(out.includes('- [Start Here](start-here.md)') && out.includes('- [notitle.md](notitle.md)'), 'docs map: first-heading title, filename fallback, links relative to the out dir')
  ok(!out.includes('INDEX.md'), 'the view never lists itself')
  for (const m of out.matchAll(/\]\(([^)]+)\)/g)) ok(fs.existsSync(path.resolve(path.join(dir, 'docs'), m[1])), `link resolves from the out dir (CTX-05 semantics): ${m[1]}`)
  // determinism: regenerate in-memory twice, byte-equal, and equal to disk
  const repo = indexRepo(dir)
  ok(generateIndex(repo, 'docs/INDEX.md') === generateIndex(repo, 'docs/INDEX.md') && generateIndex(repo, 'docs/INDEX.md') === out, 'double-gen byte-equal (deterministic)')
  const r2 = cli(dir, ['index'])
  ok(r2.status === 0 && r2.stdout.includes('up to date'), 'idempotent rerun says up to date')
  // union pool: the view is NOT yet tracked — --check must still discover it
  const c1 = cli(dir, ['--check'])
  ok(c1.status === 0 && c1.stdout.includes('1 generated view(s) in sync'), 'untracked fresh view discovered (union pool) and in sync')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'adopt view')
  // drift + remedy
  fs.writeFileSync(path.join(dir, 'docs/INDEX.md'), out.replace('deviation', 'tampered'))
  const c2 = cli(dir, ['--check'])
  ok(c2.status === 1 && c2.stderr.includes('drifted from its inputs'), 'tampered view → exit 1 drift')
  ok(c2.stderr.includes('gen index --out docs/INDEX.md --repo') && c2.stderr.includes('node '), 'remedy is a runnable node command naming out + repo')
  ok(c2.stderr.includes('may predate this PR') && c2.stderr.includes('vendored skill just bumped'), 'remedy carries the predates-this-PR + vendor-bump clauses')
  // ledger change (not tamper) drifts the same honest way
  fs.writeFileSync(path.join(dir, 'docs/INDEX.md'), out)
  fs.writeFileSync(path.join(dir, 'records/judgments/JDG-0002.json'), JSON.stringify({ record: 'judgment/1', id: 'JDG-0002', kind: 'sign-off', date: '2026-01-02', by: 't', subject: 'x', reason: 'r', review_by: '2099-01-01' }, null, 2) + '\n')
  ok(cli(dir, ['--check']).status === 1, 'a NEW ledger record drifts the committed view (the real cycle)')
  cli(dir, ['index'])
  ok(cli(dir, ['--check']).status === 0, 'regenerate clears it')
}

console.log('\n# gen index — refusals\n')
{
  const dir = mkrepo('refuse')
  fs.writeFileSync(path.join(dir, 'docs/hand.md'), '# Hand-written\nprecious\n')
  const r = cli(dir, ['index', '--out', 'docs/hand.md'])
  ok(r.status === 2 && r.stderr.includes('without the generated marker'), 'hand-written file → refusal (exit 2)')
  ok(r.stderr.includes('Move it aside') && !r.stderr.toLowerCase().includes('add the marker'), 'refusal names the way out, never coaches marker-pasting')
  ok(fs.readFileSync(path.join(dir, 'docs/hand.md'), 'utf8').includes('precious'), 'nothing was clobbered')
  // a >512KB hand file: the capped readText would call it absent — the probe must not
  fs.writeFileSync(path.join(dir, 'docs/big.md'), '# Big\n' + 'x'.repeat(600 * 1024))
  ok(cli(dir, ['index', '--out', 'docs/big.md']).status === 2, 'a >512KB hand file still refuses (uncapped probe)')
  ok(cli(dir, ['index', '--out', '/tmp/evil.md']).status === 2 && cli(dir, ['index', '--out', '../escape.md']).status === 2, '--out stays inside the repo')
}

console.log('\n# gen --check — discovery honesty\n')
{
  const dir = mkrepo('check')
  const c0 = cli(dir, ['--check'])
  ok(c0.status === 0 && c0.stdout.includes('no generated views'), 'zero marked views → trivially green (the pre-adoption state)')
  // unknown kind: loud with both causes
  fs.writeFileSync(path.join(dir, 'docs/weird.md'), '<!-- baseline:generated wormhole — do not edit by hand; regenerate: baseline gen wormhole -->\nstuff\n')
  const c1 = cli(dir, ['--check'])
  ok(c1.status === 1 && c1.stderr.includes("unknown generated kind 'wormhole'") && c1.stderr.includes('OLDER than the view') && c1.stderr.includes('typo'), 'unknown kind → exit 1 naming both causes')
  fs.rmSync(path.join(dir, 'docs/weird.md'))
  // BOM + CRLF: detection tolerates, byte-compare stays loud
  cli(dir, ['index'])
  const clean = fs.readFileSync(path.join(dir, 'docs/INDEX.md'), 'utf8')
  fs.writeFileSync(path.join(dir, 'docs/INDEX.md'), '﻿' + clean.replace(/\n/g, '\r\n'))
  const c2 = cli(dir, ['--check'])
  ok(c2.status === 1 && c2.stderr.includes('drifted'), 'BOM/CRLF view is DISCOVERED (detection tolerant) and reported as drift (bytes are loud)')
  // a >512KB generated view must not silently green
  fs.writeFileSync(path.join(dir, 'docs/INDEX.md'), clean.replace('# Index', '# Index\n' + 'x'.repeat(600 * 1024)))
  const c3 = cli(dir, ['--check'])
  ok(c3.status === 1 && c3.stderr.includes('drifted'), 'a >512KB drifted view is still seen (uncapped read — no silent green)')
  // the guard's own output is not spoofable by the content it scans
  fs.writeFileSync(path.join(dir, 'docs/INDEX.md'), clean)
  fs.writeFileSync(path.join(dir, 'docs/evil.md'), '<!-- baseline:generated [31mHACK — x -->\nstuff\n')
  const c4 = cli(dir, ['--check'])
  ok(c4.status === 1 && !c4.stderr.includes('') && !c4.stderr.includes(''), 'ANSI/BEL in a marker kind never reaches the terminal (sanitized)')
  fs.rmSync(path.join(dir, 'docs/evil.md'))
  // unscannable: a tracked-but-unreadable file fails NAMED, never skipped
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    fs.writeFileSync(path.join(dir, 'docs/locked.md'), 'x\n')
    git(dir, 'add', 'docs/locked.md')
    fs.chmodSync(path.join(dir, 'docs/locked.md'), 0o000)
    const c5 = cli(dir, ['--check'])
    ok(c5.status === 1 && c5.stderr.includes('unscannable'), 'tracked-but-unreadable → exit 1 unscannable (never a silent skip)')
    fs.chmodSync(path.join(dir, 'docs/locked.md'), 0o644)
  }
}

console.log('\n# hostile content + fs edges (panel regressions)\n')
{
  const dir = mkrepo('hostile')
  // space-bearing filename + bracket-bearing title + pipe/newline subject
  fs.writeFileSync(path.join(dir, 'docs/a file.md'), '# A [weird] (title)\nx\n')
  fs.writeFileSync(path.join(dir, 'records/judgments/JDG-0002.json'), JSON.stringify({ record: 'judgment/1', id: 'JDG-0002', kind: 'deviation', date: '2026-01-01', by: 't', subject: 'pipe | and\nnewline', reason: 'r', review_by: '2099-01-01' }, null, 2) + '\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'hostile')
  ok(cli(dir, ['index']).status === 0, 'hostile content generates')
  const out = fs.readFileSync(path.join(dir, 'docs/INDEX.md'), 'utf8')
  ok(out.includes('](<a file.md>)'), 'space-bearing destination rides in <...>')
  ok(out.includes('[A weird (title)]'), 'brackets stripped from link titles')
  ok(out.includes('pipe ∣ and newline'), 'table cells: pipes neutralized, newlines flattened')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'view')
  // the promise itself: the generated view must not redden the consumer's own check
  const CHECK = path.join(ROOT, 'check.mjs')
  const chk = spawnSync(process.execPath, [CHECK, '--repo', dir, '--json', '--no-exec'], { encoding: 'utf8', env: { ...process.env, ...GITENV } })
  const rows = JSON.parse(chk.stdout).results
  const ctx05 = rows.find(r => r.id === 'CTX-05')
  ok(ctx05 && ctx05.tag !== 'FAIL', `the view passes the consumer's own md-links blocker (CTX-05 ${ctx05?.tag}: ${String(ctx05?.detail).slice(0, 60)})`)
  // claims duplicate ids: row order pinned by _file tiebreak, not walk order
  const CLM = slug => JSON.stringify({ record: 'claim/1', id: 'CLM-0001', slug, statement: 's', type: 'technical', build_state: 'shipped-tested', blast_radius: 'recoverable' }) + '\n'
  fs.mkdirSync(path.join(dir, 'records/claims'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'records/claims/CLM-0001.json'), CLM('alpha'))
  fs.writeFileSync(path.join(dir, 'records/claims/CLM-0001b.json'), CLM('beta'))
  const g1 = generateIndex(indexRepo(dir), 'docs/INDEX.md')
  ok(g1.indexOf('alpha') > 0 && g1.indexOf('alpha') < g1.indexOf('beta') && g1 === generateIndex(indexRepo(dir), 'docs/INDEX.md'), 'duplicate claim ids: deterministic row order (_file tiebreak)')
}
{
  const dir = mkrepo('fsedge')
  // deleted-but-tracked ORDINARY md: not a view, not a red
  fs.writeFileSync(path.join(dir, 'docs/gone.md'), '# Gone\n')
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'add gone')
  fs.rmSync(path.join(dir, 'docs/gone.md'))
  ok(cli(dir, ['--check']).status === 0, 'deleted-but-tracked ordinary md → no false red (staged content consulted)')
  // symlinked out-path refused (write path only; never committed — --check reads are fine)
  const outside = path.join(os.tmpdir(), `gen-outside-${path.basename(dir)}.md`); tmps.push(outside)
  fs.writeFileSync(outside, 'plain outside file\n')
  fs.symlinkSync(outside, path.join(dir, 'docs/LINKED.md'))
  const r = cli(dir, ['index', '--out', 'docs/LINKED.md'])
  ok(r.status === 2 && r.stderr.includes('symlink'), 'symlinked --out refused (stay-inside-the-repo is a real law, not a string check)')
  fs.rmSync(path.join(dir, 'docs/LINKED.md'))
  // deleted-but-tracked VIEW: named red
  cli(dir, ['index'])
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'adopt')
  fs.rmSync(path.join(dir, 'docs/INDEX.md'))
  const r2 = cli(dir, ['--check'])
  ok(r2.status === 1 && r2.stderr.includes('deleted from the worktree'), 'deleted view → named red (restore or git rm)')
  // ..-prefixed but legal name is not refused
  ok(cli(dir, ['index', '--out', '..weird.md']).status === 0, "'..weird.md' is a legal filename, not an escape")
}

console.log('\n# remedy — the vendored-consumer (in-repo) form\n')
{
  // remedyCommand derives from process.argv[1]; fake the vendored layout by
  // pointing argv[1] inside the repo for the duration of the call
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-remedy-')); tmps.push(dir)
  const orig = process.argv[1]
  try {
    process.argv[1] = path.join(dir, 'tools/baseline/baseline.mjs')
    ok(remedyCommand(dir, 'index', 'docs/INDEX.md') === 'node tools/baseline/baseline.mjs gen index --out docs/INDEX.md --repo .', 'in-repo runner → repo-relative verbatim command')
    process.argv[1] = '/somewhere/else/baseline.mjs'
    ok(remedyCommand(dir, 'index', 'docs/INDEX.md') === `node /somewhere/else/baseline.mjs gen index --out docs/INDEX.md --repo ${dir}`, 'out-of-repo runner → absolute verbatim command')
  } finally { process.argv[1] = orig }
}

console.log('')
for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
if (fails) { console.error(`✗ ${fails} gen assertion(s) failed`); process.exit(1) }
console.log('all green')
