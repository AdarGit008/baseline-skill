# Spec: Issue #54 — the newest record is the newest record, not the last filename

## Objective

`committedLog` — the one selector behind FLOW-03, FLOW-05 and DIV-02 — picked the
lane's "newest" session record by **lexicographic filename sort**. Within one day the
slug decided, so a same-day pre-registration outranked the session record that governs:
FLOW-03 fired a blocker on a lane whose record discipline was intact, and DIV-02 read
the same wrong pick and went SKIP, reporting *"no committed next:"* on a lane that had
one.

Make the selection answer the question the rules actually ask, and make every finding
say which record it read and on what basis.

### Success criteria

- The #54 repro passes: the session record governs, the prereg does not compete.
- A record written later but sorting earlier is still read as the newest.
- FLOW-03/05 and DIV-02 name the record and the selection basis in their detail.
- No rule's **verdict** changes anywhere in the golden corpus — details only.
- `node test/flow/run.mjs` gains cases that fail on the old selector.

## The fork, as decided

Recorded on #54 before code was written (#52's plan requires this):

1. **Frontmatter ordinal leads.** `record: session/N` is what `baseline log` writes.
   Highest `N` wins; a `record: prereg` is not a session and does not compete. The
   defect is not only ordering — it is that a pre-registration was allowed to compete
   at all, and only the ordinal distinguishes record *kinds*.
2. **Commit order is the fallback**, for a hand-written record carrying no ordinal:
   the last path added in `git log base..HEAD` order.
3. **Filename sort survives as the last resort**, when the range resolves but
   `git log` does not — a degraded read, named as such, never a refusal.

Option (3) from the issue — a documented, unchecked naming convention — was declined:
mcgyvr rediscovered that convention three times.

### Stated limits

- Several records landing in **one commit** have no order between them. The fallback
  breaks that tie by filename sort, and the finding says which basis it used.
- A lane carrying **only** non-session records still selects one, by commit order. That
  is deliberate: FLOW-02's presence definition counts every added `.md`, and a selector
  that disagreed would reintroduce the "no record" + "empty next:" contradiction the
  original comment on `committedLog` exists to prevent. Narrowing FLOW-02's definition
  is a separate question, not this issue's.

## Scope

**In**: `committedLog`'s selection, the three findings' detail strings, a `git log`
path reader in `src/repo.mjs`, regression tests, the golden re-pin.

**Out**: FLOW-02's presence definition · #50's *where `next:` sits inside the chosen
file* (the other half of FLOW-03's selection problem, still open) · any change to what
`baseline log` writes.

## Tech stack / commands

```
repro (#54):   see the issue — scratch repo, prereg sorting after the session record
flow suite:    node test/flow/run.mjs
golden:        node test/golden/run.mjs --verify   (re-pinned: 9 detail diffs, 0 verdicts)
full suite:    node test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
self-check:    node check.mjs --self-check
self-score:    node check.mjs --repo . --no-exec
```
