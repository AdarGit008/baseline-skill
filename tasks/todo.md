# Tasks — Issue #52

- [x] Task 1: read the mcgyvr ADR corpus
  - Acceptance: all 36 records under `docs/decisions/` read in full; baseline-relevant
    signal extracted with ADR ids.
  - Verify: candidates trace to ADR-0001 (amendment + the `gh` write hazard), ADR-0002,
    ADR-0026 lens 3, ADR-0036's renumbering note ✓
  - Files: none (read-only against `~/claude/mcgyvr`)

- [x] Task 2: read the mcgyvr session-record corpus
  - Acceptance: all 162 records under `records/sessions/lane/**` read; the two 21 KB
    generation briefs scanned rather than read, with the limit stated in `SPEC.md`.
  - Verify: every candidate carries a lane id and a date ✓
  - Files: none (read-only)

- [x] Task 3: reproduce F1 — FLOW-03 selects by filename sort
  - Acceptance: a scratch lane carrying a session record with a filled `next:` and a
    pre-registration without one makes FLOW-03 **FAIL** and DIV-02 **SKIP**.
  - Verify: `FLOW-03 FAIL :: …positive-control-prereg.md has an empty next:` ✓
  - Files: `tasks/issues/F1-flow03-newest-record-by-filename.md`

- [x] Task 4: reproduce F2 — lane rules inert on `pull_request`
  - Acceptance: one commit, two checkouts. On the branch: FLOW-02 PASS, FLOW-03 FAIL.
    Detached: all seven FLOW rules plus DIV-01/02 SKIP.
  - Verify: tallies `{FAIL:2}` on the branch against `{FAIL:1}` detached ✓
  - Files: `tasks/issues/F2-lane-rules-inert-on-pull-request.md`

- [x] Task 5: reproduce F3 — REC-01 cannot separate an append from a rewrite
  - Acceptance: the mutation list in `records-append-only` is built from `M`/`D`/`R`
    name-status alone; nothing reads the diff's shape.
  - Verify: `src/evaluators.mjs` ~line 458 — `e.status === 'M' ? 'edited' : …` ✓
  - Files: `tasks/issues/F3-rec01-append-is-not-a-rewrite.md`

- [x] Task 6: reproduce F4 — ADR amendment edges unchecked
  - Acceptance: an ADR declaring `Amends: ADR-0019` where no ADR-0019 exists, and
    naming an ADR that does not name it back, passes CTX-02 and CTX-07.
  - Verify: `CTX-02 PASS :: 2 decision doc(s) ok` / `CTX-07 PASS :: forward-links resolve` ✓
  - Files: `tasks/issues/F4-adr-amendment-edges-unchecked.md`

- [x] Task 7: dispose of the remaining candidates
  - Acceptance: five candidates recorded with the reason each did not clear the bar;
    the claims-schema one marked **refuted on current main** rather than carried.
  - Verify: `SPEC.md` § "Candidates recorded and NOT filed" ✓
  - Files: `SPEC.md`

- [x] Task 8: corroborate the two open issues
  - Acceptance: #49 gains two dated incidents (ADR-0027 near-miss 2026-08-16;
    ADR-0035 landed twice 2026-08-17, PRs #298/#303); #50 gains two further instances
    (`lane/113` s4, `lane/266` s5).
  - Verify: drafted, not posted ✓
  - Files: `tasks/issues/comment-49.md`, `tasks/issues/comment-50.md`

- [x] Task 9: land the record
  - Acceptance: `SPEC.md`, `tasks/plan.md`, `tasks/todo.md` describe this issue;
    nothing under `src/`, `rules/`, `check.mjs` or `test/` is touched.
  - Verify: `git diff --stat main` shows docs + `tasks/` only ✓
  - Files: `SPEC.md`, `tasks/plan.md`, `tasks/todo.md`, `tasks/review.md`, `tasks/ship.md`

- [ ] Task 10 (next session): file the surviving drafts and post the two comments
  - Acceptance: one issue per finding the owner keeps, each linked from #52's table.
  - Verify: #52's table has an issue number in every filed row.
  - Files: none in-tree

- [ ] Task 11 (next session): take F1
  - Acceptance: FLOW-03/05 and DIV-02 select the lane's newest record by something
    other than filename sort; the fork is decided in the issue before code is written.
  - Verify: `node test/flow/run.mjs` gains a case where a later-written record sorts
    earlier and the rule still reads it.
  - Files: `src/evaluators.mjs`, `test/flow/run.mjs`
