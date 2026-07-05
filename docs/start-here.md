# baseline-skill — status

last-verified: 3f2f6f9 2026-07-05

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` (69 rules, v2.2.0).

**Current state.** Stable. This repo ships the standard rather than being a buildable
app, so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`) — build/test/service rules skip as `n/a`. Current score:
**0 blockers · 92%** (the one warn, SEC-05, is an honest n/a for a zero-dependency
repo). Every rule now carries an explicit `applies_to`; run `node check.mjs
--self-check` to validate the rule set's integrity and see the per-type coverage.

**Layout.**
- `SKILL.md` — the agent skill (modes: score / init / fix / explain).
- `REFERENCE.md` — full reference: rule table, categories, architecture & flow diagrams, CI wiring.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms.
- `check.mjs` + `rules.json` — the runner and the 69 rules (co-located; keep them together).
- `templates/` — scaffolds (CLAIMS.json, start-here.md, signoff.json, adr.md, doc-with-freshness.md).
- `install.sh` — installs the skill (Claude Code default, or `--hermes`).

**Score it.** `node check.mjs --repo .`

**Next.** See `CHANGELOG.md` (Unreleased) and the repo's open issues.
