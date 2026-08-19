# Spec: Issue #55 — the lane rules must run on the event that gates the merge

## Objective

Every branch-scoped rule — FLOW-01..07, DIV-01, DIV-02 — SKIPs on the `pull_request`
event, because `actions/checkout` leaves `refs/pull/N/merge` detached and `check`
resolves lane identity from the checkout alone. The check a branch-protection ruleset
requires is the run that evaluates none of the lane discipline it exists to gate. The
same defect reads as *silence* under a PR-only ruleset (mcgyvr `lane/282`, a green PR
that checked nothing) and as *deadlock* under a both-events ruleset (mcgyvr `lane/91`,
two dependabot PRs BLOCKED by a push-run FAIL the PR run had passed).

Resolve the lane from the event when the checkout cannot name one, and make every run
say which basis it resolved on.

### Success criteria

- The #55 repro inverts: detached + `GITHUB_HEAD_REF=lane/1` evaluates the FLOW/DIV
  family instead of skipping it, and the two events agree on one commit.
- A checked-out branch still wins over any environment variable.
- A tag push and a `pull_request`'s `GITHUB_REF_NAME` (`N/merge`) are never mistaken
  for a lane.
- A genuinely detached local checkout (bisect, no CI env) still SKIPs, unchanged.
- `check` states the lane and its basis where the basis is not the checkout — human
  report and `--json` alike.
- `admit` and `check` derive lane identity from **one** function.
- No verdict changes in the golden corpus.

## The fork, as decided

Recorded on #55 before code (#52's plan requires this): **option (1), resolve from the
event.** The issue presents this as an open choice; it is not, quite — `src/admit.mjs`
has always read `laneOrNull(repo) || GITHUB_HEAD_REF`, so `check` is the one merge-time
surface that dissents. Option (2) would ratify that inconsistency.

Resolution order: checkout → `GITHUB_HEAD_REF` → `GITHUB_REF_NAME` (only when
`GITHUB_REF_TYPE=branch`) → null, and null still SKIPs.

`reconcile` keeps its refusal (`src/reconcile.mjs:267`): its subject is the default
branch, and a miswired `pull_request` job must not evaluate a PR branch while claiming
to revalidate main. Two surfaces reading the environment deliberately differently is a
thing to say at both sites, not one.

### Stated limits

- On `pull_request` the tree is the **merge result**, not the lane tip. The rules
  evaluate what will exist if the PR lands — defensible for a merge gate, and not the
  same subject as the push run. The report says so; the finding text does not pretend
  otherwise.
- The environment is trusted without a `GITHUB_ACTIONS` guard (admit's existing
  behaviour). A stale exported variable can therefore name a lane that isn't checked
  out — which is exactly why the basis is reported rather than assumed.
- Whether `CONTRACT.md` should mandate which event a ruleset requires is **out**: once
  both events agree, requiring either is defensible.

## Scope

**In**: `resolveLane()` in `src/probe.mjs` · `check.mjs`'s BRANCH · the lane line in
the human report and `lane` in `--json` · `admit.mjs` routed through the helper ·
paired comments at `reconcile.mjs` · flow regression cases · golden re-pin.

**Out**: `CONTRACT.md`'s required-event guidance · the `pull_request` merge-ref subject
question beyond naming it · `reconcile`'s refusal · #50, #56, #57.

## Tech stack / commands

```
repro (#55):   see the issue — scratch repo, detached HEAD, GITHUB_HEAD_REF set
flow suite:    node test/flow/run.mjs
golden:        node test/golden/run.mjs --verify
full suite:    node test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
self-check:    node check.mjs --self-check
self-score:    node check.mjs --repo . --no-exec
```
