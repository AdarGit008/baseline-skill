// Git-plane facts: branch, HEAD, shallow, and this lane's latest LOCAL session-log next:
// (pause-state, authoritative even before a PR exists). Session records live under the V2
// path first, then the legacy prototype path; a lane's branch name is its record namespace.
import fs from 'node:fs'
import path from 'node:path'
import { currentLane, run } from '../probe.mjs'
import { globToRe, issueOf, TRAILER_AGENT, TRAILER_ISSUE } from '../util.mjs'

export const SESSION_BASES = ['records/sessions', 'docs/session-log']

// Private fetch namespace for lane-lease reads (M5b) — like claim's private base ref,
// these are race-free against concurrent fetches and refspec-proof in single-branch
// clones (an explicit refspec bypasses remote.origin.fetch entirely).
export const LANES_PRIV = 'refs/baseline/lanes/'

// The lane's CURRENT owner, read from git objects: the newest commit in the ref's
// ancestry anchoring THIS issue (claim or takeover both say `Baseline-Issue: #N`), its
// Baseline-Agent trailer. Newest wins — a takeover commit is by construction newer than
// the claim it displaces, and newer than any same-issue commit merged into the base the
// lane branched from (which is why the grep anchors on the issue, not on the trailer
// key alone: the base's history may carry OTHER lanes' claim commits). null when the
// lane carries no machine trailer (a hand-pushed branch) — surfaced, never guessed.
export function laneOwner(REPO, gitRef, issue) {
  if (issue == null) return null
  const line = run('git', ['-C', REPO, 'log', '-1', `--grep=^${TRAILER_ISSUE}: #${issue}$`, `--format=%(trailers:key=${TRAILER_AGENT},valueonly)`, gitRef])
  return (line || '').split('\n')[0].trim() || null
}

// Git-plane lane facts (M5b): tips via ls-remote (authoritative — never the clone's
// possibly-stale remote-tracking refs), objects via ONE glob fetch into LANES_PRIV.
// This is the fallback when the forge is unreachable AND the whole story under the
// multi-lane-local posture (CF5: origin is the only rendezvous). Freshness here is
// committedDate only — committer clock, no PR corroboration — which derive/lanes
// labels low-confidence. -> { lanes, truncated } | null when origin is unreachable.
export function laneRefsGit(REPO, namespace) {
  const pat = 'refs/heads/' + namespace
  const ls = run('git', ['-C', REPO, 'ls-remote', 'origin', pat], { timeout: 30000 })
  if (ls === null) return null
  const re = globToRe(namespace)
  const tips = ls.split('\n').filter(Boolean).map(l => l.split(/\s+/))
    .map(([sha, ref]) => ({ sha, ref: String(ref || '').replace(/^refs\/heads\//, '') }))
    .filter(t => t.sha && re.test(t.ref))
  if (!tips.length) return { lanes: [], truncated: false }
  const fetched = run('git', ['-C', REPO, 'fetch', 'origin', `+${pat}:${LANES_PRIV}${namespace}`], { timeout: 60000 }) !== null
  const lanes = tips.map(({ sha, ref }) => {
    const priv = LANES_PRIV + ref
    // the fetched tip may briefly outrun the ls-remote answer (a push landed between the
    // two round trips) — read dates/owner from what we actually hold, report that tip
    const tip = (fetched && run('git', ['-C', REPO, 'rev-parse', '--verify', '--quiet', priv])) || sha
    const committedDate = fetched ? (run('git', ['-C', REPO, 'log', '-1', '--format=%cI', priv]) || null) : null
    const agent = fetched ? laneOwner(REPO, priv, issueOf(namespace, ref)) : null
    return { ref, tip, committedDate, prUpdatedAt: null, pr: null, agent, agentSource: agent ? 'history-trailer' : null, source: 'git' }
  })
  return { lanes, truncated: false }
}

// The `## Left open` -> `next:` line of a session log (mirrors the session-log guard).
export function extractNext(md) {
  const lines = String(md).split('\n')
  const start = lines.findIndex(l => /^##\s+Left open\b/i.test(l))
  if (start === -1) return null
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    const m = lines[i].match(/^\s*next:\s*(.*)$/i)
    if (m) return m[1].trim() || null
  }
  return null
}

// Newest local session log for a branch -> { rel, next } or null.
export function newestLocalLog(repo, branch) {
  for (const base of SESSION_BASES) {
    const dir = path.join(repo.REPO, base, branch)
    let files
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() } catch { continue }
    if (!files.length) continue
    const file = files.at(-1)
    return { rel: `${base}/${branch}/${file}`, next: extractNext(fs.readFileSync(path.join(dir, file), 'utf8')) }
  }
  return null
}

export function gitFacts(repo) {
  // currentLane, not currentBranch: a record written on an unborn branch (first
  // session, pre-first-commit) must be readable here or the log/orient symmetry lies
  const branch = currentLane(repo)
  return {
    available: !!repo.HEAD,
    reason: repo.HEAD ? null : (branch ? 'unborn branch (no commits yet)' : 'not a git repository (no HEAD)'),
    branch,
    head: repo.HEAD || null,
    shallow: repo.HEAD ? repo.gitIsShallow() : false,
    thisLaneLog: (branch && branch !== '(detached)') ? newestLocalLog(repo, branch) : null,
  }
}
