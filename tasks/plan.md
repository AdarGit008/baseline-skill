# Implementation Plan: Issue #47 — REC-01's sanctioned-edit route resolves

## Overview

Wire REC-01 (`records-append-only`) to the judgment ledger so a mutation covered by
a sanctioning JDG is reported as *sanctioned* and excluded from the finding count —
making the rule's own `fix` ("record a JDG and leave the tombstone") true. The
mechanism already exists: `resolveConfig` loads the ledger for the signoff bridge;
DESC-03 already matches judgments by subject. The change threads the full judgment
list into `makeEvalCheck`, classifies each REC-01 mutation against it, and reports
disposition.

## Architecture decisions

- **One home for the sanction-kind set** — hoist DESC-03's inline `['sign-off',
  'deviation', 'risk-acceptance']` to a module constant `SANCTION_KINDS` shared by
  both REC-01 and DESC-03. Behavior-preserving for DESC-03.
- **Thread `JUDGMENTS` (full list) alongside the existing `JDGS` (signoff map)** —
  `resolveConfig` already calls `loadJudgments`; split the call so both consumers
  read the same parse. New param defaults to `null` so the existing direct
  `makeEvalCheck` test callers are unchanged and fail-closed (no judgments ⇒ no
  sanctions).
- **Matching = `globToRe(subject).test(path)`** — reuse the canonical glob helper;
  exact paths are literal globs, scopes use `*`/`**`. No new matcher.
- **Unexpired only** (`review_by >= TODAY`) — same clock DESC-03 and the signoff
  bridge use.
- **Golden corpus untouched** — REC-01 is SKIP in every golden fixture; no re-pin.

## Task list

### Phase 1: RED tests
- [ ] Task 1: write the failing unit + e2e tests in `test/records/run.mjs`.

### Checkpoint 1
- [ ] `node test/records/run.mjs` fails on the NEW assertions only (RED proven).

### Phase 2: plumbing
- [ ] Task 2: `resolveConfig` returns `JUDGMENTS`; thread it through `check.mjs`,
  `src/admit.mjs`, `src/reconcile.mjs` into `makeEvalCheck` (new `JUDGMENTS` param).

### Checkpoint 2
- [ ] Tests still RED (plumbing present, evaluator unchanged); no crash on the
  new param.

### Phase 3: evaluator logic (GREEN)
- [ ] Task 3: classify each mutation in `records-append-only`; hoist
  `SANCTION_KINDS`; update DESC-03 to use it.

### Checkpoint 3
- [ ] `node test/records/run.mjs` GREEN (all new + existing assertions).

### Phase 4: docs + fix field
- [ ] Task 4: rewrite REC-01 `fix` in `rules/rec.json`; update `CONTRACT.md`,
  `REFERENCE.md`, `CHANGELOG.md`.

### Phase 5: full verification
- [ ] Task 5: `check.mjs --self-check` + all 9 runners + golden `--verify` green.

### Checkpoint: Complete
- [ ] No golden re-capture; REC-01 behavior pinned for sanctioned/unsanctioned/
      wrong-subject/break-glass/expired/glob-scope/mixed/all-sanctioned.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Forgetting to thread JUDGMENTS through one of the three CLIs | Med — unit tests pass, real CLI silently ignores tombstones | The e2e `check.mjs` test is the guard; admit/reconcile share the `resolveConfig` path so a single threading is the failure surface |
| A subject glob matching too broadly (e.g. `records/**` sanctions unrelated edits) | Low | That is the author's explicit scope — a scope subject IS a deliberate broad sanction; `jdg new` requires a `--reason` |
| Expired-tombstone re-lighting a permanent mutation forces re-judgment | Low | One-line flip to permanent if dogfood data objects; documented in SPEC decision #4 |
| Detail-string change leaks into golden | Low | REC-01 is SKIP in every golden fixture; `--verify` must stay green with no re-capture |

## Open questions

None (see SPEC.md).
