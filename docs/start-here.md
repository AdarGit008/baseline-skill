# baseline-skill — start here

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` manifest + `rules/` (90 rules, v2.x line).

**Current state.** Stable. This repo ships the standard rather than being a buildable
app, so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`) — build/test/service rules skip as `n/a`. Live state is
**derived, not stamped**: run `node check.mjs --repo .` for the score and
`node baseline.mjs orient --repo .` for the survey (this doc carried a
hand-maintained freshness stamp until the M7 contraction retired the stored-status
surface — its own CTX-12 now blocks the artifact it used to be). Run
`node check.mjs --self-check` to validate the rule set's integrity and see the
per-type coverage.

**Layout.**
- `SKILL.md` — the agent skill (modes: orient / score / init / fix / explain).
- `REFERENCE.md` — full reference: rule table, categories, architecture & flow diagrams, CI wiring.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms.
- `MIGRATION.md` — moving a V1-shaped repo onto the V2 contract with existing commands.
- `check.mjs` + `rules.json` + `rules/` + `src/` — the runner, the manifest, and the 90 rules (co-located; keep them together).
- `baseline.mjs` — the unified CLI: check · admit · reconcile · orient · lane · log · jdg · gen · scrub.
- `templates/` — scaffolds (baseline.repo.json, claim.json, judgment.json, session-log.md, adr.md, doc-with-freshness.md).
- `hooks/` — SessionStart orient hook + the pre-push records scrub scaffold.
- `install.sh` — installs the skill (Claude Code default, or `--hermes`).

**Score it.** `node check.mjs --repo .`

**Next.** See `CHANGELOG.md` (Unreleased) and the repo's open issues.
