# Tasks — Issue #49

- [x] Task 1: the floor — CTX-14, one number, one record
  - Acceptance: `adr-number-unique` groups the corpus by the number parsed off each
    filename and fails on any number claimed twice, naming the number and every file
    claiming it. A hole in the sequence rides the PASS detail and is never a verdict.
    An unexpired `sign-off`/`deviation`/`risk-acceptance` whose glob `subject` matches
    *either* colliding path sanctions the collision; an expired one stops.
  - Verify: the issue's same-tree repro scores `CTX-14 FAIL — 0009 claimed by 0009-a.md,
    0009-b.md` where every rule passed before; renumbering to `0029` passes and reports
    `gap(s) in the sequence (not an error): 0028` ✓
  - Files: `src/evaluators.mjs`, `rules/ctx.json`

- [x] Task 2: the lane world reads lane TREES, not just lane refs
  - Acceptance: `laneObjects()` — lazy and memoized like the world itself, one bounded
    glob fetch into `LANES_PRIV` (laneRefsGit's refspec), per-ref resolution falling back
    to `refs/remotes/origin/*`, `files(ref)` answering `null` for uninspectable and never
    `[]`. No live fetch under replay; resolution still answers from local refs, so the
    suite exercises the rule without a round trip.
  - Verify: the flow suite's replay world resolves nothing for a lane that was never
    pushed here, and FLOW-09 SKIPs saying so ✓
  - Files: `src/facts/index.mjs`

- [x] Task 3: two git reads the rule needs
  - Acceptance: `gitLsTree(ref)` — every tracked path at a commit, `null` on failure.
    `gitDiffNames(range, rel, { deletedOnly })` — what this lane REMOVED since it
    branched, which is what separates a rename from a second record.
  - Verify: a `git mv` of a decision record does not read as a collision, while a lane
    that merely branched before the record landed does ✓
  - Files: `src/repo.mjs`

- [x] Task 4: the catch — FLOW-09, the number is reserved across live lanes
  - Acceptance: introduction measured by **path**; a collision reported against the
    default branch and against every other live lane, naming both filenames and the
    lane's derived state; COMPLETED lanes excluded; a lane branched off a lane sharing
    the same path exempt; a renamed record exempt; unresolvable lanes counted and named,
    and all-unresolvable a labeled SKIP.
  - Verify: on the two-lane repro the second lane FAILs naming `lane/265` and both
    filenames, exit 1, while `CTX-14` PASSes on that same tree — the incident, exactly.
    After `lane/265` merges, the same lane FAILs against `origin/main` ✓
  - Files: `src/evaluators.mjs`, `rules/flow.json`

- [x] Task 5: proof for the floor
  - Acceptance: 10 assertions in `test/records/run.mjs` — distinct numbers pass, the
    incident is a finding naming both files, either sanction end clears it, an expired
    judgment stops clearing it, `break-glass` is not a sanction, the repair passes with
    the gap note, and an index-only decision dir is a SKIP rather than a pass on nothing.
  - Verify: `node test/records/run.mjs` ✓
  - Files: `test/records/run.mjs`

- [x] Task 6: proof for the catch
  - Acceptance: 11 assertions in `test/flow/run.mjs` across a two-lane world on a local
    bare origin under `multi-lane-local` (forge closed — the rule is a git-plane question
    end to end): first claim, second claim, the finding's shape, exit 1, CTX-14's
    blindness on that tree, the post-merge order, CTX-14 going red once both merge, a free
    number, the rename, a lane branched off a lane, and the unreadable-lane SKIP.
  - Verify: `node test/flow/run.mjs` ✓
  - Files: `test/flow/run.mjs`

- [x] Task 7: the golden corpus, and every row accounted for
  - Acceptance: `docs-repo` gains `0006-numbering.md` + `0006-numbering-again.md` — the
    duplicate pair, both `Accepted`, no edges, so only CTX-14 moves. Re-pin captures 18
    fixtures / 1122 verdicts.
  - Verify: the pin diff is **36 changed entries, all of them new rows**. Every fixture
    gains a `CTX-14` and a `FLOW-09` row; `docs-repo.CTX-14` is the one FAIL (blockers
    3 → 4); the six `admit-*` fixtures gain only `FLOW-09` (CTX-14's contexts are
    check/reconcile). **No pre-existing verdict changed tag or detail.** ✓
  - Files: `test/fixtures/docs-repo/docs/decisions/0006-*.md.golden`,
    `test/golden/pins.json`

- [x] Task 8: the counts the docs assert
  - Acceptance: 94 rules (28 blockers · 61 warnings · 5 sign-offs) across README, SKILL,
    REFERENCE and both evaluate-stack SVGs; the CTX table row, the FLOW table rows
    (FLOW-08 was missing from it before this branch) and the two category counts.
    Drive-by: the documented check-kind count said 41 while the set held 43 before this
    branch and 45 after.
  - Verify: `node check.mjs --self-check` reports 94 rules and a consistent set ✓
  - Files: `README.md`, `SKILL.md`, `REFERENCE.md`, `docs/assets/evaluate-stack-*.svg`,
    `src/evaluators.mjs`, `test/records/run.mjs`
