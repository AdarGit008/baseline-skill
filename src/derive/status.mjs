// derive/status — a PURE function: (facts, join, capability) -> the derived status view.
// No I/O (gatherFacts already resolved every plane), so it replays deterministically from
// committed forge fixtures. Divergence is surfaced first: cross-tier conflicts a stateless
// worker must resolve before trusting the rest (a preview of the M5 DIV rules).
import { refs } from '../facts/index.mjs'

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

  const lanes = facts.prs.map(pr => ({ number: pr.number, title: pr.title, branch: pr.branch, draft: pr.draft, updatedAt: pr.updatedAt, next: pr.next, hasLog: pr.hasLog, closes: pr.closes }))
  const backlog = facts.issues.map(i => ({ number: i.number, title: i.title, milestone: i.milestone?.title ?? null, labels: (i.labels || []).map(l => l.name), updatedAt: i.updatedAt }))
  const thisLane = { branch: facts.git.branch, next: facts.git.thisLaneLog?.next ?? null, rel: facts.git.thisLaneLog?.rel ?? null }

  return {
    planes: capability,
    descriptor: facts.tree.descriptor,
    source: facts.source,
    forgeAvailable: facts.forgeAvailable,
    forgeReason: facts.forgeReason,
    divergence,
    findings: joined.findings,
    lanes, backlog, thisLane,
  }
}
