# baseline-skill

The **`baseline`** skill for **Claude Code** and **Hermes** (and any agent that loads
`SKILL.md`): a zero-dependency project-readiness checker packaged as an installable skill.
One script over repo files, every rule deterministic and AND-gated into one exit code.

> The premise: *don't trust a written promise — make something check it.*

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/evaluate-stack-dark.svg">
  <img alt="How /baseline decides — the evaluate stack. Five layers: the CLI (check.mjs) loads the rules as pure data; the judge (engine.mjs) gates and tags; the lab (evaluators.mjs) runs one evaluator per check kind; the senses (repo.mjs) read files and git; the world is fs + git itself. A gate miss is no row, an in-scope rule that cannot be evaluated is n/a, and PASS/FAIL roll up into one exit code that gates CI." src="docs/assets/evaluate-stack-light.svg" width="100%">
</picture>

## Install

```bash
git clone https://github.com/AdarGit008/baseline-skill
cd baseline-skill

./install.sh                        # Claude Code -> ~/.claude/skills/baseline
./install.sh --hermes               # Hermes      -> ~/.hermes/skills/software-development/baseline
./install.sh /custom/path           # any custom skills dir
./install.sh --with-session-hook    # also ship hooks/orient-session-start.sh (opt-in; wiring stays by hand)
```

Then in any repo say **"run baseline"** / **"score this repo"** (Claude Code: `/baseline`).
Restart Claude Code, or start a **new Hermes session**, for the skill to appear.

## Run it directly (no agent)

```bash
node baseline.mjs --repo /path/to/repo        # score — exit 1 on any finding
node baseline.mjs check --self-check          # validate the rule set and print its derived size
node baseline.mjs orient --repo /path/to/repo # five lines: repo · work · graph · knowledge · score
node baseline.mjs trust setup --repo .        # what this repo trusts, and what to wire
```

Needs only Node ≥ 18 and git. `baseline.mjs help` lists every verb.

## Where everything is

**The code is the authority.** `check.mjs`, `rules/*.json` and `src/` decide what baseline
does; `test/red/` pins what may never change. Every document below is a *view* of those
files — where a document and the code disagree, the code is right and the document is a bug.

All prose lives in one folder, **[`docs/`](docs/)**:

| document | what it is | its authority |
|---|---|---|
| [`docs/start-here.md`](docs/start-here.md) | the map — read this first | — |
| [`docs/REFERENCE.md`](docs/REFERENCE.md) | full reference; the rule table is generated | `rules/*.json`, `src/evaluators.mjs` |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | the DevOps/supply-chain terms, in plain language | — |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | the plain-git twin: what baseline expects, no tool required | `schema/`, `templates/` |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | moving an older repo onto the current shapes | `baseline gen migrate-claims` |
| [`docs/SECURITY.md`](docs/SECURITY.md) | the security policy and how to report privately | — |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | what changed, per release | `git log` |
| [`docs/v4/PLAN.md`](docs/v4/PLAN.md) | v4 as built | `test/red/` |
| [`docs/v4/rule-review.md`](docs/v4/rule-review.md) | why the v4 cut deleted what it deleted (history) | — |

The runner itself is `check.mjs` + `rules.json` + `rules/` + `src/`, co-located — keep them
together and invoke by absolute path. `SKILL.md` is the agent manifest and stays at the
repo root because the skill loader looks for it there.

## See it pass — the worked example

[**AdarGit008/baseline-demo**](https://github.com/AdarGit008/baseline-demo) is this
standard applied to a real repo, end to end — the dogfood, so this repo can stay the tool.

## License

MIT
