// Capability probe — which ground-truth planes are reachable right now. Headlines every
// orient run (C16) and is reused by the facts layer (M3b). Every plane degrades to a reason
// string; the probe never throws. Forge reachability is gh presence + auth + a repo the
// working directory actually resolves to (which also proves the network/API is up).
import { execFileSync } from 'node:child_process'
import { slug } from './util.mjs'

// Short, no-shell runner: literal argv, bounded time, null on ANY failure (missing binary,
// non-zero exit, timeout). cwd matters for gh — it resolves the repo from the directory.
export function run(cmd, args, { cwd, timeout = 15000, maxBuffer } = {}) {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, ...(maxBuffer ? { maxBuffer } : {}) }).trim() }
  catch { return null }
}
export const gh = (args, opts) => run('gh', args, opts)
export const ghJson = (args, opts) => { const o = gh(args, opts); if (o == null) return null; try { return JSON.parse(o) } catch { return null } }

export function currentBranch(repo) {
  const b = run('git', ['-C', repo.REPO, 'rev-parse', '--abbrev-ref', 'HEAD'])
  return b === 'HEAD' ? '(detached)' : (b || null)
}

// Lane identity = branch name (FS2), INCLUDING an unborn branch (fresh repo before
// the first commit — rev-parse has no HEAD yet, symbolic-ref still names it). The
// one derivation `log` writes with, git-facts reads with, and M5 leases will reuse.
export function currentLane(repo) {
  return currentBranch(repo) || run('git', ['-C', repo.REPO, 'symbolic-ref', '--short', 'HEAD'])
}

// Lane identity for GATES: a real branch name or null — never the '(detached)'
// display sentinel. log refuses the sentinel as a lane (log.mjs); the engine's
// branch gate must agree with the writer, so both route through this one decision
// (M5 leases reuse it too). currentLane stays display-oriented for orient/facts.
export function laneOrNull(repo) {
  const l = currentLane(repo)
  return l && l !== '(detached)' ? l : null
}

// A ref name a lane may actually be called: non-empty, one token, not the detached
// sentinel, not an option-looking string. An environment naming a lane `HEAD` or ''
// is naming nothing, and must degrade to the honest null rather than to a lane.
const refName = v => {
  const s = String(v ?? '').trim()
  return s && s !== 'HEAD' && !/\s/.test(s) && !s.startsWith('-') ? s : null
}

// Lane identity for the MERGE-TIME surfaces (check, admit): the checkout's branch, or —
// when the checkout cannot name one — the CI event that can. `actions/checkout` leaves
// refs/pull/N/merge DETACHED on a pull_request by design (#55), so a gate that reads the
// checkout alone is n/a on precisely the event a branch-protection ruleset requires: the
// merge gate does not run at the merge. Returns the basis with the name — a lane resolved
// from the environment is a weaker claim than a checked-out branch and every surface that
// reports it says which it had.
//
// The checkout ALWAYS wins: the environment is consulted only where there is no branch at
// all, so a stale exported GITHUB_HEAD_REF cannot redirect a local run.
//
// `reconcile` deliberately does NOT call this (src/reconcile.mjs) — its subject is the
// default branch, and a miswired pull_request job must not evaluate a PR branch while
// claiming to revalidate main. That dissent is a decision; keep it documented at both ends.
export function resolveLane(repo, env = process.env) {
  const l = laneOrNull(repo)
  if (l) return { lane: l, basis: 'checkout', event: null }
  // pull_request: GITHUB_HEAD_REF is the PR's head branch and is set on no other event,
  // so it needs no event guard. (GITHUB_REF_NAME here would be the useless 'N/merge'.)
  const head = refName(env.GITHUB_HEAD_REF)
  if (head) return { lane: head, basis: 'GITHUB_HEAD_REF', event: env.GITHUB_EVENT_NAME || 'pull_request' }
  // push with a detached checkout. GITHUB_REF_NAME is a TAG's name on a tag push, so only
  // a REF_TYPE of 'branch' qualifies — a release tag is not a lane.
  if (env.GITHUB_REF_TYPE === 'branch') {
    const name = refName(env.GITHUB_REF_NAME)
    if (name) return { lane: name, basis: 'GITHUB_REF_NAME', event: env.GITHUB_EVENT_NAME || 'push' }
  }
  return { lane: null, basis: null, event: null }
}

// One derivation of agent identity for every writer (log's record frontmatter, lane
// claim's trailer): explicit flag > BASELINE_AGENT > git user.name > 'agent', slugged.
// Two writers deriving different names would silently break the lane⇄agent join.
export function resolveAgent(explicit, REPO) {
  return slug(explicit || process.env.BASELINE_AGENT || run('git', ['-C', REPO, 'config', 'user.name'])) || 'agent'
}

// Exported alone for surfaces that need ONLY the forge answer (lane claim): the
// tree/history probes spawn git for facts such callers never read.
export function probeForge(repo) {
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
