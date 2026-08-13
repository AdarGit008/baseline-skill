# Code Review — Issue #46 (five-axis)

Reviewed diff: `2aa80a0..HEAD` (4 commits, ~105 lines of source/test change).

## Verdict: **Approve**

The change is correct, matches the repo's conventions, and adds regression coverage. Three
non-blocking observations below.

## Correctness — PASS

- `forge.prClosingIssues(n)` (`src/facts/forge.mjs:116`) reads the GraphQL
  `closingIssuesReferences` envelope and returns `number[]` or `null`; the fixed query string
  uses `$n/$owner/$name` variables, so no injection surface. Verified live on gh 2.45.0.
- `scopedPrClosers(w)` (`src/evaluators.mjs:23`) makes the forge authoritative with the body
  regex as the null-honest fallback — a failed query falls back to `issueCloses(body)` (never
  worse than prior behavior), never coalesced to "closes nothing".
- `gatherFacts` (`src/facts/index.mjs:171`) applies the same authority so orient and the DIV
  rules agree (one-derivation parity). The referenced-issue resolver already walks `pr.closes`,
  so forge-discovered closers get their issue states resolved.
- FLOW-08 (`src/evaluators.mjs:750`) correctly SKIPs on no namespace / no forge / null PR
  listing, and returns `ok:false` (warn severity) only for a real self-anchor close.
- `deriveDivergence` was **not** touched — the shared classifier is still the single "closed"
  definition, and both surfaces now feed it the same input.

## Readability & Simplicity — PASS

- Names are descriptive (`prClosingIssues`, `scopedPrClosers`, `viaSidebar`); comments name
  the rule id, the lesson, and the null-honesty contract, matching the file's style.
- No dead code, no "clever" tricks, no nested conditionals.

## Architecture — PASS (one observation)

- `prClosingIssues` sits on the forge with the other reads; `scopedPrClosers` is one home for
  the two DIV/FLOW evaluators; the rule is data-declared in `rules/flow.json`. Fits the design.

## Security — PASS

- No secrets, no injection (parameterized GraphQL), PR branch/title rendered through the
  existing `sanitizeTTY` boundary (`src/report.mjs:40`).

## Performance — PASS (accepted tradeoff)

- One memoized GraphQL spawn per open PR (capped at 50 by the PR list), shared by DIV-03,
  FLOW-08, and orient's headline via the forge's `q()` memo. Matches the codebase's stated
  "batching deferred" policy and the existing per-issue spawn pattern.

## Findings (non-blocking)

- **Optional** — `src/evaluators.mjs:23` and `src/facts/index.mjs:171` each encode the
  `forgeClosers ?? closes(body)` fallback. Two homes for one rule, against the repo's strong
  "one home" discipline. The two differ in null-contract (`prsOpenOrNull` vs `prsOpen`), so a
  naive merge would be wrong — but a small shared `resolvePrClosers(forgeClosers, body)`
  helper would remove the drift risk. Not blocking.
- **Consider** — FLOW-08 does not exclude draft PRs (`isDraft`), so a draft that links its own
  anchor warns "will close on merge". DIV-03 has the same stance (no draft filter), so this is
  consistent; flagging only because the "on merge" phrasing is slightly premature for drafts.
- **FYI** — `closingIssuesReferences(first:50)` truncates beyond 50 closers per PR; matches the
  PR list's `--limit 50`, GitHub's own ceiling is 100. Cosmetic in practice.

## Verification story

`check.mjs --self-check` green · `test/golden/run.mjs --verify` green (re-captured) ·
`test/{orient,facts,records,lane,flow,admit,reconcile,gen}/run.mjs` green · self-score
`node check.mjs --repo . --no-exec` = 0 blockers. Golden diff is purely additive (FLOW-08 rows
+ summary counts); no other verdict moved.
