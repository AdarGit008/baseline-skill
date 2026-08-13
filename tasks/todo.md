# Tasks — Issue #47

- [x] Task 1: RED tests for the sanctioned-edit route
  - Acceptance: `test/records/run.mjs` gains unit tests (sanctioned PASS, wrong-subject fails, break-glass fails, expired fails, glob-scope PASS, mixed reports only unexplained, all-sanctioned PASS) and one `check.mjs` e2e tombstone flow (WARN→PASS). They FAIL against the current evaluator.
  - Verify: `node test/records/run.mjs` → new assertions fail, existing pass ✓
  - Files: `test/records/run.mjs`

- [x] Task 2: thread JUDGMENTS through resolveConfig → check/admit/reconcile → makeEvalCheck
  - Acceptance: `resolveConfig` returns `JUDGMENTS` (full `loadJudgments().records`); `check.mjs`, `src/admit.mjs`, `src/reconcile.mjs` pass it; `makeEvalCheck` accepts `JUDGMENTS = null`. `JDGS` unchanged.
  - Verify: `node test/records/run.mjs` still RED (no behavior change yet), no crashes ✓
  - Files: `src/config.mjs`, `check.mjs`, `src/admit.mjs`, `src/reconcile.mjs`, `src/evaluators.mjs`

- [x] Task 3: REC-01 classifier + shared SANCTION_KINDS constant
  - Acceptance: `records-append-only` classifies each mutation as sanctioned (unexpired {sign-off,deviation,risk-acceptance} judgment whose subject glob-matches the reported path) vs unexplained; all-sanctioned → ok:true; any unexplained → ok:false counting only unexplained; detail names sanctioning id(s). `SANCTION_KINDS` hoisted and reused by DESC-03 (behavior-preserving).
  - Verify: `node test/records/run.mjs` GREEN ✓
  - Files: `src/evaluators.mjs`

- [x] Task 4: REC-01 fix field + docs
  - Acceptance: `rules/rec.json` `fix` names the tombstone command; `CONTRACT.md`, `REFERENCE.md`, `CHANGELOG.md` updated.
  - Verify: `node check.mjs --self-check` green; docs consistent ✓
  - Files: `rules/rec.json`, `CONTRACT.md`, `REFERENCE.md`, `CHANGELOG.md`

- [x] Task 5: full suite + golden verify
  - Acceptance: self-check + all 9 runners + `test/golden/run.mjs --verify` green with NO re-capture.
  - Verify: `node check.mjs --self-check`; `node test/{records,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs`; `node test/golden/run.mjs --verify` ✓
  - Files: none (verification only)
