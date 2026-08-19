# Implementation Plan: Issue #49 — reserve the decision-record number

## Overview

Two rules, in the two families whose subjects they are. The incident is one collision
seen from two places: a corpus that ends up with two ADR-0027s (a **context** property,
at rest, on the branch where both lanes land) and a lane taking a name another live lane
already took (a **flow** property, between concurrent lanes, while the fix is still a
rename). CTX-14 is the floor; FLOW-09 is the catch.

Everything FLOW-09 needs already exists — `LANEWORLD` gathers the lane list once and
degrades to labeled SKIPs offline — except one thing: the world reads lane *refs*, and
this rule needs lane *trees*. That is the only new plumbing.

## Architecture decisions

- **The fork is decided in the spec, not in the diff.** Three choices (one rule vs two,
  introduction by number vs by path, ledger vs allowlist) are settled in `SPEC.md`
  before code, per #52's plan.
- **INTRODUCED is by path.** The issue's own phrasing — "the numbers each lane
  introduces relative to the default branch" — is blind on the merge order that produced
  the incident: once the first lane lands, `0027` is on the default branch, so the second
  lane introduces no new number. A lane adds a *file*; whether its number is free is the
  question. This is the single decision the rest of the rule hangs off.
- **`laneObjects()` lives on the lane world, not in the evaluator.** The world is where
  "one gathering, three surfaces" is enforced, and it is lazy for a reason: a run whose
  reservation rule never fires must not pay for a fetch. One bounded glob fetch into
  `LANES_PRIV` — laneRefsGit's own refspec, so single-branch clones and concurrent
  fetches are both safe — then per-ref resolution falling back to the clone's
  remote-tracking refs. Skipped under replay, where fixtures are the whole world.
- **Degradation is per-lane and counted.** "No collisions" must never quietly mean "I
  could read one of the four". Every unresolvable lane is named; all of them unreadable
  is a SKIP carrying why, not a pass.
- **The rename is told apart by what the lane REMOVED, not by what it lacks.** A lane
  that renamed `0027-a.md` and a lane that branched before `0027-a.md` landed both fail
  to hold that file. Only the first one deleted it.

## Task list

### Phase 1: the floor
- [x] Task 1: `adr-number-unique` kind + **CTX-14** — numbers grouped off the filename,
      a collision naming the number and every file claiming it, the sequence gap in the
      PASS detail, and the `SANCTION_KINDS` route matching on either colliding path.

### Checkpoint 1
- [x] The issue's same-tree repro turns from silent-PASS to a blocker naming both files.

### Phase 2: the catch
- [x] Task 2: `laneObjects()` on the lane world — lazy, memoized, one glob fetch,
      replay-safe, `resolve(ref)`/`files(ref)` answering null for uninspectable.
- [x] Task 3: `gitLsTree` + `gitDiffNames({ deletedOnly })` in `src/repo.mjs`.
- [x] Task 4: `lane-adr-reservation` kind + **FLOW-09** — introduction by path, the
      collision against the default branch AND against every other live lane, the rename
      and branched-off-a-lane exemptions, COMPLETED lanes excluded, blind lanes counted.

### Checkpoint 2
- [x] The two-lane repro fires on the second lane, and still fires after the first lane
      merges — the order that actually shipped the incident.

### Phase 3: proof
- [x] Task 5: records-suite cases for CTX-14 (10) — the collision, both sanction ends,
      expiry, break-glass, the repair, the gap note, the index-only SKIP.
- [x] Task 6: flow-suite cases for FLOW-09 (11) — first claim, second claim, exit code,
      the CTX-14 blindness that IS the incident, the post-merge order, the floor holding
      at the merge, free number, rename, branched-off-a-lane, and the unreadable-lane
      SKIP.
- [x] Task 7: docs-repo fixture gains a duplicate pair; re-pin golden; account for every
      changed row.
- [x] Task 8: rule-count docs (94 rules, 28 blockers) and the stale check-kind count.

### Checkpoint 3
- [x] Full suite green; self-check green; self-score unchanged (this repo has no ADRs,
      so CTX-14 SKIPs and FLOW-09 is posture-gated off).

## Risks

- **Two new blockers.** CTX-14 fires on any corpus that already carries a duplicate, and
  renumbering breaks citations — which is why the ledger route is in from the start and
  the rule's `fix` names it first. FLOW-09 is posture-gated to `multi-lane`, where the
  collision is a real defect.
- **A new rule adds a row to all 18 golden fixtures**, twice over. The re-pin is not a
  diff that reviews itself; the ship note accounts for every changed row.
- **One glob fetch per run that reaches the rule.** Bounded by timeout, lazy, memoized,
  and only paid when a multi-lane repo's lane actually introduces a decision record.
