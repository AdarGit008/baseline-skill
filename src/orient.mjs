// `baseline orient` v2 — the five-line survey a session runs first (v3 PLAN §8, §10 D5,
// §11 D7/D8/D12; red tests surface V29, decisions V37, seams V24/V25, plugins V39/V41/V42).
//
//   repo:      <name> @ <HEAD> (<branch>) · pulled | not pulled (<why>)
//   work:      tdd.json present · tracked · 2h old            (obsidian-tdd's artifact)
//   graph:     graphify-out/ present · ignored · 3d old        (graphify's artifact)
//   knowledge: okf bundle present                              (okf-rag's bundle)
//   score:     0 blockers · 4 advisory                         (check, in-process)
//
// Step 0 is `git pull --ff-only --quiet` — orient's ONLY network act (D5). A pull that
// cannot happen (no git, no origin, unreachable, diverged, local changes) degrades to a
// note and the survey still prints; nothing else touches git's state: no stash, no
// commit, no other write. After the pull orient touches no forge and never spawns gh —
// and since the v4 rule-set cut that is STRUCTURAL, not a flag: GOV-01, GOV-02 and OPS-07
// are deleted along with the forge seam itself, so the score is `check`'s own pipeline run
// in-process over repo files, with no plane left to close.
//
// The three plugin lines are METADATA (D7): presence, file-or-dir, git's tracked/ignored
// answer and the artifact's mtime — probePlugin never opens tdd.json or anything under
// graphify-out/, and the bundle is asked only whether its path exists. An absent graph is
// a suggestion, never a finding (D8: the WARN is PLUG-02's check row, not an orient line),
// and no PLUG row is rendered here. Exit code is 0, always — orient blocks on nothing.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeOpt, sanitizeTTY, nowUTC } from './util.mjs'
import { pluginSpec, probePlugin, LOG_DIR } from './plugins.mjs'
import { scoreRepo } from './check-run.mjs'

const LABELS = ['repo', 'work', 'graph', 'knowledge', 'score']
const LABELW = Math.max(...LABELS.map(l => l.length)) + 2 // "knowledge: " sets the column
const fmtAge = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return null
  if (ms < 3600000) return 'fresh (<1h)'
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h old`
  return `${Math.floor(ms / 86400000)}d old`
}

// ---------------------------------------------------------------- step 0: the pull (D5)
// The reason is CLASSIFIED, not echoed: git's stderr names paths and refs a survey line
// has no business repeating, and the note only has to say that the pull did not happen
// and roughly why. Anchored first so a remote's "does not appear to be a git repository"
// is never mistaken for the working tree not being one.
function pullReason(err, e) {
  if (e?.killed || /ETIMEDOUT/i.test(String(e?.code || ''))) return 'origin timed out'
  if (/^fatal: not a git repository/im.test(err)) return 'not a git repository'
  if (/not currently on a branch/i.test(err)) return 'detached HEAD, nothing to pull onto'
  if (/no such remote|No remote repository specified|no tracking information|no upstream|does not have any commits|couldn't find remote ref/i.test(err)) return 'no origin branch to pull from'
  if (/Not possible to fast-forward|non-fast-forward|diverg|refusing to merge unrelated/i.test(err)) return 'branches diverged (not a fast-forward)'
  if (/would be overwritten|local changes|uncommitted|unmerged files|You have not concluded/i.test(err)) return 'local changes in the way'
  if (/Could not read from remote|does not appear to be a git repository|Could not resolve|unable to access|Connection|Network is unreachable|timed out|Permission denied|authentication|could not connect/i.test(err)) return 'origin unreachable'
  return 'git pull failed'
}
function pullFirst(REPO) {
  try {
    execFileSync('git', ['-C', REPO, 'pull', '--ff-only', '--quiet'], {
      encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000,
      // a session hook must never hang on a credential prompt; a pull that needs one is a
      // pull that did not happen, and the note says so
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return { pulled: true, reason: null }
  } catch (e) {
    return { pulled: false, reason: pullReason(String(e?.stderr || e?.message || ''), e) }
  }
}

// ---------------------------------------------------------------- the score leaves no trace
// check's PLUG evaluators write .baseline/log/PLUG-0N.log on a WARN and remove it on a PASS
// (D10) — that log is a `check` artifact. orient is a survey: the same pipeline runs, but
// the tree it read must be the tree it leaves (V37: worktree clean), so whatever the run
// did to the log directory is put back — a pre-existing log keeps its bytes, a fresh one
// goes, a directory the run created goes with it.
function shieldPluginLogs(REPO) {
  const base = path.join(REPO, '.baseline'), dir = path.join(REPO, LOG_DIR)
  const isLog = f => /^[A-Z]+-\d{2}\.log$/.test(f)
  const hadBase = fs.existsSync(base), hadDir = fs.existsSync(dir)
  const before = new Map()
  if (hadDir) { try { for (const f of fs.readdirSync(dir)) if (isLog(f)) { try { before.set(f, fs.readFileSync(path.join(dir, f))) } catch {} } } catch {} }
  return () => {
    try {
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
        if (!isLog(f)) continue
        const p = path.join(dir, f)
        if (!before.has(f)) { try { fs.rmSync(p, { force: true }) } catch {} ; continue }
        let now = null; try { now = fs.readFileSync(p) } catch {}
        if (!now || !now.equals(before.get(f))) { try { fs.writeFileSync(p, before.get(f)) } catch {} }
      }
      for (const [f, body] of before) { const p = path.join(dir, f); if (!fs.existsSync(p)) { try { fs.writeFileSync(p, body) } catch {} } }
      if (!hadDir) { try { fs.rmdirSync(dir) } catch {} }
      if (!hadBase) { try { fs.rmdirSync(base) } catch {} }
    } catch {}
  }
}

// ---------------------------------------------------------------- the plugin lines (D7)
const gitWord = g => g === 'tracked' ? 'tracked' : g === 'ignored' ? 'ignored' : g === 'untracked' ? 'untracked' : g === 'outside' ? 'outside the repo' : 'git unasked'
function artifactFacts(REPO, cfg, name, nowMs) {
  const spec = pluginSpec(cfg, name)
  const p = probePlugin(REPO, name, spec)
  const shown = spec?.path ? (p.kind === 'dir' || (!p.present && name === 'graphify') ? spec.path.replace(/\/+$/, '') + '/' : spec.path) : null
  const age = p.present && p.mtime ? nowMs - Date.parse(p.mtime) : null
  return {
    plugin: name, path: spec?.path ?? null, shown,
    state: p.present ? 'present' : 'absent', kind: p.kind, git: p.present ? p.git : null,
    mtime: p.mtime, age_ms: age,
  }
}
const artifactLine = (a, absentWord) => a.state === 'present'
  ? [`${a.shown} present`, gitWord(a.git), fmtAge(a.age_ms)].filter(Boolean).join(' · ')
  : `${a.shown ?? a.plugin} ${absentWord}`

export async function runOrient(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log('baseline orient — five-line survey for session start (pulls first; exits 0)\n  usage: baseline orient [--repo DIR] [--json]\n  lines: repo · work · graph · knowledge · score')
    return 0
  }
  const opt = makeOpt(argv)
  if (opt('--repo', null) === true) { console.error('orient: --repo needs a value'); return 2 }
  const REPO = path.resolve(opt('--repo', process.cwd()))
  const JSON_OUT = !!opt('--json', false)
  if (opt('--strict', false)) console.error('orient: --strict is retired — orient always exits 0 (v3 §8 V29)')

  const notes = [], suggestions = []
  const now = nowUTC() ?? new Date()
  const nowMs = now.getTime()

  // step 0 — the one network act
  const pull = pullFirst(REPO)
  if (!pull.pulled) notes.push(`not pulled: ${pull.reason} (git pull --ff-only)`)

  // the score: check's pipeline, in-process, no exec — and no trace left
  const restoreLogs = shieldPluginLogs(REPO)
  let scored = null, scoreErr = null
  try { scored = scoreRepo(REPO, { noExec: true }) }
  catch (e) { scoreErr = String(e?.message || e) }
  finally { restoreLogs() }
  const cfg = scored?.cfgRes?.cfg ?? null
  const HEAD = scored?.HEAD ?? null
  const summary = scored?.summary ?? null
  if (scoreErr) notes.push(`score unavailable: ${scoreErr}`)

  let branch = null
  try { branch = execFileSync('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch {}
  if (branch === 'HEAD') branch = '(detached)'

  // the plugin lines — metadata only
  const work = artifactFacts(REPO, cfg, 'obsidian-tdd', nowMs)
  const graph = artifactFacts(REPO, cfg, 'graphify', nowMs)
  if (graph.state === 'absent') suggestions.push(`no knowledge graph at ${graph.shown ?? 'graphify-out/'} — build one with graphify (orientation reads only its age)`)
  // the bundle is a path outside the repo more often than not: exists, and nothing else
  const okf = pluginSpec(cfg, 'okf-rag')
  const bundlePath = okf?.path ?? null
  const knowledge = {
    plugin: 'okf-rag', path: bundlePath,
    state: !bundlePath ? 'unconfigured' : fs.existsSync(bundlePath) ? 'present' : 'absent',
    source: okf?.source?.path ?? null, env: okf?.env ?? 'BASELINE_OKF_BUNDLE',
  }
  if (knowledge.state !== 'present') suggestions.push(knowledge.state === 'unconfigured'
    ? `no okf bundle configured — point ${knowledge.env} at one for \`baseline explain\``
    : `okf bundle missing at ${bundlePath} — rebuild it, or point ${knowledge.env} elsewhere`)

  // blockers and advisory are the scorer's own derived counts (check-run.mjs advisoryOf:
  // every evaluated row that is neither a pass nor a blocking failure) — never a second tally
  const score = summary
    ? { blockers: summary.blockers, advisory: summary.advisory, pass: summary.pass, total: summary.total }
    : null

  if (JSON_OUT) {
    const out = {
      repo: { path: REPO, name: path.basename(REPO), head: HEAD, branch, pulled: pull.pulled, pull: pull.pulled ? 'ff-only' : pull.reason },
      work: { plugin: work.plugin, path: work.path, state: work.state, kind: work.kind, git: work.git, mtime: work.mtime, age_ms: work.age_ms },
      graph: { plugin: graph.plugin, path: graph.path, state: graph.state, kind: graph.kind, git: graph.git, mtime: graph.mtime, age_ms: graph.age_ms },
      knowledge,
      score,
      notes, suggestions,
    }
    console.log(JSON.stringify(out, null, 2))
    return 0
  }

  // ---- human: five lines, nothing else on stdout ----
  const L = (label, body) => `${(label + ':').padEnd(LABELW)}${body}`
  const repoBits = [`${path.basename(REPO)}${HEAD ? ` @ ${HEAD}` : ' (no git HEAD)'}${branch ? ` (${branch})` : ''}`, pull.pulled ? 'pulled' : `not pulled: ${pull.reason}`]
  const graphBody = graph.state === 'present' ? artifactLine(graph) : `${graph.shown ?? 'graphify-out/'} absent · suggestion: build the knowledge graph with graphify`
  const knowledgeBody = knowledge.state === 'present' ? 'okf bundle present'
    : knowledge.state === 'absent' ? `okf bundle absent at ${bundlePath}` : `okf bundle not configured (${knowledge.env} unset)`
  const scoreBody = score ? `${score.blockers} blocker${score.blockers === 1 ? '' : 's'} · ${score.advisory} advisory` : `unavailable (${scoreErr || 'no score'})`
  const lines = [
    L('repo', repoBits.join(' · ')),
    L('work', artifactLine(work, 'absent')),
    L('graph', graphBody),
    L('knowledge', knowledgeBody),
    L('score', scoreBody),
  ]
  // repo-authored strings (a configured plugin path, a branch name) are stripped of control
  // bytes at the render boundary; --json escapes them itself
  console.log(sanitizeTTY(lines.join('\n')))
  return 0
}
