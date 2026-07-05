# Changelog

All notable changes to the `/baseline` skill are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com); the runner is versioned in
`rules.json` and `SKILL.md`.

## [Unreleased]

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
