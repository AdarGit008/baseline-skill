# Tasks — Issue #54

- [x] Task 1: decide the fork, in the issue, before code
  - Acceptance: #54 carries the chosen selection and the reason the naming-convention
    option was declined.
  - Verify: comment on #54, posted before the first commit on this branch ✓
  - Files: none in-tree

- [x] Task 2: a commit-order path reader
  - Acceptance: `gitAddedOrdered(range, rel)` returns added paths oldest-first;
    add/delete/re-add dedupes to the re-add; null on a range that doesn't resolve.
  - Verify: `git log --reverse --diff-filter=A --name-only --format= -z` returns
    `z-first-written.md` before `a-last-written.md` ✓
  - Files: `src/repo.mjs`

- [x] Task 3: rewrite the selection
  - Acceptance: `record: session/N` highest-ordinal wins; no ordinal falls back to
    commit order; an unreadable `git log` degrades to filename sort.
  - Verify: the #54 repro gives `FLOW-03 PASS … chosen by record: session/3` and
    DIV-02 is no longer SKIP ✓
  - Files: `src/evaluators.mjs`

- [x] Task 4: every finding names the record and the basis
  - Acceptance: FLOW-03 (PASS and FAIL), FLOW-05 and DIV-02's SKIP all state which
    record was read and how it was chosen.
  - Verify: `DIV-02 SKIP :: read … — chosen by …; it carries no next:` ✓
  - Files: `src/evaluators.mjs`

- [x] Task 5: regression cases
  - Acceptance: a later-written record that sorts earlier is still read; a prereg
    sorting last does not outrank the session record; the ordinal beats commit order.
  - Verify: 6 new assertions pass on the fix and **all 6 fail on the pre-fix
    selector** (`git stash` control) ✓
  - Files: `test/flow/run.mjs`

- [x] Task 6: re-pin the golden corpus
  - Acceptance: only detail strings move; no rule's verdict changes.
  - Verify: `git diff --stat test/golden/pins.json` → 9 insertions, 9 deletions;
    grep for `"status"`/`"ok"` changes returns nothing ✓
  - Files: `test/golden/pins.json`

- [ ] Task 7 (next): #55 — every lane rule is inert on the `pull_request` event
  - Acceptance: the rank-2 finding from #52, unstarted.
  - Verify: n/a
  - Files: n/a
