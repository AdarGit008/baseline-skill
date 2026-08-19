# Review — Issue #55

## What changed

One derivation of lane identity, `resolveLane()` in `src/probe.mjs`, called by both
merge-time surfaces. `check` gained the environment fallback it never had; `admit` lost
its inline `|| process.env.GITHUB_HEAD_REF` and gained the `GITHUB_REF_NAME` leg;
`reconcile` kept its refusal and now names what it is refusing.

## What the review caught

- **Two weak assertions in the first draft of the flow cases.** One carried a dead
  `bare[0] === undefined` conjunct that asserted nothing about the subject. The other
  was written as `SKIP || lane === '7/merge'` — true under either branch, so it could
  not fail. Both rewritten. The second rewrite found the real fact: on a `pull_request`
  GitHub sets `GITHUB_REF_TYPE=branch` *and* `GITHUB_REF_NAME=N/merge`, so the type
  guard alone would accept `7/merge` as a lane. What actually prevents it is **order** —
  `GITHUB_HEAD_REF` is read first and is set on no other event. The test now asserts
  that, and the comment says it.
- **The golden re-pin (planned Task 7) turned out to be unnecessary.** Keeping the basis
  on one run-level line rather than in each rule's detail meant 18 fixtures verified
  identical with no re-pin. A plan step that dissolves is worth more than one that lands.

## Residual risk, accepted

- A stale exported `GITHUB_HEAD_REF` names a lane on a detached local checkout. Bounded:
  it applies only where the answer was previously `null` (SKIP), and the report names
  the variable it believed rather than presenting the lane as observed fact.
- On `pull_request` the rules read the merge result, not the lane tip. Named on the
  lane line and in `REFERENCE.md`. A future rule that needs the tip specifically must
  ask for it rather than assume `HEAD` is it — recorded here so it is not rediscovered.

## Verification

- flow: 13 new assertions pass; 9 fail against the pre-fix resolver (`git stash`
  control). The 4 that pass either way are over-reach guards — bare detached and tag
  push must keep SKIPping, and do.
- golden: 18 fixtures identical to pins. Zero verdict changes, zero detail changes.
- full suite (records, golden, orient, facts, lane, flow, admit, reconcile, gen): green.
- self-check green; self-score 96%, no blockers.
