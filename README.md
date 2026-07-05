# baseline-skill

The **`baseline`** skill for **Hermes** and **Claude Code** (and any agent that loads
`SKILL.md`): a zero-dependency project-readiness checker packaged as an installable skill. It scores a repository
against **69 rules** across build, tests, security & [supply-chain](GLOSSARY.md#supply-chain), reproducibility,
operability, change governance, community, context/doc-drift, and claims discipline —
[blockers](GLOSSARY.md#blocker) fail CI, judgment calls resolve via a dated [sign-off ledger](GLOSSARY.md#sign-off-ledger).

> The premise: *don't trust a written promise — make something check it.*

New to the jargon? The [glossary](GLOSSARY.md) defines the DevOps and supply-chain terms in plain language.

## Install

```bash
git clone https://github.com/AdarGit008/baseline-skill
cd baseline-skill

./install.sh                # Claude Code -> ~/.claude/skills/baseline
./install.sh --hermes       # Hermes      -> ~/.hermes/skills/software-development/baseline
./install.sh /custom/path   # any custom skills dir
```

Then in any repo say **"run baseline"** / **"score this repo"** (Claude Code: `/baseline`)
— the agent runs the checker, reads the scorecard, and helps fix or scaffold what's
missing. Restart Claude Code, or start a **new Hermes session** (its skill loader is
cached per session), for the skill to appear.

`SKILL.md` follows the Hermes peer conventions (frontmatter + structure) and stays
valid for Claude Code, so the one repo is native to both.

## Run it directly (no agent)

```bash
node check.mjs --repo /path/to/repo             # human-readable scorecard, exit 1 on blockers
node check.mjs --repo /path/to/repo --json      # machine output for CI
node check.mjs --repo /path/to/repo --profile advanced
```

Needs only Node ≥ 18 and git.

## What's inside

| file | purpose |
|---|---|
| `SKILL.md` | the skill definition (modes: score / init / fix / explain) |
| `check.mjs` | the zero-dependency runner |
| `rules.json` | the 69 rules (id, severity, profile, rationale, fix, source, check) |
| `config.example.json` | per-repo config (copy to `baseline.config.json`) |
| `templates/` | scaffolds: CLAIMS.json, start-here.md, signoff.json, adr.md, doc-with-freshness.md |
| `config-presets/` | ready-made `baseline.config.json` starting points (context-management, node-service, library, …) |
| `README.md` | this guide — install, usage, file map |
| `REFERENCE.md` | full reference: rule table, categories, architecture diagrams, CI wiring |
| `GLOSSARY.md` | plain-language definitions of the DevOps/supply-chain terms |

See **[REFERENCE.md](REFERENCE.md)** for the full rule table, category
descriptions, architecture/flow diagrams, and the CI wiring snippet.

## See it pass

[AdarGit008/baseline-demo](https://github.com/AdarGit008/baseline-demo) is a reference
repo that scores a perfect 0-blockers / 100% against this standard.

## License

MIT
