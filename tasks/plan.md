# Implementation Plan: Issue #46 — forge-authoritative PR closures + FLOW-08 pre-merge warn

## Overview

Read "which issues a PR closes" from the forge's `closingIssuesReferences` (GraphQL) instead
of the body-text regex, with the body regex retained as a null-honest fallback. Add FLOW-08, a
warn-severity preventive twin of DIV-01 that fires when an open PR will close its own lane
anchor. Keep orient's divergence headline on the same authority (one-derivation parity).

## Architecture decisions

- **`prClosingIssues(n)`** on the forge: one `gh api graphql` call per PR, memoized by `q()`,
  returns `number[]` or `null` (failure → caller falls back, never "closes nothing").
- **Shared helper `scopedPrClosers(w)`** in `evaluators.mjs`: per-PR
  `{ number, branch, closes, forgeCloses, bodyCloses }` where `closes = forge ?? body`.
- **`gatherFacts`** uses the same authority so orient and the DIV rules agree.
- **FLOW-08** = `pr-closes-own-anchor`, warn, `check`+`admit`, no branch_scope (repo-wide).

## Task list

### Phase 1: forge closers + DIV-03
- [ ] Task 1: `forge.prClosingIssues(n)` + `div-closes-closed` reads the forge authority.

### Checkpoint 1
- [ ] `test/flow/run.mjs` passes; DIV-03 detects a sidebar-linked closure via replay.

### Phase 2: FLOW-08 warn
- [ ] Task 2: `pr-closes-own-anchor` kind + FLOW-08 rule.

### Checkpoint 2
- [ ] `test/flow/run.mjs` passes; FLOW-08 warns on sidebar and keyword anchors.

### Phase 3: orient parity
- [ ] Task 3: `gatherFacts` derives `closes` from the forge (fallback body regex).

### Checkpoint 3
- [ ] `test/facts/run.mjs` passes; divergence headline sees forge-discovered closers.

### Phase 4: bookkeeping + full suite
- [ ] Task 4: rule count 90→91, golden re-capture, full suite green.

### Checkpoint: Complete
- [ ] self-check, golden --verify, and all 9 test runners green; FLOW-08 and DIV-03 behavior pinned.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Per-PR GraphQL spawn count grows with open PRs | Med | PR list already capped at 50; memoized; matches existing per-issue pattern |
| Fallback re-introduces blind spot on query failure | Low | Fallback is strictly the prior behavior (never worse); null is never coalesced to "no closers" |
| Golden re-capture hides an unintended change | Med | Review the re-captured diff for only FLOW-08 rows + DIV-03 detail drift |

## Open questions

None.
