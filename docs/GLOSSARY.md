# Glossary

> **This page is not an authority — the code is.** The rule set (`rules/*.json`) and the runner (`src/`) decide; this page only
> describes them. Where the two disagree, the code is right and this page is a bug.

Plain-language definitions for the DevOps, supply-chain, and software-readiness
terms used across the baseline docs. Unfamiliar with a term in the README? Jump
here. Ordered alphabetically.

---

## ADR
**Architecture Decision Record** — a short dated document that captures one
significant technical decision, its context, and its consequences. ADRs carry a
`Status` (proposed / accepted / superseded); a superseded one links forward to
the record that replaced it. The `decisions` [pack](#pack) checks them.

## Admit
The merge-point revalidation command: *a verdict is valid only for the state it
evaluated*, so `baseline admit` re-derives against the **target ref's** current
tip and refuses when the branch is stale (the target tip is not an ancestor of
HEAD), when an admit-context [blocker](#blocker) fails (DESC-03, in the
`descriptor` pack), or when a fact it genuinely gates on is unreadable — while
advisory warns ride the verdict without ever blocking. The target ref's
descriptor governs the run — a PR cannot weaken the posture that judges it.

## Blast radius
How far a claim or change reaches if it's wrong. A claim graded by blast radius
is scored by the damage a false version would do — a throwaway line versus a
load-bearing promise a strategy depends on.

## Blocker
The most severe rule outcome. A failing blocker sets the runner's exit code to 1,
which **fails CI** and marks the repo not build-ready. Only the always-on blockers
(and a blocker in a pack you switched on) can do this. Contrast [warn](#warn)
and [n/a](#na).

## Bootstrap
The single command a newcomer runs on a fresh checkout to get the project
working (install deps, build, run tests) — often called "Task 1" or `bin/setup`.
The baseline runs it on a clean clone to prove the repo actually starts (BUILD-05).

## Branch protection
GitHub rules on a branch (usually `main`) that block direct pushes and require
pull requests, passing checks, or reviews before a merge. GOV-01/02 read the live
setting through the forge — and are therefore `n/a` under `check`, where the forge
is closed.

## Claims explosion
The migration of a legacy `docs/CLAIMS.json` monolith into per-claim
`records/claims/CLM-NNNN.json` records, run by `baseline gen migrate-claims`.
Each old claim id survives as the record's `slug`; reruns are idempotent by slug.
The checker reads records ONLY — CLAIM-07 flags a lingering monolith, and the
whole CLAIM family runs only in the `claims` [pack](#pack).

## CODEOWNERS
A file that maps paths in the repo to the people or teams responsible for them,
so the right owners are auto-requested for review when those paths change.

## Coverage floor
A minimum test-coverage percentage that CI enforces — builds fail if coverage
drops below it. Prevents coverage from silently eroding over time.

## Dependabot
GitHub's automated dependency-update tool. It opens pull requests to bump
outdated or vulnerable dependencies. Any equivalent (Renovate, etc.) satisfies the
same rule.

## Descriptor
`baseline.repo.json` — a repo's declared identity and posture (`type`,
`lifecycle`, `maturity`, `workflow`, `anchoring`), schema-validated. A valid
descriptor's `type` supersedes filesystem auto-detection; it never switches a
[pack](#pack) on. Checked by the `descriptor` pack (DESC-01/02/03).

## Diataxis
**Diátaxis** — a documentation framework that sorts docs into four modes:
tutorials, how-to guides, reference, and explanation. See <https://diataxis.fr>.

## Digest pinning
Referencing a container base image by its immutable content hash
(`FROM node@sha256:…`) instead of a moving tag (`FROM node:22`), so the exact
image can't change underneath you.

## Exit code
The number a program returns when it finishes; `0` means success, non-zero means
failure. CI treats a non-zero exit as a failed step — which is how a baseline
blocker fails a build.

## Freshness contract
A convention that a long-lived doc must carry a recent review date (e.g. a
`last_review_date` in frontmatter) so stale docs are detectable by a machine
rather than trusted on faith.

## Frozen install
Installing dependencies in a locked, reproducible mode that fails if the
[lockfile](#lockfile) is out of date (`npm ci`, `pip install --require-hashes`,
`yarn --frozen-lockfile`) — as opposed to a loose install that can silently drift.

## Generated view
A tracked markdown file whose first line is the `baseline:generated <kind>`
marker: machine-derived from the records, never hand-edited. `baseline gen index`
writes one (deterministic — sorted content, filename dates, no timestamps);
`baseline gen --check` regenerates every marked view and byte-compares, the
advisory CI drift guard. Zero marked views is trivially green — adoption is
opt-in per repo.

## Graceful shutdown
When a service catches a termination signal ([SIGTERM](#sigterm)) and finishes
in-flight work, closes connections, and exits cleanly instead of dropping
everything mid-request.

## Health check
An endpoint (e.g. `/healthz`, `/readyz`) a service exposes so load balancers and
orchestrators can tell whether it's alive and ready to receive traffic.

## Idempotent
Safe to run more than once with the same result. An idempotent bootstrap can be
re-run on an already-set-up machine without breaking or duplicating state.

## Judgment ledger
`records/judgments/JDG-NNNN.json` — where a human records a decision a script
can't make: a `deviation` from a rule, a `risk-acceptance`, or a `break-glass`
override of a fail-closed admit/reconcile gate. Every judgment is dated, owned,
scoped, reasoned, and it **expires** (`review_by`); a `tripwire` voids it when
the world it assumed changes. In v3 a judgment records a decision — it never
satisfies a rule: the manual, sign-off-backed rules were deleted rather than kept
as written promises. `baseline jdg new` writes one, `baseline jdg check`
evaluates the ledger.

## Keep a Changelog
A widely used convention for human-readable `CHANGELOG.md` files, including an
`Unreleased` section for changes not yet shipped. See <https://keepachangelog.com>.

## last-verified stamp
A hand-maintained freshness receipt: a status-doc line naming the last commit
whose described state was reconciled with reality. Retired — a stored stamp
drifts, so state is derived (`baseline orient`) and CTX-12 **blocks** the stamp
signature wherever it appears (delete the line).

## Least-privilege token
Granting a CI job only the permissions it needs. In GitHub Actions, setting
`permissions:` to the minimum (often `contents: read`) instead of the broad
default, so a compromised step can't do much.

## Lockfile
A file that pins the exact resolved version of every dependency
(`package-lock.json`, `yarn.lock`, `poetry.lock`). Committing it makes installs
reproducible across machines and time.

## Merged-while-red
A PR that landed on the default branch while its admit check had conclusion
`failure`: the admin/bypass valve was used. [Reconcile](#reconcile) detects it at
the merged PR's *head* sha and files the demand for the retroactive break-glass
judgment whose `subject` names the short merge sha. The morning-after paperwork
is the control, not the prevention.

## Mutation testing
A technique that deliberately introduces small faults ("mutants") into your code
to check whether the test suite catches them — a measure of test quality beyond
raw coverage. Stryker is a common tool.

## n/a
The state of a rule that was **in scope but could not be evaluated here** — no
subject in the tree, a tool absent and not [wanted](#want), the forge closed, an
evaluator that returned nothing. In `--json` it is `{ "state": "n/a", "reason" }`
with a non-empty reason; the human render shows nothing, and `summary.total`
counts evaluated rows only. A rule outside the run altogether (inactive pack,
off-type) is not n/a — it produces no row at all.

## OIDC
**OpenID Connect** — here, the mechanism that lets a CI job exchange a
short-lived identity token for cloud/registry access instead of storing
long-lived secrets. Reduces the blast radius of a leak.

## OpenSSF Scorecard
An open-source tool from the Open Source Security Foundation that scores a repo
on security best practices (branch protection, pinned actions, signed releases,
etc.). One of the prior-art sources the baseline was pressure-tested against.

## Pack
A named, opt-in group of rules — `claims`, `decisions`, `descriptor`, `service`,
`advanced` — declared as data on each rule (`"pack": "advanced"`) and listed in
`rules.json`'s `packs` map. A rule with no pack is **always on**. With no config
file every pack is off; a pack turns on only from an explicit switch in
`baseline.config.json` (`makes_external_claims: true`, a non-empty
`decision_globs`, `project_type: "service"`), from the `profiles` list (alias
`packs`), or from `--profile <pack>` on the CLI. Nothing in the tree — and never
the [descriptor](#descriptor)'s `type` — activates one. A rule in an inactive pack
is not part of the run: no row, not even n/a.

## Plugin
One of the three tools baseline suggests and never requires: **obsidian-tdd** (what is
open — `tdd.json`), **graphify** (what is where — `graphify-out/`) and
**okf-rag** (why it matters — a knowledge bundle at `$BASELINE_OKF_BUNDLE`,
`get_knowledge()` for agents). baseline imports no code from them and reads
their artifacts as **metadata only** — exists, file or directory, mtime,
gitignore state — never the content. Each is one always-on WARN rule
(`PLUG-01/02/03`): absent → the install command, printed and never run;
gitignore state differing from the `plugins` config → the mismatch; otherwise
PASS. A WARN leaves `.baseline/log/<PREFIX-NN>.log`. `baseline explain` may
display an okf concept; display is not a verdict.

## Pre-commit hook
A check that runs automatically before a commit is recorded (via the `pre-commit`
framework or a git hook) — e.g. linting or secret-scanning — catching issues
before they land.

## Prior-art pass
A dated check that a novelty or competitive claim isn't already shipped by
someone else. A claim of "first/only" survives only after searching for existing
implementations that would falsify it.

## Provenance
Verifiable evidence of where an artifact came from and how it was built — for
releases, a signed record linking a published artifact to the exact source and
build that produced it.

## Reconcile
`baseline reconcile` — post-merge revalidation of the default branch on cron.
Read-only toward the repo; its write surface is the issue tracker, where findings
live as `baseline`-labeled issues under a dedup lifecycle keyed
`baseline:<id>:<subject>` (file → comment on change → close when positively
re-evaluated ok → reopen on recurrence of a bot-closed issue; a human close of an
advisory filing is a judgment and stays closed). Findings never redden the cron;
a cron that cannot deliver does. It keeps the live forge probe `check` and
`orient` do not have.

## repolinter
An open-source tool (originally from GitHub) that checks a repository against
configurable structural rules (required files, license, etc.). Prior art the
baseline drew on.

## Runbook
An operational document telling an on-call engineer how to run and recover a
service — how to deploy, what alerts mean, and how to handle common failures.

## Runtime pinning
Declaring the exact language/runtime version the project needs (`.nvmrc`,
`engines`, `.python-version`) so every environment uses the same one. The
baseline also checks the pinned version is consistent everywhere it's stated.

## SAST
**Static Application Security Testing** — automated scanning of source code for
security flaws without running it (e.g. CodeQL, Semgrep), typically wired into CI.

## SBOM
**Software Bill of Materials** — a machine-readable inventory of every component
and dependency in a build (formats like CycloneDX or SPDX), used to answer "am I
affected?" when a vulnerability drops.

## Scrub tiers
The scrub gate's severity ladder: deterministic secret signatures **block**,
heuristic findings **warn** and never block, and a dated allowlist judgment
clears exactly one finding id. Severity never exceeds certainty.

## Secret scanning
Automated detection of committed credentials (API keys, tokens, private keys) in
the repo and its history, so leaked secrets are caught and rotated.

## Service catalog
A system that tracks the services an org runs, their owners, and their maturity
(Backstage, Cortex, OpsLevel). A "service descriptor" file (e.g. `catalog-info.yaml`)
declares a service's owner and lifecycle to such a catalog.

## SIGTERM
The polite "please stop" signal an operating system or orchestrator sends a
process before force-killing it. Well-behaved services trap it and shut down
gracefully.

## SLSA
**Supply-chain Levels for Software Artifacts** — a framework of graded
requirements for build integrity and [provenance](#provenance), aimed at
preventing tampering between source and release. See <https://slsa.dev>.

## Structured logging
Emitting logs as machine-parseable records (usually JSON with consistent fields)
instead of free-form text, so they can be searched, filtered, and aggregated.

## Supply chain
Everything that goes into producing your software that you didn't write —
dependencies, base images, CI actions, build tools. "Supply-chain security" is
about trusting and verifying those inputs.

## Tool
A rule's declared subject — `"tool": "docker"` on a rule that reads a
Dockerfile. The rule is in scope when the tool is detected in the tree or the
config [wants](#want) it; otherwise, on a repo of a type the rule applies to, it
resolves [n/a](#na). The vocabulary is closed (`TOOLS` in `src/selfcheck.mjs`)
and grows only with a rule that declares the new value.

## Twelve-Factor App
A well-known set of twelve principles for building portable, scalable web
services (config in the environment, stateless processes, etc.). See
<https://12factor.net>.

## Want
The config key `want: ["docker"]` — a tool declared present **by intent**. It
puts the tool's rules in scope even where the artifact (or the repo type) is
missing, so a repo that is about to adopt Docker hears REPRO-04 now; intent
counts as presence. An entry naming no known tool is reported by name.

## Warn
An advisory rule outcome. A warning is worth fixing but does **not** fail CI or
block readiness. Contrast [blocker](#blocker).
