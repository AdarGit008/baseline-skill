# Spec: Issue #57 — the decision graph's amendment edges must be read by a rule

## Objective

Two ADR checks read the **supersede** relation and only that. `adr-status` (CTX-02)
demands a forward link when the status matches `superseded|deprecated|replaced`;
`adr-forward-link` (CTX-07) resolves exactly one pattern, `Supersed(ed) by … NNNN`.
`Amends:` and `Amended-by:` are read by no rule, no kind, and no schema check — so an
ADR declaring `Amends: ADR-0019` where no ADR-0019 exists passes both, and the record
that *was* amended never learns it was.

That is the wrong half of the graph to check. Supersession is terminal: the reader is
sent elsewhere and the dead end is loud. Amendment is what a decision does when part of
it survives, so the amended record stays the one a citation arrives at — and it is the
one that does not know it has been corrected. The corpus that produced this issue
(`AdarGit008/mcgyvr`, 36 ADRs) carries **18 amendment edges to 4 supersede-shaped ones,
and 15 of the 18 are declared in one direction only**.

Read every declared edge, resolve it against the tree, and report an amendment declared
at one end only.

### Success criteria

- The #57 repro inverts: `Amends: ADR-0019 (D5 sizing), ADR-0017 (…)` reports the
  dangling `0019` — and reports `0017` as amended-by-nobody — where both checks passed.
- A wrapped declaration is read whole: the second target on a continuation line counts.
- Parenthesised commentary never declares an edge (`(D5 sizing)` is not ADR-5).
- `Supersedes: none` / `Amended-by: n/a` declare nothing.
- The legacy inline form `Status: Superseded by ADR-0003` still resolves — CTX-07's
  existing verdicts do not move.
- The **hyphenated field form the shipped template writes** — `Superseded-by: ADR-0003`
  — resolves too, in both rules. See below: it never did.
- A repo with history can reach clean without back-filling: the one-way finding is a
  `warn`, and the existing judgment route (`kind: deviation`, glob `subject`) sanctions
  a named record, with removing the judgment the proof of repair.
- The ADR header schema and template carry the two new fields, so the machine-read
  header and the rules agree on what a decision record declares.

## The fork, as decided

Three choices the issue leaves open; recorded here before code (#52's plan requires it).

**1. Widen CTX-07, add one rule — do not add a family.** Resolving a declared edge is
CTX-07's own sentence with a wider subject, so the four verbs go into the existing kind.
Whether an amendment is declared at *both* ends is a different question with a different
severity and a different adoption story, so it is **CTX-13** (`adr-backlink`), not a
second meaning bolted onto CTX-07's detail string.

**2. The allowlist is the judgment ledger, not a new frozen file.** mcgyvr's shape is a
`MISSING_BACKPOINTERS` constant in a test. This repo already has one home for
"sanctioned, not an offence" — an unexpired `sign-off`/`deviation`/`risk-acceptance`
whose glob `subject` matches the path (`SANCTION_KINDS`, REC-01's route since #47).
Reusing it buys expiry (a frozen list never lapses; `review_by` does) and costs nothing
new to learn. Same trade-off as REC-01's tombstone: the `subject` is a glob, so
`docs/decisions/**` would sanction the whole corpus including future one-way edges —
that breadth is the author's call and the rule's `fix` says so.

**2a. CTX-02 reads the same parser (found while implementing).** Both rules match
`supersed(ed)?\s*by`, where `\s*` does not match a hyphen — so `Superseded-by: ADR-0003`,
**the form `templates/adr.md` ships and tells authors to fill in**, is invisible to both.
A record that follows this repo's own template and correctly names its replacement is
reported by CTX-02 (severity *blocker*) as "superseded w/o forward link", and CTX-07
never resolves the link it does have. That is in scope rather than a separate issue: the
issue's own sentence is that both kinds read the supersede relation and only that, and
the honest correction is that they did not read it correctly either. Leaving CTX-02 on a
grep while CTX-07 reads `adrEdges` would re-create the two-readers defect this plan
condemns, one rule apart.

**3. Amendment only, both ways; supersession keeps CTX-02.** `Amends` ⇄ `Amended-by` is
the pair CTX-13 checks. Requiring a `Supersedes:` back-link would be a widening the
issue does not ask for, and CTX-02 already governs the superseded record's obligation.

### Stated limits

- **CTX-13 checks edges whose target exists.** A dangling `Amends:` is CTX-07's
  finding; reporting it twice would make one defect read as two.
- **Numbers, not paths.** An edge resolves against the *number* parsed from a decision
  filename, which is how CTX-07 has always resolved. Two files sharing a number is
  #49's subject and stays there.
- **Same-day amendments are legitimate.** No cycle or ordering check is attempted; a
  record may amend one authored the same day, and CTX-13 says nothing about it.
- **`Amended-by:` is not required to exist as a field.** Absence on the target *is* the
  finding; the rule never rewrites the target.

## Scope

**In**: `adrEdges()` in `src/records.mjs` (wrapped fields, paren-stripped, four verbs) ·
CTX-02's forward-link test routed through it ·
`parseAdrHeader` + `schema/record.adr.schema.json` + `templates/adr.md` gain
`amends`/`amended_by` · `adr-forward-link` widened · new `adr-backlink` kind and CTX-13
in `rules/ctx.json` · records-suite cases · docs-repo fixture gains an amendment pair ·
golden re-pin.

**Out**: #49's number collisions · a generated decision index · cycle/ordering checks ·
requiring supersede back-links · `CONTRACT.md`'s decision-record procedure beyond the
template's comment.

## Tech stack / commands

```
repro (#57):   see the issue — scratch repo, two ADRs, one dangling Amends:
records suite: node test/records/run.mjs
golden:        node test/golden/run.mjs --verify   (re-pin: --capture)
full suite:    node test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
self-check:    node check.mjs --self-check
self-score:    node check.mjs --repo . --no-exec
```
