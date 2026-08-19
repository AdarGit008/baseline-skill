# Implementation Plan: Issue #54 — FLOW-03/05 + DIV-02 record selection

## Overview

One selector, three consumers. `committedLog(branch)` in `src/evaluators.mjs` is called
by FLOW-03 (`lane-next-filled`), FLOW-05 (`lane-record-pushed`) and DIV-02
(`div-next-closed`). Fixing the selector fixes all three at once — which is also why it
had to be fixed in one place rather than three.

## Architecture decisions

- **The fork is decided in the issue, not in the diff.** Posted to #54 before any code:
  ordinal leads, commit order falls back, filename sort degrades. #52's plan required it
  and the alternative is a design argument buried in a commit message.
- **The ordered read can only reorder, never widen.** `gitAddedOrdered` runs over the
  same range as the existing `gitDiffNames` call; the selection intersects the two, so a
  path the ordered read misses keeps its position rather than vanishing. A failed
  `git log` degrades to the old sort — this rule must not start refusing where it used
  to answer.
- **`parseFrontmatter` is reused, not re-implemented.** `src/records.mjs` already owns
  the one opinion about a record's frontmatter; a second inline parser in the evaluator
  would drift from the writer.
- **Provenance rides the detail, on both paths.** `logProvenance()` is one helper so the
  PASS, the FAIL and the SKIP can't describe the selection three different ways. The
  SKIP mattered most: DIV-02 saying *"no committed next:"* read as "nothing to check".

## Task list

### Phase 1: the selector
- [x] Task 1: `gitAddedOrdered(range, rel)` in `src/repo.mjs` — added paths in commit
      order, add/delete/re-add deduped to the re-add, null on failure.
- [x] Task 2: rewrite `committedLog` — commit order, then kind + ordinal, with the
      basis and a count carried out.
- [x] Task 3: `logProvenance()` and the three detail strings.

### Checkpoint 1
- [x] The #54 repro inverts: FLOW-03 PASS naming `session/3`, DIV-02 no longer SKIP.

### Phase 2: proof
- [x] Task 4: three flow cases — prereg sorting last, commit-order fallback, ordinal
      beating commit order.
- [x] Task 5: negative control — all six assertions fail against the pre-fix selector.
- [x] Task 6: re-pin the golden corpus; confirm the diff is 9 details and 0 verdicts.

### Checkpoint 2
- [x] Full suite green; self-check green; self-score 96%, no blockers.

## Risks

- **A repo whose records carry no frontmatter** now depends on `git log` rather than the
  alphabet. Behaviour is unchanged where the two agree, and the detail says which was
  used when they don't.
- **Shallow clones**: `git log base..HEAD` over a truncated history returns fewer paths.
  The intersection keeps those records at their diff position, so the result degrades to
  today's behaviour rather than dropping a record.
