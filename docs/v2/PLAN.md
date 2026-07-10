# baseline-skill V2 — the "Lens & Ledger" plan

> **Status:** proposed (awaiting Adar's review) · **Date:** 2026-07-09
> **Method:** 3 workflows, 87 agents (~2.7M subagent tokens): extraction ×3 + adversarial pushback ×6 → 29-concept register → online verification ×58 (2 sources/concept, quote+URL, adversarially re-fetched) + gap crew ×6 (10 gaps confirmed) → 3 independent designs → 3-judge panel → posture debate (2 advocates + judge) → synthesis → 4 tough-but-fair critics (39 challenges: 1 blocker, 21 major, 17 minor — all four verdicts *sound-with-fixes*) → orchestrator arbitration (this document).
> **Companion:** [CONCEPTS.md](CONCEPTS.md) — the verified concept register C01–C39 with sources and the extraction-phase pushback record.
> Sections marked **⚠ AMENDED** differ from the synthesizer's draft because a critique was accepted; §14 maps every amendment to its challenge.

---

## 0. TL;DR

V2 splits the product into a **Ledger** (the minimal stored surface: one schema-validated repo descriptor + per-unit human-judgment records that ride branches to main) and a **Lens** (a derivation engine computing status, lanes, orientation, leases, readiness, and divergence on demand from three declared ground-truth planes: **tree / history / forge**). The checker stops verifying stored proxies of state; it (1) derives state directly and (2) verifies that the records the contract requires exist, join mechanically (declared keys, C38), and stay append-only.

- Judges' pick: **Lens & Ledger** spine (fidelity-weighted tally 175 vs 168/168 for PRISM and STRATA; 2 of 3 first-place votes), grafted with PRISM's facts-cache + inputs-digest and STRATA's golden corpus + capability probe.
- Posture: **hybrid-graduated** (see §2) — derived-state epistemology is unconditional; the multi-lane workflow contract is graduated by descriptor declaration.
- CTX-01, `status_file` auto-detection, `templates/start-here.md`, and the `context-management` preset are **retired via expand/contract** — no posture keeps a stored-status path alive.
- Everything ADR-0009 was silent-but-live about (orient, session-log guard, index generation, deviation ledger) is **generalized from the ADR-0009 prototype tooling**, not invented.

## 1. Vision

The premise "don't trust a written promise — make something check it" (C02) is applied to the one place V1 violated it: CTX-01 gated on a hand-maintained stamp. V2 completes the epistemology — wherever V1 checked that a human kept a proxy honest, V2 computes the state itself. The user-facing identity survives: readiness score, blockers fail CI, sign-offs for judgment, scaffold-and-check duality. What changes is the ground truth the verdicts stand on.

**Success metric** (per mandate): quality and efficiency of a solo developer's daily work running N parallel agent lanes. Orientation replaces status-file archaeology; lane collisions become unrepresentable; records write themselves into derivable positions.

## 2. Posture — the ruling (hybrid-graduated)

The posture judge found the advocates had converged on ~80% of the design and ruled a **two-layer graduated posture** (not a lazy split — each layer is fully opinionated):

- **Layer 1 — epistemology, unconditional in every posture:** state is derived, never hand-maintained. No stored-proxy code path exists anywhere: no status template, no `status_file` default, no stamp check-kind. `init` writes the C39 descriptor as its first act, always.
- **Layer 2 — workflow contract, graduated by declaration:** *undeclared* repos get best-effort derived-state (orientation when forge reachable, advisory-only, DESC-01 warn nudging declaration); *declared single-lane* repos get readiness + records, FLOW off; *declared multi-lane* repos get the full contract — lane namespaces, session records + scrub, anchoring per the C15 knob, admit revalidation — as blockers where deterministic (C07).
- One engine, one rule set: posture is descriptor data consumed by C21 scoping — never a code fork.
- The author's daily posture ships as the `multi-lane-agents` preset; `readiness-only` is the V1-equivalent preset (proven by the golden corpus).
- Escape hatches are C08 judgment records with expected-state + tripwire + expiry (the ADR-0009 prototype's deviation ledger, promoted to core).
- **✅ DECIDED (Adar, 2026-07-09):** multi-lane is the **default from V2.0** — `init` writes a multi-lane descriptor unless the user explicitly opts down; any solo dev gets lanes out of the box. The scheduled promotion review dissolves: advocate B's position is adopted at launch. Truly undeclared repos (no descriptor at all) keep advisory-only severity — you can't blocker-storm an arbitrary repo that has no records — but orient and lanes work there best-effort from day one.
- **Recorded dissent (advocate B):** the undeclared middle state may become where users park forever, making DESC-01 ignorable noise. *Resolved by the decision above — the default is no longer the middle state.*

## 3. Ground truth — three planes + exec (C29 resolved by scoping)

| Plane | Contents | Availability | Authoritative for |
|---|---|---|---|
| **TREE** (worktree @ HEAD) | descriptor, records/, code, manifests, workflows | always, deterministic, offline | code/config + all human judgment |
| **HISTORY** (local git odb) | trailers, branch topology, append-only proofs, authorship | offline, fresh as last fetch | lineage, append-only integrity |
| **FORGE** (via `gh`) | issues, PRs, assignments, protection, check runs, merge refs | networked, mutable | work-item state, lane liveness, review/protection behavior |
| **EXEC** | clean-checkout bootstrap/test probes | expensive, opt-in | BUILD-05 crown check (stays in `check`) |

Every rule declares `sources`, `on_unreachable (skip|fail|stale-ok)`, `contexts (check|admit|reconcile)`, `certainty`. Per-command C33 contracts, tested by availability fixtures:

- `check` (advisory): forge rules SKIP(reason) offline, **printed fail-open budget**; `--require-forge` escalates. **⚠ AMENDED (FS3):** in CI gating mode on a forge-declared repo, forge-required blockers **fail closed** — the advisory fail-open budget applies to local advisory runs only.
- `admit` / `reconcile`: **fail closed** on any required-source loss; the only override is an expiring, tripwired break-glass judgment record. **⚠ AMENDED (FS5):** a break-glass JDG must land on main via its own PR *before* it can unblock — it cannot ride inside the change it unblocks. Solo-mode honesty: self-merge remains possible; the control is audit-visibility + expiry, not multi-party authorization.
- `orient`: bounded-stale from the facts cache with per-line age annotation. **⚠ AMENDED (FS9):** orient never hard-refuses — it degrades to a labeled partial view (plane report up front); refusal is reserved for `--strict`.
- **⚠ AMENDED (FS1 — the blocker):** enforcing contexts read `baseline.repo.json` **from the target ref (main), never from the incoming branch**. A PR cannot weaken the posture that judges it; descriptor changes land through their own PR, gated by DESC-03 (below). Branch-local descriptors affect only local advisory output, labeled as such.

## 4. Architecture

```
capability probe → SOURCES (tree | history | forge | exec)
                 → FACTS layer (typed, provenance-carrying; forge facts memoized + cached w/ TTL)
                 → JOIN layer (ONLY descriptor-declared keys → typed graph issue⇄branch⇄pr⇄sessions⇄records; unresolvable join = finding, never a guess)
                 → DERIVED VIEWS (status · lanes+leases · orientation · divergence · readiness — pure functions)
                 → RULE ENGINE (rules-as-data + certainty→severity invariant + readiness/FLOW layering invariant)
                 → VERDICTS (PASS/FAIL/WARN/SIGN-OFF/SKIP(reason)/STALE/DIVERGED + inputs_digest)
                 → SURFACES (orient · lane claim/reclaim · log · check · admit · reconcile · gen · fix · explain · self-check)
```

Key mechanics, with amendments:

- **Facts cache** `.baseline/cache/facts.ndjson` — gitignored, rebuildable, never authoritative, never read by gates. **⚠ AMENDED (F2):** forge fetching uses batched GraphQL under an explicit rate-limit point budget with `updatedAt` cursors; REST conditional requests (ETags) only where REST is used — the draft's "etag-conditional GraphQL" was factually wrong. **⚠ AMENDED (F9):** optional per-machine shared cache (XDG, keyed by origin URL) so N fresh agent clones don't multiply cold fetches.
- **Lane claim = atomic branch creation. ⚠ AMENDED (FS2/S3):** the draft's "forge-assignment compare-and-swap" is not CAS (no conditional-write API; same-account agent fleets are indistinguishable). V2's claim primitive is **`git push origin` of the namespaced branch — ref creation at the remote is first-wins-atomic**. Lane identity = branch name + `Baseline-Agent` trailer; issue assignment becomes informational. Lease freshness derives from forge `pushedAt` (server-side) when available; git-plane fallback is labeled low-confidence (**FS10**).
- **Session records — collision-free by construction. ⚠ AMENDED (CF1):** the `-NN` counter was a read-then-increment race (a C35 violation inside a C13 feature). Filenames become `records/sessions/<lane>/<YYYY-MM-DD>-<HHMMSS>-<agent>.md` — unique without coordination.
- **`admit` — merge-point revalidation (C30/C35). ⚠ AMENDED (F4/CF2/FS7/S4):** fallback-first. Primary binding on plain GitHub (private repo, no merge queue): required `admit` check + branch-protection "require branches up to date" — which forces re-evaluation against current main at the merge-relevant SHA. Where a merge queue exists (`merge_group`), `admit` runs on the actual merge ref and emits `inputs_digest`, now scoped to **admission-relevant facts only**: {merge-ref SHA, target SHA, descriptor hash, rules version, required-check conclusions, anchored-issue state} — no more churn on unrelated forge noise. The digest-confirm ceremony is claimed only where a binding hook exists. **⚠ AMENDED (F8):** admit reuses branch check-run conclusions for exec-class facts at matching SHAs — the crown check doesn't run twice per PR.
- **`reconcile` — the C37 drift loop, read-only. ⚠ AMENDED (F6/FS6):** findings are filed as dedup-keyed GitHub issues (the forge-native inbox) and surface at the top of `orient`; reconcile holds **no write access to main**.
- **Committed snapshot views — CUT. ⚠ AMENDED (CF3/FS6/S1):** the draft's `views/orientation.md` + `views/state.json` (post-merge automation writing to protected main) were cut as a renamed stored-status proxy — the failure mode V2 exists to kill, plus a privilege-separation hole, plus a protection contradiction. What remains of C05: **in-PR generated index views** (`docs/INDEX.md`-class) regenerated by `baseline gen` on the branch (rides the PR, C14) with `gen --check` as the drift guard. Cold-clone/plain-git orientation = read `records/` directly (C28) — they are the derivation inputs, always present.
- **Scrub — layered, honestly labeled. ⚠ AMENDED (F7/CF6/FS4):** `baseline log` scrubs at write time; a scaffolded **pre-push hook** covers hand-written records (CONTRACT.md documents it); REC-02 blocks at PR; reconcile re-scans landed records; a rule checks GitHub push protection / gitleaks is enabled and delegates to them when present. The word "mandatory" is retired — this is defense in depth with a documented residual risk (C34), plus a descriptor axis to route session records to private storage for public repos.
- **Descriptor change control. ⚠ AMENDED (CF4):** new **DESC-03** — a diff touching `baseline.repo.json` requires a JDG record in the same PR; posture-*weakening* diffs are blocker-severity in `admit`. DESC-02 (engine actually consumes descriptor fields) moves into the skill's own self-check (**S7**) — it was an engine property, not a repo property.
- **Anchoring knob decoupled. ⚠ AMENDED (CF8):** the C15 strictness knob (`strict|relaxed|off`) is orthogonal to workflow mode — single-lane repos can adopt anchoring; multi-lane presets default it to `strict`.
- **Same-PR atomicity gets a rule. ⚠ AMENDED (CF9):** FLOW-06 (warn, heuristic — severity honest per C07): a PR changing a gated subject should carry the corresponding record update (C14/C26's same-PR discipline, previously prose-only).
- **REC-01 append-only proof hardened. ⚠ AMENDED (CF7):** history scan covers modify/delete/rename (`--diff-filter=MDR` + content-hash comparison), closing the delete-and-recreate hole.

## 5. Stored surface (the Ledger) — complete list

| Artifact | Why it cannot be derived |
|---|---|
| `baseline.repo.json` (schema-validated, C39) — type, lifecycle, maturity, owner, `ground_truth_boundary`, `workflow`, anchoring knob, lane namespace pattern, join keys, engine pin, lease TTL, staleness ceilings | The repo's claim about itself is root intent; every applicability derivation consumes it |
| `records/decisions/ADR-*.md` | Rationale and rejected alternatives exist in no diff |
| `records/judgments/JDG-*.json` (sign-off \| deviation \| risk-acceptance; expected_state + tripwire + review_by) | Risk acceptance is dated human judgment (C08); the tripwire lets the engine detect when the accepted world changed |
| `records/claims/CLM-*.json` (per-claim, exploded from the monolith) | Assertions about the external world (C23) |
| `records/sessions/<lane>/<date>-<time>-<agent>.md` with `next:` | The forensic tier's sole content: why, dead ends, unfinished intent (C06) |
| `.baseline/scrub-allowlist.json` (dated entries) | "Not actually a secret" is a judgment |
| `tools/baseline.lock.json` | Version pin — skew detection input (REC-06) |
| `.github/workflows/baseline-*.yml` | Repo-owned CI wiring |
| *(gitignored)* `.baseline/cache/facts.ndjson` | Derivable — therefore never committed, never authoritative (C01's legitimate-cache nuance) |
| *(optional)* in-PR generated `docs/INDEX.md`-class views, marked + drift-guarded | Derivable — C05-legit convenience only **(⚠ AMENDED: main-written snapshot views cut)** |

Everything else V1 stored is retired or derived.

## 6. Rule categories

| Category | Disposition | Notes |
|---|---|---|
| BUILD / TEST / SEC / COMM / QUAL / REPRO / OPS | **keep/rehome** | Golden-corpus-pinned behavior; all gain `sources/on_unreachable/contexts/certainty`; BUILD-05 stays the crown check; OPS gains reconcile-freshness (the drift loop itself must run) |
| CTX | **split** | CTX-01 → replaced by `derive/status`; CTX-02/04/05/07/08/10/11 survive rehomed; new CTX-12 stored-status **tripwire** (deterministic signatures = blocker post-migration; heuristic residue = warn) |
| CLAIM | **repoint + maturity-gate** | Per-claim records; activates at descriptor maturity `claimed` **(⚠ AMENDED S8: discrete maturity tiers gate activation; the continuous weight curves are cut)** |
| GOV | **redesign GOV-01/02** | File-proxy checks → live forge-behavior asserts, confined to admit/reconcile contexts, SKIP at rest (C22; even the author refused the file proxies) |
| **FLOW** (new) | add | Anchoring per knob (C15), branch-carries-session-record, `next:` guard (from check-session-log.mjs), push discipline, lease liveness, FLOW-06 same-PR record atomicity **(⚠ AMENDED CF8/CF9)** |
| **MERGE** (new) | add | Admission re-derivation at the integration point (C30/C35); no unmerged sister-branch dependencies (C32) **(⚠ AMENDED F4: fallback-first binding)** |
| **REC** (new) | add | Append-only proof (MDR-hardened), scrub-clean, record schemas, one-home duplication detector — REC-04 pinned warn-only by the certainty→severity invariant **(⚠ AMENDED CF7/CF10)** |
| **DIV** (new) | add | Cross-tier divergence as first-class DIVERGED verdicts (C36): issue-closed-but-lane-active, `next:`-points-at-closed-issue, done-labeled-nothing-merged |
| **DESC** (new) | add | DESC-01 descriptor absent/invalid → warn + scaffold; **DESC-03 descriptor change control (⚠ AMENDED CF4/FS1)**; DESC-02 moved to skill self-check **(⚠ AMENDED S7)** |

Self-check enforces two structural invariants: **certainty→severity** (blocker requires deterministic; judgment requires sign-off routing) and **layering** (readiness rules may never consume FLOW facts — the checkable anti-scope-creep proof).

## 7. Folder layout

As drafted by the synthesis (see §4 for semantics), with two amendments: `views/orientation.md` + `views/state.json` are **removed** from the consumer footprint (CF3); session filenames use the collision-free timestamp form (CF1).

```
baseline-skill/                       # product repo
  SKILL.md            # agent operating contract (Claude Code + Hermes)
  CONTRACT.md         # plain-git human twin (C28): exact branch patterns, frontmatter, trailers
  baseline.mjs        # single zero-dep CLI
  src/  probe · facts/{tree,git,forge,exec} · cache · join · derive/* · engine · verdicts · scrub · selftest
  rules/  build|test|ctx|claim|sec|gov|comm|qual|repro|ops .json  +  flow|merge|rec|div|desc .json
  schema/ repo.schema.json · record.*.schema.json · keys.md
  templates/  baseline.repo.json · adr.md · session-log.md · judgment.json · claim.json · workflows/*
              # no status-doc template exists or can exist (ruling condition 1)
  config-presets/  multi-lane-agents · readiness-only · node-service · python-library · product-with-claims
  test/  golden/ (structured verdict pins) · fixtures/ (availability + 4 canonical postures)
  docs/ MIGRATION.md REFERENCE.md GLOSSARY.md layers.md

consumer-repo/
  baseline.repo.json                  # the only mandatory stored file
  records/ decisions/ · judgments/ · claims/ · sessions/<lane>/<date>-<time>-<agent>.md
  docs/INDEX.md                       # optional, generated in-PR, drift-guarded
  tools/baseline.lock.json            # pointer install pin
  .baseline/ cache/facts.ndjson (gitignored) · scrub-allowlist.json
  .github/workflows/ baseline-check|admit|reconcile .yml
```

## 8. Migration — 7 modules, expand/contract (C26) **⚠ AMENDED (F1/F3/S5/S9)**

Re-sequenced (forge plane moved ahead of orient — orient's value is forge-derived), corpus de-byte-ified, 9→7 modules, `--vendor` demoted to a documented manual procedure:

| # | Module | Change | Risk |
|---|---|---|---|
| 1 | **M1 runner-split + corpus** | Refactor check.mjs into src/ planes behind a **structured-verdict** golden corpus (rule id → status+detail pins; probe output excluded) | regression during refactor — corpus is the net |
| 2 | **M2 descriptor** | `baseline.repo.json` + schema + presets + redesigned `init` (descriptor-first, always); DESC rules incl. target-ref anchor + DESC-03 | low, additive |
| 3 | **M3 facts + orient** | tree/history/**forge** adapters, capability probe, facts cache, `derive/status`, **`baseline orient`** (generalizing orient.mjs) + Claude Code SessionStart hook + Hermes `prefetch`/`system_prompt_block` plugin (§13.4) | orientation must beat start-here.md on day one |
| 4 | **M4 records + ledger** | Record schemas, `baseline log` + scrub layers, REC/FLOW advisory (warn), JDG unified ledger (generalizing check-baseline-deviations.mjs), claims exploded per-unit | record friction rejected by daily use |
| 5 | **M5 lanes** | Branch-creation claim, derived leases, FLOW enforcement per posture, DIV rules (generalizing check-session-log.mjs) | forge fragility (gh auth in agent sandboxes, rate limits) |
| 6 | **M6 admit + reconcile + gen** | Fallback-first admit, digest where bindable; read-only reconcile filing issues; in-PR `gen --check` index views | fail-closed admit blocks merges during forge outages — break-glass JDG is the relief valve |
| 7 | **M7 promote + contract** | Severity promotion (advisory→blocker per posture); **then, after one clean cycle:** delete start-here template, status-stamp kind, `status_file` default, context-management preset; pointer install + lock ships | the classic expand/contract failure is never contracting — this module has a date, not a vibe |

> **⚠ AMENDED (M2 — Adar's ruling, 2026-07-10):** M2 ships the *honest slice* — the descriptor + `schema/repo.schema.json` + posture presets + **DESC-01** (absent/invalid → warn + scaffold) + descriptor-first `init` + the **S7** self-check invariant (every descriptor field has a declared consumer). The **target-ref read is wired at the loader seam**, but **DESC-03 (descriptor change-control) and target-ref *enforcement* are deferred to M4 (JDG records) + M6 (`admit`)** — neither can function before those contexts exist, so nothing is stubbed that cannot yet act. `baseline.config.json` (tuning) and `baseline.repo.json` (identity/posture) **stay separate**; the descriptor's `type` supersedes auto-detection, and convergence to one file remains M7's contract job. *(M1 landed as PR #7; M2 landed as PR #25.)*

> **⚠ AMENDED (M3 — sliced, 2026-07-10):** M3 (issue #20) is ~3–4× a normal module, so it ships in slices. **M3a (shipped): `baseline orient`** — the unified `baseline.mjs` CLI (`orient` new; `check` delegates to the intact check.mjs), the capability probe, and the derived-state survey generalizing the ADR-0009 `orient.mjs` (capability header · divergence-first · live lanes · backlog · this-lane `next:`), plus the Claude Code SessionStart hook + SKILL first-act directive. `gh`-based, degrades gracefully (FS9), dogfooded on baseline-skill's own forge. **M3b (shipped):** the typed facts layer + `.baseline/cache` (advisory-only) + `join` over declared keys (`schema/keys.md`) + `derive/status` + forge record/replay fixtures, with `orient` refactored onto `facts→join→derive`. **M3c (shipped):** the per-rule `sources/on_unreachable/contexts/certainty` backfill + the self-check structural laws (blocker⇒deterministic, sign-off⇒judgment) + CTX-12 (stored-status tripwire, warn). **Deferred:** the Hermes plugin (M3d).

Each module is shippable alone and immediately dogfooded on **baseline-demo** (the public reference repo). baseline-skill is the tool, not a consumer repo: its CI keeps self-check + golden corpus + a minimal-config self-score (C19's own-repo enforcement, deliberately minimal); full self-application is at most a post-M7 showcase with explicit opt-downs.

## 9. V1 dispositions (every contested area decided)

| V1 area | Disposition | Why (one line) |
|---|---|---|
| CTX-01 status-stamp | **replace** | Hand-maintained authoritative stamp; manufactures the multi-lane collision class it exists to prevent |
| `DEFAULTS.status_file` auto-detection | **retire** | Keeping the detector keeps a stored-status escape hatch alive |
| `templates/start-here.md` | **retire** | The exact drift-and-collide artifact V2 eliminates; its job moves to `orient` |
| `config-presets/context-management.json` | **replace** | Mechanism contradicts; its intent re-lands as `multi-lane-agents` |
| `SKILL.md` init mode | **redesign** | Becomes the descriptor interview; cannot scaffold a status doc |
| signoff ledger (shared JSON) | **redesign** | Judgment tier is load-bearing (C02/C07) but a shared mutable file violates C12/C17 → per-unit `records/judgments/` |
| CLAIMS.json monolith | **redesign** | Semantics align (C23); the monolith collides under lanes → per-claim records |
| GOV-01/02 protection-as-code | **redesign** | File proxies invite checkbox compliance (C22); → live forge asserts in admit/reconcile |
| ~60 aligned rules | **keep** | Adversarially earned (C25); behavior pinned by the golden corpus |
| vendoring / install.sh copy | **replace** | The 2.1.1-vs-2.2.0 skew; → pointer install + lock + skew detection |
| score / explain modes | **keep** | Cross-map: ALIGNS |
| profiles + applies_to | **keep** | C21 survives, composed with posture axes |
| `--self-check` | **keep + extend** | Gains the two structural invariants + fixtures |
| adr.md / doc-with-freshness templates | **keep** | ALIGN; ADRs move under `records/decisions/` |
| Dual runtime (Claude Code + Hermes) | **keep** | SKILL.md reframed as the operating contract with orient as first act |

## 10. Risks (owned, not hidden)

1. **Size honesty (⚠ AMENDED F10):** estimated ~3.5–4.5k LOC engine + adapters, ~90 rules with 4 new curated metadata fields, test estate ≥ all of V1 — for a solo maintainer. Accepted as the cost of the mandate; M1's corpus and the module sequence are the mitigation.
2. **Forge fragility:** gh auth in agent sandboxes, rate limits under N clones, outages during merges → capability probe + fail-closed-with-break-glass + shared cache.
3. **Join-key discipline decay** (skipped trailers, faked logs) silently blinds derivation — Goodhart on our own process → DIV rules + reconcile + FLOW guards; residual risk accepted.
4. **A secret rides a record to public main** → layered scrub with documented residual risk + private-records descriptor axis (⚠ AMENDED FS4).
5. **Posture dissent B materializes** (users park undeclared forever) → scheduled promotion review.
6. **Ceremony routed around by a solo dev in a hurry** → the ceremony is thinnest where the value is thinnest (advisory single-lane) and hard only at admit.
7. ~~Committed views become a stored-status proxy~~ — **eliminated by cutting them** (⚠ AMENDED S1).

## 11. Deferred (V3 horizon)

Session-log compaction contracts (V2 bounds reads: orient consumes latest N per lane) · content-addressed incremental derivation cache (facts.ndjson TTL is the stand-in) · signed attestations for traveling derived facts (SLSA/in-toto) · second forge driver (GitLab / Hermes-native; forge facts already schema-neutral) · fleet-level multi-repo orientation (orient output is machine-readable by design).

## 12. The null hypothesis, answered

The scope critic's toughest question: *why not keep V1 and just patch CTX-01 + add orient.mjs (what the ADR-0009 prototype already half-built)?* Answer, accepted into the plan: the null hypothesis genuinely cannot deliver (a) merge-point revalidation (C30/C35 — V1 has no act-time concept), (b) derived leases and collision-free lanes (C31/C13 — no forge plane), (c) divergence detection (C36 — no cross-tier join), (d) the certainty→severity invariant (C07 — V1's severity is hand-assigned), or (e) the end of vendored skew (the pointer install needs the engine/descriptor split). What the null hypothesis *does* deliver — derived status + orientation — ships **first** (M2+M3) precisely so that if V2 stalled there, the highest-value slice would already be live. The migration order *is* the null-hypothesis hedge.

## 13. Decisions — locked by Adar, 2026-07-09 (were: open questions)

1. **Default posture → multi-lane for everyone.** "Any one dev can go into lanes": `init` defaults to a multi-lane descriptor (solo dev included); the graduated middle state stops being the default. No promotion review needed — decided at V2.0. Guard kept: repos with *no* descriptor stay advisory-severity (no blocker-storms on arbitrary repos), but orient/lanes work best-effort immediately.
2. **Lease TTL = 7 days.** `multi-lane-agents` preset ships `lease_ttl: "7d"` — a lane with no push for 7 days derives as ABANDONED and is reclaimable (descriptor-tunable per repo).
3. **Claude-memory side channel: banned.** Enforceability, honestly:
   - **Structural (guaranteed):** no V2 rule, view, or derivation ever reads agent memory — memory is *inert to derived state by construction*. Asserted in the skill's own self-check (engine property).
   - **Harness-level (strong, per workstation):** Claude Code — a permission deny / `PreToolUse` hook on writes to the project's memory directory; Hermes — the memory-provider plugin layer exposes an `on_memory_write` hook (verified in Hermes_backup: `plugins/agentmemory/plugin.yaml`) where project-scoped writes can be refused.
   - **Repo/CI-level (not possible):** memory lives outside the repo tree; a repo checker cannot observe it. The ban is therefore: structurally inert + workstation-enforced + policy-stated in CLAUDE.md/CONTRACT.md — not repo-verifiable, and documented as exactly that.
4. **Hermes: confirmed — orient can be enforced infrastructure.** Evidence from `AdarGit008/Hermes_backup`: Hermes plugins declare lifecycle hooks — `plugins/agentmemory/plugin.yaml` lists `prefetch`, `sync_turn`, `on_session_end`, `on_pre_compress`, `on_memory_write`, `system_prompt_block`; the plugin README describes "pre-LLM context injection … and system prompt block injection." V2 therefore ships a thin **`baseline-orient` Hermes plugin**: `prefetch` runs `baseline orient` when the working repo has a descriptor; `system_prompt_block` injects the result. Orientation becomes enforced on **both** runtimes (Claude Code via SessionStart hook, Hermes via plugin), with the SKILL.md first-act directive as the tool-agnostic fallback (C28). Added to M3 scope.

## 14. Pushback record — design phase (Workflow 3)

### 14.1 Judge panel

| Design | Thesis | Fidelity-weighted tally | First-place votes |
|---|---|---|---|
| **Lens & Ledger** (winner) | minimal stored ledger + derivation lens; records as the contract | **175** | 2/3 |
| PRISM (purist derive-engine) | 4 source adapters → fact store → join → views; smallest stored surface | 168 | 1/3 |
| STRATA (layered pragmatist) | strict L0/L1/L2 source layering; maximal V1 continuity | 168 | 0/3 |

**Grafts the judges required (kept):** PRISM's facts-cache with provenance + inputs-digest CAS; STRATA's golden corpus + capability probe + availability fixtures; PRISM's DRV-style stored-status tripwire (as CTX-12, severity-graduated); STRATA's per-rule source/contract metadata.

### 14.2 The four critics — 39 challenges, arbitrated

All four verdicts: *sound-with-fixes*. Disposition legend: **✔ fix** = accepted, plan amended (see ⚠ markers above) · **✂ cut** = accepted by removing the feature · **◐ partial** = accepted with narrowed scope · **✋ rejected** = challenge overruled, reason given. The full challenge texts are in the machine record (`wf3-full.json`); dispositions:

| # | Sev | Challenge (gist) | Disposition |
|---|---|---|---|
| **Feasibility** | | | |
| F1 | major | `orient` ships before the forge plane it depends on | ✔ fix — forge adapter moved into M3 |
| F2 | major | "etag-conditional GraphQL" — GraphQL has no ETags | ✔ fix — rate-limit-budgeted GraphQL + REST conditionals where REST is used |
| F3 | major | Byte-identical golden corpus is impossible per the plan's own grafts | ✔ fix — structured verdict pins, probe excluded |
| F4 | major | `admit --confirm` needs merge queues unavailable on private-repo free plans | ✔ fix — fallback-first: required check + up-to-date-branches; digest only where bindable |
| F5 | major | No story for faking the forge plane in tests | ✔ fix — record/replay adapter + committed forge-fact fixtures |
| F6 | major | Reconcile findings go nowhere (cron exit codes have no audience) | ✔ fix — dedup-keyed GitHub issues + orient surfaces them first |
| F7 | minor | Homegrown regex can't honestly be a "mandatory" scrub gate | ✔ fix — layered scrub, delegates to gitleaks/push-protection, "mandatory" retired |
| F8 | minor | Crown check executes twice per PR (check + admit) | ✔ fix — admit reuses check-run conclusions at matching SHAs |
| F9 | minor | N cold agent clones each re-fetch the forge | ✔ fix — optional per-machine shared cache |
| F10 | minor | Size cost accepted but never quantified | ✔ fix — quantified in §10.1 |
| **Concept fidelity** | | | |
| CF1 | major | Session `-NN` counter is a read-then-increment race (violates C35/C13) | ✔ fix — timestamp+agent filenames, unique by construction |
| CF2 | major | Nothing binds digest-confirm to the merge act without merge_group | ✔ fix — merged with F4; binding claimed only where it exists |
| CF3 | major | Views writer needs push-to-protected-main; collides with GOV asserts | ✂ cut — committed snapshot views removed; in-PR index views only |
| CF4 | major | The descriptor — V2's largest stored intent — has no change control | ✔ fix — DESC-03 same-PR JDG requirement; weakening = admit blocker |
| CF5 | major | Multi-lane contract is forge-coupled by construction | ◐ partial — by design per ADR-0009 Rule 5 (origin is the rendezvous); added a reduced git-plane `multi-lane-local` mode, honestly labeled |
| CF6 | major | Scrub only guards records written via `baseline log` | ✔ fix — pre-push hook + CONTRACT.md + push-protection rule + residual-risk note |
| CF7 | minor | REC-01 `--diff-filter=M` misses delete/recreate | ✔ fix — MDR + content-hash |
| CF8 | minor | Anchoring gated on multi-lane contradicts C15's orthogonality | ✔ fix — knob decoupled |
| CF9 | minor | C14 same-PR atomicity enforced for sessions only | ✔ fix — FLOW-06 (warn) |
| CF10 | minor | REC-04 heuristic sits next to blockers | ✔ fix — pinned warn by the certainty invariant |
| **Failure & security** | | | |
| FS1 | **blocker** | Which ref's descriptor governs the gate? A PR can weaken its own posture | ✔ fix — target-ref policy read, descriptor changes inert until merged (§3) |
| FS2 | major | Issue assignment is not CAS; same-account agents indistinguishable | ✔ fix — atomic branch-creation claim primitive |
| FS3 | major | `check`'s fail-open SKIPs contradict the C20 no-fail-open-blockers embodiment | ✔ fix — per-context contract clarified (§3) |
| FS4 | major | Merge-time scrub is too late for public repos (push is the deadline) | ✔ fix — write/push-time layers + private-records axis + residual risk owned |
| FS5 | major | Break-glass JDG is self-authored inside the blocked change | ✔ fix — must land on main via its own prior PR; solo-mode limit documented |
| FS6 | major | Post-merge automation combines main-write with repo-code execution | ✂ cut — views writer removed; reconcile is read-only + issues |
| FS7 | major | Fallback digest-CAS is self-referential without a binding hook | ✔ fix — merged with F4/CF2 |
| FS8 | minor | facts.ndjson is tamperable and orient trusts it | ◐ partial — cache stays advisory-only (gates never read it); integrity hash + age labels added; residual accepted |
| FS9 | minor | Orient's hard staleness refusal conflicts with orient-as-mandatory-first-act | ✔ fix — labeled partial views, never hard refusal (except `--strict`) |
| FS10 | minor | Lease freshness from committer timestamps is client-controlled | ✔ fix — forge `pushedAt` primary; git fallback labeled |
| **Scope & null hypothesis** | | | |
| S1 | major | Committed views are a renamed stored-status proxy | ✂ cut — same as CF3 |
| S2 | major | Byte-identity contradiction | ✔ fix — same as F3 |
| S3 | major | Lane-claim CAS broken for the actual (same-account) user | ✔ fix — same as FS2 |
| S4 | major | inputs_digest churns on admission-irrelevant forge noise | ✔ fix — digest scope narrowed |
| S5 | major | 9-module ceremony sized for a population of ~1 (author's repos) | ◐ partial — compressed to 7; expand/contract kept: ADR-0009 itself flags the gate-touching step ⚠, and staged replacement protects any live consumer of the engine. Further collapse **✋ rejected** |
| S6 | minor | 12-cell posture-matrix test estate | ✔ fix — 4 canonical posture fixtures |
| S7 | minor | DESC-02 checks an engine property as a repo rule | ✔ fix — moved to skill self-check |
| S8 | minor | Continuous maturity weight curves are an unasked-for tuning surface | ✂ cut — discrete tiers gate activation only |
| S9 | minor | `--vendor` is a maintained mode for zero known air-gapped consumers | ✂ cut — documented manual procedure instead |

**Scorecard: 35 accepted (28 fixes, 5 cuts, 3 partial-of-which-2-also-fix), 1 rejected-in-part (S5's further-collapse suggestion).** Every ⚠ AMENDED marker in §3–§8 traces to this table.

---

*Appendix A below maps all 39 concepts to their V2 embodiment (generated from the synthesis, amended entries marked).*

## Appendix A — concept embodiment map (C01–C39)

> From the synthesis, post-arbitration. Entries where an amendment applies carry a ⚠ note.

| Concept | V2 embodiment |
|---|---|
| **C01** | Status, lanes, and orientation are computed by derive/*.mjs from tree/history/forge at invocation; the only stored derived things are two declared non-authoritative caches (gitignored age-annotated facts.ndjson; main-only as_of-stamped views/) that gates never read; CTX-12 tripwires hand-maintained status, deterministic signatures at blocker severity in every posture. |
| **C02** | Every SKILL.md behavioral norm maps to a named rule with an exit code; checks that resist encoding route to JDG sign-off records with review_by + tripwire; and C02 is applied reflexively — the spine's prose freshness promise is replaced by the digest check, and the severity doctrine itself is machine-enforced by self-check. |
| **C03** | facts/exec.mjs keeps BUILD-05 as the crown check — bootstrap/test actually executed in `check` (not exiled to cron); reconcile optionally runs clean-checkout probes on schedule. |
| **C04** | The stored surface is enumerated and closed (descriptor + judgment records + two declared caches + lock + wiring); REC-04 polices additions; everything else — status, lanes, leases, readiness — is derived. |
| **C05** | `baseline gen` writes GENERATED + input-hash + as_of headers; `gen --check` is the CI drift guard and reconcile re-checks; views/ has a single writer (post-merge main automation); even the --vendor runner copy is a hash-guarded provenance-marked generated artifact. **⚠ AMENDED:** in-PR index views only (main-written snapshots cut — CF3/S1) |
| **C06** | Declared precedence: ground truth (merged main + forge) > directive (descriptor, ADRs) > forensic (session logs), with the GTA domain partition (tree/git tier-1 for code-state, forge tier-1 for work-state); session logs stay sole-source-authoritative for pause state; DIVERGED surfaces conflicts before precedence picks the fix direction. |
| **C07** | Certainty is a mandatory rule field and self-check enforces blocker⇒deterministic and judgment⇒sign-off as schema law (STRATA graft), plus the source-axis constraint that forge rules block only in admit/reconcile; the posture ruling itself is C07 applied — an undeclared descriptor is an ambiguous signal, so it warns. |
| **C08** | records/judgments/JDG-*.json: dated, authored, rule-scoped, with expected_state + machine-checkable tripwire + review_by; the ONLY override for fail-closed gates; reconcile fires expiries and tripwires; GOV-style refusals expressible out of the box. |
| **C09** | One home per fact class (work-state on the forge, decisions in ADRs, waivers in JDG, identity in the descriptor); REC-04 duplication detector; generated views link and roll up but never duplicate authoritatively. |
| **C10** | Descriptor-declared namespaces (lane/*, records/*, deploy/*); FLOW-04 enforces placement; `lane claim` creates namespaced branches mechanically so nobody free-hands a colliding name. |
| **C11** | Every session is stateless by construction: orient fetches and re-derives from origin first; coordination happens only through pushed records; Claude memory is documented as a mirror-only flagged exception (its continued sanction is an open user decision). |
| **C12** | records/sessions/<lane>/<date>-NN.md appended via `baseline log`; REC-01 proves append-only from git history (diff-filter=M over records/sessions/** is a deterministic finding). **⚠ AMENDED:** timestamp+agent filenames replace the NN counter (CF1) |
| **C13** | Collision-freedom is structural at four levels: unique record paths, namespaced one-writer branches, append-only enforcement, and a snapshot cache with a single writer (main automation) — plus machine-generated join keys removing the vigilance burden entirely. |
| **C14** | Session records, judgments, claims, and ADRs travel in the same PR as the change they describe (FLOW-02); as append-only new files they survive squash and land atomically at merge; the 'update the status' PR class no longer exists. **⚠ AMENDED:** FLOW-06 same-PR record atomicity rule added (CF9) |
| **C15** | FLOW-01 anchoring severity comes from the descriptor knob strict/relaxed/off (blocker only in declared multi-lane repos), exactly as the contested verification and ruling condition 2 demand — an explicit posture axis, never pretended consensus and never a silent fast-path. **⚠ AMENDED:** anchoring knob decoupled from workflow mode (CF8) |
| **C16** | Orient is SKILL.md's mandatory first act with an installable Claude Code SessionStart hook (orientation as infrastructure, not remembered discipline) and a Hermes session-start directive; it is a zero-prompt printed view headlined by the capability report. |
| **C17** | Every judgment unit is one owned file — ADR-NNNN, JDG-NNNN, CLM-NNNN, per-session logs — with independent lifecycle and single writer; both V1 monoliths are exploded at M4. |
| **C18** | Sharded rules/*.json on the generic engine; rules carry rationale/fix/source plus sources/on_unreachable/contexts/certainty as introspectable data; explain unchanged in spirit. |
| **C19** | self-check validates schemas, the certainty and layering invariants, and guard selfTest()s; the skill repo's CI runs the golden corpus, availability/posture fixtures, and a minimal-config self-score — full check+admit+reconcile dogfooding lives on baseline-demo, not the skill repo; migration retirements are tripwired judgments recorded where the ledger lives. |
| **C20** | Collectors never crash on the untrusted audited repo — they emit SKIP(reason) facts; the capability probe headlines every degradation on every command; the fail-open budget is printed, and blockers cannot fail open in gating contexts. **⚠ AMENDED:** per-context fail-open/fail-closed contract clarified (FS3) |
| **C21** | applies_to × profiles × contexts × posture axes all derive from the descriptor; skips never count against score, 'not applicable' is separated from 'could not evaluate', and readiness-only proves adoption with zero workflow noise. |
| **C22** | GOV-01/02 flip from protection files to live forge behavior; MERGE-03 and workflow-wired verify gates actually run; BUILD-05 executes rather than checks presence; upgrades continue incrementally under golden-corpus cover. |
| **C23** | Per-claim CLM records carry statement, build_state, blast_radius, dated prior-art, resolvable citations, review_by decay; reconcile surfaces expiry; the rollup is a generated view, never the home. |
| **C24** | The descriptor's maturity field is consumed (PRISM graft): CLAIM category activates at 'claimed', doc-freshness and DIV weights rise with maturity — drift-climbs-the-stack encoded as applicability, closing the one hole judges found in the spine. **⚠ AMENDED:** discrete maturity tiers only; weight curves cut (S8) |
| **C25** | Every surviving rule keeps its lesson/source provenance; new FLOW/MERGE/REC/DIV/DESC rules cite their GTA incident or verified pattern (merge queue, GitOps cron, Scorecard); the condition-10 promotion review supplies the adversarial-adoption evidence the graduated posture needs. |
| **C26** | Nine expand/contract modules: replacement + repointed gates live before any removal, M9 removal last, dual-severity transition releases with a published diff, and tripwired retirement judgments so the contract phase cannot silently stall. |
| **C27** | Every rule carries fix; `baseline fix`/scaffold generates descriptors, records, and workflows and executes the migration converters — and per ruling condition 1 it is structurally unable to scaffold a hand-maintained status artifact. |
| **C28** | CONTRACT.md states the whole contract in plain git terms (exact paths, frontmatter, trailers); records are plain markdown/JSON; committed views/ snapshots give cold-clone legibility — every declared posture is satisfiable by hand with no tooling. |
| **C29** | Three declared planes plus exec; per-rule sources/on_unreachable/contexts; `check` is the repolinter posture (offline-true, and at-rest declaration suppresses forge reads entirely per the dissent), admit/reconcile are the Scorecard posture; the two caches bridge them without either silently substituting for the other. |
| **C30** | `baseline admit` re-derives on the actual merge ref inside merge_group (fallback: required check on an up-to-date branch, still digest-confirmed); MERGE-03 verifies post-merge main revalidation runs — a verdict names one tree at one moment. **⚠ AMENDED:** primary binding = required check + up-to-date branches (F4) |
| **C31** | Leases are fully derived — issue assignment + branch last-push age vs descriptor TTL, nothing stored to go stale; orient shows LIVE/STALE/ABANDONED and `lane reclaim` posts the reclamation comment and reassigns, so a dead agent never wedges a namespace. **⚠ AMENDED:** lease from forge pushedAt; claim = atomic branch creation (FS2/FS10) |
| **C32** | Main is the only rendezvous: MERGE-02 flags any dependency on an unmerged sister branch unless a Baseline-Stacked-On trailer declares the stack explicitly, making the relationship itself derivable. |
| **C33** | on_unreachable is mandatory per rule and the per-command contract table (docs/layers.md) is fixture-tested: admit/reconcile fail CLOSED; check SKIPs with a printed budget and --require-forge; orient serves bounded-stale with banners and hard ceilings that refuse rather than silently age. |
| **C34** | scrub.mjs gates `baseline log`, REC-02 blocks record commits, and reconcile re-scans landed records; deterministic secret patterns block while entropy heuristics warn (C07-consistent); the allowlist is itself dated judgment records. **⚠ AMENDED:** layered scrub + push-protection delegation + residual risk owned (F7/CF6/FS4) |
| **C35** | Two concrete CAS primitives: `lane claim` uses forge assignment as compare-and-swap at claim time, and admit emits inputs_digest = sha256(merge-ref, main, forge fact ids/etags, rules version, descriptor hash) with the merge action requiring `--confirm <digest>` — re-derive and refuse on drift, closing the spine's prose gap (PRISM graft). **⚠ AMENDED:** fallback-first binding; digest narrowed (F4/S4); session filenames collision-free (CF1) |
| **C36** | DIVERGED is a first-class verdict from derive/divergence.mjs (DIV-01..03: closed-issue-live-branch, next-points-at-closed, done-with-nothing-merged), headlined in orient and check output; precedence never eats a divergence silently. |
| **C37** | baseline-reconcile.yml runs `baseline reconcile` on cron against main: forge-behavior rules, gen --check drift, JDG review_by/tripwire firings, DIV sweep, scrub re-scan — catching drift that never rode a PR, with an OPS freshness rule guarding that the loop itself keeps running. **⚠ AMENDED:** reconcile read-only; findings filed as issues (F6/FS6) |
| **C38** | schema/keys.md declares the join keys; `lane claim` and `log` machine-generate them (branch names, trailers, frontmatter) so nobody hand-types a key; join.mjs consumes only declared keys and unresolvable joins are findings — a checked relational join, never NLP inference. |
| **C39** | baseline.repo.json is the schema-validated root stored intent carrying the ruling's mandated axes (ground_truth_boundary, workflow, anchoring) plus type/lifecycle/maturity/owner and lane/join/lease config; init always writes it first; every applicability, severity, and join derivation consumes it; its absence is a detected transitional WARN with a scaffold fix — the Backstage catalog-info pattern as keystone. **⚠ AMENDED:** DESC-03 change control; gates read target-ref descriptor (CF4/FS1) |
