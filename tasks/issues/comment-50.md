---
draft: true
target: AdarGit008/baseline-skill
comment-on: 50
tracker: "#52"
---

Corroboration from the #52 read of the `AdarGit008/mcgyvr` corpus. Two further
instances of this exact mechanism, both CI blockers, both on lanes whose `next:` was
filled in and correct.

**`lane/113` session/4, 2026-08-13.** Two `## Amendment` sections were appended to the
previous record *after* its `## Left open`, pushing the `next:` out of `extractNext`'s
reach. The record's own account:

> `extractNext` reads `next:` only **inside** the `## Left open` section — it stops at
> the first `##` heading after it — so session/3's two appended `## Amendment`
> headings pushed its `next:` out of reach and the lane read as having no recorded
> next step. All 25 recent records in this repository put `next:` last inside
> `## Left open`; that is the convention, and appending a section after it silently
> breaks a blocker-severity rule.

**`lane/266` session/5, 2026-08-15.** A closing prose section (`## The method note,
which is the point of this record`) placed after `## Left open` did the same. That
record separates the two failure modes explicitly:

> This is a different failure from the one already on record. Lane/231's ordering trap
> documents `committedLog` picking the lexicographically-last added record rather than
> the newest by time. That is not what happened here … The trap here is **placement
> within the file**, not selection between files. Two distinct ways to fail one rule,
> and the second is easier to hit, because `## Left open` reads like a section that can
> appear anywhere.

**What each instance cost.** Not a message — a record. REC-01 makes committed records
append-only, so the fix cannot be moving the `next:`; both lanes wrote a *new* session
record whose subject is the rule. `lane/113`'s: *"the fix is this record rather than an
edit to session/3: the newest record governs, and restructuring session/3 to move its
`next:` would have traded a blocker for a mutation."*

Three instances now (this issue's, plus these two), across three lanes, in three days.

**One thing the reproductions add to the suggested fix.** The case where the record
carries a top-level `next:` and no `## Left open` at all is the misleading one this
issue names. The two above are a fourth case the current message also cannot express:
the heading *is* present, the `next:` *is* inside it, and a later heading truncates the
scan. `no '## Left open' section` would be wrong for these; the honest finding is
something like `'## Left open' is not the last section — next: found on line N is
outside the scanned range`.

The lane/266 record also states what a reader has to know today and cannot learn from
the finding: **put `## Left open` last, and `next:` inside it.**

Related: the sibling half of FLOW-03's selection — which *file* is read, decided by
filename sort — is drafted as its own issue under #52. These two rules are one rule's
two ways of reading the wrong thing, and both mcgyvr lanes above hit one of each within
48 hours.
