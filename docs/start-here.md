# baseline-skill — start here

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code, Hermes and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` manifest + `rules/` (the rule set, one module per
category — `node check.mjs --self-check` prints its size and coverage). v3: always-on
blockers fail CI, packs switch on explicitly, three plugins (tdd-pi · graphify · okf-rag)
are suggested and never required.

**Current state.** Stable. This repo ships the standard rather than being a buildable
app, so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`) — build/test/service rules produce no row. Live state is
**derived, not stamped**: run `node check.mjs --repo .` for the score and
`node baseline.mjs orient --repo .` for the five-line survey (a hand-maintained freshness
stamp is exactly what CTX-12 blocks). Run `node check.mjs --self-check` to validate the
rule set's integrity and see the per-type coverage.

**Layout.**
- `SKILL.md` — the agent skill, one page (modes: orient / score / fix / explain).
- `REFERENCE.md` — full reference: packs, scope, plugins, architecture, the generated rule table, CI wiring.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms.
- `CONTRACT.md` — the plain-git twin: the record forms, no tool required.
- `MIGRATION.md` — moving an older repo onto the current record shapes.
- `check.mjs` + `rules.json` + `rules/` + `src/` — the runner, the manifest, and the rules (co-located; keep them together).
- `baseline.mjs` — the unified CLI: check · orient · explain · gen · admit · reconcile · log · jdg · scrub.
- `templates/` — scaffolds (baseline.repo.json, claim.json, judgment.json, session-log.md, adr.md, doc-with-freshness.md).
- `hooks/` — the pre-push records scrub; the session-start orient hook ships only with `install.sh --with-session-hook`.
- `docs/assets/` — the README diagram and the REFERENCE.md table generators (`gen-evaluate-stack.mjs`, `gen-reference-rules.mjs`); rerun after a rule or evaluator change.
- `install.sh` — installs the skill (Claude Code default, `--hermes`, or a path; `--with-session-hook` opts into the hook).
- `test/` — the suites (source repo only, not installed).

**Score it.** `node check.mjs --repo .`

**Next.** See `CHANGELOG.md` (Unreleased), `docs/v3/PLAN.md`, and the repo's open issues.
