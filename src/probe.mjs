// Capability probe — which ground-truth planes are reachable right now. Headlines every
// orient run (C16) and is reused by the facts layer (M3b). Every plane degrades to a reason
// string; the probe never throws. Forge reachability is gh presence + auth + a repo the
// working directory actually resolves to (which also proves the network/API is up).
import { execFileSync } from 'node:child_process'

// Short, no-shell runner: literal argv, bounded time, null on ANY failure (missing binary,
// non-zero exit, timeout). cwd matters for gh — it resolves the repo from the directory.
export function run(cmd, args, { cwd, timeout = 15000 } = {}) {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim() }
  catch { return null }
}
export const gh = (args, opts) => run('gh', args, opts)
export const ghJson = (args, opts) => { const o = gh(args, opts); if (o == null) return null; try { return JSON.parse(o) } catch { return null } }

export function currentBranch(repo) {
  const b = run('git', ['-C', repo.REPO, 'rev-parse', '--abbrev-ref', 'HEAD'])
  return b === 'HEAD' ? '(detached)' : (b || null)
}

function probeForge(repo) {
  if (gh(['--version']) == null) return { available: false, gh: false, reason: 'gh not installed' }
  if (run('gh', ['auth', 'status']) == null) return { available: false, gh: true, authed: false, reason: 'gh not authenticated (gh auth login)' }
  const nwo = ghJson(['repo', 'view', '--json', 'nameWithOwner'], { cwd: repo.REPO })?.nameWithOwner
  if (!nwo) return { available: false, gh: true, authed: true, reason: 'no forge repo resolves here (or network/API down)' }
  return { available: true, gh: true, authed: true, repo: nwo }
}

export function capabilityProbe(repo) {
  const history = repo.HEAD
    ? { available: true, shallow: repo.gitIsShallow(), branch: currentBranch(repo) }
    : { available: false, reason: 'not a git repository (no HEAD)' }
  return { tree: { available: true }, history, forge: probeForge(repo) }
}
