# ADR-000X — <short title>

Status: Accepted
Supersedes: none
Superseded-by: none
Amends: none
Amended-by: none
Date: 2026-07-04

<!--
Status ∈ Proposed | Accepted | Superseded | Deprecated | Rejected | Amended.

REVERSED — a later decision replaces this one. In the SAME commit:
  1) set this file's Status to "Superseded"
  2) fill "Superseded-by: ADR-00YY"
  3) add "Supersedes: ADR-000X" to the new ADR.
CTX-02 fails if a Superseded/Deprecated record has no forward link.

CORRECTED — a later decision withdraws part of this one and the rest still stands.
Amendment, not supersession, is what most decisions do to each other. In the SAME
commit:
  1) add "Amends: ADR-000X (what it changes)" to the new ADR
  2) add "Amended-by: ADR-00YY" HERE.
CTX-13 reports an amendment declared at one end only — a reader arriving at this
record from a citation is exactly the reader who cannot see the correction. Both
fields take a comma-separated list and may wrap onto the next line; text in
parentheses is commentary, never a target.

CTX-07 resolves every target in all four fields against the decision tree: a
declaration naming a record that does not exist is a finding whatever the verb.

THE NUMBER is this record's identity — every citation, and every field above,
resolves to it. Two files carrying one number is CTX-14, a blocker: a citation to
ADR-0027 arrives at whichever file sorted first. In a multi-lane repo, check the
number is free across the OTHER live lanes before you write it (FLOW-09 does this
on the branch; `baseline orient` lists the lanes) — two lanes can author the same
number under different filenames and merge with no git conflict at all.
-->

## Context
<what forced a decision>

## Decision
<what we chose>

## Consequences
<trade-offs, what this makes easy/hard>
