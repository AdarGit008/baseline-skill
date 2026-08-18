# Spec: Issue #52 — derive the hardening backlog from mcgyvr

## Objective

Every hardening issue this repo has landed since v2.5.0 was discovered by accident:
someone running the workflow in `mcgyvr` tripped over a rule and wrote it up. #46,
#47, #49 and #50 are all that shape — four issues, four separate accidents.

`mcgyvr` has accumulated **36 ADRs and 162 session records across 95 lanes**
(2026-08-01 → 2026-08-18). An ADR in that corpus is, by construction, a failure
severe enough to become policy; a session record is where the friction was felt
before anyone decided what to do about it. Nobody had read the corpus with the
question *"what should baseline have caught?"* in hand.

This issue is that read, producing a **ranked hardening backlog** with each
confirmed finding reproduced against baseline-skill code and filed as its own
issue.

**This branch carries the review, the spec, the plan and the drafted child issues.
It changes no evaluator, no rule and no test.**

### Success criteria

- All 36 ADRs and all 162 session records read (limits stated where they exist).
- Every filed finding **reproduced against baseline-skill code at `df7f5c3`** with a
  runnable repro, in the style of #50 — not cited to a mcgyvr record alone.
- Findings ranked by **trust damage × frequency** (the issue's declared rule).
- Candidates that did not reproduce recorded as candidates, **not filed**.
- Corroborating evidence for the two already-open issues (#49, #50) recorded with
  dates and lane ids.
- No change to `src/`, `rules/`, `check.mjs` or `test/` on this branch.

## Scope

**In** (from the issue's own answers): defects in existing rules · coverage gaps
where a mcgyvr failure has no rule at all · lane and workflow mechanics.

**Out**: ergonomics and doc-drift polish; anything requiring a change to `mcgyvr`.

## Tech stack / commands

Node ≥ 18, zero dependencies. Read-only against `mcgyvr`; reproductions build
throwaway git repos under the session scratchpad and invoke this repo's checker.

```
repro (per finding):  see tasks/issues/F<n>-*.md — each carries a self-contained
                      shell block that builds a scratch repo and prints the verdict
self-check:           node check.mjs --self-check
full suite:           node test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
self-score:           node check.mjs --repo . --no-exec
```

## The findings, ranked

Rank is trust damage × frequency. Trust damage is how much the defect makes an
author stop believing baseline's output; frequency is how many distinct mcgyvr
lanes hit it.

| # | Finding | Class | Trust | Freq | Repro |
|---|---------|-------|-------|------|-------|
| F1 | `committedLog` picks the newest lane record by **filename sort**, so a same-day record that sorts later governs FLOW-03/05 and DIV-02 | rule defect | blocker fires on a compliant lane; **silently blinds DIV-02** | 3 lanes + 1 latent | ✅ |
| F2 | Every lane rule (FLOW-01…07, DIV-01/02) is **inert on the `pull_request` event** — the run a branch ruleset actually requires | rule defect | the merge gate is the run that does not check | 2 incidents | ✅ |
| F3 | REC-01 scores an **append** identically to a rewrite, and the reply-corpus design guarantees one append per measurement run | rule defect | the warn that stops being read | 6+ records, monotonic | ✅ |
| F4 | ADR **amendment** edges (`Amends:` / `Amended-by:`) are read by no rule — a dangling amendment pointer resolves to nothing and is not reported | coverage gap | a decision graph nothing checks | 18 edges, 15 one-way | ✅ |

### F1 — the newest record is the last filename, not the newest record

`src/evaluators.mjs:61-71`:

```js
const md = added.filter(f => f.endsWith('.md')).sort()
if (!md.length) return null
const rel = md.at(-1)
```

`added` is every record the lane adds against the default branch. The sort is
lexicographic over the path, so within one day the **slug** decides which record is
"newest". `records/sessions/lane/231/2026-08-13-checks-1-and-2-under-the-gate-adar.md`
carries a filled `next:`; `…2026-08-13-positive-control-prereg.md` correctly carries
none — a pre-registration is not a session. `c` < `p`, so FLOW-03 reads the
pre-registration and fails a lane whose record discipline is intact.

The second-order effect is the expensive one: DIV-02 reads the same selection, so
picking a `next:`-less record turns divergence detection off with a SKIP that reads
like "nothing to check".

Observed on mcgyvr `lane/231` (2026-08-13, CI blocker), `lane/113` (2026-08-13) and
`lane/266` (2026-08-15); latent on `lane/225`, which survived only because
`f1-t…` happens to sort after `f1-r…`.

### F2 — the lane rules do not run on the event that gates the merge

`actions/checkout` on a `pull_request` event checks out the merge ref detached, so
`laneOrNull` returns null and every branch-scoped rule takes the honest
`no branch resolved (detached HEAD / CI checkout)` SKIP. Same commit, two verdicts:
on `push` the lane rules fire; on `pull_request` all seven FLOW rules plus DIV-01
and DIV-02 go n/a.

Which run a branch ruleset requires then decides whether the merge gate has any lane
discipline in it at all. mcgyvr hit both directions: `lane/91` (2026-08-01) had two
dependabot PRs **blocked** because the push run failed FLOW-04 while the PR run
passed; `lane/282` (2026-08-16) recorded the inverse as the more serious reading.

Filed today only as an "adjacent finding" inside #49, which asks for it to be split
out if real. It is real.

### F3 — an append is not a rewrite, and REC-01 cannot tell them apart

`records-append-only` reports every `M`/`D`/`R` event under `records/` as a mutation.
An append is an `M`. mcgyvr's three long-standing mutations were *all* additive or
citation-repairing — one of them (`67c92db`) replaced a rot-prone citation with
sha256-pinned evidence, making the record **more** forensically sound.

#47 gave the rule a sanctioned route, which is the right escape hatch and does not
close this: the finding still cannot say whether a mutation added to a record or
rewrote it, so a repair and a falsification are scored alike and the author's only
signal is a count. mcgyvr's `lane/212` names the sharp end — `records/corpora/worker-replies/golden.json`
must be re-pinned on every measurement run, so REC-01's count grows by one per sweep
**by design**.

### F4 — the decision graph's amendment edges are unchecked

CTX-02 and CTX-07 read `Status:` and `Superseded-by:` only. `Amends:` and
`Amended-by:` are read by no rule and no kind. An ADR declaring `Amends: ADR-0019`
where no ADR-0019 exists passes both; an ADR amended by another, saying nothing back,
passes both.

mcgyvr's decision graph is amendment-shaped rather than supersede-shaped — 18 edges,
of which **15 are one-way** — and it had to build `tests/test_decisions.py` and
`tools/decisions/index.py` locally to get the check baseline does not ship.

## Corroboration for the two open issues

- **#49** (duplicate decision-record numbers) — two real incidents, both after the
  issue was filed. `ADR-0027` was claimed by `lane/265` and `lane/282` on 2026-08-16
  and caught only by a human re-read ("two ADRs numbered 0027 under different
  filenames merge without a git conflict, so nothing would have reported it").
  `ADR-0035` was **actually landed twice** on 2026-08-17 — PR #298 at 22:15 and PR
  #303 at 23:25, seventy minutes apart — and was resolved by renumbering on
  `lane/304` the next day.
- **#50** (FLOW-03's `## Left open` placement) — two further instances beyond the
  one in the issue: `lane/113` session/4 (an `## Amendment` section appended after
  `## Left open`) and `lane/266` session/5 (a closing prose section after it). Both
  cost a whole extra session record, because REC-01 makes the older one immutable.

## Candidates recorded and NOT filed

Per the issue's bar, these did not clear reproduction and stay candidates:

1. **`reconcile`'s forge writes are not verified against intent.** `mutate()` treats
   `result !== null` as success — a transport check. mcgyvr's ADR-0001 records
   `gh issue edit --body-file` **blanking a body and exiting 0**, twice, and built
   `tools/issues/body.py` to read the live body back. Plausible here, but this repo's
   filing path passes bodies as strings rather than files, so the specific hazard was
   not reproduced.
2. **The inert-rule class.** mcgyvr's ADR-0026 lens 3 and ADR-0034 are one long
   argument that a check which cannot say what it applied is worse than no check.
   Whether a baseline rule can PASS vacuously — matching nothing and reporting
   health — was not established on any rule; it needs a rule-by-rule sweep, which is
   its own issue-sized job.
3. **A merged lane is spent, and the next commit has nowhere to go.** Four lanes hit
   it (`106`, `114`, `216`, `231`); `lane/216` lost a correction by six minutes to a
   squash. Real friction, but working-as-designed under DIV-01 rather than a defect,
   and the remedy (a new issue and lane) is what the rule intends.
4. **DIV-02 costs a whole record to clear a stale `next:`.** Three lanes wrote a
   session record whose only content was "the plan is stale" (`10`, `133`, `150`).
   Cost is real; no defect identified.
5. **Claims are validated against a schema nothing enforces** — flagged in four
   mcgyvr lanes over 10 claim records. **Refuted on current main**: `loadClaimRecords`
   runs `validateRecord('claim', …)` and surfaces schema-invalid records as errors.
   mcgyvr's vendored copy predates the fix.

## Stated limits of the read

- Two of the 162 session records — `225/2026-08-11-bench-campaign-t1-brief.md` and
  `225/2026-08-11-bench-probe-t2-brief.md`, 21 KB each — are problem-generation
  briefs addressed to sub-agents. They were scanned for baseline surface (`baseline`,
  `REC-`, `FLOW-`, `DIV-`, judgment, admit, orient, scrub) rather than read in full;
  the scan returned only `tools/bench/admit.py` references, which are mcgyvr's own
  gate and not baseline's. Every other record was read whole.
- The read is of what mcgyvr **wrote down**. Friction that never reached a record is
  outside it, and the live-baseline-run evidence source was declined at interview.
