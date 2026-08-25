---
name: baseline
description: "Use when asked to run baseline, score a repo, check build- or project-readiness, orient at session start, or fix the blockers. A zero-dependency Node checker: always-on blockers fail CI, opt-in packs and three suggested plugins do the rest."
version: 3.0.0
author: Adar (AdarGit008)
license: MIT
platforms: [linux, macos, windows]
---

# baseline

Workflow scaffolding, not an enforcer. Every rule is a check a script runs on a repo at rest; the exit code is the verdict. *Don't trust a written promise — make something check it.*

`$SKILL_DIR` is this file's directory — resolve it and run by **absolute path** (`baseline.mjs` loads `rules.json`, `rules/`, `src/` from beside itself). Needs Node >= 18 and git.

## Modes

- **orient** — session start: `node "$SKILL_DIR/baseline.mjs" orient --repo <r>`. Five lines (repo · work · graph · knowledge · score), read-only, always exit 0.
- **score** (default): `node "$SKILL_DIR/check.mjs" --repo <r>` — `--json` for CI; `--no-exec` on an untrusted repo (skips BUILD-05's bootstrap run). Lead with blockers, then warns by category; never dump every row.
- **fix** — apply each failing rule's own `fix` field, re-score, confirm no new blockers.
- **explain** — `baseline explain <rule-id>`: title + rationale, plus the okf concept when `BASELINE_OKF_BUNDLE` names a bundle. Display only — never a verdict.

## What fails CI

Only the always-on blockers set exit 1: BUILD-01 BUILD-03 BUILD-05 TEST-01 SEC-01 SEC-02 COMM-01 CTX-05 CTX-12. Everything else warns. Packs (claims · decisions · descriptor · service · advanced) run only from an explicit switch in `baseline.config.json` — `profiles`/`packs` or `--profile <pack>`; nothing in the tree turns one on. A rule that does not apply is silent (`state: "n/a"` in `--json`).

## Plugins — suggested, never required

- `tdd-pi` — `tdd.json`, tracked: what is open.
- `graphify` — `graphify-out/`, ignored: what is where.
- `okf-rag` — `$BASELINE_OKF_BUNDLE`: why it matters; ask `get_knowledge` for the doctrine.

One WARN each (PLUG-01/02/03), never a FAIL: absent → the install command, printed and never run; gitignore state differing from the `plugins` config → the mismatch. A WARN leaves `.baseline/log/PLUG-0N.log`. baseline reads metadata only — never the artifact.

## Counts

Never quote rule, blocker or kind counts — `node "$SKILL_DIR/check.mjs" --self-check` derives them and validates the rule set. Details: `REFERENCE.md`, terms: `GLOSSARY.md`.

## Pitfalls

- Presenting a warn as a blocker: severity lives in `rules/*.json`.
- `--no-exec` on a trusted repo with `bootstrap_command` set — the green crown check is the strongest signal.
- Chasing 100%: zero blockers is the bar; an honest warn beats presence theater.
