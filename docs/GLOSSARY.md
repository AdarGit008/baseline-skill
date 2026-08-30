# Glossary

> **This page is not an authority — the code is.** The rule set (`rules/*.json`) and the runner (`src/`) decide; this page only
> describes them. Where the two disagree, the code is right and this page is a bug.

Plain-language definitions for the terms used across the baseline docs. Unfamiliar
with a term in the README? Jump here. Ordered alphabetically.

---

## ADR
**Architecture Decision Record** — a short dated document that captures one
significant technical decision, its context, and its consequences. Stored under
`records/decisions/ADR-NNNN.md`; the number is the identity every citation resolves
to. ADRs carry a `Status` (proposed / accepted / superseded); a superseded one links
forward to the record that replaced it.

## Admit
The merge-point revalidation command: *a verdict is valid only for the state it
evaluated*, so `baseline admit` re-derives against the **target ref's** current tip
and refuses (exit 1) when the branch is stale (the target tip is not an ancestor of
HEAD), when an admit-context [blocker](#blocker) fails, or when a fact it genuinely
gates on is unreadable. The target ref's descriptor governs the run — a PR cannot
weaken the posture that judges it.

## Baseline rules layer
Every non-plugin rule — BUILD-03, BUILD-04, GOV-03, SEC-01, SEC-02, CTX-19 — one
layer a repo opts in or out of at setup time, **default in**. `"baseline_rules":
false` opts it out: those rules resolve [n/a](#na), out of the exit gate. Absent or
`true` leaves it in — only the literal `false` mutes, so a typo can never quietly
stop a rule from gating. Written by `baseline trust setup --baseline-rules in|out`;
its state is printed on every `check`. The mirror half, the [trust circle](#trust-circle),
is opt-in and default out.

## Blast radius
How far a claim or change reaches if it's wrong. A claim graded by blast radius
is scored by the damage a false version would do — a throwaway line versus a
load-bearing promise a strategy depends on.

## Blocker
The only severe rule outcome. A failing blocker sets the runner's exit code to 1,
which **fails CI** and marks the repo not build-ready. Every rule that claims a
severity is a blocker; the one exception is the [frozen rule](#frozen-rule), which
claims none. Contrast [n/a](#na).

## CODEOWNERS
A file that maps paths in the repo to the people or teams responsible for them,
so the right owners are auto-requested for review when those paths change. GOV-03
checks one exists and names an owner.

## Descriptor
`baseline.repo.json` — a repo's declared identity and posture (`type`, `lifecycle`,
`maturity`, `workflow`, `anchoring`), schema-validated. A valid descriptor's `type`
supersedes filesystem auto-detection of `project_type`. Read at the target ref by
`admit`, so the posture that judges a merge is the one the merge declares.

## Diataxis
**Diátaxis** — a documentation framework that sorts docs into four modes:
tutorials, how-to guides, reference, and explanation. See <https://diataxis.fr>.

## Exit code
The number a program returns when it finishes; `0` means success, non-zero means
failure. CI treats a non-zero exit as a failed step — which is how a baseline
blocker fails a build.

## Frozen rule
A rule that is declared but structurally incapable of a verdict: CTX-18, which
stands for `my-onto` — a tool that does not exist yet. It claims no severity,
resolves `n/a` on every run, and is silent to humans. "Blocker" would be an empty
claim about a check that can never fire; the rule exists so the trust circle is
honest about the fourth member rather than quietly three-quarters of a roster.

## Generated view
A tracked markdown file whose first line is the `baseline:generated <kind>`
marker: machine-derived from the records, never hand-edited. `baseline gen index`
writes one (deterministic — sorted content, filename dates, no timestamps);
`baseline gen --check` regenerates every marked view and byte-compares, the
advisory CI drift guard. Zero marked views is trivially green.

## Idempotent
Safe to run more than once with the same result. An idempotent bootstrap can be
re-run on an already-set-up machine without breaking or duplicating state.

## Judgment ledger
`records/judgments/JDG-NNNN.json` — where a human records a decision a script
can't make: a `deviation`, a `risk-acceptance`, or a `break-glass` override of a
fail-closed admit/reconcile gate. Every judgment is dated, owned, scoped, reasoned,
and it **expires** (`review_by`); a `tripwire` voids it when the world it assumed
changes. A judgment records a decision — it never satisfies a rule. `baseline jdg
new` writes one, `baseline jdg check` evaluates the ledger.

## Keep a Changelog
A widely used convention for human-readable `CHANGELOG.md` files, including an
`Unreleased` section for changes not yet shipped. See <https://keepachangelog.com>.

## Lockfile
A file that pins the exact resolved version of every dependency
(`package-lock.json`, `yarn.lock`, `poetry.lock`). Committing it makes installs
reproducible across machines and time.

## Member
A plugin a repo has adopted into its [trust circle](#trust-circle): its name is a
key of `baseline.config.json` `plugins`. A member's rule gates — the build fails on
a missing artifact or a git state the config denies. A plugin that is not a member
is a suggestion ([n/a](#na), never a failure).

## n/a
The state of a rule that was **in scope but could not be evaluated here** — no
subject in the tree, a plugin not adopted, the forge closed, an evaluator that
returned nothing. In `--json` it is `{ "state": "n/a", "reason" }` with a non-empty
reason; the human render shows nothing, and `summary.total` counts evaluated rows
only.

## OIDC
**OpenID Connect** — here, the mechanism that lets a CI job exchange a
short-lived identity token for cloud/registry access instead of storing
long-lived secrets. Reduces the blast radius of a leak.

## OpenSSF Scorecard
An open-source tool from the Open Source Security Foundation that scores a repo
on security best practices (branch protection, pinned actions, signed releases,
etc.). One of the prior-art sources the baseline was pressure-tested against.

## Orient
The session-start survey — `baseline orient` — five derived lines (`repo:` ·
`work:` · `graph:` · `knowledge:` · `score:`), read-only, exit 0 always. It fetches
first and notes how far behind origin the branch is, but never pulls, never spawns
`gh`, and changes no file, branch or history.

## Plugin
One of the tools baseline suggests and never requires: **obsidian-tdd** (what is
open — `tdd.json`), **graphify** (what is where — `graphify-out/`) and **okf-rag**
(why it matters — a knowledge bundle at `$BASELINE_OKF_BUNDLE`, `get_knowledge()`
for agents). baseline imports no code from them and reads their artifacts as
**metadata only** — exists, file or directory, mtime, gitignore state — never the
content. Each is one rule (`PLUG-01/02/03`), a [blocker](#blocker) only for a
[member](#member): adopted-and-absent → the finding names the install command and
never runs it; a git state the config denies → the mismatch. Otherwise PASS or n/a.
`baseline explain` may display an okf concept; display is not a verdict.

## Provenance
Verifiable evidence of where an artifact came from and how it was built — for
releases, a signed record linking a published artifact to the exact source and
build that produced it.

## Reconcile
`baseline reconcile` — post-merge revalidation of the default branch on cron.
Read-only toward the repo; its write surface is the issue tracker, where findings
live as `baseline`-labeled issues under a dedup lifecycle (file → comment on change
→ close when positively re-evaluated ok → reopen on recurrence). Findings never
redden the cron; a cron that cannot deliver does. It keeps the live forge probe
`check` and `orient` do not have.

## repolinter
An open-source tool (originally from GitHub) that checks a repository against
configurable structural rules (required files, license, etc.). Prior art the
baseline drew on.

## SAST
**Static Application Security Testing** — automated scanning of source code for
security flaws without running it (e.g. CodeQL, Semgrep), typically wired into CI.

## SBOM
**Software Bill of Materials** — a machine-readable inventory of every component
and dependency in a build (formats like CycloneDX or SPDX), used to answer "am I
affected?" when a vulnerability drops.

## Scrub gate
`baseline scrub` — the secret-scan shared by `baseline log` and the pre-push hook
(`hooks/scrub-pre-push.sh`). Deterministic signatures (SEC-01 parity + JWT +
fine-grained PAT) **block**; heuristic findings **warn** and never block (severity
never exceeds certainty). A block is non-lossy — the draft survives under
`.baseline/cache/` and the exact rerun is printed; a false positive becomes a dated
allowlist judgment (`.baseline/scrub-allowlist.json`) via `--allow <finding-id>`.

## Secret scanning
Automated detection of committed credentials (API keys, tokens, private keys) in
the repo and its history, so leaked secrets are caught and rotated.

## SIGTERM
The polite "please stop" signal an operating system or orchestrator sends a
process before force-killing it. Well-behaved services trap it and shut down
gracefully.

## SLSA
**Supply-chain Levels for Software Artifacts** — a framework of graded
requirements for build integrity and [provenance](#provenance), aimed at
preventing tampering between source and release. See <https://slsa.dev>.

## Source scope
The globs a trust-circle member's derived artifact is meant to track —
`test_state_sources` (obsidian-tdd, CTX-16) and `knowledge_sources` (okf-rag,
CTX-17) in `baseline.config.json`. Opt-in by emptiness: baseline cannot guess what
a store covers, so an empty scope leaves the rule `n/a` rather than gating CI on a
guess. There is no day-threshold twin for either — "behind" is an ordering, not a
deadline.

## Stamp
A committed receipt under `.baseline/trust/<member>.json` that lets CI gate an
artifact it never sees. graphify's stamp carries per-file content hashes baseline
recomputes against the tracked tree (verifiable); okf-rag's is RECORDED-ONLY — a
claim baseline orders but cannot verify, and says so on every surface. Written by
`baseline trust stamp`, rechecked by `baseline trust verify`, committed like any
file.

## Structured logging
Emitting logs as machine-parseable records (usually JSON with consistent fields)
instead of free-form text, so they can be searched, filtered, and aggregated.

## Supply chain
Everything that goes into producing your software that you didn't write —
dependencies, base images, CI actions, build tools. "Supply-chain security" is
about trusting and verifying those inputs.

## Trust circle
The set of plugins a repo adopted — the opt-in half of the rule set, default out.
Adoption is a fact about the config (a `plugins` key), never a guess about the
tree; `baseline trust add|remove|setup` manages it, and `baseline trust wire`
installs the orientation entrypoint `.baseline/orient.sh` (CTX-19 checks its
byte-identity). Its mirror, the [baseline rules layer](#baseline-rules-layer), is
opt-out and default in.

## Twelve-Factor App
A well-known set of twelve principles for building portable, scalable web
services (config in the environment, stateless processes, etc.). See
<https://12factor.net>.
