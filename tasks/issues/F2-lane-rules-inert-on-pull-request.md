---
draft: true
target: AdarGit008/baseline-skill
labels: [bug]
title: "Every lane rule is inert on the pull_request event — the run a branch ruleset actually requires is the one that does not check"
tracker: "#52"
rank: 2
split-from: "#49 (adjacent finding)"
---

## Symptom

One commit, two events, two verdicts. On `push`, with the branch checked out:

```
FLOW-02  PASS   2 session record(s) ride this lane
FLOW-03  FAIL   …prereg.md has an empty next:
tally: PASS 12 · FAIL 2 · WARN 7 · SKIP 67
```

On `pull_request`, where `actions/checkout` leaves a detached merge ref:

```
FLOW-01  SKIP   no branch resolved (detached HEAD / CI checkout) — lane rules n/a
FLOW-02  SKIP   no branch resolved (detached HEAD / CI checkout) — lane rules n/a
FLOW-03  SKIP   no branch resolved (detached HEAD / CI checkout) — lane rules n/a
FLOW-04  SKIP   …            FLOW-05  SKIP   …            FLOW-06  SKIP   …
FLOW-07  SKIP   …            DIV-01   SKIP   …            DIV-02   SKIP   …
tally: PASS 10 · FAIL 1 · WARN 7 · SKIP 70
```

Every branch-scoped rule — the whole FLOW family plus DIV-01 and DIV-02 — is n/a on
the event whose check a branch-protection ruleset requires.

## Cause

`laneOrNull` (`src/probe.mjs`) resolves lane identity from the checkout:

```js
export function laneOrNull(repo) {
  const l = currentLane(repo)
  return l && l !== '(detached)' ? l : null
}
```

`actions/checkout` on a `pull_request` event checks out `refs/pull/N/merge` detached
by design, so there is no branch to resolve and the engine takes the honest SKIP.
Nothing reads `GITHUB_HEAD_REF`, and `src/reconcile.mjs:267` deliberately refuses it —
correctly, because `reconcile` revalidates the default branch and *"a miswired
pull_request job must not evaluate a PR branch while claiming to revalidate main."*
That reasoning is right for `reconcile` and is the opposite of what `check` wants on a
PR.

The SKIP text is accurate and, since M7, specific. What it cannot say is that the
rules were **not evaluated on this event** rather than **not applicable to this
branch** — and the consequence does not depend on the wording.

## Why this costs more than a skipped rule

**The lane rules exist to gate the merge, and the merge gate is where they do not
run.** FLOW-01 through FLOW-05 and DIV-01/02 are about a lane's discipline at the
moment it lands: is it anchored, does it carry its record, is the record's plan
current, does the tracker agree. A ruleset that requires the `pull_request` check —
the ordinary configuration, and the one GitHub's UI steers you toward — merges with
none of that evaluated, and the summary says 87% ready with zero failures.

**The two failure directions have both happened, and neither is theoretical.**

- *Green PR, red push.* mcgyvr `lane/282` (2026-08-16): FLOW-04 FAIL on `push`,
  SKIP on `pull_request`; caught only because that repo's ruleset requires both runs.
  A repo requiring only the PR check would have merged on a green that checked nothing.
- *Red push, blocked PR.* mcgyvr `lane/91` (2026-08-01): two dependabot PRs sat
  **BLOCKED** with no admin bypass, because the push-triggered `baseline` context
  failed FLOW-04 on a branch the PR-triggered run had passed. The ruleset counts the
  context by name and does not care which event produced it.

So the same defect reads as *silence* under one ruleset and as *deadlock* under
another, and neither state names the event as the cause.

**A blocker that is n/a in one context is a different kind of rule.** Every other
`n/a` in the run is a statement about the repository — no lanes namespace, no
committed records, a declared-family branch. This one is a statement about the CI
runner's checkout mode, and it is indistinguishable from the others in the report.

## Suggested fix

Two coherent positions; this issue does not choose:

1. **Resolve the lane from the event.** When the checkout is detached and
   `GITHUB_HEAD_REF` (or `GITHUB_REF_NAME` on a push) names a branch, use it as the
   lane identity for `check`. The rules then evaluate the head branch on both events
   and the two runs agree. `reconcile` keeps its refusal — its subject is main, not
   the PR — so the two surfaces would deliberately read the environment differently
   and should say so where they do it.
2. **Keep the SKIP and make it loud.** If lane discipline is genuinely a push-time
   property, then a run that skipped the entire family for a *context* reason should
   say so once, above the rule rows — `lane rules not evaluated: detached checkout
   (pull_request event); the push-event run is the one that judges this lane` — and
   `CONTRACT.md` should state which event a ruleset must require. A reader currently
   has to know the checkout mode to interpret the report.

The half of mcgyvr's original suggestion that asked for a specific SKIP reason is
**already done** on current main; the wording is precise. What is not addressed is
that the precision does not reach the person configuring the ruleset.

## Reproducing

```bash
d=$(mktemp -d) && cd "$d" && git init -q -b main . && git config user.email a@b.c && git config user.name t
cat > baseline.repo.json <<'EOF'
{"schema_version":1,"type":"docs","lifecycle":"production","maturity":"released",
 "workflow":"multi-lane","anchoring":"off",
 "ground_truth_boundary":{"default_branch":"main"},"lanes":{"namespace":"lane/*"}}
EOF
git add -A && git commit -qm base && git checkout -qb lane/1
mkdir -p records/sessions/lane/1
printf -- '---\nrecord: session/1\nlane: 1\n---\n\n# S\n\n## Did\nx\n\n## Left open\nnext: y\n' \
  > records/sessions/lane/1/2026-01-01-x.md
git add -A && git commit -qm record

echo '--- push event (branch checked out) ---'
node /path/to/baseline-skill/check.mjs --repo . --no-exec | grep -E '^(FLOW|DIV)-'

git checkout -q --detach HEAD          # what actions/checkout does on pull_request
echo '--- pull_request event (detached merge ref) ---'
node /path/to/baseline-skill/check.mjs --repo . --no-exec | grep -E '^(FLOW|DIV)-'
# every lane rule: SKIP  no branch resolved (detached HEAD / CI checkout) — lane rules n/a
```

## Found

Reading `AdarGit008/mcgyvr` for #52. Filed today only as the *"Adjacent finding —
separable, and possibly the more serious one"* section at the foot of #49, which says
*"it is worth its own issue if you agree it is real."* It is real, it reproduces, and
its reach is wider than that section reports: not FLOW-01 and FLOW-04 but the entire
branch-scoped family, DIV-01 and DIV-02 included.

Two mcgyvr incidents, in opposite directions: `lane/91` (2026-08-01, two dependabot
PRs blocked) and `lane/282` (2026-08-16, the green-PR reading).
