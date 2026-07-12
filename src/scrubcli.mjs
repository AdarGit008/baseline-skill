// `baseline scrub` — scan record content for secret shapes with the ONE scan API
// (src/scrub.mjs) that `baseline log`/`jdg new` and REC-02 share. Two modes:
//
//   baseline scrub <file...> [--repo DIR]          scan worktree files as given
//   baseline scrub --pushed SHA [--since SHA]      scan committed records/ blobs in a
//       [--repo DIR]                               push range (the pre-push hook's mode)
//
// --pushed reads blob content AT the pushed commit (git show), not the worktree —
// what's being pushed is what gets scanned. Without --since (a brand-new ref) the
// whole records/ tree at that commit is scanned. Deterministic findings exit 1
// (the hook blocks the push); heuristics warn and never block (C34/C07). False
// positives get a dated allowlist judgment: --allow <finding-id> --allow-reason "...",
// the same surface as `baseline log`. Exit: 0 clean · 1 blocked · 2 usage/environment.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeOpt, makeOptText, makeOptAll, nowUTC } from './util.mjs'
import { scan, loadAllowlist, addAllowlistEntries, ALLOWLIST_FILE } from './scrub.mjs'

export function runScrub(argv) {
  const opt = makeOpt(argv), optText = makeOptText(argv), optAll = makeOptAll(argv)
  const usage = msg => { console.error(`baseline scrub: ${msg}\n  usage: baseline scrub <file...> [--repo DIR]\n         baseline scrub --pushed SHA [--since SHA] [--repo DIR]\n         baseline scrub --allow ID --allow-reason "..." [--repo DIR]`); return 2 }
  for (const f of ['--repo', '--pushed', '--since', '--allow']) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const git = args => execFileSync('git', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

  // --allow writes the dated judgment and exits — the retry loop after a blocked push
  const allowIds = optAll('--allow')
  if (allowIds.length) {
    const reason = optText('--allow-reason', null)
    if (typeof reason !== 'string' || !reason.trim()) return usage('--allow needs --allow-reason "why this is not a secret"')
    if (allowIds.some(id => !/^scrub-[0-9a-f]{12}$/.test(id))) return usage(`--allow takes finding ids (scrub-<12 hex>, as printed by a scan)`)
    const today = (nowUTC() ?? new Date()).toISOString().slice(0, 10)
    let entries
    try { entries = addAllowlistEntries(REPO, allowIds, reason.trim(), today) } catch (e) { console.error(`baseline scrub: ${e.message}`); return 2 }
    console.log(`allowlisted ${allowIds.join(', ')} (${ALLOWLIST_FILE}, ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}) — commit it and rerun`)
    return 0
  }

  const pushed = opt('--pushed', null)
  let targets // [{name, text}]
  if (pushed) {
    const since = opt('--since', null)
    let paths
    try {
      paths = (since
        ? git(['diff', '--name-only', '--diff-filter=d', `${since}..${pushed}`, '--', 'records/'])
        : git(['ls-tree', '-r', '--name-only', pushed, '--', 'records/'])
      ).toString('utf8').split('\n').filter(Boolean)
    } catch { console.error(`baseline scrub: cannot resolve push range at ${pushed.slice(0, 12)} — is this a git repo?`); return 2 }
    targets = []
    for (const p of paths) {
      try { targets.push({ name: p, text: git(['show', `${pushed}:${p}`]).toString('latin1') }) }
      catch { /* deleted in range / not a blob — nothing to scan */ }
    }
    if (!targets.length) { console.log(`scrub: no record content in the push range — clean`); return 0 }
  } else {
    // positionals = argv minus flags AND their values (a path named like a flag value must not double-count)
    const VALUE_FLAGS = new Set(['--repo', '--pushed', '--since', '--allow', '--allow-reason'])
    const files = []
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]
      if (a.startsWith('-')) { if (VALUE_FLAGS.has(a)) i++; continue }
      files.push(a)
    }
    if (!files.length) return usage('give files to scan, or --pushed SHA')
    targets = []
    for (const f of files) {
      const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)
      let text; try { text = fs.readFileSync(abs, 'latin1') } catch { console.error(`baseline scrub: cannot read ${f}`); return 2 }
      targets.push({ name: f, text })
    }
  }

  let allowlist = []
  try { allowlist = loadAllowlist(REPO).entries } catch (e) { console.error(`baseline scrub: ${e.message}`); return 2 }
  let blocked = 0, warned = 0, allowed = 0
  for (const t of targets) {
    const res = scan(t.text, { allowlist })
    allowed += res.allowed.length
    for (const x of res.blocked) { blocked++; console.error(`  BLOCK ${t.name}:${x.line} ${x.name} (${x.masked}) [${x.id}]`) }
    for (const x of res.warned) { warned++; console.error(`  warn  ${t.name}:${x.line} ${x.name} (${x.masked}) [${x.id}]`) }
  }
  if (blocked) {
    console.error(`\nscrub: ${blocked} deterministic secret shape(s) — push blocked. Rotate/remove them, or for a true false-positive:\n  baseline scrub --allow <finding-id> --allow-reason "why it isn't a secret" --repo ${REPO}`)
    return 1
  }
  console.log(`scrub: ${targets.length} file(s) clean${warned ? ` (${warned} heuristic warning(s) — review, never blocks)` : ''}${allowed ? ` (${allowed} allowlisted)` : ''}`)
  return 0
}
