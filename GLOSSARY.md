# Glossary

Plain-language definitions for the DevOps, supply-chain, and software-readiness
terms used across the baseline docs. Unfamiliar with a term in the README? Jump
here. Ordered alphabetically.

---

## ADR
**Architecture Decision Record** — a short dated document that captures one
significant technical decision, its context, and its consequences. ADRs carry a
`Status` (proposed / accepted / superseded); a superseded one links forward to
the record that replaced it.

## Blast radius
How far a claim or change reaches if it's wrong. A claim graded by blast radius
is scored by the damage a false version would do — a throwaway line versus a
load-bearing promise a strategy depends on.

## Blocker
The most severe rule outcome. A failing blocker sets the runner's exit code to 1,
which **fails CI** and marks the repo not build-ready. Contrast [warn](#warn) and
[sign-off](#sign-off-ledger).

## Bootstrap
The single command a newcomer runs on a fresh checkout to get the project
working (install deps, build, run tests) — often called "Task 1" or `bin/setup`.
The baseline runs it on a clean clone to prove the repo actually starts (BUILD-05).

## Branch protection
GitHub rules on a branch (usually `main`) that block direct pushes and require
pull requests, passing checks, or reviews before a merge. "Branch-protection-as-code"
means declaring those rules in a file in the repo, not just in web settings.

## Claims explosion
The C17 migration of the legacy `docs/CLAIMS.json` monolith into per-claim
`records/claims/CLM-NNNN.json` records, run by `baseline gen migrate-claims`.
Each V1 claim id survives as the record's `slug`; both homes are read during the
migration window (see [dual-read](#dual-read)) until M7 retires the legacy read.

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

## Diataxis
**Diátaxis** — a documentation framework that sorts docs into four modes:
tutorials, how-to guides, reference, and explanation. See <https://diataxis.fr>.

## Digest pinning
Referencing a container base image by its immutable content hash
(`FROM node@sha256:…`) instead of a moving tag (`FROM node:22`), so the exact
image can't change underneath you.

## Dual-read
Reading both the old and the new home of a record during a sanctioned migration
window (per-claim records alongside the legacy `CLAIMS.json`; the JDG ledger
alongside `signoff.json`), so a repo mid-migration is never punished. The
exploded record shadows its migrated twin by slug; the legacy reads end at M7.

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

## Keep a Changelog
A widely used convention for human-readable `CHANGELOG.md` files, including an
`Unreleased` section for changes not yet shipped. See <https://keepachangelog.com>.

## Lane
A working branch treated as the unit of parallel work in a multi-lane repo.
Lane identity **is** the branch name — session records live under
`records/sessions/<lane>/` — and a detached HEAD is not a lane.

## Lease
The fully **derived** liveness of a claimed lane (nothing stored to go stale):
freshness = max(tip committedDate, PR updatedAt) against the descriptor's
`lease_ttl` → **LIVE** | **STALE** (past ttl/2 — orient's nudge, never a finding)
| **ABANDONED** (past ttl — FLOW-07 warns; `lane reclaim` may take over). An
unresolvable freshness derives no state at all — surfaced, never guessed.

## DIVERGED
The engine tag for a cross-tier contradiction (DIV rules): the git plane and the
forge disagree — issue closed under an active lane, a recorded `next:` at a dead
issue, an open PR closing a closed issue. Its own verdict in the scorecard and
`summary.diverged` in `--json`; severity stays warn (the exit code is unchanged
until M7) because divergence demands a human resolution, not a red build.

## last-verified stamp
A line like `last-verified: <short-sha> <date>` in a status doc, naming the last
commit whose described state was actually reconciled with reality. The baseline
checks it points at a recent commit, not a stale or off-branch one (CTX-01).

## Least-privilege token
Granting a CI job only the permissions it needs. In GitHub Actions, setting
`permissions:` to the minimum (often `contents: read`) instead of the broad
default, so a compromised step can't do much.

## Lockfile
A file that pins the exact resolved version of every dependency
(`package-lock.json`, `yarn.lock`, `poetry.lock`). Committing it makes installs
reproducible across machines and time.

## Mutation testing
A technique that deliberately introduces small faults ("mutants") into your code
to check whether the test suite catches them — a measure of test quality beyond
raw coverage. Stryker is a common tool.

## OIDC
**OpenID Connect** — here, the mechanism that lets a CI job exchange a
short-lived identity token for cloud/registry access instead of storing
long-lived secrets. Reduces the blast radius of a leak.

## OpenSSF Scorecard
An open-source tool from the Open Source Security Foundation that scores a repo
on security best practices (branch protection, pinned actions, signed releases,
etc.). One of the prior-art sources the baseline was pressure-tested against.

## Posture gate
An engine gate that skips any rule whose declared workflow doesn't match the
repo descriptor's — e.g. [lane](#lane)-workflow rules are unrepresentable on a
repo that never declared `multi-lane`, so they skip instead of warning as
wallpaper.

## Pre-commit hook
A check that runs automatically before a commit is recorded (via the `pre-commit`
framework or a git hook) — e.g. linting or secret-scanning — catching issues
before they land.

## Prior-art pass
A dated check that a novelty or competitive claim isn't already shipped by
someone else. A claim of "first/only" survives only after searching for existing
implementations that would falsify it.

## Profile
A tag that decides which rules run for a given repo. `core` always runs;
`service` turns on automatically when `project_type=service`; `advanced` is
opt-in. Rules outside the active profile **skip** and never count against you.

## Provenance
Verifiable evidence of where an artifact came from and how it was built — for
releases, a signed record linking a published artifact to the exact source and
build that produced it.

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

## Sign-off ledger
Where a human records that a judgment a script can't automate — like a prior-art
pass — was actually done, so "manual" rules leave a checkable trace instead of
being taken on trust. The primary home is the unified JDG ledger
(`records/judgments/JDG-*.json`, M4b): a dated, unexpired `kind: sign-off`
judgment naming the rule as its subject. The legacy
`.project-baseline/signoff.json` file is [dual-read](#dual-read) until M7.

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

## Twelve-Factor App
A well-known set of twelve principles for building portable, scalable web
services (config in the environment, stateless processes, etc.). See
<https://12factor.net>.

## Warn
An advisory rule outcome. A warning is worth fixing but does **not** fail CI or
block readiness. Contrast [blocker](#blocker).

## Wedge and moat
A **wedge** is the narrow initial way a product gets in (a specific job it wins
first); a **moat** is the durable advantage that keeps competitors out later.
The baseline asks that both are stated and pressure-tested — a wedge is not a moat.
