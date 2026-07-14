# The Concept Register — baseline-skill × ADR-0009

> Inputs to the baseline-skill-V2 plan. 29 concepts extracted from two sources by a 9-agent crew (3 extractors, 6 adversarial critics), consolidated, then **online-verified by 58 agents** (one researcher + one adversarial quote-checker per concept; 2 independent sources each, quote + URL). 10 gap concepts (C30–C39) were proposed by a 3-lens gap crew and confirmed by skeptics.
>
> Sources: [baseline-skill v2.2.0](https://github.com/AdarGit008/baseline-skill) · GTA_6_CAD `docs/decisions/0009-multi-lane-context-model.md` (+ CLAUDE.md §7–8, live tooling)
>
> Generated 2026-07-09 · verification verdicts: **29/29 verified** (C26 repaired by orchestrator with canonical source after one checker flag) · 16 concepts carry honest *contested* notes.

## Index

| # | Concept | Framing | Verified | Contested |
|---|---|---|---|---|
| C01 | Derive state, don't store it | a | ✓ 2 sources | ⚠ yes |
| C02 | Don't trust a written promise — make something check it | a | ✓ 2 sources | ⚠ yes |
| C03 | Prove readiness by execution | a | ✓ 2 sources | — |
| C04 | Store only what cannot be derived | a | ✓ 2 sources | — |
| C05 | Stored derived views must be regenerable and marked | a | ✓ 2 sources | ⚠ yes |
| C06 | Tiered authority: ground truth > directive > forensic | b | ✓ 2 sources | ⚠ yes |
| C07 | Gate severity tracks check certainty | b | ✓ 2 sources | ⚠ yes |
| C08 | Human judgment leaves a dated, checkable record | b | ✓ 2 sources | — |
| C09 | One home per fact, declared precedence | b | ✓ 2 sources | ⚠ yes |
| C10 | Branchwise isolation via lane namespaces | c | ✓ 2 sources | ⚠ yes |
| C11 | Contextwise isolation: stateless contexts re-derive from origin | c | ✓ 2 sources | ⚠ yes |
| C12 | Sessionwise isolation: append-only per-session records | c | ✓ 2 sources | — |
| C13 | Collision-freedom by construction, not vigilance | c | ✓ 2 sources | ⚠ yes |
| C14 | Data rides the branch to main | d | ✓ 2 sources | ⚠ yes |
| C15 | No issue, no work — no fast-path | a+b | ✓ 2 sources | ⚠ yes |
| C16 | Orientation is automatic default behavior | a | ✓ 2 sources | ⚠ yes |
| C17 | One owned record per unit | c+a | ✓ 2 sources | ⚠ yes |
| C18 | Rules as data, generic engine | skill | ✓ 2 sources | ⚠ yes |
| C19 | The gate validates itself | skill | ✓ 2 sources | — |
| C20 | Fail-safe degradation on untrusted input | skill | ✓ 2 sources | ⚠ yes |
| C21 | Run only what fits; a skip never counts against you | skill | ✓ 2 sources | — |
| C22 | Check load-bearing behavior, not artifact presence | skill | ✓ 2 sources | ⚠ yes |
| C23 | External claims as a structured, decaying, falsifiable register | skill | ✓ 2 sources | ⚠ yes |
| C24 | Drift climbs the stack as a project matures | skill | ✓ 2 sources | ⚠ yes |
| C25 | A standard earns its rules adversarially | skill | ✓ 2 sources | — |
| C26 | Replacement before removal | ADR | ✓ 2 sources | — |
| C27 | Audit and scaffold are two faces of one rule set | skill | ✓ 2 sources | ⚠ yes |
| C28 | The process degrades gracefully without the favored tooling | ADR | ✓ 2 sources | ⚠ yes |
| C29 | Declare the ground-truth boundary: at-rest tree vs live forge | a (boundary condition) | ✓ 2 sources | — |
| C30 | GAP: Merge-point revalidation | gap | skeptic-confirmed | — |
| C31 | GAP: Ownership is a lease, not a deed | gap | skeptic-confirmed | — |
| C32 | GAP: Main is the only rendezvous | gap | skeptic-confirmed | — |
| C33 | GAP: Declared behavior under source unavailability | gap | skeptic-confirmed | — |
| C34 | GAP: Records are public-forever at write time | gap | skeptic-confirmed | — |
| C35 | GAP: Check-then-act atomicity | gap | skeptic-confirmed | — |
| C36 | GAP: Cross-tier divergence is a detected signal | gap | skeptic-confirmed | — |
| C37 | GAP: Reconciliation loop catches drift | gap | skeptic-confirmed | — |
| C38 | GAP: Derivation is a join — declare the keys | gap | skeptic-confirmed | — |
| C39 | GAP: The repo declares itself | gap | skeptic-confirmed | — |


## (a) Derive state from actions / work / spec / formal docs

### C01-derive-dont-store — Derive state, don't store it

**Claim.** Project status and resume state should be computed on demand from ground truth (git history, open PRs, open issues, per-unit records) rather than hand-maintained in a status file; a stored status blob inevitably goes stale and, under concurrent writers, becomes a collision magnet.

**Origin.** ADR-0009 (skill's CTX-01 is the anti-example)

**Verified online** (verified):

- **[SUPPORTS]** [martinfowler.com — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — verified
  > "We can discard the application state completely and rebuild it by re-running the events from the event log on an empty application."

- **[SUPPORTS]** [OpenGitOps (CNCF) — OpenGitOps — GitOps Principles v1.0.0](https://opengitops.dev/) — verified
  > "Software agents continuously observe actual system state and attempt to apply the desired state."

**Contested — honest counter-position.** Mildly. The strongest counter-position is the performance/materialization argument, acknowledged on the very same canonical page (https://martinfowler.com/eaaDev/EventSourcing.html): deriving state on demand "is a slow process, particularly if there are many events," so mature event-sourced and CQRS systems deliberately store snapshots and read models — stored derived state is legitimate when it is a rebuildable, non-authoritative cache. This does not defend hand-maintained status files (nobody canonical defends those), but it does contest a strict "compute everything on demand" reading; for a 69-rule CI checker over git/GitHub APIs, on-demand derivation cost and API rate limits are the real trade-off to watch.

### C02-checklist-as-exit-code — Don't trust a written promise — make something check it

**Claim.** A standard is only trustworthy if enforced as executable checks with an exit code in CI (policy-as-code); a prose checklist inevitably drifts from practice.

**Origin.** baseline-skill

**Verified online** (verified):

- **[SUPPORTS]** [Open Policy Agent (CNCF) — OPA Documentation: Philosophy](https://www.openpolicyagent.org/docs/philosophy) — verified
  > "Software services should allow policies to be specified declaratively, updated at any time without recompiling or redeploying, and enforced automatically (which is especially valuable when decisions need to be made faster than humanly possible)."

- **[COMPLICATES]** [Google SRE — Site Reliability Engineering, Ch. 27: Reliable Product Launches at Scale](https://sre.google/sre-book/reliable-product-launches/) — verified
  > "The checklist needs continuous attention in order to remain relevant and up-to-date: recommendations change over time, internal systems are replaced by different systems, and areas of concern from previous launches become obsolete due to new policies and processes."

**Contested — honest counter-position.** Partially. The drift claim is uncontroversial, but 'only executable checks are trustworthy' is contested by the human-curated-checklist tradition: Google SRE's Launch Coordination Engineers kept a prose launch checklist effective at scale via disciplined curation and gatekeeping (https://sre.google/sre-book/reliable-product-launches/), and the broader Checklist Manifesto tradition (aviation, surgery) shows non-executable checklists reliably change outcomes when reviewed by accountable humans. The strongest counter-position: many high-value checks (e.g. 'is your capacity plan sane', 'does this launch have a rollback story') resist encoding as exit codes, and forcing everything into automation biases a standard toward only what is cheaply machine-checkable.

### C03-prove-by-execution — Prove readiness by execution

**Claim.** The strongest readiness proof is executing the project's bootstrap/test command on a clean checkout; artifact presence is a weak proxy for a working build.

**Origin.** baseline-skill (BUILD-05 crown check)

**Verified online** (verified):

- **[SUPPORTS]** [martinfowler.com (Martin Fowler) — Continuous Integration](https://martinfowler.com/articles/continuousIntegration.html) — verified
  > "I should be able to walk up with a laptop loaded with only an operating system, and by using the repository, obtain everything I need to build and run the product."

- **[SUPPORTS]** [Joel on Software (Joel Spolsky) — The Joel Test: 12 Steps to Better Code](https://www.joelonsoftware.com/2000/08/09/the-joel-test-12-steps-to-better-code/) — verified
  > "On good teams, there’s a single script you can run that does a full checkout from scratch, rebuilds every line of code, makes the EXEs, in all their various versions, languages, and #ifdef combinations, creates the installation package, and creates the final media — CDROM layout, download website, whatever."

### C04-store-only-intent — Store only what cannot be derived

**Claim.** Persist only what cannot be derived — human intent, decisions, judgment; derive everything else. Stored copies of derivable state are drift liabilities.

**Origin.** both

**Verified online** (verified):

- **[SUPPORTS]** [OpenGitOps (CNCF GitOps Working Group) — OpenGitOps — GitOps Principles v1.0.0](https://opengitops.dev/) — verified
  > "Software agents continuously observe actual system state and attempt to apply the desired state."

- **[SUPPORTS]** [martinfowler.com — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — verified
  > "We can discard the application state completely and rebuild it by re-running the events from the event log on an empty application."

### C05-regenerable-derived-views — Stored derived views must be regenerable and marked

**Claim.** Committed derived artifacts (indexes, generated docs) are legitimate only when mechanically regenerable, marked as generated (DO-NOT-EDIT provenance), and guarded against hand-edit drift.

**Origin.** both (CTX-08; GTA_6_CAD M-index gen-doc-indexes.mjs)

**Verified online** (verified):

- **[SUPPORTS]** [Go project (go.dev) — cmd/go — Generate Go files by processing source](https://pkg.go.dev/cmd/go) — verified
  > "To convey to humans and machine tools that code is generated, generated source should have a line that matches the following regular expression (in Go syntax): ^// Code generated .* DO NOT EDIT\.$ This line must appear before the first non-comment, non-blank text in the file."

- **[SUPPORTS]** [Reproducible Builds project — Reproducible Builds](https://reproducible-builds.org/) — verified
  > "Reproducible builds are a set of software development practices that create an independently-verifiable path from source to binary code."

**Contested — honest counter-position.** Partially. The 'regenerable and marked' criteria themselves are uncontroversial, but whether derived artifacts should be committed at all is genuinely contested: the mainstream counter-position holds that generated files should be excluded from version control entirely and regenerated by the build/CI, since they invite conflicts, drift, and unreviewable diffs — e.g. Michael Ernst's 'Version control concepts and best practices' (https://homes.cs.washington.edu/~mernst/advice/version-control.html) and https://perlmaven.com/dont-keep-generated-files-in-version-control. The principle as stated ('legitimate only when regenerable, marked, and drift-guarded') is the standard compromise position when committing is unavoidable.

### C15-no-ticket-no-work — No issue, no work — no fast-path

**Claim.** Every change is anchored to a tracked work item before work begins, with deliberately no fast-path exceptions — the audit/derivation chain is only as complete as its weakest exemption.

**Origin.** ADR-0009 Rule 2

**Verified online** (verified):

- **[COMPLICATES]** [GitHub (github.blog, Philip Holleran) — Demonstrating end-to-end traceability with pull requests](https://github.blog/enterprise-software/governance-and-compliance/demonstrating-end-to-end-traceability-with-pull-requests/) — verified
  > "Unplanned work happens. Typos, minor UI corrections, and small bug fixes may not have associated issues when they are addressed. Since pull requests can be tracked and planned in GitHub Projects and can include rich context, just like issues, you may find requiring every change to have an associated issue to be redundant."

- **[COMPLICATES]** [DORA (dora.dev / Google Cloud) — DORA Capabilities: Streamlining change approval](https://dora.dev/capabilities/streamlining-change-approval/) — verified
  > "Traditionally, these goals have been met through a heavyweight process involving approval by people external to the team proposing the change: a change advisory board (CAB) or a senior manager. However, DORA's research shows that these approaches have a negative impact on software delivery performance."

**Contested — honest counter-position.** Yes — genuinely contested. The strongest counter-position is GitHub's own governance guidance (https://github.blog/enterprise-software/governance-and-compliance/demonstrating-end-to-end-traceability-with-pull-requests/): requiring every change to have an associated issue can be redundant because unplanned work happens and the PR itself already provides a tracked, auditable work record — i.e., traceability of every change is the requirement; a pre-work ticket for every change is one (optional) implementation. DORA's research reinforces this: exceptionless heavyweight gates degrade delivery performance with no measured reduction in change-fail rate. Chromium's contributing docs similarly state bugs are unnecessary for sufficiently isolated changes.

### C16-orientation-automatic — Orientation is automatic default behavior

**Claim.** Orientation/context-restore should be automatic default behavior at session start, not a command a human must remember to run.

**Origin.** ADR-0009 Rule 4 (orient.mjs prototype)

**Verified online** (verified):

- **[SUPPORTS]** [Google SRE (Site Reliability Engineering book, O'Reilly/Google) — Automation: Enabling Failure at Scale — Chapter 7, Site Reliability Engineering](https://sre.google/sre-book/automation-at-google/) — verified
  > "In most common cases, where, for example, failover or traffic switching can be well defined for a particular application, it makes no sense to effectively require a human to intermittently press a button called “Allow system to continue to run.”"

- **[SUPPORTS]** [OpenGitOps (CNCF GitOps Working Group) — GitOps Principles v1.0.0](https://opengitops.dev/) — verified
  > "Pulled Automatically Software agents automatically pull the desired state declarations from the source."

**Contested — honest counter-position.** Partially. The strongest counter-position is the "ironies of automation" line, stated in the same Google SRE chapter (https://sre.google/sre-book/automation-at-google/): when automation invisibly covers daily activities, "human operators are progressively more relieved of useful direct contact with the system," their mental models decay, and when the automation fails they cannot recover — i.e., fully automatic context-restore can erode the operator's (or agent's) own understanding and mask staleness/failure of the orientation step itself. This complicates "automatic by default" but does not refute it; the SRE remedy is autonomy plus introspection/observability, not reverting to manual commands.

### C29-at-rest-vs-forge — Declare the ground-truth boundary: at-rest tree vs live forge

**Claim.** A checker must declare its ground-truth boundary: the at-rest tree (offline, deterministic, reproducible) vs live forge data (PRs/issues — complete but networked and mutable). Derived-state models need forge data; at-rest models need stored proxies — this is the fundamental trade a derived-state redesign must resolve.

**Origin.** both — the central V2 trade

**Verified online** (verified):

- **[SUPPORTS]** [OpenGitOps (CNCF GitOps Working Group) — GitOps Principles v1.0.0](https://opengitops.dev/) — verified
  > "Desired state is stored in a way that enforces immutability, versioning and retains a complete version history."

- **[COMPLICATES]** [OpenSSF — OpenSSF Scorecard README](https://github.com/ossf/scorecard) — verified
  > "GitHub imposes api rate limits on unauthenticated requests. To avoid these limits, you must authenticate your requests before running Scorecard."


## (b) Tier hierarchy

### C06-tiered-authority — Tiered authority: ground truth > directive > forensic

**Claim.** Conflicting records need a declared authority order: ground truth (merged code/history) beats directives (work items) beats forensic narrative (session notes) — and the lowest tier can still be authoritative where it is the sole source (mid-flight pause state).

**Origin.** ADR-0009

**Verified online** (verified):

- **[SUPPORTS]** [martinfowler.com (Martin Fowler) — Code As Documentation](https://martinfowler.com/bliki/CodeAsDocumentation.html) — verified
  > "The rationale for the code being the primary source of documentation is that it is the only one that is sufficiently detailed and precise to act in that role"

- **[COMPLICATES]** [Cognitect (Michael Nygard) — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — verified
  > "One of the hardest things to track during the life of a project is the motivation behind certain decisions."

**Contested — honest counter-position.** Partially. The exact three-tier ordering appears original to ADR-0009 (no field-canonical statement of 'ground truth > directive > forensic' was found), and the underlying primacy-of-code idea is genuinely debated: the strongest counter-position is the ADR/documentation-as-decision-record school (Michael Nygard, https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), which holds that code cannot express rationale, so narrative records are not merely subordinate — for intent and motivation they are the only authority. The concept's sole-source clause already concedes this, which weakens but does not eliminate the tension when a narrative record contradicts code about intended behavior.

### C07-severity-by-certainty — Gate severity tracks check certainty

**Claim.** Only deterministic, unambiguous checks should hard-block a merge; ambiguous or judgment-dependent signals should warn or route to explicit human sign-off.

**Origin.** baseline-skill

**Verified online** (verified):

- **[SUPPORTS]** [Google (Software Engineering at Google, O'Reilly, free online via abseil.io) — Static Analysis (Software Engineering at Google, Chapter 20)](https://abseil.io/resources/swe-book/html/ch20.html) — verified
  > "Produce no effective false positives (the analysis should never stop the build for correct code)"

- **[SUPPORTS]** [martinfowler.com — Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html) — verified
  > "The general approach with quarantine is to take the quarantined tests out of the main deployment pipeline so that you still get your regular build process."

**Contested — honest counter-position.** Partially. The core "deterministic-only hard blocks" idea is broadly accepted, but the "ambiguous signals should warn" half has a strong counter-position from Google itself: "We have found repeatedly that developers ignore compiler warnings. We either enable a compiler check as an error (and break the build) or don't show it in compiler output" (https://abseil.io/resources/swe-book/html/ch20.html). I.e., a standing warn tier degrades into noise; uncertain findings should be routed to a human decision point (code review) rather than emitted as warnings. A second, opposite pressure comes from continuous-deployment advocates who argue human sign-off gates are bottlenecks and push to make more checks deterministic/automated rather than adding human routing.

### C08-judgment-as-record — Human judgment leaves a dated, checkable record

**Claim.** Human judgment calls (risk acceptance, waivers, deviations from a standard) must leave a dated, structured, machine-checkable record rather than living in memory or chat.

**Origin.** baseline-skill (signoff.json) + GTA_6_CAD (deviation ledger)

**Verified online** (verified):

- **[SUPPORTS]** [Cognitect (Michael Nygard) — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — verified
  > "One of the hardest things to track during the life of a project is the motivation behind certain decisions. A new person coming on to a project may be perplexed, baffled, delighted, or infuriated by some past decision."

- **[SUPPORTS]** [OpenVEX (OpenSSF/Chainguard community) — OpenVEX Specification](https://github.com/openvex/spec/blob/main/OPENVEX-SPEC.md) — verified
  > "A statement is useless without a timestamp as it cannot be related to others talking about the same subject."

### C09-one-home-per-fact — One home per fact, declared precedence

**Claim.** Every fact gets exactly one canonical home with declared precedence; all other documents link to it instead of duplicating it.

**Origin.** both (CTX-03; knowledge-ledger precedence)

**Verified online** (verified):

- **[SUPPORTS]** [The Pragmatic Bookshelf (Hunt & Thomas) — Pragmatic Programmer Tips — Tip #15: DRY—Don't Repeat Yourself](https://pragprog.com/tips/) — verified
  > "Every piece of knowledge must have a single, unambiguous, authoritative representation within a system."

- **[COMPLICATES]** [GitLab (Documentation Style Guide) — Documentation Style Guide — Documentation is the single source of truth (SSoT)](https://docs.gitlab.com/development/documentation/styleguide/) — verified
  > "The GitLab documentation is the SSoT for all product information related to implementation, use, and troubleshooting."

**Contested — honest counter-position.** Partially. Strict deduplication is contested: Sandi Metz's "The Wrong Abstraction" (https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) argues "duplication is far cheaper than the wrong abstraction" — premature consolidation into one canonical home can be worse than tolerated duplication. GitLab's own SSoT policy echoes this by explicitly permitting duplicated content in multiple places for findability, while keeping one authoritative source.


## (c) Isolation — branchwise, contextwise, sessionwise

### C10-branch-namespace-isolation — Branchwise isolation via lane namespaces

**Claim.** Concurrent workers/lanes get collision-free branch namespaces and one-writer-per-branch ownership, so parallel work cannot contend on names or files.

**Origin.** ADR-0009 Rule 5

**Verified online** (verified):

- **[SUPPORTS]** [Anthropic (Claude Code docs) — Common workflows — Run parallel sessions with worktrees](https://code.claude.com/docs/en/common-workflows) — verified
  > "Work on a feature in one terminal while Claude fixes a bug in another, without the edits colliding. Each worktree is a separate checkout on its own branch."

- **[COMPLICATES]** [martinfowler.com (Martin Fowler) — Patterns for Managing Source Code Branches](https://martinfowler.com/articles/branching-patterns.html) — verified
  > "Branching is about managing the interplay of isolation and integration. Having everyone work on a single shared codebase all the time, doesn't work because I can't compile the program if you're in the middle of typing a variable name. So at least to some degree, we need a notion of a private workspace that I can work on for a while."

**Contested — honest counter-position.** Partly. Nobody disputes that collision-free branch namespaces prevent name/file contention, but the trunk-based-development / continuous-integration school (https://martinfowler.com/articles/branching-patterns.html; https://trunkbaseddevelopment.com/) argues isolation is a liability if branches live long: semantic conflicts between lanes are merely deferred, not prevented ("integration fear"), so isolation must be bounded by frequent merges to mainline. This complicates, rather than refutes, the principle — it constrains lane lifetime, not lane namespacing.

### C11-stateless-context-rederive — Contextwise isolation: stateless contexts re-derive from origin

**Claim.** Workers (clones, sessions, agents) are stateless by construction: each re-derives its context at start from the shared remote source of truth and coordinates only through pushed records — never through local side-channel state.

**Origin.** ADR-0009 + user generalization (clones→agent contexts); caveat: Claude memory is a sanctioned side channel in GTA_6_CAD

**Verified online** (verified):

- **[SUPPORTS]** [The Twelve-Factor App (Adam Wiggins / Heroku) — The Twelve-Factor App — VI. Processes: Execute the app as one or more stateless processes](https://12factor.net/processes) — verified
  > "Twelve-factor processes are stateless and share-nothing. Any data that needs to persist must be stored in a stateful backing service, typically a database."

- **[SUPPORTS]** [OpenGitOps (CNCF GitOps Working Group) — OpenGitOps — GitOps Principles v1.0.0](https://opengitops.dev/) — verified
  > "Software agents automatically pull the desired state declarations from the source."

**Contested — honest counter-position.** Mildly. The strongest counter-position is the local-first / stateful-worker school: Ink & Switch's "Local-first software" (https://www.inkandswitch.com/essay/local-first/) argues that treating local state as first-class (synced via CRDTs) rather than as an illegitimate side channel gives availability, latency, and ownership benefits that pure re-derive-from-origin architectures sacrifice; similarly, durable-execution systems (Temporal) deliberately make worker state durable rather than re-derived. These complicate the principle's absolutism but do not refute it for CI/repo-governance contexts, where a single authoritative remote source is the norm.

### C12-session-scoped-records — Sessionwise isolation: append-only per-session records

**Claim.** Each work session appends its own record at a unique path (per-branch, per-day, per-session) — an append-only journal — rather than editing a shared mutable log.

**Origin.** ADR-0009 Rule 3

**Verified online** (verified):

- **[SUPPORTS]** [GitLab (about.gitlab.com) — How we solved GitLab's CHANGELOG conflict crisis](https://about.gitlab.com/blog/2018/07/03/solving-gitlabs-changelog-conflict-crisis/) — verified
  > "As GitLab gained in popularity and started receiving more contributions, we'd constantly see merge conflicts in the changelog when multiple merge requests attempted to add an entry to the list."

- **[SUPPORTS]** [martinfowler.com — Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — verified
  > "Event Sourcing ensures that all changes to application state are stored as a sequence of events."

### C13-collision-free-by-construction — Collision-freedom by construction, not vigilance

**Claim.** Concurrency safety should come from structure (unique paths, single ownership, append-only) that makes collisions unrepresentable, not from coordination vigilance or merge-conflict resolution.

**Origin.** ADR-0009

**Verified online** (verified):

- **[SUPPORTS]** [crdt.tech (Kleppmann et al.) — About CRDTs — Conflict-free Replicated Data Types](https://crdt.tech/) — verified
  > "CRDTs ensure that, no matter what data modifications are made on different replicas, the data can always be merged into a consistent state. This merge is performed automatically by the CRDT, without requiring any special conflict resolution code or user intervention."

- **[COMPLICATES]** [martinfowler.com — Patterns for Managing Source Code Branches](https://martinfowler.com/articles/branching-patterns.html) — verified
  > "But often conflicts appear where the text merges without a problem, but the system still doesn't work. Imagine Scarlett changes the name of a function, and Violet adds some code to her branch that calls this function under its old name. This is what I call a Semantic Conflict."

**Contested — honest counter-position.** Partially. The continuous-integration school (Fowler, https://martinfowler.com/articles/branching-patterns.html) argues that no structural partitioning can make all collisions unrepresentable, because semantic conflicts survive clean textual merges; their counter-position is that safety must come from vigilance-style practices — integrating frequently and running tests — not from structure alone. This complicates but does not refute the principle for the mechanical/write-collision layer (unique paths, append-only, single ownership), where by-construction safety is uncontroversial (e.g. CRDTs).

### C17-record-per-unit — One owned record per unit

**Claim.** One structured record per unit of work (per-decision ADR files, per-claim entries, per-session logs) beats monolithic documents: independent lifecycle, single writer, mergeable by construction.

**Origin.** both (per-ADR files, CLAIMS entries, session logs)

**Verified online** (verified):

- **[SUPPORTS]** [Michael Nygard / Cognitect — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — verified
  > "We will keep ADRs in the project repository under doc/arch/adr-NNN.md"

- **[SUPPORTS]** [OpenStack (reno) — reno: Design Constraints](https://docs.openstack.org/reno/latest/user/design.html) — verified
  > "We want to avoid merge issues when shepherding in a lot of release-note-worthy changes, which we expect to happen on stable branches always, and at release times on master branches."

**Contested — honest counter-position.** Mildly. The strongest counter-position is Keep a Changelog (https://keepachangelog.com/en/1.1.0/), which advocates a single curated CHANGELOG.md optimized for readers, arguing changelogs are "for humans" — a monolithic curated document trades writer mergeability for reader coherence. A second nuance: GitLab abandoned per-MR changelog-entry files in favor of generating changelogs from Git commit trailers (https://docs.gitlab.com/development/changelog/), suggesting the endpoint of the underlying principle may be 'derive the record from ground truth (commits)' rather than 'store one record file per unit'.


## (d) Data rides branch to main

### C14-data-rides-branch — Data rides the branch to main

**Claim.** Records and docs travel with the change: committed on the work branch, updated in the same PR that changes the state they describe, landing atomically on main at merge.

**Origin.** ADR-0009 Rule 3 + same-PR atomicity (CLAUDE.md/workflows)

**Verified online** (verified):

- **[SUPPORTS]** [Google (google.github.io styleguide) — Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html) — verified
  > "Change your documentation in the same CL as the code change"

- **[SUPPORTS]** [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) — verified
  > "You can block merging of new features if they don’t include documentation, which incentivizes developers to write about features while they are fresh"

**Contested — honest counter-position.** Mildly. The atomicity ideal is broadly accepted, but real docs-as-code practice often splits: large projects (e.g. Kubernetes, whose docs live in the separate kubernetes/website repo) keep docs in a dedicated repo for tooling/reviewer-ownership reasons, breaking same-PR atomicity and requiring cross-repo sync; and strict 'no merge without docs' gates are criticized for slowing urgent fixes. No single canonical counter-manifesto found, so no URL cited.


## Baseline-skill-native DNA

### C18-rules-as-data — Rules as data, generic engine

**Claim.** Encode rules/policies as declarative data evaluated by a small generic engine, so the rule set evolves without engine changes and rules stay introspectable (rationale, fix, source as fields).

**Origin.** baseline-skill (rules.json + ~36 check kinds)

**Verified online** (verified):

- **[SUPPORTS]** [Open Policy Agent (CNCF) — OPA Documentation: Philosophy](https://www.openpolicyagent.org/docs/philosophy) — verified
  > "Software services should allow policies to be specified declaratively, updated at any time without recompiling or redeploying, and enforced automatically"

- **[COMPLICATES]** [martinfowler.com — Rules Engine (bliki, 2009)](https://martinfowler.com/bliki/RulesEngine.html) — verified
  > "So I often hear that it was easy to set up a rules system, but very hard to maintain it because nobody can understand this implicit program flow. This is the dark side of leaving the imperative computational model."

**Contested — honest counter-position.** Yes. The strongest counter-position is Martin Fowler's "Rules Engine" (https://martinfowler.com/bliki/RulesEngine.html): "there's a lot to be said for avoiding rules engine products" — declarative rules create implicit program flow that is easy to set up but hard to maintain, so rules should be few, non-chaining, and confined to a narrow domain-specific context. This contests general-purpose rules engines rather than the baseline-skill design specifically; a small fixed vocabulary of ~36 check kinds with flat, independent rules is close to Fowler's recommended mitigation.

### C19-self-validating-gates — The gate validates itself

**Claim.** A quality gate must validate itself (self-check of its rule set, self-tests of its guards, enforcement on its own repo) so the enforcement layer cannot silently rot.

**Origin.** baseline-skill (--self-check, BUILD-06) + GTA_6_CAD selfTest() house pattern

**Verified online** (verified):

- **[SUPPORTS]** [Open Policy Agent (CNCF) — Policy Testing](https://www.openpolicyagent.org/docs/policy-testing) — verified
  > "To help you verify the correctness of your policies, OPA also gives you a framework that you can use to write tests for your policies."

- **[SUPPORTS]** [pitest.org (Henry Coles / PIT mutation testing) — PIT Mutation Testing](https://pitest.org/) — verified
  > "Traditional test coverage (i.e line, statement, branch, etc.) measures only which code is executed by your tests. It does not check that your tests are actually able to detect faults in the executed code."

### C20-fail-safe-degradation — Fail-safe degradation on untrusted input

**Claim.** A robust checker treats the audited repo as untrusted input and degrades unevaluable checks to an explicit SKIP rather than crashing — but each degradation is a fail-open channel that must be visible and bounded for blocker-severity gates.

**Origin.** baseline-skill (SKIP-not-crash; pushback: fail-open channels)

**Verified online** (verified):

- **[COMPLICATES]** [OWASP — Fail securely](https://owasp.org/www-community/Fail_securely) — verified
  > "Handling errors securely is a key aspect of secure coding. There are two types of errors that deserve special attention. The first is exceptions that occur in the processing of a security control itself. It's important that these exceptions do not enable behavior that the countermeasure would normally not allow."

- **[SUPPORTS]** [Kubernetes (CNCF) — Dynamic Admission Control](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/) — verified
  > "failurePolicy defines how unrecognized errors and timeout errors from the admission webhook are handled. Allowed values are Ignore or Fail. Ignore means that an error calling the webhook is ignored and the API request is allowed to continue. Fail means that an error calling the webhook causes the admission to fail and the API request to be rejected."

**Contested — honest counter-position.** Partially. The 'fail closed on blocker gates' half is genuinely contested on availability grounds: in the Kubernetes admission-webhook community, many operators deliberately set failurePolicy: Ignore (fail-open) because a fail-closed webhook outage can block all cluster changes, including the fix itself — the same Kubernetes docs page (https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/) warns that failing open/closed trades enforcement guarantees against cluster availability. The counter-position: for infrastructure-critical gates, fail-open with monitoring beats fail-closed self-inflicted outage. The SKIP-not-crash half itself is not seriously contested.

### C21-run-only-what-fits — Run only what fits; a skip never counts against you

**Claim.** Rules declare applicability (project type, profile, opt-in); a rule that doesn't apply skips visibly and never counts against the score — that's how a standard scales in size without scaling noise.

**Origin.** baseline-skill (applies_to × profiles × opt-in)

**Verified online** (verified):

- **[SUPPORTS]** [pytest (pytest-dev) — How to use skip and xfail to deal with tests that cannot succeed](https://docs.pytest.org/en/stable/how-to/skipping.html) — verified
  > "A skip means that you expect your test to pass only if some conditions are met, otherwise pytest should skip running the test altogether. Common examples are skipping windows-only tests on non-windows platforms, or skipping tests that depend on an external resource which is not available at the moment (for example a database)."

- **[COMPLICATES]** [GitHub Docs — Troubleshooting required status checks — Handling skipped but required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) — verified
  > "If a workflow is skipped due to path filtering, branch filtering or a commit message, then checks associated with that workflow will remain in a \"Pending\" state. ... If, however, a job within a workflow is skipped due to a conditional, it will report its status as \"Success\"."

### C22-check-behavior-not-presence — Check load-bearing behavior, not artifact presence

**Claim.** Verify the load-bearing property (linter actually enforced, CI actually runs tests), not artifact presence; presence checks invite checkbox compliance (Goodhart's law).

**Origin.** baseline-skill (QUAL-04, BUILD-10; presence-theater aversion)

**Verified online** (verified):

- **[SUPPORTS]** [martinfowler.com — Test Coverage (bliki)](https://martinfowler.com/bliki/TestCoverage.html) — verified
  > "If you make a certain level of coverage a target, people will try to attain it. The trouble is that high coverage numbers are too easy to reach with low quality testing."

- **[SUPPORTS]** [OpenSSF — OpenSSF Scorecard — Check Documentation (CI-Tests)](https://github.com/ossf/scorecard/blob/main/docs/checks.md) — verified
  > "This check tries to determine if the project runs tests before pull requests are merged. It is currently limited to repositories hosted on GitHub, and does not support other source hosting repositories (i.e., Forges). This check only considers tests which run successfully."

**Contested — honest counter-position.** Partially. The strongest counter-position is pragmatic and visible inside OpenSSF Scorecard itself (https://github.com/ossf/scorecard/blob/main/docs/checks.md): several of its checks ARE presence checks (Security-Policy looks for a SECURITY.md file, License looks for a license file), because behavior verification is expensive, ecosystem-specific, and hard to automate reliably — Scorecard's own CI-Tests docs concede a low score "is not a definitive indication that the project is at risk" since many CI setups are undetectable. So the field accepts presence checks as a cheap floor where behavioral verification is infeasible; the principle is a preference ordering, not an absolute.

### C23-claims-register — External claims as a structured, decaying, falsifiable register

**Claim.** Externally visible claims (novelty, competitive, capability) belong in a structured register with build-state, blast-radius grading, dated prior-art passes, and resolvable citations — so claims decay visibly instead of silently going false.

**Origin.** baseline-skill (CLAIM-00..06)

**Verified online** (verified):

- **[SUPPORTS]** [OpenSSF (Security Insights working group) — Security Insights Specification](https://security-insights.openssf.org/) — verified
  > "Security Insights is a standardized YAML format that lets open source projects self-report their security practices, policies, and processes in a machine-processable way."

- **[SUPPORTS]** [in-toto (CNCF project) — in-toto Attestation Framework](https://github.com/in-toto/attestation) — verified
  > "The in-toto Attestation Framework provides a specification for generating verifiable claims about any aspect of how a piece of software is produced. Consumers or users of software can then validate the origins of the software, and establish trust in its supply chain, using in-toto attestations."

**Contested — honest counter-position.** Partially. The underlying principle (structured, dated, verifiable claims) is mainstream, but the strongest counter-position is that self-asserted registers drift from reality and should be replaced by derivation from observable state: OpenSSF Scorecard (https://github.com/ossf/scorecard) deliberately measures security posture from the repo itself rather than trusting self-reported files, and in-toto requires cryptographic attestation rather than self-assertion. This tension is internal to the V2 design itself ("derive state from ground truth, don't store it") — a stored claims register is exactly the kind of stored state the redesign otherwise rejects, mitigated only if CI actively re-checks claims (as Security Insights mitigates via required last-reviewed dates). No source contests the idea of tracking novelty/competitive claims specifically; that extension appears novel to baseline-skill and has no established prior art found.

### C24-drift-climbs — Drift climbs the stack as a project matures

**Claim.** As a project matures, the dominant failure shifts up the stack: from code/build to narrative docs to headline claims; scrutiny should shift with it.

**Origin.** baseline-skill (REFERENCE 'Why it's shaped this way')

**Verified online** (verified):

- **[SUPPORTS]** [Google (Software Engineering at Google, O'Reilly, free online edition) — Software Engineering at Google, Chapter 10: Documentation](https://abseil.io/resources/swe-book/html/ch10.html) — verified
  > "Just like old code can cause problems, so can old documents. Over time, documents become stale, obsolete, or (often) abandoned."

- **[COMPLICATES]** [M. M. Lehman & J. F. Ramil (Imperial College London; hosted by UT Austin ECE) — Metrics and Laws of Software Evolution — The Nineties View (FEAST)](https://users.ece.utexas.edu/~perry/work/papers/feast1.pdf) — verified
  > "The quality of E-type systems will appear to be declining unless they are rigorously maintained and adapted to operational environment changes."

**Contested — honest counter-position.** Partly. The strongest counter-position is Lehman's Laws of Software Evolution (Law II Increasing Complexity and Law VII Declining Quality, https://users.ece.utexas.edu/~migod — canonical open statement at https://users.ece.utexas.edu/~perry/work/papers/feast1.pdf): in mature E-type systems, code-level complexity and quality problems grow continuously unless rigorously counteracted, so mature projects cannot safely redirect scrutiny away from code toward docs and headline claims; scrutiny must be additive across layers, not a moving spotlight. No source was found asserting the specific three-stage ladder (code -> docs -> headline claims) as a named, established principle; it appears to be the baseline-skill's own synthesis.

### C25-adversarial-provenance — A standard earns its rules adversarially

**Claim.** A standard earns each rule adversarially: pressure-test candidates against field prior art and real incidents; every rule carries its source; candidates that check nothing get dropped.

**Origin.** baseline-skill (v1→v2 method)

**Verified online** (verified):

- **[SUPPORTS]** [Google SRE — Site Reliability Engineering, Ch. 6: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — verified
  > "Data collection, aggregation, and alerting configuration that is rarely exercised (e.g., less than once a quarter for some SRE teams) should be up for removal."

- **[SUPPORTS]** [OpenSSF — OpenSSF Scorecard — Check Documentation](https://github.com/ossf/scorecard/blob/main/docs/checks.md) — verified
  > "This page describes each Scorecard check in detail, including scoring criteria, remediation steps to improve the score, and an explanation of the risks associated with a low score."

### C26-replacement-before-removal — Replacement before removal

**Claim.** Migrations retire a load-bearing artifact only after its replacement and repointed gates are live (expand/contract, parallel change); removal is the last module, not the first.

**Origin.** ADR-0009 rollout (M-remove last)

**Verified online** (verified):

- **[SUPPORTS]** [martinfowler.com (Danilo Sato) — Parallel Change (bliki)](https://martinfowler.com/bliki/ParallelChange.html) — verified
  > "Once all usages have been migrated to the new version, you perform the contract phase to remove the old version and change the interface so that it only supports the new version."

- **[SUPPORTS]** [Prisma (Data Guide) — Using the expand and contract pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern) — paraphrase-not-verbatim
  > "Once all clients have been updated to stop writing to the original schema, you can safely delete the original data structure. This is the last step of the expand and contract pattern that completes the migration."

- **[SUPPORTS]** [martinfowler.com (Danilo Sato) — Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) — verified (orchestrator repair; replaced a paraphrase-flagged source)
  > "Parallel change, also known as expand and contract, is a pattern to implement backward-incompatible changes to an interface in a safe manner, by breaking the change into three distinct phases: expand, migrate, and contract."

### C27-scaffold-and-check — Audit and scaffold are two faces of one rule set

**Claim.** A standard should both audit and scaffold: every rule knows its fix, and the same tool that scores can generate the missing artifact — closing the loop from detection to remediation.

**Origin.** baseline-skill (modes: score/init/fix/explain; per-rule fix field)

**Verified online** (verified):

- **[SUPPORTS]** [ESLint (OpenJS Foundation) — Core Concepts - ESLint](https://eslint.org/docs/latest/use/core-concepts/) — verified
  > "Rules may optionally provide fixes for violations that they find. Fixes safely correct the violation without changing application logic."

- **[SUPPORTS]** [OpenRewrite (Moderne / open source) — Recipes - OpenRewrite Docs](https://docs.openrewrite.org/concepts-and-explanations/recipes) — verified
  > "A recipe represents a group of search and refactoring operations that can be applied to a Lossless Semantic Tree."

**Contested — honest counter-position.** Mildly contested. The strongest counter-position is the OpenSSF's deliberate separation of measurement from remediation: Scorecard (https://github.com/ossf/scorecard) only scores repos, while a separate tool, Allstar (https://github.com/ossf/allstar), handles policy enforcement/fixes — an architectural argument that an auditor should stay a neutral read-only measurer, with remediation authority in a distinct tool. Relatedly, ESLint's own docs concede fixes are optional and 'Not all problems are fixable using this option', so the fix-for-every-rule ideal degrades to fix-where-safe in practice.

### C28-tool-agnostic-degradation — The process degrades gracefully without the favored tooling

**Claim.** A workflow model must remain followable without its favored tooling: a plain-git contributor meets the same contract by reading the same records directly (progressive enhancement for process).

**Origin.** ADR-0009 Costs + CLAUDE.md non-Claude path

**Verified online** (verified):

- **[SUPPORTS]** [Cognitect (Michael Nygard) — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) — verified
  > "We will keep ADRs in the project repository under doc/arch/adr-NNN.md"

- **[SUPPORTS]** [GOV.UK Service Manual (Government Digital Service) — Using progressive enhancement](https://www.gov.uk/service-manual/technology/using-progressive-enhancement) — verified
  > "Progressive enhancement is a way of building websites and applications based on the idea that you should make your page work with HTML first."

**Contested — honest counter-position.** Mildly. The strongest counter-position comes from platform-engineering 'golden path / paved road' thinking (popularized by Spotify and Netflix): rather than keeping every workflow followable without the favored tooling, mandate one well-supported tooling path and treat off-road usage as unsupported, because maintaining a degraded parallel path adds cost and drift (e.g. https://engineering.atspotify.com/2020/08/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem/ — quote not independently verified against the page). A related web-side critique (Tom Dale's 'Progressive enhancement is dead' argument) holds that when the enhanced layer is the product, engineering a toolless fallback is wasted effort. Neither refutes C28 for repo governance, where the plain-git substrate already exists for free, but they show the general principle is not unanimous.


## Gap concepts (bonus): C30–C39 — confirmed by skeptics

> Three gap-finder lenses (scale/concurrency, failure-modes/trust, prior-art transplants) proposed 17 candidate gaps against the register; a tough-but-fair skeptic per lens ruled each. **10 real gaps accepted** (below; two lenses independently found the merge-point gap — merged), **4 real-but-deferred**, **1 already-covered**.

### C30 — GAP: Merge-point revalidation

**[G-scale-3 · lens: scale-concurrency]** A gate result is a statement about one tree at one moment; under concurrent lanes it decays the moment main moves. Merge admission must therefore be optimistic-concurrency-shaped: the checks re-run (or are proven still valid) against the candidate's merge with current main — ideally serialized through a merge queue — before landing, so main is never in a state the gates have not actually seen. Two independently green branches can compose into a red main; only the integration point can catch that.

- *Why V2 needs it:* C14 lands records atomically at merge and C02 makes the checklist an exit code, but every check in the current model runs against the branch snapshot. At N>2 lanes and high merge rates, semantically conflicting-but-textually-clean merges become routine, and the derived state on main (which every stateless worker re-derives from, per C11) is computed from a tree no gate ever validated. This silently breaks C01's premise that ground truth is trustworthy. V2's authority model needs the merge point named as its own validation stage.
- *Prior art:* Graydon Hoare's 'Not Rocket Science' rule and Rust's Bors (https://graydon2.dreamwidth.org/1597.html); GitHub merge queue (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue); OpenStack Zuul speculative gating (https://zuul-ci.org/); Uber's SubmitQueue paper (probabilistic speculation at scale).
**[G-PA-5 · lens: prior-art-transplant]** Isolation makes parallel work safe to write but not safe to land: two lanes each green against an old main can be red combined — semantic skew in code, record schemas, or rule sets that textual merge never detects. The gate must therefore evaluate the predicted post-merge tree (speculative merge), and landings must serialize through a queue, so the default branch is never in a state the checker has not actually seen.

- *Why V2 needs it:* V2's core motion is many concurrent lanes carrying records to main (C10–C14), and C13 explicitly promises collision-freedom by construction — but namespacing only prevents write collisions, not landing-order skew (lane A renames a record field while lane B adds records in the old schema; both merge cleanly, main is red). This is a landing-time problem no amount of branch isolation solves, and the register currently has no landing-time concept at all.
- *Prior art:* Graydon Hoare's 'Not Rocket Science Rule' and the original bors (https://graydon2.dreamwidth.org/1597.html); bors-ng; GitHub Merge Queue (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue); OpenStack Zuul speculative gating.
- *Skeptic verdict:* real-gap — found independently by BOTH the scale lens and the prior-art lens; merged

### C31 — GAP: Ownership is a lease, not a deed

**[G-scale-4 · lens: scale-concurrency]** One-writer-per-branch ownership must expire: a lane's claim on its namespace carries a liveness signal (recent commits, heartbeat record, or declared lease horizon) and a declared reclamation protocol for when the signal lapses — abandoned branches are detected, their sole-source pause state (C06) is harvested into a durable record, and the namespace is reclaimed or archived. Permanent claims plus mortal workers equals unbounded orphaned state.

- *Why V2 needs it:* C10 grants collision-free namespaces with single ownership, and C06 makes a mid-flight session note authoritative because it is the sole source — but agents in a fleet crash, hit token limits, and get killed mid-task constantly. Without lease semantics, V2 accumulates orphaned branches whose 'authoritative' pause state no one will ever resume, orientation (C16) surfaces dozens of zombie lanes as live work, and derived project status (C01) is polluted by claims from dead writers. Distributed systems solved this decades ago: exclusive ownership is only safe when time-bounded.
- *Prior art:* Google Chubby lock service leases (Burrows, OSDI 2006, https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/); Kubernetes Lease objects for leader election and node heartbeats (https://kubernetes.io/docs/concepts/architecture/leases/); DynamoDB lock client lease durations; TTL-based session ownership in ZooKeeper/etcd.
- *Skeptic verdict:* real-gap

### C32 — GAP: Main is the only rendezvous

**[G-scale-5 · lens: scale-concurrency]** Isolated lanes will eventually need each other's unmerged work; the model must name the legal channels. Either the dependency waits for the prerequisite to land on main (main as sole integration point), or it is an explicitly declared stack (branch B based on branch A, dependency recorded in B's work item, merge order enforced). Lanes must never satisfy a dependency by cherry-picking, copying files, or reading another lane's branch ad hoc — undeclared cross-lane edges are the concurrency-model equivalent of stored derivable state: invisible coupling that breaks silently when the upstream lane rebases or dies.

- *Why V2 needs it:* C10-C13 are a pure isolation story — they make lanes unable to collide but say nothing about lanes that must cooperate. At N>2 lanes this is the first thing that happens (lane B needs lane A's schema change), and without a declared protocol, agents will improvise side channels that defeat C11's stateless re-derivation and make merge order an undocumented constraint no derivation can see. The dependency edge is exactly the kind of human intent C04 says must be stored; today it has no home.
- *Prior art:* Trunk-based development's short-lived-branch discipline (https://trunkbaseddevelopment.com/); stacked diffs/PRs as first-class dependency chains — Phabricator, Meta's Sapling (https://sapling-scm.com/), Graphite (https://graphite.dev/); GitHub PR base-branch retargeting on merge; Gerrit's explicit 'depends-on' change relationships.
- *Skeptic verdict:* real-gap

### C33 — GAP: Declared behavior under source unavailability

**[G-fm-3 · lens: failure-security]** Every derivation declares its contract when a ground-truth source is unreachable (forge outage, offline clone, missing gh auth): merge-blocking gates fail closed (no verdict, no merge — an unreachable source is never treated as 'no objections'), while orientation/read paths may serve a last-known-good snapshot explicitly labeled with its staleness bound; silent fabrication of a view from partial sources is never permitted.

- *Why V2 needs it:* V2 moves authoritative state off the at-rest tree onto live forge data (C29), making the forge a runtime dependency of every gate and every session start — yet the register's only degradation concept (C20) addresses untrusted repo content, not unavailable infrastructure, and itself warns that each SKIP is a fail-open channel without supplying the closing rule. Without this, a forge outage or revoked token either bricks all work or — worse — lets blockers evaluate against an empty PR/issue list and pass.
- *Prior art:* Fail-open vs fail-closed doctrine in security controls (firewalls, OPA/Gatekeeper failurePolicy on admission webhooks — Fail=closed for enforcement); AWS 'static stability' (Well-Architected: keep operating on last-known-good during dependency failure, https://aws.amazon.com/builders-library/static-stability-using-availability-zones/); Envoy/feature-flag last-known-good config fallback.
- *Skeptic verdict:* real-gap

### C34 — GAP: Records are public-forever at write time

**[G-fm-4 · lens: failure-security]** Any record that rides a branch to main (session logs, journals, ADRs, waivers) must be treated as permanently public at the moment it is written: a mandatory scrub gate (secret patterns, tokens, PII, internal URLs) runs before commit/push, because git history is effectively immutable and remediation (history rewrite) is orders of magnitude costlier than prevention; verbose agent session narrative is the highest-risk record class and gets the strictest filter.

- *Why V2 needs it:* C12+C14 make per-session records a load-bearing pillar — machine-written, verbose, committed to branches and merged to main — but the register says nothing about what must NOT be in them. Agents echo environment variables, tokens, API responses, and private context into logs routinely; one leaked credential in a merged session record poisons the whole 'data rides the branch' design and forces a history rewrite that breaks every derived view pinned to old SHAs (compounding with G-fm-1).
- *Prior art:* GitHub push protection / secret scanning (blocks at push, not after); gitleaks, trufflehog, git-secrets as pre-commit gates; BFG Repo-Cleaner as the canonical evidence that post-merge remediation is disruptive (https://rtyley.github.io/bfg-repo-cleaner/); GitGuardian's State of Secrets Sprawl reports documenting secrets-in-history prevalence.
- *Skeptic verdict:* real-gap

### C35 — GAP: Check-then-act atomicity

**[G-fm-5 · lens: failure-security]** Between deriving a view and acting on it, the world can change (new commit lands, issue reopens, another lane merges); therefore every consequential action — especially merge — must carry the pinned state its verdict was computed against and be applied compare-and-swap style: proceed only if that state still holds, otherwise re-derive; a green check on Tuesday's tree confers nothing on Wednesday's.

- *Why V2 needs it:* This is the TOCTOU hole in the derive-don't-store model under multi-lane concurrency: C13 makes writes collision-free but says nothing about read staleness — two lanes can each derive a passing view and both act, with the second acting on a world the first just invalidated. Without check-then-act atomicity, V2's gates are races, and the more parallel agents the workflow runs (its whole point), the more often they lose.
- *Prior art:* GitHub merge queues and Bors/Homu ('not rocket science' rule: test the exact commit that will land, https://graydon2.dreamwidth.org/1597.html); optimistic concurrency control (HTTP ETag/If-Match, database CAS); Kubernetes resourceVersion preconditions on updates.
- *Skeptic verdict:* real-gap

### C36 — GAP: Cross-tier divergence is a detected signal

**[G-fm-6 · lens: failure-security]** The derivation deliberately computes status from more than one authority tier and reconciles them: a directive that claims done with no corresponding merged change, a session record narrating work no branch contains, a closed issue whose acceptance check fails — each mismatch is surfaced as a first-class finding (possible gaming, rot, or error), not silently settled by precedence.

- *Why V2 needs it:* C06 says who wins when records conflict, but a precedence rule only fires if the conflict is noticed — and a derivation that reads only the winning tier never notices. In a multi-agent workflow the cheapest way for a pressured agent to 'finish' is to write the record without doing the work; reconciliation is the structural counter to record-gaming, the same way C22 counters checkbox compliance in rules. It is also the early-warning sensor for C24's drift climbing the stack.
- *Prior art:* Accounting reconciliation / three-way match (order vs receipt vs invoice must agree); Kubernetes controllers reconciling declared spec against observed status and reporting drift; declarative-infra drift detection (terraform plan, driftctl); 'trust but verify' audit doctrine.
- *Skeptic verdict:* real-gap

### C37 — GAP: Gates catch changes; a reconciliation loop catches drift

**[G-PA-2 · lens: prior-art-transplant]** PR-time enforcement only observes state that arrives through the gate, but ground truth also mutates outside any PR: forge-side issue/PR state changes, hand-edits to generated files on main, force-pushes, and rule-set upgrades that retroactively redden old merges. A derived-state system therefore needs a scheduled reconciliation loop that recomputes declared-vs-actual against the live default branch and surfaces divergence as its own first-class signal — the GitOps controller pattern applied to repo readiness.

- *Why V2 needs it:* V2's authority model (C06) and claims register (C23) assume ground truth and derived views are current, but main can drift red between merges — a claim decays, an anchoring issue gets closed, a new rule lands — and no concept in the register ever re-looks at main except when the next PR happens to arrive. Event-triggered checking (C02) plus continuous reconciliation are two different guarantees, and the register only has the first.
- *Prior art:* Argo CD automated sync, drift detection and selfHeal (https://argo-cd.readthedocs.io); Flux reconciliation intervals; Kubernetes controller reconcile loops (declared spec vs observed status); OpenSSF Scorecard's scheduled re-scans of ~1M repos independent of any PR event (https://github.com/ossf/scorecard).
- *Skeptic verdict:* real-gap

### C38 — GAP: Derivation is a join — declare the keys

**[G-PA-4 · lens: prior-art-transplant]** Deriving project state from many sources — commits, branches, PRs, issues, per-unit records, session journals — is a relational join, and joins need declared keys, not inference. Commit trailers (Issue:, Session:, Change-Id-style tokens), structured record frontmatter, and branch-name grammars are written at creation time by convention and validated at the gate, so cross-artifact linkage is parsed deterministically rather than reconstructed by heuristics or reading prose.

- *Why V2 needs it:* C15 anchors every change to a work item and C17 gives one record per unit, but nothing in the register guarantees the anchor is machine-readable inside the ground truth itself. Without declared join keys, the automatic orientation step (C16) degenerates into fuzzy matching over commit messages, and the at-rest model (C29) cannot reconstruct the issue-to-commit-to-record chain offline at all. Trailers and git notes additionally give V2 a metadata channel that rides the commit without touching the tree — the C14 principle for facts that must not be files.
- *Prior art:* git commit trailers / git-interpret-trailers (https://git-scm.com/docs/git-interpret-trailers); Gerrit Change-Id tracking across amends; Conventional Commits; GitHub closing keywords ('Fixes #123'); git notes as an attach-after-the-fact metadata channel (https://git-scm.com/docs/git-notes).
- *Skeptic verdict:* real-gap

### C39 — GAP: The repo declares itself (schema-validated descriptor)

**[G-PA-6 · lens: prior-art-transplant]** Applicability, scrutiny level, and ownership derivations all consume one input that cannot be derived: what this repo claims to be — type, lifecycle stage, maturity, owner, profile, opt-ins. That belongs in a single, deliberately minimal, schema-validated descriptor file that the gate checks, not in per-rule tree-sniffing heuristics that misfire and cannot express intent like 'pre-production, claims-exempt'. The descriptor is the canonical root fact other derivations hang off; keeping it small and schema-bound is what stops it from regrowing into a status blob.

- *Why V2 needs it:* C21 makes rules declare applicability 'by project type and profile' and C24 keys scrutiny to maturity, but the register never says where type, profile, or maturity live or that they are declared rather than inferred. Without this concept every one of the 69 rules reimplements fragile project-type detection, skips (C20/C21) become unauditable because their premise is a guess, and C04's 'store only intent' has no named mechanism for the single most load-bearing piece of intent in the whole system.
- *Prior art:* Backstage catalog-info.yaml descriptor format — kind/type/lifecycle/owner consumed by all catalog tooling (https://backstage.io/docs/features/software-catalog/descriptor-format); Kubernetes declared-spec vs observed-status split; GitHub CODEOWNERS as declared-ownership prior art.
- *Skeptic verdict:* real-gap

### Deferred to the V3 horizon (skeptic: real-but-defer)

- **Append-only needs a compaction contract** (G-scale-1, lens scale-concurrency) — Every append-only record stream (session logs, per-unit records, journals) must declare a compaction contract from day one: a periodic, mechanically derived snapshot/rollup that becomes the new derivation baseline, plus a retention rule for the raw records it summarizes — so derivation cost and reader noise are bounded by the snapshot horizon, not by total project age. The snapshot is itself a derived view (regenerable, marked, C05-compliant); the raw records may then be archived or pruned without losing the ability to re-derive current state.
- **Derivation cost scales with the change, not the history** (G-scale-2, lens scale-concurrency) — On-demand derivation must be incremental and content-addressed: each derived view is a pure function of enumerable inputs (commit ranges, record paths, forge query results) keyed by a hash of those inputs, so a re-derivation whose inputs are unchanged is a cache hit and a changed input recomputes only the affected slice. Cache correctness comes from construction (key = hash of inputs), never from TTLs or manual invalidation; a cache entry is exactly as trustworthy as the ground truth it hashes.
- **Cache derivations by input fingerprint; staleness is decidable** (G-PA-1, lens prior-art-transplant) — Re-derivation must be cheap enough to be the default: cache each derived view keyed by a content hash of its exact inputs (tree hash, rule-set version, forge-snapshot cursor), so freshness is a hash comparison rather than a judgment call. A cached derivation whose fingerprint matches current inputs is equivalent to re-deriving; one whose fingerprint mismatches is automatically invalid — never trusted, never hand-refreshed. Memoization, not storage, is the sanctioned way derived state persists.
- **A derived fact that travels must carry verifiable provenance** (G-PA-3, lens prior-art-transplant) — The moment a derived result leaves the deriver — a readiness score in a README badge, a record committed to main, a claims-register entry — it is stored state again, and it stays trustworthy only if packaged as an attestation: the subject digest (which commit/tree it describes), the deriver's identity and version, its input fingerprints, and a timestamp, ideally signed. A consumer then decides 'does this still apply?' by digest comparison instead of trust, and can verify it offline. An exported derived fact without provenance is indistinguishable from a hand-maintained claim.

*Already covered:* G-fm-2 (provenance-graded derivation inputs) — ruled covered by C06 tier partitioning + C29 boundary declaration.


## Pushback record — extraction crew (Workflow 1)

> Each extraction was attacked by a **fidelity skeptic** (verifies every quote verbatim against the files, hunts misreads/overclaims) and a **completeness critic** (re-sweeps the sources for what was missed). 54 challenges were raised.
>
> **Disposition scheme:** every challenge below was **✔ accepted and folded** — the register above is the *post-pushback* text — except where an explicit disposition note says otherwise.

### Extraction: skill-concepts

**Fidelity skeptic** — overall verdict: *needs-rework* · 9 challenges

- **[blocker · missing-concept]** *entire extraction (no concept sourced from ADR-0009)* — ADR-0009 is one of the two named sources, and the extraction contains zero concepts, quotes, or evidence entries from it. This is not a marginal omission: the ADR's Decision section is the single most on-point source for the derive-vs-store question the extraction is built around — it is an ACCEPTED decision (dated 2026-07-09) that already implements 'derive state, don't store it' for exactly the artifacts the extraction flags as V2 targets. Missing concepts include at minimum: (1) the computed-resume-view rule ('Derivable state is computed at session start ... nothing narrative is serialized on main'); (2) the three-tier source-authority model (Ground truth > Directive > Forensic, with explicit conflict precedence); (3) 'No issue, no work' (every change anchored to a GitHub issue — deriving the backlog from forge state); (4) per-branch session logs that 'ride the squash-merge onto main' (the purest instance of data riding the branch to main); (5) the rejected-alternatives reasoning ('open PRs already are the cross-clone lane index, and a file on main reintroduces a shared write' — a direct argument against stored proxies).
  - ✋ **REJECTED.** The extractor's mandate was deliberately skill-repo-only (ADR-0009 had its own dedicated extractor); the ambiguity was in the critic's briefing, not the extraction. The sibling point about framing (c) was extracted as its own (valid) challenge below.
- **[major · wrong-verdict]** *notes — framing map claim that '(c) isolation has essentially no counterpart'* — The notes assert framing (c) isolation 'has essentially no counterpart' in the sources, with the closest match being CTX-01's 'misdirecting the next session' rationale. This is affirmatively false: ADR-0009 is an isolation design end to end — separate lane clones sharing only origin, lane-namespaced branches so lanes cannot collide, per-branch unique-path session logs 'collision-free across lanes by construction', and the explicit consequence that two lanes never touch a shared file. An orchestrator relying on this note would wrongly conclude the sources offer nothing for framing (c), when they offer a complete accepted model for it.
- **[major · missing-context]** *stored-stamp-derived-verification (v2_implication and statement)* — The concept presents 'compute where-we-are directly from git/PR history and eliminate the reconcile-the-stamp chore' as a V2 proposal, but ADR-0009 (Status: Accepted) has already decided exactly this, with a rollout plan (M-ctx01, M-remove) — the stamp file is being removed from main and CTX-01 'repointed or retired'. The concept also strips the load-bearing empirical evidence: the stamp pattern's derived-honesty check demonstrably FAILED under two lanes — PR #127 carried a valid-ancestor stamp yet 'merging it would have reverted newer state. CI did not catch it (docs-only, valid ancestor)'. So the claim that ancestry/lag verification makes the stamp 'machine-falsifiable' needs the caveat that a stamp can pass ancestry verification and still misdirect; the ADR states CTX-01 'structurally assumes a single line of history'. Presenting decided, evidenced ground as open design space materially misleads the V2 orchestrator.
- **[major · overclaim]** *repo-at-rest-scoping (statement)* — 'Every check runs over the repository at rest ... with no network calls and no runtime observation' is false as written: the `command` check kind (BUILD-05, BUILD-09) executes the repo's configured bootstrap (install+test) — runtime execution, and typically network (the example config is 'pnpm install --frozen-lockfile && pnpm -w test'). SECURITY.md's no-network sentence describes the runner itself and explicitly carves BUILD-05 out as the documented exception. The extraction even contradicts itself: its own crown-check concept calls BUILD-05 'the one check that executes anything'. Since this concept's V2 implication ('the at-rest constraint is exactly what forces the stored proxies') leans on the absolute claim, the overclaim is load-bearing.
- **[minor · overclaim]** *checklist-as-exit-code (statement)* — 'Written promises are treated as untrustworthy until something computes their truth' overgeneralizes: the sources deliberately carve out 5 manual rules where a written promise (a dated signoff.json entry) IS the satisfier, and the machine computes only its existence and date — never its truth. REFERENCE.md line 3 states this openly ('The judgment calls a script can't make become a dated sign-off ledger'). The extraction's own signoff-ledger concept handles the nuance, but concept 1's 'every readiness lesson must be backed by a machine-executable check whose result is an exit code' also glosses that SIGN-OFF results never set exit 1 (check.mjs line 599: unsigned manual rules tag SIGN-OFF, and only blocker FAILs drive the exit code).
- **[minor · misreading]** *skip-scoping-machinery (statement)* — The statement bundles 'opt-in globs (claims register, freshness_globs etc.)' into the 'three short-circuit gates before evaluation'. Mechanically wrong for the *_globs keys: the pre-evaluation `requires` gate covers only `makes_external_claims` and `requires:false` config keys (check.mjs lines 593-594); freshness_globs/generated_globs/grounding_docs rules DO reach their evaluator and skip from inside it via ok:null (e.g. line 368: `if (!list.length) return { ok: null, detail: \`config.${c.list_from_config} empty (opt-in)\` }`; same pattern at line 376). REFERENCE.md's own funnel diagram separates 'SKIP — opted out / claims off' (gate) from 'SKIP — not evaluable' (post-evaluation). Outcome is identical (SKIP never counts), but a V2 that rebuilds the gating from this description would put the opt-in logic in the wrong layer.
- **[minor · overclaim]** *self-validating-ruleset (statement: 'a malformed rule set can't even install')* — install.sh copies SKILL.md/check.mjs/rules.json/templates to $DEST (lines 26-32) BEFORE running the smoke test (lines 34-36). On self-check failure it prints an error and exits 1, but there is no rollback — the malformed rule set is already installed on disk at the skills path an agent will load. A malformed rule set can't install *silently*, but it absolutely can install.
- **[minor · misreading]** *zero-dep-crash-resilient (v2_implication: 'shallow clones already get this treatment in status-stamp')* — The implication says every derivation must 'degrade to SKIP — never crash, never invent a FAIL' and cites shallow clones in status-stamp as the existing precedent. But the shallow-clone path returns ok:true — a PASS ('unverifiable-but-fresh'), not a SKIP; same for the no-git path (line 322). That is a materially different (and more gameable) policy: unverifiable ground truth currently counts FOR readiness rather than being excluded from the denominator. A V2 copying 'this treatment' would inherit unverifiable-passes, not degrade-to-skip.
- **[minor · overclaim]** *self-referential-ci-enforcement (statement: 'BUILD-06 checks that the baseline gate itself is wired into CI as a required check')* — BUILD-06's check is a grep over workflow files for a baseline invocation pattern; 'required status check' is GitHub branch-protection state that is not visible in the at-rest tree and is not checked by any rule (GOV-01 checks only that merge protection is *declared in-repo*). The 'required' language comes from REFERENCE.md's instruction to the human ('Make `baseline` a required status check'), which the extraction imports into the checkable claim. By the extraction's own presence-theater ladder, BUILD-06 as implemented sits on the bottom rung: a workflow that invokes baseline but is not required would still pass.

*What survives (the fair half):* Quote integrity is excellent: I grepped/read every one of the ~40 quotes across README.md, SKILL.md, REFERENCE.md, check.mjs, rules.json, SECURITY.md, install.sh, config.example.json, baseline.config.json, and all cited templates — every quote is verbatim and at (or within a line of) the cited location; zero fabricated or inexact quotes. The counts survive empirical attack: I recounted rules.json with node (69 rules; 14 blocker / 50 warn / 5 manual, matching REFERENCE.md line 11 exactly; manual = TEST-03/04/06, CTX-04, CLAIM-05; every rule carries a lesson field, 49/69 carry a source URL) and ran the checker on the repo itself, confirming the dogfooding claim (0 blockers: 12 pass, 1 warn, 56 skip under project_type=docs). The following concepts withstand scrutiny essentially intact: rules-as-data (CHECK_KINDS verified, engine/data split real), severity-authority-split (the res.soft runtime downgrade observation is a genuinely sharp catch — status-stamp stale→soft WARN and command unconfigured→soft WARN both verified in code), signoff-ledger (presence+date semantics verified at check.mjs:522), crown-check-execution (BUILD-05/09 and --no-exec gating verified), config-as-declared-intent (the claims-opt-in comment and project_type-as-intent comment both real), scaffold-check-duality, claims-register-falsifiability (decay arithmetic and supports_because enforcement verified at check.mjs:509-515), presence-theater-aversion (the ladders and quote-aware comment-stripping are real and correctly read), and adversarial-rule-provenance. The notes' central tension — stored human proxies whose VALIDITY, not state, is derived, with CTX-01's own lesson field ('status is a computed exit-state') as smoking gun — is well-grounded and is in fact independently confirmed by ADR-0009, which the extraction unfortunately never read.

**Completeness critic** — overall verdict: *sound-with-fixes* · 9 challenges

- **[major · missing-concept]** *missing: layered failure model (whole extraction)* — The extraction has no concept for the causal theory that generated the standard's shape: three failure layers (code/tests/CI, narrative docs, headline claims) observed in real repos, with drift CLIMBING the stack as a project matures — pre-code repos break at the code layer, the mature repo's #1 risk was the narrative layer. This theory explains why a 'readiness' standard covers claims and doc-drift at all, why v2 added the shipping layers, and — for V2 — predicts exactly where stored proxies concentrate (the upper, human-maintained layers). 'adversarial-rule-provenance' covers the vetting method but not this organizing theory; no concept cites REFERENCE.md's 'Why it's shaped this way' section.
- **[major · missing-concept]** *missing: one-home-per-fact + precedence hierarchy (CTX-03/CTX-09/sources_of_truth)* — The extraction relegates 'one home per fact' and the precedence clause to a parenthetical in notes, but it is a first-class design principle with its own rules (CTX-03 sources-of-truth declaration, CTX-09 grounding docs 'have one home'), its own config surface (sources_of_truth), an explicit conflict-resolution hierarchy in the start-here template, and dogfooding in the repo's own baseline.config.json (which names check.mjs 'single source of truth for how a rule is scored'). The principle diagnoses the root cause of drift as fact duplication and prescribes declared canonical owners plus a precedence rule for disagreements — this is the extraction's user framing (b) made concrete, yet no concept carries it; framing (b) currently maps only to the severity tiers.
- **[major · missing-concept]** *missing: decision-lineage integrity (CTX-02 blocker + CTX-07 + templates/adr.md)* — Two of the standard's 14 blockers concern narrative-layer referential integrity (CTX-01, CTX-02), but the extraction covers only CTX-01. CTX-02/CTX-07 plus the ADR template define a distinct concept: decisions form a versioned chain where a reversed decision must be flipped to Superseded AND forward-linked in the SAME commit (atomicity), and the forward link must resolve to an existing file (referential integrity, machine-checked by adr-status/adr-forward-link evaluators with the Nygard-heading parser in check.mjs statusOf/isAdrFile). This is 'foreign keys for the doc graph' — different from the stamp pattern (freshness) — and it is the rule that would directly govern ADR-0009 on the other side of the cross-map.
  - ✔ **Folded (partially).** Decision-lineage checking (CTX-02/07 + adr template) was folded into C17 (record-per-unit) and the cross-map ALIGNS entries rather than promoted to its own register concept — the lineage rules survive V1→V2 untouched, so they ride as aligned rules, not a new principle.
- **[major · missing-context]** *severity-authority-split* — The concept captures the tier mechanics but hides the bigger idea: severity assignment is calibrated to check CERTAINTY. Blocker status is reserved for unambiguous, deterministically-checkable facts; rules whose checks are pattern heuristics self-declare it in their rationale (SEC-04 'Heuristic — treat hits as review flags', OPS-04 'Heuristic.') and are all warns. This certainty→authority calibration rule is load-bearing for any V2 'derived authority' design: a derivation's confidence should bound the authority of its verdict, exactly as here.
- **[minor · misreading]** *zero-dep-crash-resilient* — The v2_implication claims 'shallow clones already get this treatment in status-stamp' where 'this treatment' = 'degrade to SKIP'. In fact the shallow-clone and no-git branches of status-stamp return ok:true — a PASS, not a SKIP. The system's actual stance when ground truth is unavailable is FAIL-OPEN (benefit of the doubt), a consistent and stronger design decision the extraction blurs: implies-checks skip rather than warn when the requirement can't be evaluated, and GOV-01 deliberately skips when protection lives only in the GitHub UI. For a derived-state V2 the fail-open-vs-fail-closed choice on missing derivation sources is a real design decision, and the current system's answer is 'never punish what you cannot see' — pass or skip, never fail.
- **[minor · missing-context]** *repo-at-rest-scoping / zero-dep-crash-resilient* — Neither concept captures the runner's threat model: the repo under audit is treated as ADVERSARIAL INPUT. Git helpers pass filenames/SHAs as literal argv specifically to prevent a crafted repo from injecting shell commands; SECURITY.md scopes 'a crafted repo or config that causes command execution' as in-scope vulnerabilities; and CHANGELOG 2.1.1 documents a 4-round adversarial hardening pass (including a severity inversion in CTX-01 and comment-blind greps). For V2 this matters: every new derivation source (git history, forge data) is attacker-influenced data the deriver must parse defensively.
- **[minor · missing-context]** *notes (stored-vs-derived tension) / rules-as-data* — The extraction's central thesis — the epistemology is half-implemented, stored proxies persist — misses the most self-referential instances inside the skill repo itself: REFERENCE.md's rule table is a hand-regenerated stored copy of rules.json (marked only by an honor-system comment), the fact '69 rules' is duplicated across at least six files (README, SKILL.md x4, docs/start-here.md, baseline.config.json, REFERENCE.md), and the repo's own sign-off note concedes REFERENCE.md is hand-maintained. These are derivable facts stored in N homes — the exact failure mode CTX-03/CTX-08 exist to catch — and they are concrete, low-cost V2 targets (generate the table and counts from rules.json).
- **[minor · missing-context]** *scaffold-check-duality / cross-map context* — The extraction treats templates/ as generic scaffolds, but they transplant a specific, opinionated context model from the author's CAD project (the other source repo in this analysis): start-here.md hardcodes a precedence triad of start-here vs CLAUDE.md+CONTRIBUTING.md vs docs/knowledge-ledger.md, and CLAIMS.json ships real GTA/FiveM-CAD product claims (migration wedge, AI report-gen moat, RLS tenant isolation) as its example content. For the cross-map crew this shared DNA is load-bearing: the skill's templates and ADR-0009's repo describe the same context architecture, so concept alignment between the two sources is genealogical, not coincidental.
- **[minor · weak-implication]** *signoff-ledger + severity-authority-split* — Partial over-extraction: the third tier of 'severity-authority-split' ('manual rules are satisfiable only by a dated human entry in the sign-off ledger') and the opening of 'signoff-ledger' restate the same fact with overlapping evidence (both lean on REFERENCE.md line 160 territory and check.mjs's signoff evaluator). The distinct content — anti-rubber-stamp norm, ledger-invalidation V2 options — belongs in one entry. Also neither entry captures the boundary case that a sign-off can satisfy a NON-manual rule (TEST-05, severity warn, lists {"kind":"signoff"} as an any-of alternative), which shows sign-off is an escape hatch usable inside ordinary checks, not a severity-locked tier.
  - ✔ **Folded.** The near-duplication was accepted: the register keeps them separate (C07 = severity calibration principle; C08 = the judgment-record mechanism) but with non-overlapping claims.

*What survives (the fair half):* Coverage of the skill repo is genuinely strong. All sixteen concepts are real, correctly grounded, and non-fabricated as far as my independent sweep shows: the exit-code epistemology, the rules-as-data/engine split (22 check kinds confirmed in CHECK_KINDS), the three-tier authority model including the runtime res.soft downgrade (a sharp catch most extractions would miss), the sign-off ledger and its anti-rubber-stamp norm, at-rest/no-network scoping, BUILD-05 as the sole exec path with the --no-exec trust gate plus BUILD-09 idempotence, the gate→evaluate→tag skip machinery, config-as-intent with the 'not robot-detectable at rest' boundary quote, the --self-check integrity gate wired into install.sh, crash-resilient per-rule try/catch, the four agent modes with fix-as-data, the CTX-01 stamp pattern correctly identified as the central V2 contradiction (its own lesson field vs its implementation — the single best insight in the extraction), claims-register decay mechanics, existence-vs-enforcement ladders (QUAL-01/04, BUILD-03/10, SEC-01/12) including the strip_comments detail, BUILD-06 self-referential CI closure with distribution-mode dogfooding, and the adversarial rule-provenance methodology. The notes' tension analysis is largely correct and orchestrator-useful: stored artifacts cluster exactly at intent/judgment/world-assertions, the no-network constraint is causally linked to storage, and the severity-honesty gradient precedent is real. Severity counts verified by script: 14 blocker / 50 warn / 5 manual = 69, matching the notes' final recount and REFERENCE.md's stated '14 blockers · 50 warnings · 5 sign-offs'. The framing map ((a)/(b)/(d) strong, (c) absent) is fair for this source. What's missing is concentrated one level up (the failure-layer theory, one-home-per-fact/precedence, decision-lineage integrity, certainty→authority calibration) plus one factual blur (fail-open vs degrade-to-SKIP) — additions and corrections, not rework.

### Extraction: adr-concepts

**Fidelity skeptic** — overall verdict: *sound-with-fixes* · 7 challenges

- **[major · fabricated-or-inexact-quote]** *orientation-default-behavior* — The evidence quote given as tools/orient.mjs lines 11-12 — "// Orientation is *behavior*;\n// this just makes the survey reproducible." — does not exist verbatim: `grep -c '^// Orientation is'` returns 0. The real text sits mid-line 9 through mid-line 10: line 9 reads "// `gh` + network, so it is deliberately NOT wired into `pnpm boundaries` / CI. Orientation is *behavior*;" and line 10 reads "// this just makes the survey reproducible. Failures are non-fatal — every `gh` call degrades to a note and". The extractor synthesized a "// " comment prefix onto the first fragment and cited the wrong lines (11-12 instead of 9-10), so a copy-paste grep of the quote as given fails. The content and meaning are faithfully preserved (both fragments exist contiguously in the file), which is why I rate this major rather than blocker — but it is the single quote in the extraction that fails the strict verbatim test, and it compounds with a wrong line reference on the same evidence item.
- **[minor · fabricated-or-inexact-quote]** *data-rides-branch-to-main, loadbearing-next-handoff, ctx01-repoint-computed-status (evidence line refs)* — Several evidence entries cite line ranges that are off by one or overshoot, even though the quote TEXT is verbatim in every case. Confirmed drifts in the ADR: data-rides-branch-to-main quote labeled 62-63 actually spans 61-62 ("sole mid-flight handoff. Logs are committed on the branch..." begins on line 61); its second quote labeled line 89 ("`main` stays clean of narrative...") is on line 88; loadbearing-next-handoff quote labeled 61-62 actually spans 60-61 ("Each log carries a **required `## Left open` → `next:` field**" begins on line 60); ctx01 quote labeled 74-76 spans 74-75; sessionwise quote labeled 57-60 spans 57-59; session-log/README quote labeled 18-19 is line 19 alone; CONTRIBUTING quote labeled 94-98 ends mid-line 97. Quotes survive grep; the metadata does not survive line-anchored lookup, which weakens the evidence chain for any consumer that resolves citations by line number.
- **[minor · overclaim]** *collision-freedom-by-construction* — The statement generalizes the by-construction guarantee to "unique paths (branch-namespaced log directories, per-unit files) plus 'a branch is worked by one lane at a time' make collisions unrepresentable." The ADR claims by-construction collision-freedom only for session-log paths and lane-namespaced branch names. "Per-unit files" are NOT uniformly collision-free by construction: the repo's own docs acknowledge that sequential `NNNN-` ADR filenames are a residual collision surface (two lanes drafting ADRs concurrently can both pick 0010) accepted deliberately because ADRs are "rare, owner-gated" — and specs were moved to date-prefixed names precisely to "avoid the collision race." So for one class of per-unit file, collision-freedom is by rarity and vigilance, not construction — the exact distinction this concept is about.
- **[minor · missing-context]** *ctx01-repoint-computed-status* — The statement says the CTX-01 change "is protected by the selfTest() pattern" — true, but it names only half the protection. The vendored patch is additionally tamper-evident via a separate CI guard, tools/check-baseline-deviations.mjs (`ctx01-status-computed`), which fails CI if a future re-vendor of baseline-skill silently drops the local patch. This is load-bearing for exactly the story the extraction's own notes lean on (the vendored-patch-to-upstream pipeline, notes items 4-5): selfTest() protects against a broken short-circuit, while the deviations guard protects against the patch vanishing on refresh — different failure modes, and only the first is captured.
- **[minor · missing-concept]** *extraction as a whole (concept set)* — The extraction misses the model's deliberate tool-agnostic degradation path: the ADR's Costs section states the same tiers must be followable by a non-Claude contributor "by reading issues + logs directly," devops.md restates the tiers explicitly "for non-Claude contributors, the same model without any tooling," and orient.mjs is built so every `gh` failure "degrades to a note" with a manual fallback. For the stated v2 purpose (a from-scratch redesign around derived state) this is a real design constraint the concept set omits: the derivation must have a zero-tooling manual equivalent, or the model becomes agent-locked. No extracted concept covers it.
- **[minor · weak-implication]** *no-issue-no-work (v2_implication)* — The v2_implication claims "unanchored work is invisible to derived state" and that issue coverage "is what makes derivation complete." That conflates two distinct mechanisms. Visibility is governed by push discipline (Rule 5): an unanchored branch that is pushed with an open PR IS visible to the derived view — orient.mjs's LIVE LANES input is open PRs, with no issue-anchoring precondition. What issue anchoring completes is the DIRECTIVE tier (the backlog / what-to-build-next), not visibility of in-flight work. The real invisibility failure mode the sources name is unpushed WIP, which the extraction correctly covers in push-discipline-visibility — so this implication attributes push-discipline's property to the issue rule.
- **[minor · missing-context]** *derivable-vs-judgment-split* — The statement strengthens the ADR's "nothing narrative is serialized on `main`" to "nothing narrative is EVER serialized on main" without the reconciling context that narrative forensic logs DO land on main — via the squash, as append-only per-branch files (ADR line 88: "`main` stays clean of narrative; forensic history still lands there via the squash"). Read as a standalone concept card, it appears to contradict the extraction's own data-rides-branch-to-main concept. The load-bearing sense of "serialized" in the sources is write-contention through one shared blob / direct writes to main (session-log README: "nothing serializes through one file"), not the absence of narrative content on main. The extraction resolves this correctly inside data-rides-branch-to-main but leaves this card ambiguous.

*What survives (the fair half):* Nearly everything. Quote integrity: of the ~40 quoted evidence strings across 15 concepts, all but one (the orient.mjs comment, challenge 1) exist verbatim in the named files — I grep-verified every one, including the exact ADR tier block (lines 36-42), Rule texts, baseline.config.json lines 7-8, check.mjs lines 175 and 590-591, CONTRIBUTING.md line 102, devops.md 169-182, CLAUDE.md 32-33/120-121/130-132, session-log/README.md, and decisions/README.md line 7. Classifications hold under attack: 'derived/computed' for the resume view is correct (no stored artifact exists — docs/start-here.md is confirmed deleted, orient.mjs prints and never writes), and the extraction preempts the obvious counterattack (derived view fed by hand-maintained inputs) by itself surfacing the guarded next: and 'a rotted board yields a rotted orientation' (ADR line 93, verified) in notes item 7. The subtle readings are accurate, not lucky: authority scoped per-question (lowest-authority forensic tier being sole authority on pause-state) is exactly ADR lines 42-43; the 'no fast-path is itself the design' reading of Rule 2 is literal ADR text; the rejections-as-negative-spec reading matches lines 77-81. The contextwise-isolation generalization to agent contexts is honestly flagged as a delta rather than passed off as ADR text — model epistemic practice. The notes survive fact-checking impressively: all four rollout logs exist at the exact claimed paths (docs/session-log/context/{m-ctx01-repoint,m-log-session-logs,m-orient-protocol,m-remove-start-here}/2026-07-09-01.md); the final log's next: contains verbatim 'ADR-0009 fully rolled out — no follow-on module' and the upstreaming proposal; VENDORED.md tracks the CTX-01 patch with 'Port this upstream'; the vendored rules.json line 139 fix text contains verbatim 'set config.status_computed=true'; and I confirmed the upstream baseline-skill at /home/adar008/repos/baseline/baseline-skill has NO status_computed anywhere (rules.json/check.mjs), consistent with the notes' 'proposes upstreaming' framing. lane_2 is a real second clone on disk (/home/adar008/repos/rally_cad/lane_2/.git). tools/check-session-logs.mjs exists and is wired into pnpm boundaries as claimed. The seven challenges are all fixable in place; none undermines a concept's core reading or verdict.

**Completeness critic** — overall verdict: *sound-with-fixes* · 9 challenges

- **[major · missing-concept]** *three-tier-authority / missing concept: record-currency mechanism* — The extraction explains what each tier IS but never extracts HOW ground truth stays current without a close ritual: the same-PR atomicity rule. A state-changing PR must update the relevant ADR/spec/issue (and drop its session log) in the SAME PR — this is the replacement for the retired close ritual and the reason tier 1 can be trusted to 'win on what is true'. workflows.md also contains the crispest statement of the whole model — pause-state is 'the one thing that isn't auto-derived' — which sharpens derivable-vs-judgment-split into: derive everything, store exactly one judgment datum, and land it atomically with the change. No concept carries this; 'not a close ritual' is quoted but the affirmative mechanism is absent.
- **[major · missing-concept]** *computed-resume-view / derivable-vs-judgment-split — missing third storage mode (M-index)* — The extraction's central dichotomy (computed-never-stored vs judgment-stored-once) misses the model's third mode, shipped as rollout module M-index: a STORED derived view that is committed but mechanically regenerated and drift-guarded in CI (`--check` exits 1 on a stale block, wired into boundaries). This directly complicates computed-resume-view's v2_implication ('Any v2 feature that wants a current-state doc should instead ship a derivation function') — the repo's own practice for a wanted aggregate doc is generate + commit + drift-gate, with the explicit principle 'The index is a directory, not a source of truth'. M-index is named once in a v2_implication aside but never extracted or evidenced.
- **[major · missing-concept]** *orientation-default-behavior — missing concept: tool-agnostic portability / graceful degradation* — The ADR's final Costs bullet — the only Decision/Consequences line class with zero coverage in the extraction — states the model is deliberately NOT agent-dependent: a non-Claude contributor executes the same tiers by hand, and devops.md restates it as 'the same model without any tooling'. orient.mjs encodes the same principle as graceful degradation ('the protocol is not' optional; gh failures degrade to reading by hand). This is load-bearing for a v2 built on derived state: the derivation must remain executable manually by any reader. The extraction's v2_implication for orientation ('runs as ambient agent behavior') actually risks inverting the source, which anchors the model in repo/platform semantics, not agent capability.
- **[major · missing-context]** *contextwise-isolation-lanes — Claude memory is a sanctioned side channel* — The extraction asserts the generalization 'contexts, like clones, exchange state only through pushed records' and derives the v2 axiom 'no side-channel state'. But the sources explicitly sanction Claude memory as a continuity layer: CLAUDE.md routes 'durable facts' to Claude memory, workflows.md lists it as a layer of the source-of-truth chain, and dictionary.md puts it IN the resume chain. Agent memory is local, unpushed, and invisible cross-lane — exactly the side-channel the extraction claims the design forbids. The delta note (notes item 1) flags the clone→context generalization but never surfaces this counter-evidence, which materially weakens 'stateless by construction'.
- **[major · missing-context]** *ctx01-repoint-computed-status — tamper-evident deviation guard and upstream divergence* — The ctx01 concept covers the patch but hides a second, bigger idea: the local patch to the vendored baseline is itself protected by an executable deviation record. check-baseline-deviations.mjs (`ctx01-status-computed`) fails CI if a re-vendor silently drops the patch, and the file's header states the storage principle — justification lives as a CI tripwire, not narrative, 'so the reasoning can't rot in append-only history' and surfaces exactly when re-litigated. This is the extraction's own 'structural, not vigilance-dependent' principle applied to config drift, plus a fourth storage mode (executable justification records). The upstream divergence is also real and uncited: upstream baseline-skill rules.json still has no status_computed and its CTX-01 title still hardcodes the single-writer model ('Status lives in one owner with a fresh 'last-verified' stamp'), so 'portable upstream' currently rests on the guard + VENDORED.md porting instruction.
- **[major · missing-context]** *three-tier-authority — tier 1 is internally partitioned by domain* — The extraction presents the three tiers as the complete authority model, but the repo's canonical expansion (workflows.md §3, explicitly labeled as 'the ADR-0009 three-tier model') is a six-layer priority chain adding domain-scoped winners inside/around tier 1: knowledge-ledger.md wins product/strategy conflicts, CLAUDE.md + CONTRIBUTING win process/tooling conflicts, and docs/ default to 'working notes, not formal specs'. The dictionary confirms removal of start-here.md RELOCATED its product/strategy authority to the ledger rather than computing it away — a nuance directly relevant to user framing (a)'s 'FORMAL docs' and framing (b)'s hierarchy. baseline.config.json even machine-declares the mapping (sources_of_truth: facts → knowledge-ledger.md, decisions → docs/decisions/).
- **[minor · weak-implication]** *branchwise-isolation-lane-namespace / one-owned-record-per-unit — v2_implication overgeneralizes the uniqueness mechanism* — The branchwise v2_implication claims any concurrently-writable namespace (including 'spec filenames') 'should embed the writer's identity'. The repo actually uses three distinct collision strategies, only one of which is writer-identity: lane namespace for branches/logs; DATE+slug for specs ('frequent, multi-author — avoids the collision race'); and owner-gated sequential numbering for ADRs (retained because 'supersession references need a stable number'). The residual collision channel in per-unit records — ID allocation races — and its differentiated solutions are absent from the extraction, so the v2 guidance flattens a deliberate three-way tradeoff into one rule.
- **[minor · missing-context]** *computed-resume-view / ctx01-repoint — rollout ordering principle (replacement before removal)* — The ADR's Rollout section carries a design principle the extraction skips entirely: the stored artifact is deleted LAST, only after its computed replacement (M-orient) and the repointed gate (M-ctx01) are live — i.e., migrate stored→derived by standing up the derivation and re-aiming enforcement before removing the store. For the stated v2 purpose (redesigning around derived state) this is the migration-safety rule; the notes cover the dogfooding of the rollout but not its ordering constraint.
- **[minor · missing-context]** *loadbearing-next-handoff — self-test is a house pattern for all guards, not a CTX-01 special* — The extraction attributes the selfTest() pattern only to the CTX-01 blocker gate, but the next:-guard itself self-tests against synthetic fixtures under the stated general principle that 'a format guard is green-by-omission if its own parser silently breaks', and the deviations guard names it a house pattern ('house pattern, cf. tools/check-public-env.mjs'). The guard's header also states WHY a guard beats a template ('a free-form "remember to fill in next:" convention rots'), which grounds the concept's tripwire claim in an explicit rationale the extraction never cites.

*What survives (the fair half):* Coverage of the ADR's Decision section is genuinely strong and survives intact: all six rules, all three tiers, all three rejected alternatives, the Gains, and four of five Costs bullets are extracted with accurate, well-chosen multi-file evidence (ADR + CLAUDE.md + CONTRIBUTING + devops.md + session-log README + orient.mjs + check.mjs + baseline.config.json). Several extractions capture second-order principles most extractors would miss: the per-question scoping of authority (lowest-authority-yet-sole-source), 'no fast-path is itself the design', the RESUME.md rejection's dual role as a transport filter, and the 'Unchanged (deliberately)' scoping of the ADR to the two blobs. The stored_vs_derived tagging is consistent, and the notes honestly flag the two riskiest interpretive moves (clone→agent-context generalization; user framing (a) blending two tiers) rather than smuggling them in as source claims. The dogfooding observation (rollout ran under its own rules, same-day logs, upstreaming proposal) is correct and valuable. I found no over-extraction requiring merges — the collision-adjacent trio (branch namespace / collision-by-construction / shared-blob failure) each carries a distinct axis (mechanism, property, anti-pattern), and the three-tier vs lowest-authority split earns its keep by extracting a separate principle. The misses concentrate in exactly three places the extractor under-swept: the ADR's final Costs bullet (non-Claude portability), the Rollout section (M-index as a third storage mode; replacement-before-removal ordering), and the operational docs' expansion of the model (same-PR record currency, the six-layer authority chain, Claude memory as a sanctioned side channel, the tamper-evident deviation guard).

### Extraction: cross-map

**Fidelity skeptic** — overall verdict: *sound-with-fixes* · 9 challenges

- **[major · misreading]** *check.mjs DEFAULTS.status_file (config auto-detection) entry* — The entry claims the default 'points CTX-01 at docs/start-here.md on every repo, even unconfigured ones.' False: firstExisting returns the first CANDIDATE THAT EXISTS, falling through to README.md. On the common unconfigured repo (README present, no start-here), CTX-01 targets README.md and demands a 'last-verified' stamp there; docs/start-here.md is the target only when it already exists or when none of the five candidates exist. The 'contradicts' verdict survives on a corrected basis (an unconfigured run always demands a stamped status file SOMEWHERE, which the ADR model rejects), but the stated mechanism is wrong.
- **[major · overclaim]** *check.mjs config loading (silent swallow) entry* — The entry claims a swallowed parse error means 'the config flag that carries the whole M-ctx01 decision can vanish without a sound.' Inverted: with the config swallowed, status_computed reverts to the vendored default false, evalStatusStamp proceeds, status_file falls back to README.md (exists in GTA_6_CAD, verified to contain no 'last-verified' stamp), and CTX-01 FAILs as a blocker — CI goes loudly red, not silently green. The genuinely silent degradations are exactly the ones VENDORED.md names (advanced profile off, bootstrap check off 'while CI stays green'). The hard-error recommendation still stands, but the stakes argument for status_computed specifically is fail-closed, not fail-silent.
- **[major · overclaim]** *config-presets/context-management.json entry* — The adr_position claims 'This preset targets exactly the repo class the ADR governs' — but the quoted description ('a docs/knowledge repo where the point is keeping context true over time') is the PRESET's own _preset text, and the repo the ADR actually governs is project_type 'service' (its live baseline.config.json), not a docs repo. The ADR also scopes the failure to two writers — the exact scoping the extraction used to give the other four presets only 'partially-aligns'. So the contradicts-vs-partially-aligns differential between this preset and the preset family rests on a false repo-class equivalence, and the redesign note's 'the preset most likely to be copied by an ADR-0009-style repo' is dubious (an ADR-0009-style repo is a multi-lane service; it would copy node-service or product-with-claims). 'Contradicts' is still salvageable on the preset's own content — it triple-anchors the stamped blob with no computed alternative — but the stated ground must change.
- **[major · missing-concept]** *Session-log guard entry, orientation entry, and templates/start-here.md redesign notes* — The 'silent' verdicts about upstream V1 are correct (verified: no session-log or orientation surface anywhere in rules.json/check.mjs/SKILL.md), but the redesign notes propose designing from scratch what GTA_6_CAD already ships as working reference implementations: tools/check-session-logs.mjs is the M-log format guard (issue #137 — enforces <YYYY-MM-DD>-NN.md naming, branch dirs, and a non-empty non-placeholder `next:` under `## Left open`, with a selfTest() on synthetic fixtures), and tools/orient.mjs is literally the proposed 'orient.mjs' helper (issue #138 — derives live lanes / backlog / this-lane `next:` via gh, agent-run, deliberately not a gate). The extraction applies the 'downstream already implemented it — port it upstream' framing to the CTX-01 patch but misses that the same is true for M-log and M-orient, which materially changes the V2 work from design to port.
- **[minor · wrong-verdict]** *templates/signoff.json entry (vs templates/CLAIMS.json entry)* — Inconsistent verdicts on identical write topology: CLAIMS.json (one physical JSON on main, per-claim entries) gets 'aligns' while signoff.json (one physical JSON on main, per-rule entries) gets 'partially-aligns', and both entries' notes acknowledge the same shared-file caveat. The ADR blesses both in the same clause and declares both unchanged; its own classification supports 'aligns' for both, with the physical-topology observation kept as redesign commentary (where the CLAIMS entry already puts it).
- **[minor · overclaim]** *notes — throughline paragraph ('CTX-01 alone gates on a hand-maintained promise ... 68 rules obey')* — Not alone: the extraction's own CTX-06 entry calls last_review_date 'a stored human promise', and the manual rules (CTX-04, TEST-03/04, CLAIM-05) resolve on a hand-maintained dated ledger (.project-baseline/signoff.json) — also written promises the runner merely reads. The defensible narrower claim is that CTX-01 is the only rule whose check structurally assumes ONE linear history (match_head + ancestor-of-HEAD), which is the part the ADR attacks.
- **[minor · overclaim]** *Issue anchoring entry ('the only issue-adjacent surface in all 69 rules is CLAIM-06's globs')* — SEC-04's CI-injection pattern also references issues — `github\.event\.(issue|pull_request|comment|review)` at rules.json line 310 — so 'only issue-adjacent surface' is inexact. The load-bearing claim survives fully: grep confirms no rule anywhere checks that branches/PRs/commits reference an issue, and no ISSUE_TEMPLATE-content rule exists beyond CLAIM-06's acceptance-criteria grep.
- **[minor · weak-implication]** *notes — at-rest vs forge paragraph ('tiers 1–2 of the ADR's authority model (open PRs, open issues) live on the forge, not in the clone')* — Tier 1 is 'merged code, git history, closed issues, ADRs / specs / CLAIMS.json on main' — overwhelmingly in-clone; only issues (tier 2) and open PRs (orientation's lane index, not a tier) require the forge. The real tension (a derived-status CTX-01 needs gh/network for orientation inputs) is correctly identified but misattributed to 'tiers 1–2' wholesale.
- **[minor · missing-context]** *CTX-06 entry (freshness TTL vs append-only logs)* — The claimed tension — 'a freshness TTL must never demand refreshing an archived log' — can only arise if a repo deliberately lists docs/session-log/** in freshness_globs; the rule is opt-in and defaults to empty, so the conflict is config-avoidable rather than structural. GTA_6_CAD's live config even has "freshness_globs": []. The 'partially-aligns' verdict is tolerable but should state that the clash requires a configuration mistake, not that the rule as shipped collides with the forensic tier.

*What survives (the fair half):* The extraction's evidentiary core is exceptionally solid: I grep-verified every quoted string across all twelve cited files (rules.json, check.mjs, config.example.json, all five presets, all five templates, SKILL.md, REFERENCE.md, docs/start-here.md, both baseline.config.json files, VENDORED.md, ADR-0009, vendored check.mjs/rules.json) and found zero fabricated or inexact quotes; every cited line number is exact (check.mjs 90/96/114/330/392-416/515/522, REFERENCE.md 116, vendored check.mjs 586-593, vendored config.example.json line 12, SKILL.md init line 64). The headline verdicts withstand attack: CTX-01 'contradicts' is directly supported by ADR Rule 6 and the Context section; the 'aligns' family (CTX-02/04/05/07/08/11, adr.md, CLAIMS.json, score-mode philosophy) matches the ADR's 'Unchanged (deliberately)' clause and derived-state tiering; the 'silent' family is verified by exhaustive negative greps — no rule checks issue anchoring, nothing in rules.json/check.mjs/SKILL.md mentions session logs, and check.mjs contains no reference to origin or branch names, confirming push-discipline/lane-namespace invisibility. The vendored-patch entry is the extraction's strongest work: the CTX-01 status_computed patch, its tamper guard (tools/check-baseline-deviations.mjs, 'ctx01-status-computed' confirmed at lines 131/196-197), the behavioral self-test upstream --self-check lacks, and the 'retires rather than repoints' observation (evalStatusStamp returns ok:null unconditionally on status_computed with no verification of derivation inputs) are all accurate and analytically sharp. The notes' central diagnosis — CTX-01 as the one rule that structurally manufactures the #115/#127 collision class, and the at-rest-runner vs forge-dependent-orientation tension — survives with only the phrasing fixes noted. Templates/start-here.md 'contradicts', the preset-family 'partially-aligns' with its single-writer scoping, GOV-02 as V1's partial answer to the motivating incident, and the self-dogfooding entry are all defensible readings.

**Completeness critic** — overall verdict: *sound-with-fixes* · 11 challenges

- **[major · missing-concept]** *Per-branch session logs + required 'Left open → next:' guard (ADR Rule 3 / M-log); notes ('second-deepest tension')* — The M-log guard is not a V2 proposal — it already exists downstream as a shipped, self-testing CI gate the extraction never cites. /home/adar008/repos/rally_cad/lane_1/GTA_6_CAD/tools/check-session-logs.mjs (issue #137) enforces exactly the rule the entry sketches (filename pattern <YYYY-MM-DD>-NN.md, branch-dir layout, non-empty non-placeholder next:), runs on every CI + pre-push via the `boundaries` script (package.json line 15; ci.yml line 77 `run: pnpm boundaries`), and even carries the selfTest() pattern the ADR demands for gates. This also falsifies the notes' claim that 'nothing verifies the derivation's inputs (non-empty next: in latest per-branch logs, ...)': the next: input IS machine-verified on every CI run — just outside the baseline runner. The correct statement (which the extraction's GTA-config entry gets right: 'the runner verifies nothing') is that the BASELINE gate doesn't verify the inputs; the repo's sibling-guard layer partially does. A cross-map meant to seed a V2 redesign should cite this as the reference implementation to absorb, and the notes' 'unchecked assertion' thesis needs the qualifier.
- **[major · missing-concept]** *Orientation protocol (ADR Rule 4 / M-orient) vs SKILL.md's invocation model; notes (at-rest vs gh/network tension)* — The extraction proposes 'an orient.mjs deriving lanes/backlog/next from gh + logs' as a V2 idea — the file exists at /home/adar008/repos/rally_cad/lane_1/GTA_6_CAD/tools/orient.mjs (issue #138), and CLAUDE.md §8 names it as the sanctioned agent-run helper. More importantly, its header resolves the exact open question the notes leave hanging ('a derived-state CTX-01 either needs a first-ever network/gh-backed check class, or must settle for the at-rest fragments'): the downstream answer is already decided and documented — network-dependent derivation lives OUTSIDE the gate as a non-gating, degrade-gracefully helper, and only at-rest fragments gate CI. The extraction never read CLAUDE.md §8 or CONTRIBUTING (no entry quotes either file), so it missed that M-orient is implemented (protocol text + helper) and that its design encodes the boundary the notes treat as unresolved.
- **[major · missing-concept]** *CTX-04 / CTX-08 / CTX-02 redesign notes (M-index)* — M-index is also already implemented, and it exposes a concrete incompatibility the CTX-08 redesign note walks straight into. /home/adar008/repos/rally_cad/lane_1/GTA_6_CAD/docs/tools/gen-doc-indexes.mjs (issue #136) regenerates the ADR/spec index blocks from directory + Status frontmatter and has a `--check` mode wired into `boundaries` — precisely the 'regeneration check ... in CI' the CTX-04 note proposes as a future V2 upgrade. But its generated-block marker is `<!-- BEGIN generated: adr-index ... -->`, which does NOT match CTX-08's grep pattern (`Code generated .*DO NOT EDIT|@generated|DO NOT EDIT`), and GTA's baseline.config.json ships `"generated_globs": []` — so the CTX-08 note's advice ('any committed derived view ... goes into generated_globs by default') would immediately FAIL the flagship downstream repo unless the marker convention or the pattern is reconciled. The extraction stayed at 'once M-index generates...' future tense and missed both the implementation and the marker mismatch.
- **[major · missing-concept]** *GTA_6_CAD vendored baseline entry / signoff entry / whole-map (deviation ledger as a concept)* — The extraction cites tools/check-baseline-deviations.mjs only as tamper-evidence for the ctx01 patch, missing the mechanism itself and two-thirds of its content. The file is a general, CI-enforced ledger of DELIBERATE deviations from the baseline standard with a revert tripwire and its own selfTest — the exact conceptual dual of baseline's signoff.json (signoff = dated judgment satisfying a rule; deviations = dated judgment REJECTING a rule, made durable: 'To genuinely re-decide a deviation, edit/remove its entry below IN THE SAME PR that adopts the baseline way'). It carries THREE entries, of which the extraction surfaces one: 'husky-not-pre-commit' (SEC-12/SEC-14 deliberately not satisfied the baseline way) and 'no-branch-protection-as-code' (GOV-01/GOV-02 deliberately left SKIP) are absent from the map. For a cross-map about how a real repo relates to the standard, 'how disagreement with a rule is recorded checkably' is a first-class missing concept — and an obvious V2 feature (baseline could ship a deviations ledger next to signoff.json, turning today's silent SKIPs into dated, tripwired decisions).
- **[major · missing-context]** *GOV-02 (strict/up-to-date merges) vs the #115/#127 collision* — Two downstream facts materially reshape this entry. (1) GTA_6_CAD deliberately refuses protection-as-code, with a tripwired deviation whose note says GOV-01/02 SKIP is 'the accepted path, not a gap' — so the entry's advice to 'consider promoting it above warn for multi-writer repos' would turn the flagship multi-writer repo red against its own documented decision, and GOV-02's check (grep over committed ruleset/settings files) structurally SKIPs there ('no files to scan'). (2) Live protection on main already includes exactly what GOV-02 greps for — strict/branches-up-to-date and conversation resolution — applied via `gh api` (devops.md §2), invisible to the at-rest check. The bigger idea hiding in the entry: GOV-02 measures protection-AS-CODE, not protection — a declared-vs-actual gap in baseline's own throughline — and the incident repo shows the mitigation can exist live while the rule reports nothing. This also complicates the entry's counterfactual ('enforced strict checks would have forced #127 to update onto newer main'), since strict/up-to-date protection is documented in the very repo where the near-miss was caught only by reading the diff.
- **[major · missing-concept]** *check.mjs runSelfCheck entry / CTX-01 entry (fail-open channels of the blocker gate)* — The extraction covers one fail-open channel (config swallow) but misses the other two, both documented in sources it already quoted. First: every evaluator runs inside try/catch and degrades to SKIP even at blocker severity (check.mjs line 595), advertised as a feature in SKILL.md ('crash-resilient: an unevaluable check degrades to SKIP, never crashing the run') and listed as a known upstream issue in the very VENDORED.md bullet list the extraction mined — a broken regex or throwing check silently disables a blocker gate while CI stays green. This lands directly on the ADR cost the extraction quotes ('The `CTX-01` rework touches a **blocker** gate — do it behind the baseline guard's `selfTest()` pattern'): fail-open blocker evaluation is precisely why the ADR demands behavioral self-tests. Second: CTX-01 itself has an unconditional-pass branch on shallow clones (check.mjs line 324), which the downstream repo had to work around with fetch-depth:0 — its ci.yml comment documents the degradation verbatim. A cross-map entry about CTX-01's freshness semantics that omits 'the blocker passes unverified on a shallow clone' understates how leaky the stamped model already was.
- **[minor · missing-context]** *GTA_6_CAD vendored baseline entry (version skew)* — The extraction argues the fork-maintenance cost is real but misses the live proof: the vendored drop is pinned at v2.1.1 while upstream is already v2.2.0, and 2.2.0 shipped the entire config-presets/ family and REFERENCE.md that the extraction analyzes upstream — meaning the next re-vendor (which must hand-re-apply the CTX-01 patch per VENDORED.md) is already due. CHANGELOG also shows CTX-01 is the standard's most-churned surface ('severity inversion in CTX-01' fixed in 2.1.1; 2.2.0 'Removed an internal end-of-session reference from CTX-01's fix text'), reinforcing the extraction's own 'absorb the patch natively' priority with historical evidence it didn't cite.
- **[minor · missing-context]** *templates/start-here.md entry (precedence claim 'inverted by the tiers')* — The entry says the template's precedence block is 'inverted by the tiers', but only half of it is. The template's process-half survives verbatim downstream in CLAUDE.md's header — the ADR killed the status blob's product/status precedence, not the product-vs-process authority split, which is an orthogonal precedence axis the repo keeps (knowledge-ledger wins product/strategy; CLAUDE.md+CONTRIBUTING win process/tooling). The template also hard-codes `docs/knowledge-ledger.md` and `CLAUDE.md`/`CONTRIBUTING.md` — direct lineage evidence that baseline's scaffolds were distilled from this exact repo family, which strengthens the cross-map's whole framing (the ADR is the template's birthplace outgrowing it) and belongs in the entry.
- **[minor · missing-context]** *Push discipline + lane branch namespaces (ADR Rule 5) entry; issue-anchoring entry* — The extraction never mined CONTRIBUTING.md, where M-lane already landed as binding prose ('Name: `<lane>/<slug>`', 'open PRs are the live-lane index'), and where I could confirm NO guard enforces it (no branch-name check exists in tools/*.mjs or .github/workflows; commitlint covers commit messages only). That makes Rule 5 the ONLY ADR rule with zero mechanical enforcement anywhere — which sharpens the entry's branch-lint proposal from 'partially checkable' to 'the one genuinely unfilled gap' (M-log, M-orient, M-index, M-ctx01 all have shipped mechanisms). Bonus for the issue-anchoring entry: CONTRIBUTING's contract item 2 still says 'Non-trivial work has a visible GitHub issue first' while its own Branching section says 'One issue per branch — no issue, no work (ADR-0009)' — pre-ADR prose drifting inside the merge contract itself is exactly the checkability argument that entry needed.
- **[minor · weak-implication]** *CTX-09 entry + config-presets/context-management.json entry (over-extraction)* — Near-duplicate entries: both anchor on the same file (config-presets/context-management.json), the same fact (the preset re-anchors on docs/start-here.md), and overlapping redesign advice (drop the resume file from grounding, offer a computed variant). The CTX-09 entry's only independent content is one sentence ('the check kind itself ... is fine'). Splitting them inflates the contradiction count and dilutes the sharper preset entry.
- **[minor · weak-implication]** *check.mjs config loading (silent swallow) entry* — The entry's escalation ('the config flag that carries the whole M-ctx01 decision can vanish without a sound') is wrong in the specific repo it cites: post-M-remove there is no docs/start-here.md, so a swallowed config makes DEFAULTS.status_file fall through firstExisting() to README.md, which carries no 'last-verified:' stamp → CTX-01 FAILs as a blocker and CI goes RED — loud, though misdiagnosed (it points at a missing stamp instead of the broken config). The silent losses are the ones VENDORED.md actually names (advanced profile, bootstrap check). The bigger idea hiding here: whether the swallow fails silent or loud depends on which status model the repo is on — deleting the status file accidentally converted the swallow into a loud (if confusing) failure for computed-model repos, while stamped-model repos stay silently degraded. That asymmetry is the sharper V2 argument for hard-failing on malformed config.

*What survives (the fair half):* The upstream (baseline-skill) side of the extraction is close to exhaustive and its verdicts are right. All 11 CTX rules are individually and correctly characterized (I re-read every rule in rules.json and every cited evaluator in check.mjs); the four load-bearing contradictions (CTX-01's single-HEAD assumption, DEFAULTS.status_file, templates/start-here.md, the context-management preset and init/quickstart scaffolding) are exactly the right ones, and the 'partially-aligns' calls (CTX-03, CTX-06, signoff-as-one-physical-file, preset family, self-dogfooding) are well-judged and defensible. The 'silent' findings correctly identify V1's real gaps (issue anchoring — confirmed: CLAIM-06's ISSUE_TEMPLATE glob is the only issue-adjacent surface in all 69 rules; session logs; push discipline; orientation). The vendored-patch story (VENDORED.md, the behavioral CTX-01 self-test at vendored check.mjs ~586-593, status_computed→n/a, the tamper-evident deviations guard for ctx01) is accurate as far as it goes. The notes' two central tensions are genuine and well-grounded: CTX-01 as the one rule that inverts the 'don't trust a written promise' throughline (and manufactures the #115/#127 PR class under two lanes), and the at-rest/zero-dependency axiom vs the ADR's forge-resident tiers. GOV-02-as-the-motivating-incident is a sharp catch. The blind spot is systematic and one-directional: the extractor read the ADR text and the vendored tools/baseline tree but never swept the rest of the downstream repo — CLAUDE.md §7/§8, CONTRIBUTING's contract, devops.md, tools/check-session-logs.mjs, tools/orient.mjs, docs/tools/gen-doc-indexes.mjs, and two of the three entries in the deviations ledger — so it repeatedly proposes as 'V2 futures' mechanisms the repo already shipped (M-log guard, orient helper, index regeneration check), overstates 'nothing verifies the derivation's inputs', and misses the deviation-ledger concept plus two additional live deviations (SEC-12/14, GOV-01/02) that reframe its GOV-02 advice.

