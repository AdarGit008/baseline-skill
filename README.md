# baseline-skill

The **`/baseline`** skill for Claude Code (and compatible agents): a zero-dependency
project-readiness checker packaged as an installable skill. It scores a repository
against **69 rules** across build, tests, security & [supply-chain](GLOSSARY.md#supply-chain), reproducibility,
operability, change governance, community, context/doc-drift, and claims discipline —
[blockers](GLOSSARY.md#blocker) fail CI, judgment calls resolve via a dated [sign-off ledger](GLOSSARY.md#sign-off-ledger).

> The premise: *don't trust a written promise — make something check it.*

New to the jargon? The [glossary](GLOSSARY.md) defines the DevOps and supply-chain terms in plain language.

## Install

```bash
git clone https://github.com/AdarGit008/baseline-skill
./baseline-skill/install.sh                 # copies into ~/.claude/skills/baseline
# or install elsewhere: ./install.sh /path/to/skills/baseline
```

Restart Claude Code, then in any repo say **`/baseline`** (or "run baseline",
"score this repo"). The agent runs the checker, reads the scorecard, and helps
fix or scaffold what's missing.

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
