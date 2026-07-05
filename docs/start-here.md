# baseline-skill — status

last-verified: 3ea3e5e 2026-07-05

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` (69 rules, v2.1.1).

**Current state.** Stable. This repo ships the standard rather than being a buildable
app, so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`) — build/test/service rules skip as `n/a`, and it targets
**0 blockers** against the rules that actually fit a distribution repo.

**Layout.**
- `SKILL.md` — the agent skill (modes: score / init / fix / explain).
- `REFERENCE.md` — full reference: rule table, categories, architecture & flow diagrams, CI wiring.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms.
- `check.mjs` + `rules.json` — the runner and the 69 rules (co-located; keep them together).
- `templates/` — scaffolds (CLAIMS.json, start-here.md, signoff.json, adr.md, doc-with-freshness.md).
- `install.sh` — installs the skill into `~/.claude/skills/baseline`.

**Score it.** `node check.mjs --repo .`

**Next.** See `CHANGELOG.md` (Unreleased) and the repo's open issues.
