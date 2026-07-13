// `baseline lane` — the lane surfaces (M5; claim is the M5a slice, reclaim lands at M5b).
// The claim primitive (FS2/S3): ATOMIC BRANCH CREATION AT ORIGIN — ref creation inside the
// remote's ref transaction is first-wins, so the race needs no forge CAS, no lock file, and
// no assignment ceremony (issue assignment is informational only). The ref identity is the
// descriptor's lanes.namespace with the issue number substituted — EXACTLY that (M5 panel,
// FS-1): user slugs were cut because two spellings would both push-succeed and mint two
// lanes for one issue; descriptiveness is orient's job. Lane identity = branch name +
// Baseline-Agent trailer (C38: claim machine-generates only descriptor-declared join keys).
//
// Checkout-free by construction (M5 panel, DA-6): the claim commit is built with
// commit-tree against FETCH_HEAD and pushed sha:ref — HEAD, worktree, and local branch
// list are untouched until AFTER the push wins, so the loser exits clean with no partial
// state structurally, not via cleanup. Only the winner gets a local branch + checkout
// (best-effort: a busy worktree downgrades to a printed recipe, never an error — the
// claim itself already succeeded at the rendezvous).
//
// Posture: workflow multi-lane-local (CF5) never consults the forge — the printed label
// names the posture, never fakes unreachability (panel FS-7). Otherwise the forge, when
// reachable, refuses a claim on an issue positively known closed (divergence at birth,
// DIV-01's territory); unverifiable proceeds labeled — the push, not the forge, decides.
//   exit: 0 claimed · 2 usage/refusal/environment · 3 lane already claimed (lost race)
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeOpt, slug } from './util.mjs'
import { indexRepo } from './repo.mjs'
import { loadDescriptor, DESCRIPTOR_FILE } from './descriptor.mjs'
import { capabilityProbe, run } from './probe.mjs'
import { makeForge } from './facts/forge.mjs'

const TRAILER_ISSUE = 'Baseline-Issue'
const TRAILER_AGENT = 'Baseline-Agent'

const LANE_USAGE = `usage: baseline lane claim <issue> [--agent A] [--repo DIR] [--json]`

export function runLane(argv) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`baseline lane — claim a work lane (atomic branch creation at origin)\n  ${LANE_USAGE}\n  exit: 0 claimed · 2 usage/refusal/environment · 3 lane already claimed (lost race)`)
    return argv.length ? 0 : 2
  }
  if (argv[0] === 'claim') return runClaim(argv.slice(1))
  console.error(`baseline lane: unknown action '${argv[0]}' (this slice ships: claim)\n  ${LANE_USAGE}`)
  return 2
}

function runClaim(argv) {
  const opt = makeOpt(argv)
  const usage = msg => { console.error(`baseline lane claim: ${msg}\n  ${LANE_USAGE}`); return 2 }
  for (const f of ['--repo', '--agent']) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const JSON_OUT = !!opt('--json', false)
  const notes = []
  const note = s => { notes.push(s); if (!JSON_OUT) console.log(`  · ${s}`) }

  // the issue number is the one positional (accepts '#22' and '22')
  const valueFlags = new Set(['--repo', '--agent'])
  let issueArg = null
  for (let i = 0; i < argv.length; i++) {
    if (valueFlags.has(argv[i])) { i++; continue }
    if (argv[i].startsWith('-')) continue
    issueArg = argv[i]; break
  }
  if (!issueArg) return usage('which issue? — pass the issue number (the lane anchors to it)')
  const issue = String(issueArg).replace(/^#/, '')
  if (!/^[1-9][0-9]*$/.test(issue)) return usage(`'${issueArg}' is not an issue number`)

  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const repo = indexRepo(REPO)

  // ---- the descriptor is the only place a lane name may come from (C10 — never guess) ----
  const d = loadDescriptor(repo)
  if (!d.present) return usage(`no ${DESCRIPTOR_FILE} — lane claim derives the branch from the descriptor's lanes.namespace (declare it: baseline init)`)
  if (!d.valid) return usage(`${DESCRIPTOR_FILE} is invalid (${d.errors[0] || 'schema error'}) — claim refuses to guess a namespace from a broken descriptor`)
  const ns = d.data.lanes?.namespace
  if (!ns) return usage(`descriptor declares no lanes.namespace — add e.g. "lanes": { "namespace": "lane/*" }`)
  if ((ns.match(/\*/g) || []).length !== 1) return usage(`lanes.namespace '${ns}' must contain exactly one '*' (the issue number replaces it — one deterministic ref per issue is what makes the claim a race with one winner)`)
  const ref = ns.replace('*', issue)
  if (run('git', ['check-ref-format', `refs/heads/${ref}`]) === null) return usage(`'${ref}' is not a valid branch name (from lanes.namespace '${ns}')`)

  // ---- trailer allowlist (C38): claim stamps ONLY descriptor-declared join keys ----
  const jk = d.data.join_keys
  if (Array.isArray(jk) && (!jk.includes(TRAILER_ISSUE) || !jk.includes(TRAILER_AGENT))) {
    return usage(`descriptor join_keys omits ${[TRAILER_ISSUE, TRAILER_AGENT].filter(k => !jk.includes(k)).join(' + ')} — claim stamps exactly those trailers (C38). Declare them: "join_keys": ["${TRAILER_AGENT}", "${TRAILER_ISSUE}"]`)
  }
  const agent = slug(opt('--agent', null) || process.env.BASELINE_AGENT || run('git', ['-C', REPO, 'config', 'user.name']) || 'agent') || 'agent'

  // ---- origin is the rendezvous (ADR-0009 Rule 5) — no origin, no claim ----
  if (run('git', ['-C', REPO, 'remote', 'get-url', 'origin']) === null) return usage('no origin remote — the claim rendezvous is ref creation at origin; add one (git remote add origin ...)')

  // ---- issue verification: the posture decides whether the forge is even asked ----
  const workflow = d.data.workflow
  if (workflow === 'multi-lane-local') {
    note('forge not consulted (multi-lane-local posture)')
  } else {
    const cap = capabilityProbe(repo)
    const forge = makeForge(repo, { available: cap.forge.available, nwo: cap.forge.repo || null })
    if (forge.available) {
      const it = forge.issue(issue)
      const state = it ? String(it.state || '').toLowerCase() : null
      if (state && state !== 'open') {
        return usage(`issue #${issue} is ${state}${it.title ? ` ("${it.title}")` : ''} — claiming it is divergence at birth (DIV-01). Reopen it first (gh issue reopen ${issue}) or claim an open issue.`)
      }
      note(it ? `issue #${issue} open${it.title ? `: "${it.title}"` : ''}` : `issue #${issue} unverified (forge returned nothing) — proceeding; the push decides`)
    } else {
      note(`issue #${issue} unverified (${cap.forge.reason}) — proceeding; the push decides`)
    }
  }

  // ---- resolve the base: descriptor default branch, else origin's own HEAD (asked, not guessed) ----
  let def = d.data.ground_truth_boundary?.default_branch
  if (!def) {
    const sym = run('git', ['-C', REPO, 'ls-remote', '--symref', 'origin', 'HEAD'], { timeout: 30000 })
    def = sym?.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)?.[1] || null
    if (def) note(`default branch undeclared — origin HEAD says '${def}' (declare ground_truth_boundary.default_branch to pin it)`)
  }
  if (!def) return usage('no base to branch from — declare ground_truth_boundary.default_branch (origin HEAD did not resolve)')

  // ---- advisory preflight: cheap early exit; the push, not this, decides the race ----
  const pre = run('git', ['-C', REPO, 'ls-remote', 'origin', `refs/heads/${ref}`], { timeout: 30000 })
  if (pre === null) return usage('cannot reach origin (ls-remote failed) — nothing claimed')
  if (pre) return lost(ref, pre.split(/\s/)[0], issue, JSON_OUT, notes)

  // ---- build the claim commit against origin's CURRENT tip, worktree untouched (DA-6) ----
  if (run('git', ['-C', REPO, 'fetch', 'origin', def], { timeout: 60000 }) === null) return usage(`cannot fetch origin ${def} — nothing claimed`)
  const base = run('git', ['-C', REPO, 'rev-parse', 'FETCH_HEAD'])
  const tree = run('git', ['-C', REPO, 'rev-parse', 'FETCH_HEAD^{tree}'])
  if (!base || !tree) return usage('FETCH_HEAD did not resolve after fetch — nothing claimed')
  const msg = `claim ${ref}: issue #${issue}\n\n${TRAILER_ISSUE}: #${issue}\n${TRAILER_AGENT}: ${agent}`
  const sha = run('git', ['-C', REPO, 'commit-tree', tree, '-p', base, '-m', msg])
  if (!sha) return usage('commit-tree failed — is a git identity configured? (git config user.name / user.email)')

  // ---- THE claim: create the ref at origin; first push wins, atomically ----
  try {
    execFileSync('git', ['-C', REPO, 'push', 'origin', `${sha}:refs/heads/${ref}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })
  } catch (e) {
    // rejected OR transport failure — ask origin which: if the ref exists now, we lost the race
    const now = run('git', ['-C', REPO, 'ls-remote', 'origin', `refs/heads/${ref}`], { timeout: 30000 })
    if (now) return lost(ref, now.split(/\s/)[0], issue, JSON_OUT, notes)
    const why = String(e.stderr || e.message || '').split('\n').find(l => l.trim()) || 'push failed'
    return usage(`push failed (${why.trim()}) — nothing claimed`)
  }

  // ---- winner: local branch + checkout, best-effort (the claim already stands at origin) ----
  run('git', ['-C', REPO, 'fetch', 'origin'], { timeout: 60000 })
  // a pre-existing LOCAL branch with the lane's name (stale from manual work) is not the
  // claim — leave it alone and say so, rather than checking out the wrong tip
  const hadLocal = run('git', ['-C', REPO, 'show-ref', '--verify', '--quiet', `refs/heads/${ref}`]) !== null
  if (hadLocal) note(`a local branch ${ref} already existed here — left untouched; the claim is origin/${ref} (reconcile by hand before working)`)
  const branched = !hadLocal && run('git', ['-C', REPO, 'branch', ref, sha]) !== null
  if (branched) run('git', ['-C', REPO, 'branch', `--set-upstream-to=origin/${ref}`, ref])
  const checkout = branched && run('git', ['-C', REPO, 'checkout', ref]) !== null

  if (JSON_OUT) { console.log(JSON.stringify({ claimed: true, ref, issue: +issue, agent, sha, base: def, checkout, notes }, null, 2)); return 0 }
  console.log(`✓ claimed ${ref} (issue #${issue}) as ${agent} — ${sha.slice(0, 8)} pushed to origin`)
  if (!checkout) console.log(`  branch ${branched ? 'created locally' : `at origin (local branch not created)`}; switch when ready:  git checkout ${ref}`)
  console.log(`  next act: work the lane; record sessions as you go —  baseline log -m "..." --next "..."`)
  return 0
}

function lost(ref, tip, issue, JSON_OUT, notes) {
  if (JSON_OUT) { console.log(JSON.stringify({ claimed: false, ref, issue: +issue, existing: tip, notes }, null, 2)); return 3 }
  console.log(`✗ lane ${ref} is already claimed at origin (tip ${String(tip).slice(0, 8)}) — you lost the race, cleanly: nothing was created here.`)
  console.log(`  next act:  baseline orient   (see live lanes + backlog, then claim a different issue)`)
  return 3
}
