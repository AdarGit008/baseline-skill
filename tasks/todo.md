# Tasks — Issue #57

- [x] Task 1: one reader for what a decision record declares
  - Acceptance: `adrHeaderFields` walks the header once — a field ends at the next
    FIELD, not the next newline — and `adrEdges` turns it into four integer lists.
    Parenthesised commentary is stripped before numbers are read; `none`/`n/a`/`-`
    declare nothing; the legacy inline `Status: Superseded by ADR-0003` folds in.
  - Verify: the issue's own wrapped declaration reads `[17, 19]`, not `[19]` and not
    `[5, 17, 19]`; the golden corpus's inline form still reads `[3]` ✓
  - Files: `src/records.mjs`

- [x] Task 2: the storage form matches the rules
  - Acceptance: `parseAdrHeader` routes through the same walk and carries
    `amends`/`amended_by`; `record.adr.schema.json` and `templates/adr.md` carry them
    too, and the template's comment teaches the amendment ceremony next to the
    supersede one.
  - Verify: `templates/adr.md`'s extracted header still validates, now with both new
    fields present ✓
  - Files: `src/records.mjs`, `schema/record.adr.schema.json`, `templates/adr.md`

- [x] Task 3: CTX-07 resolves every declared edge
  - Acceptance: all four verbs resolved against the decision tree, the finding names
    the verb (`0021-bench.md amends ADR 0019 (no such file)`), and the pass detail
    counts what it checked. Self-reference still resolves against OTHER files only.
  - Verify: the #57 repro's dangling `0019` is reported and the resolving `0017` is
    not; `4 declared edge(s) resolve` once `0019` exists ✓
  - Files: `src/evaluators.mjs`, `rules/ctx.json`

- [x] Task 4: CTX-13, and the adoption route that is not a new mechanism
  - Acceptance: a one-way amendment is a warn naming both records; a dangling one is
    left to CTX-07; an unexpired sanctioning judgment whose glob `subject` matches the
    declaring record clears it, and an expired one stops clearing it.
  - Verify: 7 assertions covering the finding, the no-double-report guard, the
    both-ends PASS, and three sanction cases ✓
  - Files: `src/evaluators.mjs`, `rules/ctx.json`, `test/records/run.mjs`

- [x] Task 5: the blocker-severity false positive found on the way
  - Acceptance: `Superseded-by: ADR-0003` — the spelling `templates/adr.md` ships — is
    a forward link to CTX-02 and a resolvable edge to CTX-07. `\s*` never matched the
    hyphen, so a record following this repo's own template was reported as misdirecting
    a reader. The phrase fallback stays, so nothing that passed before now fails.
  - Verify: the pre-fix runner scores that fixture **CTX-02 FAIL**; this one PASSes,
    and a superseded record with no link at all still fails ✓
  - Files: `src/evaluators.mjs`, `test/records/run.mjs`

- [x] Task 6: proof, and the negative control
  - Acceptance: 18 assertions in the records suite. The pre-fix runner is checked out
    in a worktree and scored against the same two fixtures.
  - Verify: pre-fix `CTX-02 PASS · CTX-07 PASS` (no CTX-13) on the repro → post-fix
    `CTX-02 PASS · CTX-07 WARN · CTX-13 WARN`; pre-fix `CTX-02 FAIL` on the template
    fixture → post-fix PASS ✓
  - Files: `test/records/run.mjs`

- [x] Task 7: account for every moved row
  - Acceptance: the docs-repo fixture gains a real one-way amendment; the re-pin is
    12 fixtures × (one CTX-13 SKIP row, total 89→90), docs-repo's CTX-13 WARN and its
    CTX-07 detail, reconcile-repo's rule count, and the scorecard's two lines. No
    other verdict moves.
  - Verify: golden re-pinned and clean at 18 fixtures / 1094 verdicts; records ·
    golden · orient · facts · lane · flow · admit · reconcile · gen all exit 0;
    self-check green; self-score has no blockers and SKIPs all three ADR rules ✓
  - Files: `test/fixtures/docs-repo/docs/decisions/0003-new.md.golden`,
    `test/golden/pins.json`, `CHANGELOG.md`, `README.md`, `SKILL.md`, `REFERENCE.md`,
    `docs/assets/evaluate-stack-{light,dark}.svg`, `tasks/todo.md`
