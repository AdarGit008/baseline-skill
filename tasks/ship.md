# Ship — Issue #55

Ready. Rank 2 of the #52 backlog, and the one whose blast radius was the merge gate
itself: the branch-scoped rules now evaluate on the event a branch-protection ruleset
requires, and the two events agree on one commit.

## Ship criteria

- [x] `pull_request` and `push` return the same verdicts for one commit
- [x] A checked-out branch always beats the environment
- [x] A tag push and a PR's `N/merge` ref are never mistaken for a lane
- [x] A genuinely detached local checkout still SKIPs, unchanged
- [x] `check` and `admit` derive lane identity from one function
- [x] `reconcile`'s refusal is preserved and documented at both ends
- [x] Every run states the lane and the basis it resolved on
- [x] Zero verdict and zero detail changes in the golden corpus
- [x] Full suite green; self-check green; no blockers

## Both mcgyvr incidents, closed

- *Green PR, red push* (`lane/282`, 2026-08-16): the PR run now evaluates FLOW-04.
- *Red push, blocked PR* (`lane/91`, 2026-08-01): the two runs can no longer disagree
  by event, so the ruleset's by-name context count stops deadlocking.

## Next

Task 8: #56 — REC-01 scores an append identically to a rewrite, so a repair and a
falsification read the same. Rank 3 of the #52 backlog.
