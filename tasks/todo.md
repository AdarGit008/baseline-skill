# Tasks — Issue #56

- [x] Task 1: classify an `M` event instead of reporting it flat
  - Acceptance: `records-append-only` reads the blob at the mutating commit and
    classifies it against the record's introduction — `appended` (introduced lines
    still at the front, in order), `extended` (all still there, in order, insertions
    between), `rewritten` (an introduced line gone or restated). Line-wise prefix,
    not string-wise. An unreadable blob on either side stays `edited`.
  - Verify: the issue's repro prints `2 mutation(s) (1 rewritten · 1 appended)` ✓
  - Files: `src/evaluators.mjs`

- [x] Task 2: the finding leads with the class tally and the lossy examples
  - Acceptance: detail reads `N mutation(s) (<tally>): …`; the three printed examples
    sort rewrites/disposals ahead of the lossless classes.
  - Verify: 10 assertions in the records suite; 7 fail against the pre-fix evaluator
    (the other 3 are over-reach guards — #47's sanction route, which must not move) ✓
  - Files: `src/evaluators.mjs`, `test/records/run.mjs`

- [x] Task 3: the third class the two-way split could not carry
  - Acceptance: a mid-file insertion is `extended`, not `appended` and not `rewritten`
    — the issue's own golden fixture is exactly that edit, and calling it a rewrite
    would put benign edits back in the bucket the rule is trying to empty.
  - Verify: `flow-repo` re-pins to `1 mutation(s) (1 extended): … inserted into …` ✓
  - Files: `src/evaluators.mjs`, `test/records/run.mjs`, `test/golden/pins.json`

- [x] Task 4: the documentation half — the glob subject covers a class
  - Acceptance: REC-01's `fix` says the judgment `subject` is a glob, so a corpus
    re-pinned per sweep wants ONE standing deviation on `records/corpora/**`, and
    names the three edit classes; `lesson` carries the split.
  - Verify: `node check.mjs --self-check` green; an assertion proves one glob
    deviation sanctions three sweep appends at once ✓
  - Files: `rules/rec.json`, `test/records/run.mjs`

- [x] Task 5: nothing else moved
  - Acceptance: one golden pin changes, and it is the fixture that names itself the
    REC-01 mutation; the full suite is green.
  - Verify: records · golden · orient · facts · lane · flow · admit · reconcile · gen
    all exit 0 ✓
  - Files: `CHANGELOG.md`, `tasks/todo.md`
