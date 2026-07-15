# baseline-skill — status

last-verified: b936952 2026-07-15

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` manifest + `rules/` (86 rules, v2.3.0 line).

**Current state.** Stable. This repo ships the standard rather than being a buildable
app, so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`) — build/test/service rules skip as `n/a`. Current score:
**0 blockers · 84%** with three warns, each an honest read of this repo: SEC-05
(dependency-update automation — n/a-shaped for a zero-dependency repo), SEC-12
(secret-scanning gate), and CTX-12 (a hand-maintained status stamp exists — this very
file; it retires or derives at M7). Run `node check.mjs --self-check` to validate the
rule set's integrity and see the per-type coverage.

**Layout.**
- `SKILL.md` — the agent skill (modes: score / init / fix / explain).
- `REFERENCE.md` — full reference: rule table, categories, architecture & flow diagrams, CI wiring.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms.
- `check.mjs` + `rules.json` + `rules/` + `src/` — the runner, the manifest, and the 86 rules (co-located; keep them together).
- `baseline.mjs` — the unified CLI: check · orient · log · jdg · gen · scrub.
- `templates/` — scaffolds (claim.json, session-log.md, start-here.md, signoff.json, adr.md, doc-with-freshness.md).
- `hooks/` — SessionStart orient hook + the pre-push records scrub scaffold.
- `install.sh` — installs the skill (Claude Code default, or `--hermes`).

**Score it.** `node check.mjs --repo .`

**Next.** See `CHANGELOG.md` (Unreleased) and the repo's open issues.
