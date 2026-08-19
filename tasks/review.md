# Review — Issue #54

## What changed

| File | Change |
|------|--------|
| `src/repo.mjs` | `gitAddedOrdered(range, rel)` — added paths in commit order |
| `src/evaluators.mjs` | `committedLog` selects by record kind + ordinal, then commit order; `logProvenance()`; three detail strings |
| `test/flow/run.mjs` | three cases, six assertions |
| `test/golden/pins.json` | re-pinned: 9 detail diffs, 0 verdict changes |

## The one thing worth arguing about

A lane carrying **only** non-session records still selects one, by commit order, and
FLOW-03 can then fire "empty next:" on a pre-registration. That is unchanged from
before and it is deliberate: FLOW-02's presence definition counts every added `.md`, so
a selector that refused to pick would produce "a record is present" and "no record to
read" from one tree. Narrowing FLOW-02 is a separate issue; this one would have hidden
the question rather than answered it.

## Verification

- #54's own repro, run against the patched checker: FLOW-03 PASS naming
  `record: session/3`, DIV-02 no longer SKIP.
- Negative control: the six new assertions all **fail** with `src/` stashed — they test
  the fix, not the harness.
- Golden: 18 fixtures, 1083 rule verdicts, 9 changed details, **0 changed verdicts**.
- Full suite green: records · golden · orient · facts · lane · flow · admit ·
  reconcile · gen.
- `node check.mjs --self-check` green. Self-score 96%, no blockers (the 1 warn is
  SEC-05, pre-existing and unrelated).

## Not done here

- #50 — where `next:` sits *inside* the chosen file. The other half of FLOW-03's
  selection problem, still open.
- FLOW-02's presence definition, per the argument above.
