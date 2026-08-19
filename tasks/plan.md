# Implementation Plan: Issue #57 — read every declared edge in the decision graph

## Overview

One parser, two rules. The defect is not that CTX-07's regex is too narrow — it is that
there is no *reader* of a decision record's relations at all, so every consumer invents
one. `parseAdrHeader` grabs two fields with a single-line regex; CTX-07 greps the whole
document for one phrase; CTX-02 greps for four more. The fix is `adrEdges()` in
`src/records.mjs` — the file that already owns the ADR header's storage form — with the
rules reading it instead of the text.

## Architecture decisions

- **The fork is decided in the spec, not in the diff.** Three choices (one rule vs a
  family, judgment ledger vs frozen list, amendment-only vs all four back-links) are
  settled in `SPEC.md` and posted to #57 before code.
- **One reader, in `records.mjs`.** The file already carries this discipline for status
  ("Status extraction delegates to util's statusOf, the SAME reader CTX-02 uses — one
  opinion about an ADR's status"). Relations resolved two ways at two rules is the same
  defect one relation later.
- **The parser reads fields, and the legacy phrase is an extra source.** Field form
  (`Superseded-by: ADR-0003`) and the golden corpus's inline form (`Status: Superseded
  by ADR-0003`) both declare a supersede edge. Dropping the second would move CTX-07's
  verdicts on a fixture that exists to pin exactly that, so `adrEdges` emits both and
  de-duplicates by number.
- **Commentary is stripped before numbers are read, not after.** `Amends: ADR-0019 (D5
  sizing)` must yield `19`, never `19` and `5`. Parenthesised spans come out first; only
  then does the value split on commas. The repo that hit this found the inverse error —
  a first-line grep that read 11 edges where there were 18 — so the continuation-line
  walk and the paren strip are one function, tested together.
- **A field ends at the next field, not at the next newline.** Continuation lines are
  lines that are not blank, not a heading, and do not open a new `Key:` field.
- **CTX-13 reports the record that declares, and sanctions on its path.** The one-way
  edge is a property of the pair, but a finding needs one path a `subject` glob can
  match. The declaring record is the one that can be read to learn the pair.

## Task list

### Phase 1: the reader
- [x] Task 1: `adrEdges(md)` in `src/records.mjs` — `{ supersedes, superseded_by,
      amends, amended_by }`, each a sorted list of integers; wrapped fields, paren
      stripped, `none`/`n/a`/`-`/empty declare nothing, legacy inline phrase folded in.
- [x] Task 2: `parseAdrHeader` grows `amends`/`amended_by`; `record.adr.schema.json`
      and `templates/adr.md` carry them.

### Checkpoint 1
- [x] `adrEdges` reads the issue's own wrapped declaration as `[17, 19]` and the golden
      fixture's inline `Status: Superseded by ADR-0003` as `superseded_by: [3]`.

### Phase 2: the rules
- [x] Task 3: `adr-forward-link` (CTX-07) resolves all four relations; title, rationale
      and `fix` widen with it.
- [x] Task 4: `adr-backlink` kind + CTX-13 in `rules/ctx.json` — warn, deterministic,
      with the judgment sanction route and a `fix` that names the glob breadth.

### Checkpoint 2
- [x] The #57 repro inverts: CTX-07 names the dangling `0019`, CTX-13 names `0017`.

### Phase 3: proof
- [x] Task 5: records-suite cases — the split, wrapping, paren commentary, `none`,
      the legacy inline form, the sanction route, and the target-exists precedence.
- [x] Task 6: negative control — the new assertions fail against the pre-fix evaluator.
- [x] Task 7: docs-repo fixture gains an amendment pair; re-pin golden; account for
      every changed row.

### Checkpoint 3
- [x] Full suite green; self-check green; self-score unchanged (this repo has no ADRs,
      so CTX-02/07/13 all SKIP on it).

## Risks

- **A new rule adds a row to all 18 golden fixtures.** Unavoidable and mechanical, but
  it means the re-pin is no longer a one-line diff that reviews itself — the ship note
  must account for CTX-13's verdict on every fixture, not just the changed ones.
- **Widening CTX-07 can move a verdict on a corpus that declares `Supersedes:` fields
  pointing at archived records.** That is the rule doing its job, but it is a behaviour
  change on adopters, so the CHANGELOG says which declarations became visible.
