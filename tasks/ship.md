# Ship — Issue #49

Ready. The last open issue on the board, and the one #57's ship note pointed at.

## Ship criteria

- [x] Two lanes authoring the same decision number is a finding **on the lane**, naming
      the other lane and both filenames
- [x] It still fires on the merge order that shipped the incident — first lane landed,
      second lane checking
- [x] Two conflict-free merges cannot put two ADR-0027s on the default branch silently
- [x] A rename introduces a path, not a number
- [x] A lane branched off a lane is one record reached twice, not a second claim
- [x] A COMPLETED lane holds no reservation
- [x] A lane the clone cannot read is counted and named, never folded into a pass
- [x] A gap in the sequence is reported and is not a verdict
- [x] A corpus that cannot renumber without breaking citations adopts through the
      existing ledger route, with an expiry
- [x] Every re-pinned row accounted for; no pre-existing verdict moved
- [x] Full suite green; self-check green; no blockers on this repo

## The gap this closes, in the words of the issue

> It was caught by a human mentioning in conversation that the other lane was in flight.
> That is the whole detection mechanism today.

Both branches passed. Both would merge with no git conflict. The paths differed, so git
had nothing to say, and no rule read the number.

## The adjacent finding

The issue's second half — `baseline gate` producing different results on the `push` and
`pull_request` events, leaving the lane rules inert on the event that guards the merge —
was filed and shipped separately as **#55** (`da7c56a`, "resolve the lane from the CI
event, so the merge gate runs at the merge"). Nothing further is owed here; the flow
suite's `#55` block is the standing proof.

## Next

The board is empty. If a follow-up is wanted, the honest candidate is the one FLOW-09
deliberately does not do: **allocate** a decision-record number the way `lane claim`
allocates an issue number — an atomic ref transaction at origin, so two agents cannot
take `0027` in the first place rather than both discovering it afterwards.
