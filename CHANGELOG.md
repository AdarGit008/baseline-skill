# Changelog

All notable changes to the `/baseline` skill are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com); the runner is versioned in
`rules.json` and `SKILL.md`.

## [Unreleased]

### Added — V2 M3c: rule metadata backfill + CTX-12 (the Lens's contract)
- **Every rule now declares `sources` / `on_unreachable` / `contexts` / `certainty`** (introspectable
  data): which ground-truth planes it reads, what it does when one is unreachable, the contexts it
  runs in, and how certain its verdict is. 38 deterministic, 28 heuristic, 5 judgment.
- **`--self-check` enforces two structural laws** (STRATA graft): a **blocker must be deterministic**
  and a **sign-off must be judgment** — plus per-field validity and a layering check (readiness rules
  can't consume FLOW facts, inert until M5). The existing rule set satisfies both with zero conflicts.
- **CTX-12** — the stored-status **tripwire** (71 rules total): warns when a hand-maintained
  `last-verified:` stamp is present (the artifact V2 replaces with derived `orient`). Warn now while
  CTX-01 still gates the stamp; promotes to blocker once migration completes (M7).
- Golden corpus re-pinned: only CTX-12 added (metadata fields are inert to verdicts).

### Deferred (M3 continues)
- **M3d** — the Hermes `prefetch`/`system_prompt_block` plugin (needs the Hermes plugin API).

### Added — V2 M3b: the typed Lens plumbing
- **`src/facts/{tree,git,forge}.mjs`** — typed, provenance-carrying facts. The forge adapter wraps
  `gh` with **record/replay**: `BASELINE_FORGE_REPLAY=<dir>` reads committed fixtures (deterministic,
  no network) and `BASELINE_FORGE_RECORD=<dir>` captures them, so downstream lane/admit tests replay
  a fixed forge. (Batched GraphQL is deferred to fleet scale — M5.)
- **`.baseline/cache/facts.ndjson`** (`src/cache.mjs`) — gitignored, advisory-only (gates never read
  it, FS8); write-through on live fetch, `observed_at` per entry.
- **`src/join.mjs`** + **`schema/keys.md`** — the relational join over declared keys only (C38):
  PR⇄branch and PR⇄issue (`closes #N`) active now; record joins declared but inert until M4/M5. An
  unresolvable join is a **finding, never a guess**.
- **`src/derive/status.mjs`** — a pure function (facts + join → the derived status view), replayable;
  surfaces divergence first (next:→closed issue, closed-issue-live-branch).
- **`orient` refactored onto `facts → join → derive → render`** — one forge path; it gains the cache
  + record/replay and the same fixtures. `orient --json` now emits the derived-status shape
  (`planes` / `forgeAvailable` / `thisLane` / `findings`).
- `test/facts/run.mjs` — deterministic scenario over committed replay fixtures (clean close,
  divergence, unresolvable-join finding); wired into CI. (M3c + M3d remain — see `docs/v2/PLAN.md` §8.)

### Added — V2 M3a: `baseline orient` (the Lens goes live)
- **`baseline.mjs`** — the unified CLI entry point. `orient` is new; `check` (the default)
  delegates to the intact `check.mjs`, so the golden corpus and CI keep invoking it directly.
- **`baseline orient`** — a derived-state survey for session start (C16): a capability header
  (tree / history / forge reachability), divergence first, live lanes (open PRs + each branch's
  latest session `next:`), backlog (open issues by milestone), and this lane's `next:`.
  `gh`-based, descriptor-aware, `--json` / `--strict`. Generalizes the ADR-0009 `orient.mjs`.
- **Capability probe** (`src/probe.mjs`) — plane reachability; every unreachable plane degrades
  to a labelled note, so orient works offline and **never hard-refuses** (C33 / FS9); `--strict`
  turns forge-unreachability into exit 1.
- **Claude Code SessionStart hook** (`hooks/orient-session-start.sh` + `hooks/README.md`) runs
  orient as the session's first act; SKILL.md carries the tool-agnostic first-act directive (C28).
- `test/orient/run.mjs` — availability tests (offline / no-forge degradation), wired into CI.

### Deferred (M3 continues in later slices)
- Typed facts layer + `.baseline/cache` + `src/join.mjs` + `derive/status.mjs` + forge
  record/replay fixtures (M3b); the `sources/on_unreachable/contexts/certainty` metadata backfill
  + CTX-12 (M3c); the Hermes `prefetch`/`system_prompt_block` plugin (M3d).

### Added — V2 M2: the repo descriptor
- **`baseline.repo.json`** — the schema-validated repo descriptor (C39): the one stored piece
  of intent every applicability/severity derivation consumes. Declares `type`, `lifecycle`,
  `maturity`, `owner`, `workflow`, `anchoring` (+ optional forge / lanes / join-keys / staleness).
  Schema at `schema/repo.schema.json`, loaded and validated by a zero-dependency subset validator
  in `src/descriptor.mjs`. Read from the working tree or a git ref (the target-ref seam).
- **`type` supersedes filesystem auto-detection** when a valid descriptor is present, so a tooling
  `package.json` can't misclassify a docs repo as `node`; absent/invalid → auto-detect still governs.
- **DESC-01** (new `desc` category — 70 rules across 11 categories): descriptor absent or
  schema-invalid → WARN + scaffold fix; present and valid → PASS. Transitional — adopt incrementally.
- **Posture presets** `config-presets/multi-lane-agents.repo.json` (the V2 default) and
  `readiness-only.repo.json` (V1-equivalent), plus the `templates/baseline.repo.json` scaffold.
- **`--self-check`** now enforces the descriptor invariant (S7 / DESC-02): every schema field has a
  declared consumer (active, or reserved for a named later module).
- **`init` is descriptor-first** — writes `baseline.repo.json` before anything else; no longer
  scaffolds a status doc.
- Golden corpus: two new fixtures (`descriptor-repo`, `descriptor-invalid`); pins re-captured.

### Deferred (honest slice)
- **DESC-03** (descriptor change-control) and **target-ref *enforcement*** are wired at the loader
  seam but not yet active — their teeth need JDG records (M4) and the `admit` context (M6). See
  `docs/v2/PLAN.md` §8.

## [2.2.0] — 2026-07-05

### Added
- `REFERENCE.md` — the full reference (rule table, category descriptions, CI wiring)
  plus **architecture & flow diagrams** drawn from `check.mjs`.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms, linked
  from the docs. Both are copied on install.
- Distribution-mode self-scoring: `baseline.config.json` (`project_type: docs`) so the
  repo is scored against the rules that fit a distribution repo, plus a status doc,
  sign-off ledger, `SECURITY.md`, `CODEOWNERS`, and this changelog.
- **`project_types` + explicit `applies_to` on every rule**, and a `--self-check`
  mode that validates rule-set integrity (no missing/typo'd `applies_to`, unknown
  check kind, profile, severity, category, `requires` key, or duplicate id) and prints
  a per-type coverage matrix. Guards against silently-dangling rules.
- **Hermes-native:** `SKILL.md` now uses the Hermes peer conventions (frontmatter
  superset with `author`/`license`/`platforms`/`metadata.hermes`, "Use when…"
  description, peer structure) while staying valid for Claude Code. `install.sh --hermes`
  installs into `~/.hermes/skills/software-development/baseline`.
- `config-presets/` — ready-made `baseline.config.json` starting points
  (context-management, node-service, python-library, internal-tool, product-with-claims),
  each annotated and copied on install.

### Changed
- Removed an internal end-of-session reference from CTX-01's `fix` text.
- Genericized the v1 provenance line (dropped specific private repo names).
- Re-scoped TEST-03/TEST-04 to code repos (`node`/`python`/`service`/`library`); a
  docs/distribution repo now skips them instead of needing "n/a" sign-offs.

## [2.1.1] — 2026-07-05

### Changed
- Bulletproofing pass: 62 defects fixed across 4 adversarial rounds (severity
  inversion in CTX-01, a shell-injection in the git helpers → `execFileSync`,
  comment-blind greps → quote-aware stripping); ~70 regression assertions green.

## [2.1.0] — 2026-07-05

### Added
- Backfilled 8 rules (SEC-11/12/14, QUAL-04, BUILD-10, TEST-07, CTX-11) and 3 check
  kinds (workflow-permissions, implies, doc-code-age). The standard is now **69 rules**.
