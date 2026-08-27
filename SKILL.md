---
name: baseline
description: "Use when asked to run baseline, score a repo, check build- or project-readiness, orient at session start, or fix blockers. Zero-dependency Node: one script over repo files, every rule a blocker, one exit code."
version: 3.0.0
author: Adar (AdarGit008)
license: MIT
platforms: [linux, macos, windows]
---

# baseline

Workflow scaffolding, not an enforcer. Every rule is a check a script runs on a repo at rest; the exit code is the verdict. *Don't trust a promise — make something check it.*

`$SKILL_DIR` is this file's directory — run by **absolute path** (`baseline.mjs` loads `rules.json`, `rules/`, `src/` from beside it). Node >= 18 and git.

## Modes

- **orient** — session start: `node "$SKILL_DIR/baseline.mjs" orient --repo <r>`. Five lines (repo · work · graph · knowledge · score), read-only, exit 0 always.
- **score** (default): `node "$SKILL_DIR/check.mjs" --repo <r>` — `--json` for CI; `--no-exec` is a no-op.
- **fix** — apply each failing rule's own `fix` field, re-score, confirm no new blockers.
- **explain** — `baseline explain <rule-id>`: title + rationale, plus the okf concept when `BASELINE_OKF_BUNDLE` is set. Display only, never a verdict.

## What fails CI

Everything. No warn tier: every rule reads repo files, is deterministic, AND-gated into one exit code — BUILD-03 BUILD-04 SEC-01 SEC-02 GOV-03 PLUG-01 PLUG-02 PLUG-03 CTX-15 CTX-16 CTX-17 CTX-19. A rule with no subject resolves `state: "n/a"` in `--json`, silent to humans, out of the gate. CTX-18 is **frozen**: declared, claiming no severity, silent until `my-onto` exists.

## The two opt-ins, opposite defaults

- **Trust circle** — opt **in**, default out: a plugin is a **member** when its name is a key of `baseline.config.json` `plugins` (`baseline trust add|remove <tool>`). A member's rule gates — a missing artifact, a git state the config denies (logged to `.baseline/log/`), a derived store behind the code (gated on the stamp `trust stamp` commits, never an mtime). Unadopted is a **suggestion**: `n/a`, never a failure. Metadata only.
- **Baseline rules layer** — every non-plugin rule, opt **out**, default in. `"baseline_rules": false` mutes them to `n/a`, out of the gate; `false` or `null` does, nothing else. `trust setup --baseline-rules in|out` writes it. Never silent: `check` prints the state and every muted id, `--json` carries it as `baseline`.

## Plugins

- `obsidian-tdd` — `tdd.json`, tracked: what is open.
- `graphify` — `graphify-out/`, ignored: what is where.
- `okf-rag` — `$BASELINE_OKF_BUNDLE`: why it matters; ask `get_knowledge` for the doctrine.
- `my-onto` — not built yet: declared so the roster is honest, silent.

`trust setup` lists every supported tool and prints the config to copy; `trust wire` installs `.baseline/orient.sh` — commit it, CTX-19 compares it byte-for-byte with the shipped one.

## Pitfalls

- Never quote rule, blocker or kind counts — `check.mjs --self-check` derives them.
- Never quote a doc: `rules/*.json` and `check.mjs` decide, `docs/` only describes.
- Chasing 100%: zero blockers is the bar; an honest `n/a` is not a gap to fill.
