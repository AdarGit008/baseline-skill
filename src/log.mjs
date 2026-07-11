// `baseline log` — write one scrubbed, schema-valid session record (the forensic
// tier, C06). The UX is pinned by the M4 ruling (#21): one command, lane/agent/
// timestamp derived, stdin accepted, never $EDITOR; a scrub block is NON-LOSSY —
// the draft survives under .baseline/cache/ and the exact rerun is printed, with
// inline `--allow <finding-id> --reason "..."` writing the dated allowlist entry.
//
//   baseline log -m "what happened" [--next "the one next step"]
//     [--deadends "..."] [--lane L] [--agent A] [--repo DIR] [--json]
//     [--from FILE] [--allow ID ... --reason "..."]
//
// Message: --from FILE > -m TEXT (or `-m -`) > piped stdin. A --from file that
// starts with '---' is a full record draft (what a scrub block saved) and is
// replayed verbatim: same started/lane/agent, so the path is stable across retries.
// Lane = branch name (FS2 — the M5 seam); paths are collision-free by construction
// (CF1: <YYYY-MM-DD>-<HHMMSS>-<agent>.md, written with O_EXCL, no counters).
// Exit: 0 written · 1 scrub-blocked · 2 usage/environment.
import fs from 'node:fs'
import path from 'node:path'
import { indexRepo } from './repo.mjs'
import { currentBranch, run } from './probe.mjs'
import { validateRecord, parseFrontmatter, renderFrontmatter } from './records.mjs'
import { scan, loadAllowlist, addAllowlistEntries, ALLOWLIST_FILE } from './scrub.mjs'

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)

export function runLog(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d }
  const optAll = n => argv.reduce((a, v, i) => (argv[i] === n && argv[i + 1] && !argv[i + 1].startsWith('--') ? [...a, argv[i + 1]] : a), [])
  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const JSON_OUT = !!opt('--json', false)
  const usage = msg => { console.error(`baseline log: ${msg}\n  usage: baseline log -m "what happened" [--next "..."] [--deadends "..."] [--lane L] [--agent A] [--from FILE] [--allow ID --reason "..."]`); return 2 }

  // ---- the dated-judgment path: --allow writes allowlist entries first ----
  const allowIds = optAll('--allow')
  const reason = opt('--reason', null)
  const now = process.env.BASELINE_LOG_NOW ? new Date(process.env.BASELINE_LOG_NOW) : new Date()
  if (isNaN(now)) return usage('BASELINE_LOG_NOW is not a parseable instant')
  const started = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const today = started.slice(0, 10)
  if (allowIds.length) {
    if (typeof reason !== 'string' || !reason.trim()) return usage('--allow requires --reason "why this is not a secret" (allowlist entries are dated judgments)')
    addAllowlistEntries(REPO, allowIds, reason.trim(), today)
  }

  // ---- resolve the message (never $EDITOR) ----
  const fromFile = opt('--from', null)
  let mFlag = opt('-m', opt('--message', null))
  let message = null, draftReplay = null
  if (typeof fromFile === 'string') {
    let raw; try { raw = fs.readFileSync(path.resolve(fromFile), 'utf8') } catch (e) { return usage(`cannot read --from file: ${e.message}`) }
    if (/^---\r?\n/.test(raw)) draftReplay = raw; else message = raw.trim()
  } else if (mFlag === '-' || (mFlag == null && !process.stdin.isTTY)) {
    try { message = fs.readFileSync(0, 'utf8').trim() } catch { message = '' }
  } else if (typeof mFlag === 'string') {
    message = mFlag.trim()
  }
  if (draftReplay == null && !message) return usage('no message — pass -m "...", pipe stdin, or --from FILE')

  // ---- derive lane / agent / fields ----
  const repo = indexRepo(REPO)
  let fields, body
  if (draftReplay != null) {
    const parsed = parseFrontmatter(draftReplay)
    if (!parsed.fields) return usage('--from draft has no frontmatter (not a record draft)')
    fields = parsed.fields; body = parsed.body
    // explicit flags still win over the draft's derivation
    const laneFlag = opt('--lane', null); if (typeof laneFlag === 'string') fields.lane = laneFlag
    const agentFlag = opt('--agent', null); if (typeof agentFlag === 'string') fields.agent = slug(agentFlag)
  } else {
    // an unborn branch (fresh repo, pre-first-commit) has no HEAD to rev-parse, but a
    // first session is exactly when a record matters — symbolic-ref still names the lane
    const branch = currentBranch(repo) || run('git', ['-C', REPO, 'symbolic-ref', '--short', 'HEAD'])
    const lane = typeof opt('--lane', null) === 'string' ? opt('--lane', null) : (branch && branch !== '(detached)' ? branch : null)
    if (!lane) return usage(`no lane resolvable (${branch === '(detached)' ? 'detached HEAD' : 'no git branch here'}) — pass --lane <name>`)
    // records/ lives under --repo; if that isn't the git toplevel, orient (which reads
    // the toplevel's records/) would never see this record — say so instead of splitting
    const top = run('git', ['-C', REPO, 'rev-parse', '--show-toplevel'])
    if (top && path.resolve(top) !== REPO) console.error(`  note: --repo is below the git toplevel (${top}) — records/ will live under --repo, where orient won't look`)
    const agent = slug(opt('--agent', null) || process.env.BASELINE_AGENT || run('git', ['-C', REPO, 'config', 'user.name']) || 'agent') || 'agent'
    fields = { record: 'session/1', lane, agent, started }
    const next = typeof opt('--next', null) === 'string' ? opt('--next', null).trim() : ''
    const deadends = typeof opt('--deadends', null) === 'string' ? opt('--deadends', null).trim() : ''
    body = `\n# Session — ${lane} — ${today}\n\n## Did\n${message}\n` +
      (deadends ? `\n## Dead ends\n${deadends}\n` : '') +
      `\n## Left open\nnext: ${next}\n`
  }

  const errors = validateRecord('session', fields)
  if (errors.length) return usage(`record invalid: ${errors.join('; ')}`)
  const content = renderFrontmatter(fields) + body

  // ---- the write-time scrub gate (deterministic blocks, heuristic warns — C34/C07) ----
  const { blocked, warned, allowed } = scan(content, { allowlist: loadAllowlist(REPO).entries })
  const stamp = `${fields.started.slice(0, 10)}-${fields.started.slice(11, 19).replace(/:/g, '')}`
  const rel = `records/sessions/${fields.lane}/${stamp}-${fields.agent}.md`

  if (blocked.length) {
    const draftRel = `.baseline/cache/rejected-log-${stamp}-${fields.agent}.md`
    const draftAbs = path.join(REPO, draftRel)
    fs.mkdirSync(path.dirname(draftAbs), { recursive: true })
    fs.writeFileSync(draftAbs, content)
    if (JSON_OUT) { console.log(JSON.stringify({ blocked, warned, draft: draftRel }, null, 2)); return 1 }
    console.error(`✗ scrub blocked the record — nothing written under records/.`)
    for (const f of blocked) console.error(`    ${f.name}  line ${f.line}  (${f.masked}${f.count > 1 ? ` ×${f.count}` : ''})   id ${f.id}`)
    console.error(`  draft kept (NOT lost): ${draftRel}  — .baseline/cache/ stays gitignored; the draft contains the flagged content.`)
    console.error(`  real secret?  rotate it, edit the draft, rerun:  baseline log --from ${draftRel}`)
    console.error(`  false positive?  rerun with the dated judgment:  baseline log --from ${draftRel}${blocked.map(f => ` --allow ${f.id}`).join('')} --reason "why this is not a secret"`)
    return 1
  }

  const abs = path.join(REPO, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  try { fs.writeFileSync(abs, content, { flag: 'wx' }) } // O_EXCL: CF1 forbids counters; same agent + same second = retry, honestly
  catch (e) { return usage(e.code === 'EEXIST' ? `record already exists at ${rel} (same second + agent) — retry` : e.message) }

  if (JSON_OUT) { console.log(JSON.stringify({ written: rel, warned, allowed: allowed.length }, null, 2)); return 0 }
  console.log(`✓ logged ${rel}`)
  for (const f of warned) console.log(`  ⚠ heuristic finding (written anyway): ${f.name} line ${f.line} (${f.masked}) — silence: --allow ${f.id} --reason "..."`)
  for (const f of allowed) console.log(`  · allowed by ${ALLOWLIST_FILE}: ${f.name} (${f.date}: ${f.reason})`)
  const next = parseFrontmatter(content).body.match(/^next:\s*(.*)$/m)
  if (next && next[1]) console.log(`  next: ${next[1]}`)
  return 0
}
