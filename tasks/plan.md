# Implementation Plan: Issue #52 — the mcgyvr-derived hardening backlog

## Overview

Read the `mcgyvr` corpus with one question in hand, reproduce every candidate against
this repo's code, rank what survives by trust damage × frequency, and file each
survivor as its own issue linked from the #52 tracker.

**This branch delivers the review and the plan. It ships no code.** The four
reproduced findings are drafted as issue bodies under `tasks/issues/` and are
deliberately **not posted** — filing is the next session's first act, after review.

## Method (as executed)

1. **ADRs first.** All 36 read in full. Signal density for baseline is low by design —
   they are mcgyvr's product decisions — but four carry baseline surface directly:
   ADR-0001's amendment (the `gh` write hazard), ADR-0002 (CONTRACT.md's classic-vs-ruleset
   bypass reasoning), ADR-0026 lens 3 (a check that cannot state its content is
   negative) and ADR-0036's renumbering note (the ADR-0035 collision).
2. **Session records second.** All 162, chunked to fit and read whole except the two
   generation briefs (scanned; limit stated in `SPEC.md`).
3. **Reproduce or don't file.** Every candidate traced to the evaluator, rule or CLI
   path and exercised against a throwaway repo. Four reproduced; five did not and are
   recorded as candidates.
4. **Rank.** Trust damage × frequency, both stated per finding rather than asserted.

## Architecture decisions

- **One issue per finding, not one omnibus.** Each fix touches a different evaluator
  and carries its own regression test; bundling them would make the review of any one
  of them worse. The tracker (#52) carries the ranking and the candidate list.
- **The tracker is updated, the child issues are drafted only.** #52 is this work's
  own record and its body promises the table; the child issues are a filing decision
  the owner has not made yet.
- **No fix is designed here.** Each drafted issue names the mechanism and the cost and
  stops at *"suggested fix"*, in #50's shape. F1 in particular has a real fork
  (frontmatter `record:` ordinal vs. commit order vs. a naming convention) and
  choosing it inside a review is the overreach mcgyvr's own records keep flagging.
- **Corroboration goes to the existing issues, not into new ones.** #49 and #50 are
  open and correct; what this read adds is dated evidence, drafted as comments under
  `tasks/issues/`.

## Task list

### Phase 1: the read — DONE
- [x] Task 1: read all 36 ADRs.
- [x] Task 2: read all 162 session records (two briefs scanned; limit stated).
- [x] Task 3: extract candidates with lane ids and dates.

### Phase 2: reproduction — DONE
- [x] Task 4: reproduce F1 (FLOW-03 filename-sort selection).
- [x] Task 5: reproduce F2 (lane rules inert on `pull_request`).
- [x] Task 6: reproduce F3 (REC-01 append vs rewrite) from the evaluator source.
- [x] Task 7: reproduce F4 (ADR amendment edges unchecked).
- [x] Task 8: attempt the five remaining candidates; record them unfiled.

### Checkpoint 1
- [x] Four findings carry a runnable repro; five candidates carry the reason they
      did not clear the bar; one is refuted on current main and says so.

### Phase 3: the record — DONE
- [x] Task 9: `SPEC.md` — the objective, the ranked table, the corroboration, the
      candidates, the stated limits.
- [x] Task 10: `tasks/issues/F1..F4` — drafted issue bodies, #50's shape.
- [x] Task 11: `tasks/issues/comment-49.md`, `comment-50.md` — drafted corroboration.
- [x] Task 12: update #52's body with the findings table.

### Checkpoint 2
- [x] `git status` clean of any change under `src/`, `rules/`, `check.mjs`, `test/`.
- [x] `node check.mjs --repo . --no-exec` — no new findings from this branch.

### Phase 4: next session (NOT this branch)
- [ ] Task 13: owner reviews the four drafts; file the ones that survive.
- [ ] Task 14: post the two corroboration comments on #49 and #50.
- [ ] Task 15: take F1 first — it is the highest-ranked, it is a blocker firing on
      compliant lanes, and its fix is the smallest of the four.

## Risks

- **The ranking is a judgement.** Trust damage is argued, not measured. The frequency
  column is countable and is the check on it: every row names the lanes.
- **F2's fix is a policy call, not a bug fix.** Reading `GITHUB_HEAD_REF` when the
  checkout is detached makes the lane rules fire on the PR event; refusing to makes
  the SKIP correct and pushes the problem into CI wiring and documentation. The
  drafted issue states both and picks neither.
- **F3 overlaps #47.** The sanctioned route landed; this is the residual. The draft
  says so in its first paragraph so it is not read as a re-filing.
