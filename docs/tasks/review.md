# Review — Issue #49

## What changed, and why each piece is there

| Piece | Why |
|---|---|
| **CTX-14** (`adr-number-unique`) | Nothing owned the decision-record *number*. Every consumer — CTX-07's edge resolution, CTX-13's pairing, a human following "see ADR-0027" — reads it off the filename and expects one record back. This is the floor: it makes the collision unable to survive on the branch where both lanes land. |
| **FLOW-09** (`lane-adr-reservation`) | `lane claim` makes the issue number an atomic reservation at origin precisely so two agents cannot claim one. The decision-record number is the other scarce name in a multi-lane repo and had no reservation at all. This is the one moment the fix is still a rename. |
| `laneObjects()` on the lane world | The world reads lane *refs*; this rule needs lane *trees*. Putting it in the world keeps "one gathering, three surfaces" and keeps it lazy — a run that never reaches the rule pays nothing. |
| `gitLsTree` · `gitDiffNames({ deletedOnly })` | The tree *as of* a commit, and what this lane removed since it branched. The second is what separates a renamed record from a second one. |
| docs-repo duplicate pair | The golden corpus is where a finding's text is pinned. Both records are `Accepted` with no edges, so CTX-14 is the only rule that moves. |
| rule-count docs + SVGs | Two new rules; and the check-kind count was already stale at 41-documented-for-43 before this branch. |

## The decision a reviewer should check first

**INTRODUCED is measured by path, not by number.** The issue says "the decision-record
numbers each lane introduces relative to the default branch", and read literally that is
wrong on the merge order that produced the incident: once `lane/265` lands, `0027` *is*
on the default branch, so `lane/282` introduces no new *number* and the duplicate ships.
The flow suite pins both orders. A lane adds a *file*; whether its number is free is the
question the rule asks.

## Where the reach was deliberately stopped

- **No allocation.** FLOW-09 detects; it does not reserve a number at origin the way
  `lane claim` reserves an issue. An atomic number allocator is a different mechanism
  with a different failure mode, and the issue asks for detection.
- **CTX-14 says nothing about the other lane.** That is FLOW-09's sentence. One
  collision reported by two rules with two subjects, never one defect read as two.
- **A gap is not a finding.** It rides the PASS detail. A retracted draft and a number
  reserved on a lane that never landed both look like a gap.
- **No content comparison.** Two records with the same number collide even if identical;
  two with different numbers do not collide even if they decide the same thing. Identity
  is what the consumers read.
- **No new allowlist file.** The judgment ledger already means "sanctioned, not an
  offence", and it expires. Renumbering breaks citations, so this route matters more here
  than it did for CTX-13, not less.

## The one thing a reviewer should push on

FLOW-09 reports a number **once**, preferring the finding against the default branch. The
exception is a lane that renamed the base's holder: it clears the base finding and can
still be reported against a lane that authored a second record under that number. The
alternative — report every pair — produces N findings for one rename in a repo with many
live lanes, all pointing at the same fix. The current rule can, in one exotic shape (lane
A renames the base's `0027`, lane B authors a second `0027`), tell lane A about lane B
while telling lane B about the default branch: two sentences about one collision, from
two lanes. Named here rather than hidden.

Second, smaller: `laneObjects()` performs a live `git fetch` inside a `check` run. It is
lazy, bounded by timeout, memoized, skipped under replay, and only reached by a
multi-lane lane that actually introduces a decision record — but `check` was previously
fetch-free by design (`enrich: false` exists for exactly that reason), and this is the
first rule that changes that.

## Verification

- 10 new assertions in `test/records/run.mjs` (CTX-14), 11 in `test/flow/run.mjs`
  (FLOW-09, on a local bare origin under `multi-lane-local` — zero network).
- Negative control against a worktree of `origin/main`: the same-tree repro scores **no
  findings at all** pre-fix and one blocker post-fix; the two-lane repro's `lane/282`
  carries one unrelated blocker pre-fix and gains `FLOW-09` post-fix.
- Golden re-pinned: 18 fixtures, 1122 verdicts. 36 changed pin entries, **all of them new
  rows** — no pre-existing verdict changed tag or detail. `docs-repo` gains the intended
  `CTX-14 FAIL` (blockers 3 → 4).
- Full suite (records, golden, orient, facts, lane, flow, admit, reconcile, gen) green;
  `--self-check` green (94 rules, consistent); self-score has no blockers.
