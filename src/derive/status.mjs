// derive/status — a PURE function: (facts, join, capability) -> the derived status view.
// No I/O (gatherFacts already resolved every plane), so it replays deterministically from
// committed forge fixtures. Divergence is surfaced first: cross-tier conflicts a stateless
// worker must resolve before trusting the rest (a preview of the M5 DIV rules).
// M5b: `lanes` is the derived LEASE view (claimed refs — LIVE|STALE|ABANDONED, C31);
// the open-PR list that used to live under that key is `prs` now. A lane's open PR is
// joined onto its line (headRefName ⇄ ref, a declared key), so a PR-less claim finally
// APPEARS — the invisible-claim gap was the whole reason M5b re-homed this view.
import { refs } from '../facts/index.mjs'
import { deriveLanes } from './lanes.mjs'

export function deriveStatus(facts, joined, capability) {
  const stateOf = (n) => facts.issueStates[n]?.state
  const titleOf = (n) => facts.issueStates[n]?.title || ''
  const isClosed = (s) => s && s !== 'open' && s !== 'unknown'
  const divergence = []

  // DIV: a next: points at an issue that is no longer open.
  const scanNext = (where, nextStr) => {
    for (const n of refs(nextStr)) if (isClosed(stateOf(n))) divergence.push(`${where}: next: points at #${n} (${stateOf(n)}) — "${titleOf(n)}"`)
  }
  if (facts.git.thisLaneLog?.next) scanNext(`this lane (${facts.git.branch})`, facts.git.thisLaneLog.next)
  for (const pr of facts.prs) if (pr.next) scanNext(`#${pr.number} ${pr.branch}`, pr.next)

  // DIV: a live PR closes an already-closed issue (closed-issue-live-branch).
  for (const pr of facts.prs) for (const n of pr.closes) if (isClosed(stateOf(n))) divergence.push(`#${pr.number} ${pr.branch}: closes #${n}, already ${stateOf(n)} — "${titleOf(n)}"`)

  const prs = facts.prs.map(pr => ({ number: pr.number, title: pr.title, branch: pr.branch, draft: pr.draft, updatedAt: pr.updatedAt, next: pr.next, hasLog: pr.hasLog, closes: pr.closes }))
  const backlog = facts.issues.map(i => ({ number: i.number, title: i.title, milestone: i.milestone?.title ?? null, labels: (i.labels || []).map(l => l.name), updatedAt: i.updatedAt }))
  const thisLane = { branch: facts.git.branch, next: facts.git.thisLaneLog?.next ?? null, rel: facts.git.thisLaneLog?.rel ?? null }

  // the lease view (C31), with each lane's open PR joined on. The join key is the PR
  // NUMBER when the lane's commit-anchored PR is known (a fork PR merely NAMED like the
  // lane must not override the verified association) and the branch⇄ref key otherwise
  // (git-plane lanes carry no PR). next/hasLog come from the fetched PR facts; a lane
  // whose PR was never fetched says null — unknown, not "no log" (that would be a guess).
  const meta = facts.lanesMeta
  const lanes = meta ? deriveLanes({ lanes: facts.lanes ?? [], ttlMs: meta.ttlMs, now: facts.now, issueStates: facts.issueStates, namespace: meta.namespace })
    .map(l => {
      const pr = prs.find(p => l.pr ? p.number === l.pr.number : p.branch === l.ref)
      return pr ? { ...l, pr: { number: pr.number, title: pr.title, draft: pr.draft, updatedAt: pr.updatedAt }, next: pr.next, hasLog: pr.hasLog }
        : { ...l, next: null, hasLog: null }
    }) : []

  return {
    planes: capability,
    descriptor: facts.tree.descriptor,
    source: facts.source,
    forgeAvailable: facts.forgeAvailable,
    forgeReason: facts.forgeReason,
    now: facts.now, // the ONE clock the view was derived at — renderers age against this, never a second wall-clock read
    nowFallback: facts.nowFallback ?? null,
    divergence,
    findings: joined.findings,
    lanes, lanesMeta: meta, prs, backlog, thisLane,
  }
}
