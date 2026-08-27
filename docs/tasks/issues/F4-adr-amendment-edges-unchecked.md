---
draft: true
target: AdarGit008/baseline-skill
labels: [enhancement]
title: "The decision graph's amendment edges are read by no rule — a dangling Amends: resolves to nothing and is not reported"
tracker: "#52"
rank: 4
---

## Symptom

An ADR declares that it amends two others. One of them does not exist. The other says
nothing back. Both CTX rules pass:

```
CTX-02  PASS   2 decision doc(s) ok
CTX-07  PASS   forward-links resolve
```

```
# ADR-0021 — the bench obligation
Status: Accepted
Supersedes: none
Superseded-by: none
Amends: ADR-0019 (D5 sizing), ADR-0017 (what it obliges the bench to do)
```

There is no `ADR-0019` in the tree. `ADR-0017` carries no `Amended-by:`. Nothing
reports either.

## Cause

Both ADR kinds read the **supersede** relation and only that.

`adr-status` (CTX-02) requires a forward link only when the status matches
`superseded|deprecated|replaced`:

```js
if (/superseded|deprecated|replaced/i.test(st) && !/supersed(ed)?\s*by|replaced\s*by|→\s*adr|see\s+adr/i.test(t))
  bad.push(`${f}: superseded w/o forward link`)
```

`Amended` is in the allowed-status set — so `Status: Amended` is legal — and it is not
in the set that demands a link. `adr-forward-link` (CTX-07) resolves exactly one
pattern:

```js
const sm = t.match(/supersed(?:ed)?\s*by[^\n]*?(?:adr[- ]?)?(\d{1,4})/i)
if (!sm) continue
```

So `Amends:` and `Amended-by:` are not read by any rule, any kind, or any schema
check. Neither direction is required, neither is resolved against the tree, and the
two are never compared with each other.

## Why this is a gap rather than a wish

**Amendment is the relation a live decision graph actually uses.** Supersession is
terminal — a record is replaced and the reader goes elsewhere. Amendment is what a
record does when part of it survives: a premise is withdrawn, a figure is corrected, a
clause is made operational. mcgyvr's 36 ADRs carry **18 amendment edges and 4
supersede-shaped ones**, and **15 of the 18 are declared in one direction only**. The
relation baseline checks is the rare one; the relation it does not check is the load-
bearing one.

**A dangling amendment pointer is worse than a dangling supersede pointer**, because
nothing downstream fails. A reader following `Amends: ADR-0019` to a file that does not
exist concludes the corpus is incomplete, not that the pointer is wrong. CTX-07 exists
because that failure mode was worth catching for supersede; the same argument applies
unchanged.

**A one-way edge hides a live correction.** The record that *was* amended is the one a
reader arrives at from a citation, and it is the one that does not know it has been
corrected. mcgyvr's ADR-0025 stood for four days with its central premise withdrawn by
ADR-0026 and nothing in ADR-0025 saying so; the repair was a hand edit found by
re-reading. Their own summary of the whole class: *"None of these was found by a check.
Every one was found by a person or an agent re-reading."*

**The repo already ships the schema half.** `schema/record.adr.schema.json` and
`templates/adr.md` establish that baseline has an opinion about what a decision record
carries. The rules stop one relation short of it.

## Suggested fix

Widen the two ADR kinds rather than adding a family:

- **CTX-07 resolves every declared edge, not only `Superseded by`.** Same loop, same
  padding logic, over `Supersedes` / `Superseded-by` / `Amends` / `Amended-by`. A
  declaration naming a record that does not exist is a finding whatever the verb.
  This is the cheap half and it is a strict widening of the rule's own sentence
  ("Superseded ADRs link forward to a file that exists").
- **A back-link check, with an allowlist.** An `Amends: ADR-N` with no `Amended-by:`
  on N is a one-way edge. Requiring both directions immediately would light up every
  existing corpus, so the honest shape is mcgyvr's: a frozen allowlist of known
  one-way edges, where *removing an entry is how a repair is proved*. That makes the
  rule adoptable on a repo with history and still refuses a new one-way edge.

Two details worth carrying from the repo that hit this:

- **Declarations wrap.** `Amends: ADR-0019 (D5 sizing), ADR-0017 (…)` puts the second
  target on a continuation line in real records; a first-line grep found 11 edges
  where the true count was 18. The parser must read the whole wrapped field, and
  parenthesised commentary never declares an edge.
- **Same-day amendments are legitimate** and would otherwise look like a cycle. They
  want naming rather than forbidding.

This is adjacent to #49 (two lanes authoring the same decision number) — both are
"the decision namespace is unguarded", and a `Status`/edge parser that reads the
whole header is the shared substrate. They are separable: #49 is a collision between
lanes, this is a relation inside the corpus.

## Reproducing

```bash
d=$(mktemp -d) && cd "$d" && git init -q -b main . && git config user.email a@b.c && git config user.name t
mkdir -p docs/decisions
printf '{"project_type":"docs","adr_globs":["docs/decisions/*.md"]}\n' > baseline.config.json
printf '# ADR-0017 — the floor is the product\n\nStatus: Accepted\nSupersedes: none\nSuperseded-by: none\nDate: 2026-08-09\n\n## Context\n\nx\n' \
  > docs/decisions/0017-floor.md
printf '# ADR-0021 — the bench obligation\n\nStatus: Accepted\nSupersedes: none\nSuperseded-by: none\nAmends: ADR-0019 (D5 sizing), ADR-0017 (what it obliges)\nDate: 2026-08-11\n\n## Context\n\nx\n' \
  > docs/decisions/0021-bench.md
git add -A && git commit -qm adrs

node /path/to/baseline-skill/check.mjs --repo . --no-exec | grep -E 'CTX-0[27]'
# -> CTX-02 PASS  2 decision doc(s) ok
# -> CTX-07 PASS  forward-links resolve
# ADR-0019 does not exist and ADR-0017 never names 0021 back. Neither is reported.
```

## Found

Reading `AdarGit008/mcgyvr` for #52. That repo's `lane/304` (2026-08-18) built the
check locally — `tests/test_decisions.py` covering number uniqueness, title/filename
agreement and bidirectional amendment edges against a frozen `MISSING_BACKPOINTERS`
allowlist, plus `tools/decisions/index.py` generating a drift-checked index — after
its own adversarial pass found the wrapped-declaration parsing error described above.
Its measured state before the check: 18 edges, 15 one-way.
