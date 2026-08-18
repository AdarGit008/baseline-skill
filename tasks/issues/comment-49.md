---
draft: true
target: AdarGit008/baseline-skill
comment-on: 49
tracker: "#52"
---

Corroboration from the #52 read of the `AdarGit008/mcgyvr` corpus. Two incidents, both
**after** this issue was filed, and the second one landed.

**2026-08-16 — near-miss on ADR-0027.** `lane/265` and `lane/282` both authored an
ADR-0027 under different filenames. Caught by a person re-reading, not by anything in
the tree. `lane/282`'s record states the mechanism this issue predicts, in its own
words:

> ADR-0027 was yielded to lane/265 … The collision was silent by construction: two
> ADRs numbered 0027 under different filenames merge without a git conflict, so
> nothing would have reported it. This lane's four records were renumbered 0028–0031.
> Worth noting as a gap in the gate — the baseline checks branch placement and record
> discipline, and does not check that a decision number is unique across open lanes.

**2026-08-17 — ADR-0035 merged twice, seventy minutes apart.** #262's ceiling record
landed as ADR-0035 in PR #298 at 22:15. #301's vocabulary record landed as ADR-0035 in
PR #303 at 23:25. Neither PR conflicted. From the resolving record (`lane/304`,
2026-08-18):

> Seventy minutes earlier, #262's ceiling record had merged under the same number
> (PR #298, 22:15) — two lanes on one evening, and nothing in the tree could refuse
> the second claim: no test reads docs/decisions/, and there was no index.

The repair cost a renumbering of the second record, a dated correction inside it, a
dated correction in the session record that cited it, an `Amended-by:` fix on a third
ADR, and a check written from scratch (`tests/test_decisions.py` plus a generated
`INDEX.md` with a drift mode). The near-miss cost four records renumbered.

So the sequence-gap companion this issue floats as optional — *"a missing 0027 is not
an error, but it is worth seeing"* — would have caught the near-miss; only the
cross-lane reservation would have caught the merge.

One detail worth carrying into whichever rule this becomes, from the same lane:
**declarations wrap.** `Amends: ADR-0019 (…), ADR-0017 (…)` puts the second target on
a continuation line, and a first-line grep undercounted that corpus's edges 11 to 18.
A header parser that stops at the first line will undercount the numbers it is
reserving too.

Separately: this issue's *"Adjacent finding"* section — the lane rules going SKIP on
the `pull_request` event — reproduces, and its reach is wider than the section reports
(the whole FLOW family plus DIV-01 and DIV-02, not FLOW-01 and FLOW-04). Per that
section's own invitation it is drafted as its own issue under #52.
