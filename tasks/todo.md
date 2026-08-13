# Tasks — Issue #46

- [x] Task 1: `forge.prClosingIssues(n)` + `div-closes-closed` reads the forge authority
  - Acceptance: `makeForge` exposes `prClosingIssues(n)` (GraphQL, memoized, null on failure); `div-closes-closed` uses `closes = forge ?? issueCloses(body)`; a sidebar-linked closure (body has no keyword) is detected by DIV-03.
  - Verify: `node test/flow/run.mjs` ✓
  - Files: `src/facts/forge.mjs`, `src/evaluators.mjs`, `test/flow/run.mjs`

- [x] Task 2: `pr-closes-own-anchor` kind + FLOW-08 rule
  - Acceptance: `CHECK_KINDS` gains `pr-closes-own-anchor`; `rules/flow.json` gains FLOW-08 (warn, check+admit, no branch_scope); an open PR whose closing set contains its own anchor warns, distinguishing sidebar vs keyword.
  - Verify: `node test/flow/run.mjs` ✓
  - Files: `src/evaluators.mjs`, `rules/flow.json`, `test/flow/run.mjs`

- [x] Task 3: `gatherFacts` derives `closes` from the forge (fallback body regex)
  - Acceptance: orient's divergence headline and the check rule read the same authority; facts replay fixtures `pr-closers-*.json` added.
  - Verify: `node test/facts/run.mjs` ✓
  - Files: `src/facts/index.mjs`, `test/facts/run.mjs`

- [x] Task 4: bookkeeping + full suite + golden re-capture
  - Acceptance: `test/records/run.mjs` asserts 91 rules; golden pins re-captured and `--verify` green; self-check green.
  - Verify: self-check + all 9 runners + golden `--capture`/`--verify` ✓
  - Files: `test/records/run.mjs`, `test/golden/pins.json`
