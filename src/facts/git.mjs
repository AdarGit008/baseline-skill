// Git-plane facts: branch, HEAD, shallow, and this lane's latest LOCAL session-log next:
// (pause-state, authoritative even before a PR exists). Session records live under the V2
// path first, then the legacy prototype path; a lane's branch name is its record namespace.
import fs from 'node:fs'
import path from 'node:path'
import { currentLane } from '../probe.mjs'

export const SESSION_BASES = ['records/sessions', 'docs/session-log']

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
