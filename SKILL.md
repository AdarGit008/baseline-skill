---
name: baseline
description: "Use when asked to run baseline, score a repo, check build- or project-readiness, audit a repo against a standard, or adopt/scaffold the project-baseline standard. Runs a zero-dependency Node checker (69 rules across build, tests, security & supply-chain, reproducibility, operability, change-governance, community, context/doc-drift, and claims), reads the scorecard, and helps fix or scaffold what's missing."
version: 2.1.1
author: Adar (AdarGit008)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [baseline, readiness, ci, standards, project-quality, code-review]
    related_skills: [requesting-code-review, plan, systematic-debugging, test-driven-development]
---

# project-baseline

## Overview

A **testable readiness standard**: 69 rules, each backed by a check a zero-dependency Node runner executes on a repo *at rest*. Blockers fail CI (`exit 1`); the judgment calls a script can't make resolve via a dated **sign-off ledger**. The throughline: *don't trust a written promise — make something check it.* A checklist doc drifts; this is the checklist as an exit code.

Runs natively under **Hermes** and **Claude Code** (and any agent that loads `SKILL.md`). The runner is portable — plain Node, no agent-specific dependency. Source: `github.com/AdarGit008/baseline-skill` (reference repo: `baseline-demo`).

## When to Use

- "run baseline", "score this repo", "check build-readiness / project-readiness"
- "audit this repo against a standard", "is this build-ready?"
- "set up / adopt / scaffold baseline here"
- "fix the baseline failures", "get this to green"
- "what does SEC-03 check", "why did CTX-05 fail"

**Don't use for:** general logic/bug review (use a code-review skill) or writing tests (use a TDD skill). Baseline checks *readiness posture at rest*, not runtime correctness.

## Setup — resolve the toolkit path first

`$SKILL_DIR` = the absolute path of the directory containing this file. Resolve it to a concrete path before running anything (never pass the literal `$SKILL_DIR` to the shell). Typical locations:
- Hermes: `~/.hermes/skills/software-development/baseline`
- Claude Code: `~/.claude/skills/baseline`

`check.mjs` loads `rules.json` from its own directory, so always invoke the runner **by its absolute path** (`node "<abs>/check.mjs" …`); don't copy `check.mjs` away from `rules.json`. Requires **Node ≥ 18 and `git`** on PATH — if `node` is missing, say so rather than guessing.

Co-located files: `check.mjs` (runner), `rules.json` (the 69 rules), `config.example.json`, `templates/` (scaffolds), `config-presets/` (ready-made configs), `REFERENCE.md` (full reference: rule table, categories, architecture diagrams, CI wiring), `GLOSSARY.md` (plain-language term definitions).

## Modes

Figure out intent from the user's words; default to **score**.

### score (default)
1. Pick the target repo: an explicit path, else the current working directory. Confirm it looks like a repo (a manifest or `.git`).
2. Run the runner:
   ```bash
   node "$SKILL_DIR/check.mjs" --repo <target>
   ```
   - `--no-exec` — skip executing the repo's bootstrap/test command (BUILD-05). Use for untrusted repos or when the command isn't configured; otherwise prefer running it (BUILD-05 is the crown check).
   - `--profile advanced` — opt into expert rules (SBOM, code-scanning, mutation testing, dependency-vuln-scan, coverage-floor). `service` turns on automatically for `project_type=service`.
   - `--json` — machine output instead of the scorecard.
   - **Completion criterion:** you have the readiness %, the blocker count, and each FAIL/notable WARN with its one-line detail.
3. Present it: lead with **blockers** (they fail CI), then warnings worth fixing, grouped by category. Don't dump all 69 rows — summarize and offer to fix or scaffold.

### init — "set up / adopt / scaffold baseline"
1. Vendor the toolkit into the repo (suggest `tools/baseline/`) or reference it in place.
2. Pick a config: copy the closest `config-presets/*.json` (e.g. `context-management`, `node-service`, `library`) to `<repo>/baseline.config.json`, or start from `config.example.json`. Then scaffold only what's missing (never overwrite without asking):
   ```bash
   cp "$SKILL_DIR/config-presets/node-service.json" <repo>/baseline.config.json   # pick the closest preset
   cp "$SKILL_DIR/templates/CLAIMS.json"    <repo>/docs/CLAIMS.json      # only if it makes external claims
   cp "$SKILL_DIR/templates/start-here.md"  <repo>/docs/start-here.md    # if no status doc exists
   mkdir -p <repo>/.project-baseline && cp "$SKILL_DIR/templates/signoff.json" <repo>/.project-baseline/signoff.json
   ```
3. Edit `baseline.config.json` to reality: `project_type` (`node`/`python`/`service`/`library`/`docs`), `bootstrap_command` (clean-checkout install+test for BUILD-05), `makes_external_claims` (false skips CLAIM-*). Opt-in `*_globs` keys stay empty until adopted.
4. Wire the `baseline` job into CI as a **required** check (rule BUILD-06) — snippet is in `REFERENCE.md`.
5. Run a first score.
- **Completion criterion:** `node check.mjs --repo <repo>` runs and every scaffolded artifact is accounted for.

### fix — "get this to green"
1. Score first. For each blocker/warn to address, apply the rule's own `fix` field (read it from `rules.json`) as concrete edits — add the missing LICENSE, pin the action to a SHA, git-ignore + rotate the `.env` secret, add the negative test, etc.
2. For `manual` (sign-off) rules, **don't fake the check** — do the judgment with the user (blast-radius, prior-art pass, wedge/moat) and record a dated entry in `.project-baseline/signoff.json`.
3. Re-score to confirm.
- **Completion criterion:** re-score shows the targeted rules resolved and no new blockers introduced.

### explain — "what does SEC-03 check", "why did CTX-05 fail"
Read the rule from `rules.json` (`title`, `rationale`, `fix`, `source`, `check`) and explain it plainly plus what the runner actually looked for. For unfamiliar jargon (SBOM, SLSA, provenance, sign-off ledger, …) point to `GLOSSARY.md`.

## Rule-set integrity — `--self-check`

The rule set validates itself:
```bash
node "$SKILL_DIR/check.mjs" --self-check
```
Exits 1 on any rule with a missing/typo'd `applies_to`, an unknown check-kind / profile / severity / category / `requires` key, a duplicate id, or an orphan type/profile — and prints a per-type **coverage matrix**. Use it if you edit `rules.json`, or wire it into CI so a malformed rule set can't merge.

## How the runner decides (so you can read detail lines)

- **PASS / FAIL / WARN / SIGN-OFF / SKIP** per rule; only a `blocker` FAIL sets exit 1.
- **SKIP** = the rule didn't apply: `applies_to` excludes the repo's `project_type` (`n/a for <type>`), an off profile (`profile 'advanced' off`), an unadopted opt-in, or nothing to check. A skip never counts against readiness.
- **`applies_to`** (`"all"` or a subset of `node`/`python`/`service`/`library`/`docs`) scopes each rule to the repo types it fits — e.g. a `docs` repo skips build/test/service rules.
- **Profiles:** `core` always; `service` auto-on for `project_type=service`; `advanced` only with `--profile advanced`.
- **Claims are opt-in:** CLAIM-* run only if a claims register exists or `makes_external_claims:true` is set.
- Config auto-detects; `baseline.config.json` at the repo root overrides (keys documented in `config.example.json`). The runner is zero-dependency and crash-resilient: an unevaluable check degrades to SKIP, never crashing the run.

## Common Pitfalls

1. **Copying `check.mjs` away from `rules.json`.** It loads `rules.json` from its own directory — invoke by absolute path instead.
2. **Presenting a warn as a blocker (or vice-versa).** Severity is in `rules.json` and the runner output — never upgrade/downgrade it.
3. **Faking a sign-off.** Manual rules exist because a script can't judge them; record a real dated `signoff.json` entry, don't rubber-stamp.
4. **Skipping BUILD-05 by habit.** Omit `--no-exec` when the repo is trusted and `bootstrap_command` is set — a green crown check is the strongest single signal.
5. **Gaming a warn to hit 100%.** An honest advisory warn (e.g. a dependency-updater rule on a zero-dep repo) beats a presence-theater fix. 0 blockers = build-ready is the real bar.

## Verification Checklist

- [ ] Ran the runner by its **absolute** path with `--repo <target>`
- [ ] Reported **blockers first**, then warnings, grouped by category (not a 69-row dump)
- [ ] For `fix`: re-scored and confirmed no new blockers
- [ ] For `init`: picked a preset/config, scaffolded only what was missing, ran a first score
- [ ] Any sign-off is a real dated judgment, not a rubber stamp
- [ ] `--self-check` still passes if `rules.json` was edited
