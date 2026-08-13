# Ship Report — Issue #46

## Decision: **GO** ✅

## Fan-out (parallel agents)

| Agent | Verdict | Action |
|-------|---------|--------|
| code-reviewer | REQUEST CHANGES → 1 Required (fallback duplicated across `scopedPrClosers` and `gatherFacts`) | **Addressed** — `forge.prClosers(pr)` extracted as one home (`eb8b553`) |
| security-auditor | 0 Critical/High/Medium; land as-is | No action |
| test-engineer | Tests are real regression tests (verified on old source); 2 critical test-gaps (empty-vs-null forge answer, FLOW-08 fallback) | **Addressed** — two regression tests added (`eb8b553`) |

## Deferred (non-blocking, filed as follow-ups)

- `closingIssuesReferences(first:50)` truncation is silent (no `pageInfo.hasNextPage` label).
- Per-PR GraphQL spawn count grows with open PRs (batching deferred, documented in code).
- FLOW-08 "via linked reference, not body text" does not distinguish commit-message keywords
  (body regex only scans the body).
- FLOW-08 does not exclude draft PRs (consistent with DIV-03).

## Verification

- `check.mjs --self-check` green (91 rules, internally consistent).
- `test/golden/run.mjs --verify` green (re-captured; diff purely additive).
- `test/{orient,facts,records,lane,flow,admit,reconcile,gen}/run.mjs` all green.
- Self-score `node check.mjs --repo . --no-exec` = 0 blockers.
- Live GraphQL query shape verified against gh 2.45.0.

## Rollback plan

Trigger: any post-merge regression in a vendoring consumer (REC-06 hash-pinned) or CI.

1. `git revert --no-edit eb8b553 13062b6 eb435ec f62f5a3 fe04ff5` (reverse order), or
   `git reset --hard 2aa80a0` on the branch.
2. Re-run `node check.mjs --self-check && node test/golden/run.mjs --verify` and the 9 runners.
3. Consumers: no data migration or schema change — the only shipped artifacts are
   `rules/flow.json` (new FLOW-08), `src/*.mjs` (additive forge method + refactor), and tests.

Time to rollback: < 5 minutes (pure source revert, no deploy, no data).

## Risk note

Not high-risk/irreversible (no auth, secrets, destructive migration, payment, or deploy), so
doubt-driven-development was not invoked. The one operational risk — per-PR forge spawn growth —
is bounded (50-PR cap, memoized) and already flagged for batching in the code's own comments.
