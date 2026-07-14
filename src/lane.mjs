// `baseline lane` — the lane surfaces (M5; claim is the M5a slice, reclaim lands at M5b).
// The claim primitive (FS2/S3): ATOMIC BRANCH CREATION AT ORIGIN — ref creation inside the
// remote's ref transaction is first-wins, so the race needs no forge CAS, no lock file, and
// no assignment ceremony (issue assignment is informational only). The ref identity is the
// descriptor's lanes.namespace with the issue number substituted — EXACTLY that (M5 panel,
// FS-1): user slugs were cut because two spellings would both push-succeed and mint two
// lanes for one issue; descriptiveness is orient's job. Lane identity = branch name +
// Baseline-Agent trailer (C38: claim machine-generates only descriptor-declared join keys —
// an absent join_keys refuses like an incomplete one, or M5b's join could never read back
// what claim writes).
//
// Checkout-free (M5 panel, DA-6): the claim commit is built with commit-tree against a
// PRIVATE fetched ref and pushed sha:ref — HEAD, worktree, and local branch list are
// untouched until AFTER the push wins, so the loser exits clean with no partial state
// structurally, not via cleanup. FETCH_HEAD is never read: it is one shared file any
// concurrent fetch (IDE autofetch, a sibling agent) rewrites between our fetch and read.
//
// The race is settled honestly in BOTH directions: a ref that exists under this agent's
// own trailer is an idempotent win (a crashed claimer rerunning must not be told it "lost"
// to itself and go double-claim another issue), and a push whose failure report arrives
// after origin applied the ref is recognized by tip==sha as a win, never a fake loss.
//
// Posture: workflow multi-lane-local (CF5) never consults the forge — makeForge owns the
// closure and its label ("forge not consulted (multi-lane-local posture)"), so replay
// fixtures cannot fake a consultation the posture forbids. Otherwise the forge, when
// reachable, refuses a claim on an issue positively known closed (divergence at birth,
// DIV-01's territory); an unknown or stateless answer proceeds labeled — the push decides.
//   exit: 0 claimed (or already this agent's) · 2 usage/refusal/environment · 3 lost race
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { makeOpt, TRAILER_ISSUE, TRAILER_AGENT } from './util.mjs'
import { liteRepo } from './repo.mjs'
import { loadDescriptor, DESCRIPTOR_FILE } from './descriptor.mjs'
import { probeForge, resolveAgent, run } from './probe.mjs'
import { makeForge } from './facts/forge.mjs'

const LANE_USAGE = `usage: baseline lane claim <issue> [--agent A] [--repo DIR] [--json]`
const VALUE_FLAGS = ['--repo', '--agent']
// private refs for race-free reads: the claim base and the existing-tip peek
const BASE_REF = 'refs/baseline/claim-base'
const PEEK_REF = 'refs/baseline/claim-peek'

export function runLane(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(`baseline lane — claim a work lane (atomic branch creation at origin)\n  ${LANE_USAGE}\n  exit: 0 claimed (or the lane already stands under this agent's trailer) · 2 usage/refusal/environment · 3 claimed by another agent (lost race)`)
    return 0
  }
  if (argv[0] === 'claim') return runClaim(argv.slice(1))
  console.error(`baseline lane: ${argv.length ? `unknown action '${argv[0]}'` : 'which action?'} (this slice ships: claim)\n  ${LANE_USAGE}`)
  return 2
}

function runClaim(argv) {
  const opt = makeOpt(argv)
  const usage = msg => { console.error(`baseline lane claim: ${msg}\n  ${LANE_USAGE}`); return 2 }
  for (const f of VALUE_FLAGS) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const JSON_OUT = !!opt('--json', false)
  const notes = []
  const note = s => { notes.push(s); if (!JSON_OUT) console.log(`  · ${s}`) }

  // the issue number is the one positional (accepts '#22' and '22')
  const skipValue = new Set(VALUE_FLAGS)
  let issueArg = null
  for (let i = 0; i < argv.length; i++) {
    if (skipValue.has(argv[i])) { i++; continue }
    if (argv[i].startsWith('-')) continue
    issueArg = argv[i]; break
  }
  if (!issueArg) return usage('which issue? — pass the issue number (the lane anchors to it)')
  const issue = String(issueArg).replace(/^#/, '')
  if (!/^[1-9][0-9]*$/.test(issue)) return usage(`'${issueArg}' is not an issue number`)

  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const repo = liteRepo(REPO) // claim reads the descriptor and talks to origin — no tree walk
  const G = (...a) => run('git', ['-C', REPO, ...a])

  // ---- the descriptor is the only place a lane name may come from (C10 — never guess) ----
  const d = loadDescriptor(repo)
  if (!d.present) return usage(`no ${DESCRIPTOR_FILE} — lane claim derives the branch from the descriptor's lanes.namespace (declare it: baseline init)`)
  if (!d.valid) return usage(`${DESCRIPTOR_FILE} is invalid (${d.errors[0] || 'schema error'}) — claim refuses to guess a namespace from a broken descriptor`)
  const ns = d.data.lanes?.namespace
  if (!ns) return usage(`descriptor declares no lanes.namespace — add e.g. "lanes": { "namespace": "lane/*" }`)
  if ((ns.match(/\*/g) || []).length !== 1) return usage(`lanes.namespace '${ns}' must contain exactly one '*' (the issue number replaces it — one deterministic ref per issue is what makes the claim a race with one winner)`)
  const ref = ns.replace('*', issue)
  if (run('git', ['check-ref-format', `refs/heads/${ref}`]) === null) return usage(`'${ref}' is not a valid branch name (from lanes.namespace '${ns}')`)

  // ---- trailer allowlist (C38): claim stamps ONLY declared keys, so both must be declared ----
  const jk = Array.isArray(d.data.join_keys) ? d.data.join_keys : []
  const missing = [TRAILER_AGENT, TRAILER_ISSUE].filter(k => !jk.includes(k))
  if (missing.length) {
    return usage(`descriptor ${Array.isArray(d.data.join_keys) ? `join_keys omits ${missing.join(' + ')}` : 'declares no join_keys'} — claim stamps exactly those trailers (C38), and undeclared keys could never be joined back. Declare: "join_keys": ["${TRAILER_AGENT}", "${TRAILER_ISSUE}"]`)
  }
  const agent = resolveAgent(opt('--agent', null), REPO)

  // ---- origin is the rendezvous (ADR-0009 Rule 5) — no origin, no claim ----
  if (G('remote', 'get-url', 'origin') === null) return usage('no origin remote — the claim rendezvous is ref creation at origin; add one (git remote add origin ...)')

  // ---- issue verification: the posture decides whether the forge is even asked ----
  const workflow = d.data.workflow
  const pf = workflow === 'multi-lane-local' ? null : probeForge(repo)
  const forge = makeForge(repo, { available: !!pf?.available, nwo: pf?.repo || null, posture: workflow })
  if (!forge.available) {
    note(forge.source === 'posture' ? forge.reason : `issue #${issue} unverified (${pf?.reason || forge.reason}) — proceeding; the push decides`)
  } else {
    const it = forge.issue(issue)
    const state = it ? String(it.state || '').toLowerCase() : null
    if (state === 'open') note(`issue #${issue} open${it.title ? `: "${it.title}"` : ''}`)
    else if (state) return usage(`issue #${issue} is ${state}${it.title ? ` ("${it.title}")` : ''} — claiming it is divergence at birth (DIV-01). Reopen it first (gh issue reopen ${issue}) or claim an open issue.`)
    else note(`issue #${issue} unverified (forge returned no state) — proceeding; the push decides`)
  }

  // ---- ONE preflight round trip answers three questions: origin reachable? what is
  // origin's HEAD (the default-branch fallback)? does the lane ref exist already? ----
  const pre = run('git', ['-C', REPO, 'ls-remote', '--symref', 'origin', 'HEAD', `refs/heads/${ref}`], { timeout: 30000 })
  if (pre === null) return usage('cannot reach origin (ls-remote failed) — nothing claimed')
  const preTip = pre.split('\n').find(l => l.endsWith(`\trefs/heads/${ref}`))?.split('\t')[0] || null
  let def = d.data.ground_truth_boundary?.default_branch
  if (!def) {
    def = pre.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)?.[1] || null
    if (def) note(`default branch undeclared — origin HEAD says '${def}' (declare ground_truth_boundary.default_branch to pin it)`)
  }
  if (!def) return usage('no base to branch from — declare ground_truth_boundary.default_branch (origin HEAD did not resolve)')

  // ---- outcomes (closures over the resolved context; S4 — no parameter threading) ----
  const win = (sha, pushed) => {
    // the push doesn't create refs/remotes/origin/<ref> in single-branch clones and a
    // plain fetch wouldn't either (refspec) — we KNOW the sha, so write the tracking
    // ref directly: offline, refspec-proof, and set-upstream then just works
    G('update-ref', `refs/remotes/origin/${ref}`, sha)
    const localTip = G('rev-parse', '--verify', '--quiet', `refs/heads/${ref}`) || null
    let branched = false, checkout = false
    if (localTip === sha) {
      branched = true // rerun after a crash-past-checkout: the local branch IS the claim
      checkout = G('checkout', ref) !== null
    } else if (localTip) {
      // a pre-existing local branch with the lane's name is NOT the claim — leave it,
      // and print no checkout recipe that would land on the wrong tip
      note(`a local branch ${ref} already existed here — left untouched: local ${ref} vs origin/${ref} (the claim) must be reconciled by hand before working`)
    } else {
      branched = G('branch', ref, sha) !== null
      if (branched) {
        // upstream resolves through the FETCH REFSPEC, not the tracking ref — a
        // single-branch clone refuses ("not a branch") until the lane is opted into
        // the refspec (what `git remote set-branches --add` does); detected by the
        // refusal itself, never by parsing refspecs
        if (G('branch', `--set-upstream-to=origin/${ref}`, ref) === null) {
          G('config', '--add', 'remote.origin.fetch', `+refs/heads/${ref}:refs/remotes/origin/${ref}`)
          G('branch', `--set-upstream-to=origin/${ref}`, ref)
        }
        checkout = G('checkout', ref) !== null
      }
    }
    if (JSON_OUT) { console.log(JSON.stringify({ claimed: true, ref, issue: +issue, agent, sha, base: def, pushed, checkout, notes }, null, 2)); return 0 }
    console.log(pushed
      ? `✓ claimed ${ref} (issue #${issue}) as ${agent} — ${sha.slice(0, 8)} pushed to origin`
      : `✓ lane ${ref} (issue #${issue}) already stands as this agent's claim (${agent}) — ${sha.slice(0, 8)} at origin`)
    if (branched && !checkout) console.log(`  branch created locally; switch when ready:  git checkout ${ref}`)
    console.log(`  next act: work the lane; record sessions as you go —  baseline log -m "..." --next "..."`)
    return 0
  }
  const lost = tip => {
    if (JSON_OUT) { console.log(JSON.stringify({ claimed: false, ref, issue: +issue, existing: tip, notes }, null, 2)); return 3 }
    console.log(`✗ lane ${ref} is already claimed at origin (tip ${String(tip).slice(0, 8)}) — you lost the race, cleanly: nothing was created here.`)
    console.log(`  next act:  baseline orient   (see live lanes + backlog, then claim a different issue)`)
    return 3
  }
  // an existing ref is a loss only if it is someone ELSE's: peek the tip's agent trailer
  // (a crashed claimer rerunning, or a fleet-mate sharing the agent identity, owns the lane)
  const settleExisting = tip => {
    let owner = null
    if (G('fetch', 'origin', `+refs/heads/${ref}:${PEEK_REF}`) !== null) {
      owner = (G('log', '-1', `--format=%(trailers:key=${TRAILER_AGENT},valueonly)`, PEEK_REF) || '').split('\n')[0].trim() || null
      G('update-ref', '-d', PEEK_REF)
    }
    if (owner && owner === agent) { note(`the existing claim carries this agent's own trailer — idempotent`); return win(tip, false) }
    return lost(tip)
  }
  if (preTip) return settleExisting(preTip)

  // ---- build the claim commit against origin's CURRENT tip, worktree untouched (DA-6) ----
  if (G('fetch', 'origin', `+refs/heads/${def}:${BASE_REF}`) === null) return usage(`cannot fetch origin ${def} — nothing claimed`)
  const base = G('rev-parse', BASE_REF)
  const tree = G('rev-parse', `${BASE_REF}^{tree}`)
  G('update-ref', '-d', BASE_REF) // best-effort tidy; a leftover is harmless (force-updated next claim)
  if (!base || !tree) return usage('claim base did not resolve after fetch — nothing claimed')
  const msg = `claim ${ref}: issue #${issue}\n\n${TRAILER_ISSUE}: #${issue}\n${TRAILER_AGENT}: ${agent}`
  const sha = G('commit-tree', tree, '-p', base, '-m', msg)
  if (!sha) return usage('commit-tree failed — is a git identity configured? (git config user.name / user.email)')

  // ---- THE claim: create the ref at origin; first push wins, atomically ----
  try {
    execFileSync('git', ['-C', REPO, 'push', 'origin', `${sha}:refs/heads/${ref}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 })
  } catch (e) {
    // rejected, OR the transport died — ask origin what actually happened
    const now = run('git', ['-C', REPO, 'ls-remote', 'origin', `refs/heads/${ref}`], { timeout: 30000 })
    const tip = now ? now.split(/\s/)[0] : null
    if (tip === sha) { note('the push report was lost but origin holds this claim — won (transport hiccup after the ref landed)'); return win(sha, true) }
    if (tip) return settleExisting(tip)
    const why = String(e.stderr || e.message || '').split('\n').find(l => l.trim()) || 'push failed'
    return usage(`push failed (${why.trim()}) — nothing claimed`)
  }
  return win(sha, true)
}
