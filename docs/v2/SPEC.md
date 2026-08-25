# Spec: Issue #49 — the decision-record number is a scarce name, and nothing reserved it

> **History, kept as written against the 2.5.0 tree.** This is the #49 design as it
> landed in #64. In **3.0.0** the lane workflow was deleted (CHANGELOG *Removed — V3*):
> **FLOW-09** / `lane-adr-reservation`, `rules/flow.json`, `lane claim`, `laneObjects()`
> and the `test/lane` and `test/flow` suites named below no longer exist. **CTX-14**
> (`adr-number-unique`, `decisions` pack) survives and is the whole floor: one number, one
> record, on the branch where the lanes land. Read everything below about FLOW-09 as the
> reason CTX-14 is shaped the way it is, not as a live rule.

## Objective

Two lanes of the same repo each authored a decision record numbered **0027**, under
different filenames:

- `lane/265` — `docs/decisions/0027-run-identity-is-one-block-and-an-unreadable-field-is-a-refusal.md`
- `lane/282` — `docs/decisions/0027-a-routing-policy-is-adopted-only-if-it-is-inspectable-here-and-measured-here.md`

Both branches passed `baseline check` — correctly, because neither tree contained a
duplicate. Both would merge into the default branch with **no git conflict**, because
the paths differ. The result on `main` would be two ADR-0027s, and nothing anywhere
would have reported it. It was caught by a human mentioning in conversation that the
other lane was in flight. That is the whole detection mechanism today.

The model is already in the repo: **a lane claims a scarce name before using it.**
`lane claim` is an atomic ref transaction at origin precisely so two agents cannot claim
one issue. The issue number is protected that way. The decision-record number is the
other scarce name in a multi-lane repo, and it is unprotected.

### Success criteria

- The issue's own repro inverts. On a two-lane world, the second lane's `0027` is a
  **finding on that lane**, naming the lane that already holds the number and both
  filenames — while both trees stay individually clean, which is the whole incident.
- The collision cannot **survive** where it lands: two conflict-free merges put two
  ADR-0027s on the default branch, and the gate there turns red.
- The merge order that actually shipped it is covered. When the first lane lands
  *before* the second one checks, no live lane holds `0027` any more — the default
  branch does. A rule that reads "what number is new to me" goes quiet exactly there.
- A **rename** is not a second claim: moving `0027-a.md` to `0027-b.md` introduces a
  path, not a number.
- A lane branched **off another lane** shares its parent's record at the *same path* —
  one record reached twice, never a collision.
- A lane whose objects the clone cannot resolve is **counted and named**, never folded
  into a pass.
- A gap in the sequence is **reported and is not a finding**.
- A corpus that already carries a duplicate can reach clean without renumbering, through
  the ledger route the repo already has — with an expiry date.

## The fork, as decided

Three choices the issue leaves open; recorded here before code (#52's plan requires it).

**1. Two rules, in the two families whose subjects they are — not one widened rule.**
The issue offers CTX-02 or FLOW and asks for a ruling. Both, because they are two
different sentences:

- **CTX-14** (`adr-number-unique`, blocker, context) is a property of *a corpus at
  rest*: one number, one record. It is posture-independent, tree-local, needs no forge
  and no other lane, and holds on the default branch — which is where the collision
  ends up.
- **FLOW-09** (`lane-adr-reservation`, blocker, flow) is a property of *concurrent
  lanes*: this lane must not take a name a live lane already took. It is
  workflow-gated, branch-scoped, and reads through `LANEWORLD` like every other lane
  rule.

Bolting the second meaning onto CTX-02's detail string would put a cross-lane
reservation finding under a rule titled "Every decision record carries a Status", which
is the CTX-13 argument from #57, one issue later.

**2. INTRODUCED is measured by path, not by number.** The obvious reading of the issue —
"the decision-record numbers each lane introduces relative to the default branch" — is
by number, and it is wrong on the merge order that produced the incident. Once `lane/265`
merges, `0027` *is* on the default branch, so `lane/282` introduces no new number and the
duplicate sails through. A lane adds a *file*; whether its number is free is the
question. FLOW-09 therefore reports two collisions with one sentence: against another
live lane, and against the default branch this lane is about to merge into.

**3. Adoption is the judgment ledger, at blocker severity.** Renumbering a decision
record **breaks the citations that point at it**, so a corpus that already carries a
duplicate may rationally keep it — this is a stronger reason for the sanction route than
CTX-13 had, not a weaker one. An unexpired `sign-off`/`deviation`/`risk-acceptance`
whose glob `subject` matches **either** colliding file clears it (`SANCTION_KINDS`,
REC-01's route since #47); deleting the judgment is how a repair is proved, and
`review_by` is the expiry a frozen allowlist never has. Naming either end names the
collision: a collision has two paths and no privileged one.

### Stated limits

- **CTX-14 cannot see the other lane.** That is FLOW-09's job. CTX-14 is the floor: it
  guarantees the collision does not survive on the branch where both lanes land, which
  the issue calls "strictly better than nothing".
- **Numbers, not content.** Two records with the same number are a collision even if
  they are byte-identical, and two records with different numbers are not a collision
  even if they decide the same thing. Identity here is what every consumer reads —
  CTX-07's edge resolution, CTX-13's pairing, a human following "see ADR-0027".
- **A gap is not a finding.** A missing `0027` rides CTX-14's PASS detail. A retracted
  draft and a number reserved on a lane that never landed both look like this, and
  neither is an error.
- **Reported once per number.** A number already reported against the default branch is
  not repeated per lane. The one exception is a lane that *renamed* the base's holder:
  it clears the base finding and can still collide with a lane that authored a second
  record under that number.
- **The forge is not consulted.** FLOW-09 is a git-plane question end to end; under
  `multi-lane-local` it works with the forge closed, and the behavioural suite proves
  it there.

## Scope

**In**: `adr-number-unique` kind + **CTX-14** in `rules/ctx.json` (with the gap note and
the sanction route) · `lane-adr-reservation` kind + **FLOW-09** in `rules/flow.json` ·
`laneObjects()` on the lane world (`src/facts/index.mjs`) — one bounded glob fetch,
lazy and memoized like the world itself · `gitLsTree` and `gitDiffNames`'
`deletedOnly` in `src/repo.mjs` · records-suite cases for CTX-14 · flow-suite cases for
FLOW-09 · docs-repo fixture gains a duplicate pair · golden re-pin · rule-count docs.

**Out**: a `lane claim`-style *pre*-reservation of numbers at origin (this rule detects,
it does not allocate) · renumbering automation · a generated decision index · the
issue's adjacent CI-event finding, which landed as **#55**.

## Tech stack / commands

```
repro (#49):   see the issue — two lanes, one number, two filenames, no git conflict
records suite: node test/records/run.mjs
flow suite:    node test/flow/run.mjs
golden:        node test/golden/run.mjs --verify   (re-pin: --capture)
full suite:    node test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
self-check:    node check.mjs --self-check
self-score:    node check.mjs --repo . --no-exec
```
