---
name: baseline
description: "Use when asked to run baseline, score a repo, check build- or project-readiness, orient at session start, or fix the blockers. A zero-dependency Node checker: one script over repo files, every rule a blocker, one exit code."
version: 3.0.0
author: Adar (AdarGit008)
license: MIT
platforms: [linux, macos, windows]
---

# baseline

Workflow scaffolding, not an enforcer. Every rule is a check a script runs on a repo at rest; the exit code is the verdict. *Don't trust a written promise — make something check it.*

`$SKILL_DIR` is this file's directory — resolve it and run by **absolute path** (`baseline.mjs` loads `rules.json`, `rules/`, `src/` from beside it). Needs Node >= 18 and git.

## Modes

- **orient** — session start: `node "$SKILL_DIR/baseline.mjs" orient --repo <r>`. Five lines (repo · work · graph · knowledge · score), read-only, always exit 0.
- **score** (default): `node "$SKILL_DIR/check.mjs" --repo <r>` — `--json` for CI; `--no-exec` is a no-op.
- **fix** — apply each failing rule's own `fix` field, re-score, confirm no new blockers.
- **explain** — `baseline explain <rule-id>`: title + rationale, plus the okf concept when `BASELINE_OKF_BUNDLE` is set. Display only, never a verdict.

## What fails CI

Everything. There is no warn tier: every rule reads repo files, is deterministic, and is AND-gated into one exit code — BUILD-03 BUILD-04 SEC-01 SEC-02 GOV-03 PLUG-01 PLUG-02 PLUG-03. A rule with no subject resolves `state: "n/a"` in `--json`, is silent to humans, and is excluded from the gate — it can never fail a build.

## The two opt-ins, opposite defaults

- **Trust circle** — opt **in**, default out. A plugin is a **member** when its name is a key of `baseline.config.json` `plugins` (`baseline trust add|remove <tool>`). A member's rule gates: absent artifact → its install command, printed never run; git state differing from the config → the mismatch, logged to `.baseline/log/PLUG-0N.log`. Unadopted is a **suggestion**: `n/a`, never a failure. Metadata only — never the artifact.
- **Baseline rules layer** — every non-plugin rule, opt **out**, default in. `"baseline_rules": false` mutes them all to `n/a` and out of the gate; an absent key means IN, and nothing but that literal `false` turns them off. `baseline trust setup --baseline-rules in|out` writes it. Never silent: `check` prints the layer's state and every muted id, `--json` carries it as `baseline`.

## Plugins

- `obsidian-tdd` — `tdd.json`, tracked: what is open.
- `graphify` — `graphify-out/`, ignored: what is where.
- `okf-rag` — `$BASELINE_OKF_BUNDLE`: why it matters; ask `get_knowledge` for the doctrine.

`baseline trust setup` lists every supported tool and prints the config a repo that adopted nothing should copy.

## Counts

Never quote rule, blocker or kind counts — `node "$SKILL_DIR/check.mjs" --self-check` derives them and validates the rule set. Details: `REFERENCE.md`, terms: `GLOSSARY.md`.

## Pitfalls

- Quoting a rule that no longer exists: the shipped `rules/*.json` is the only authority.
- Chasing 100%: zero blockers is the bar; a rule that is honestly `n/a` is not a gap to fill.
