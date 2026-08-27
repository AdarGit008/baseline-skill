# baseline-skill — start here

> **Nothing in this folder is an authority. The code is.**
> `check.mjs`, `rules/*.json` and `src/` decide what baseline does; `test/red/` pins what
> may never change. Every page here is a *view* of those files. Where a page and the code
> disagree, the code is right and the page is a bug — say so and fix the page.
> That is not modesty, it is the repo's own premise applied to itself: *don't trust a
> written promise — make something check it.*

**What this is.** The installable `/baseline` skill — the *project-baseline* readiness
standard packaged for Claude Code, Hermes and compatible agents. The canonical toolkit is
`check.mjs` (runner) + `rules.json` (manifest) + `rules/` (the rule set, one module per
category). One script over repo files, exit 0 or 1. There is no warn tier: every rule that
claims a severity is a blocker, and a rule with no subject in the tree resolves `n/a` and
is excluded from the gate.

**Ask the tool, not this page.**

| question | the command that answers it |
|---|---|
| how many rules are there, and what do they cover? | `node check.mjs --self-check` |
| how does this repo score? | `node check.mjs --repo .` |
| what is this repo's state right now? | `node baseline.mjs orient --repo .` |
| what does one rule check, and why? | `node baseline.mjs explain <rule-id>` |
| what does this repo trust, and what must be wired? | `node baseline.mjs trust setup --repo .` |
| are the generated views still in sync? | `node baseline.mjs gen --check --repo .` |

**Current state.** Stable. This repo ships the standard rather than being a buildable app,
so it scores itself in **distribution mode** via `baseline.config.json`
(`project_type: docs`). Live state is **derived, not stamped** — there is no
hand-maintained freshness line anywhere in this repo, and there should never be one.

## The prose — all of it, in this folder

| page | what it is |
|---|---|
| [`REFERENCE.md`](REFERENCE.md) | the full reference: scope, plugins, architecture, the **generated** rule table, CI wiring |
| [`GLOSSARY.md`](GLOSSARY.md) | plain-language definitions of the DevOps/supply-chain terms |
| [`CONTRACT.md`](CONTRACT.md) | the plain-git twin: the record forms, no tool required |
| [`MIGRATION.md`](MIGRATION.md) | moving an older repo onto the current record shapes |
| [`SECURITY.md`](SECURITY.md) | the security policy and the private reporting channel |
| [`CHANGELOG.md`](CHANGELOG.md) | what changed, per release — history, not a specification |
| [`v4/PLAN.md`](v4/PLAN.md) | v4 as built: 5 categories, two opt-ins, the stamp contract |
| [`v4/rule-review.md`](v4/rule-review.md) | the v4 cut, verdict by verdict — a historical record |
| [`v3/PLAN.md`](v3/PLAN.md) · [`v2/`](v2/) | superseded plans, kept for provenance |
| [`tasks/`](tasks/) | the closed work log of the v2-era issues — history, kept verbatim |
| [`assets/`](assets/) | the diagram and the generators that draw it — rerun, never hand-edit |

## The code — where the authority actually lives

- `SKILL.md` (repo root) — the agent manifest. It stays at the root because the skill
  loader looks for it there; `install.sh` copies it to the skill directory's root.
- `check.mjs` + `rules.json` + `rules/` + `src/` — the runner, the manifest and the rules,
  co-located. Invoke by absolute path; never copy `check.mjs` away from `src/`.
- `baseline.mjs` — the unified CLI: check · orient · explain · gen · trust · admit ·
  reconcile · log · jdg · scrub · help.
- `test/red/` — the invariants. A statement in `docs/` that no test enforces is a wish.
- `schema/`, `templates/`, `config-presets/` — the machine-readable shapes and scaffolds.
- `hooks/` — the pre-push records scrub; the session-start orient hook ships only with
  `install.sh --with-session-hook`. Its `README.md` stays beside the scripts it documents.
- `install.sh` — installs the skill (Claude Code default, `--hermes`, or a path).

**Next.** [`CHANGELOG.md`](CHANGELOG.md) (Unreleased), [`v4/PLAN.md`](v4/PLAN.md), and the
repo's open issues.
