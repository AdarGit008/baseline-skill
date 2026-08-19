# Review — Issue #57

## What changed, and why each piece is there

| Piece | Why |
|---|---|
| `adrHeaderFields` / `adrEdges` (`src/records.mjs`) | There was no *reader* of a decision record's relations, so every consumer invented one: `parseAdrHeader` grabbed two fields with a single-line regex, CTX-07 grepped the document for one phrase, CTX-02 grepped for four. One walk, one opinion. |
| CTX-07 widened | Its own sentence ("a declared link resolves to a file that exists") applied to one verb out of four. |
| CTX-13 added | The relation a live decision graph mostly uses had no check at all. |
| CTX-02 routed through the parser | Found while implementing: `\s*` does not match a hyphen, so the template's own `Superseded-by:` was invisible — a **blocker**-severity false positive on a correctly-authored record. |
| schema + template | The rules and the machine-read header must agree on what a record declares, and the template is where an author learns the ceremony. |
| rule-count docs + SVGs | Already stale at 91-documented-as-90 before this branch; this change would have made it two off. |

## Where the reach was deliberately stopped

- **CTX-13 stays silent on a dangling `Amends:`.** That is CTX-07's finding. Reporting
  it in both places would make one defect read as two and teach the reader to discount
  the count.
- **No supersede back-link requirement.** CTX-02 already governs what a superseded
  record owes; adding a second obligation is a widening the issue does not ask for.
- **No cycle or ordering check.** A same-day amendment is legitimate; the issue says so
  and a naive cycle check would light it up.
- **No new allowlist file.** The judgment ledger already means "sanctioned, not an
  offence", and it expires. A frozen constant would be a second mechanism for one job.
- **The phrase fallback survives in CTX-02.** A prose forward link with no resolvable
  number passed before and passes now. Tightening that is a separate argument with a
  separate blast radius.

## The one thing a reviewer should push on

`adrEdges` treats any `Key: value` line in the header as a field boundary, which means a
continuation line containing a colon in prose (`Amends: ADR-0019, and ADR-0017 — note:
the D5 figure only`) truncates the declaration at `note:`. The alternative — indentation
alone as the continuation signal — breaks the unindented wrap the corpus actually
writes. The current rule loses an edge in a case nobody has written; the alternative
loses edges in the case that produced the issue. Named here rather than hidden.

## Verification

- 18 new assertions in `test/records/run.mjs`.
- Negative control against a worktree of `main`: the repro scores `CTX-02 PASS ·
  CTX-07 PASS` (no CTX-13) pre-fix and `PASS · WARN · WARN` post-fix; the
  template-form fixture scores **`CTX-02 FAIL`** pre-fix and `PASS` post-fix.
- Golden re-pinned: 18 fixtures, 1094 verdicts, every moved row accounted for in
  `tasks/todo.md` Task 7.
- Full suite green; `--self-check` green; self-score has no blockers.
