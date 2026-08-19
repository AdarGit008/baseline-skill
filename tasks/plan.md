# Implementation Plan: Issue #55 — lane identity on the pull_request event

## Overview

One derivation, three surfaces. `check` reads the checkout only, `admit` reads the
checkout then `GITHUB_HEAD_REF`, `reconcile` refuses the environment on purpose. The
fix is not a new fallback in `check` — it is one `resolveLane()` that `check` and
`admit` both call, with `reconcile`'s refusal documented against it so the difference
reads as a decision rather than an oversight.

## Architecture decisions

- **The fork is decided in the issue, not in the diff.** Posted to #55 before any code.
- **One derivation, in `probe.mjs`.** The file already carries this discipline for
  agent identity ("two writers deriving different names would silently break the
  lane⇄agent join"). Lane identity resolved two ways at two merge-time surfaces is the
  same defect, and #55 is what it looks like when it lands.
- **The environment is read narrowly.** `GITHUB_REF_NAME` is a *tag's* name on a tag
  push and `N/merge` on a pull_request, so it qualifies only under
  `GITHUB_REF_TYPE=branch`. `GITHUB_HEAD_REF` is non-empty only on a PR event, so it
  needs no event guard. Values are validated as plausible ref names — a lane called
  `HEAD`, `-x` or `` is no lane.
- **The basis rides the run, not each rule.** Which lane was resolved and how is a
  run-level fact, not a property of FLOW-04. It goes on one report line and one `--json`
  key, so no rule's detail string changes and the golden corpus keeps its verdicts.
- **The checkout always wins.** The environment is consulted only where `laneOrNull`
  returns null, so no local run can be redirected by a stale exported variable.

## Task list

### Phase 1: one derivation
- [x] Task 1: `resolveLane(repo, env)` in `src/probe.mjs` — `{ lane, basis, event }`,
      checkout → `GITHUB_HEAD_REF` → branch-typed `GITHUB_REF_NAME` → null.
- [x] Task 2: `check.mjs` resolves BRANCH through it; `admit.mjs:162` routed through it
      too, replacing its inline `|| process.env.GITHUB_HEAD_REF`.
- [x] Task 3: paired comments — `probe.mjs` names `reconcile`'s refusal,
      `reconcile.mjs` names the helper it declines.

### Checkpoint 1
- [x] The #55 repro inverts: detached + `GITHUB_HEAD_REF=lane/1` evaluates FLOW/DIV.

### Phase 2: say the basis
- [x] Task 4: the human report prints one lane line when the basis is not the checkout,
      naming the variable, the event, and the merge-ref subject; `--json` carries
      `lane: { name, basis, event }` on every run.

### Phase 3: proof
- [x] Task 5: flow cases — detached+HEAD_REF evaluates; both events agree on one commit;
      checkout beats env; tag push and `N/merge` are not lanes; bare detached still SKIPs.
- [x] Task 6: negative control — the new assertions fail on the pre-fix resolver.
- [x] Task 7: re-pin golden; confirm zero verdict changes.

### Checkpoint 2
- [x] Full suite green; self-check green; no blockers.

## Risks

- **A stale `GITHUB_HEAD_REF` in a developer's shell** names a lane on a detached local
  checkout. Bounded: it applies only where there was no lane at all (SKIP before), and
  the report names the variable it believed.
- **The merge-ref subject.** On a PR the rules read the merge result. Records committed
  on the lane are present in that tree, so the FLOW family's subject survives; a rule
  that later wants the lane *tip* specifically must ask for it, not assume HEAD is it.
- **`admit`'s widened resolution** (it gains the `GITHUB_REF_NAME` leg). Same guards,
  and the admit suite is the check.
