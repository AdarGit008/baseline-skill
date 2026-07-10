---
name: baseline
description: "Use when asked to run baseline, score a repo, check build- or project-readiness, audit a repo against a standard, or adopt/scaffold the project-baseline standard. Runs a zero-dependency Node checker (71 rules across build, tests, security & supply-chain, reproducibility, operability, change-governance, community, context/doc-drift, and claims), reads the scorecard, and helps fix or scaffold what's missing."
version: 2.2.0
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

A **testable readiness standard**: 71 rules, each backed by a check a zero-dependency Node runner executes on a repo *at rest*. Blockers fail CI (`exit 1`); the judgment calls a script can't make resolve via a dated **sign-off ledger**. The throughline: *don't trust a written promise — make something check it.* A checklist doc drifts; this is the checklist as an exit code.

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

The unified CLI is **`baseline.mjs`** — `node "<abs>/baseline.mjs" <command>` (`orient`, `check`, `help`); `baseline check …` delegates to `check.mjs`, still the checker. Both load `rules.json` + `src/` from their own directory, so always invoke **by absolute path**; don't copy them away from `rules.json` + `src/`. Requires **Node ≥ 18 and `git`** on PATH — if `node` is missing, say so rather than guessing.

Co-located files: `baseline.mjs` (CLI entry: orient / check), `check.mjs` (the checker), `rules.json` (the 71 rules), `schema/repo.schema.json` (the descriptor schema), `config.example.json`, `templates/` (scaffolds), `config-presets/` (ready-made configs), `hooks/` (SessionStart orient hook), `REFERENCE.md` (full reference), `GLOSSARY.md` (term definitions).

## Orientation — the first act

Before working in a repo that runs multiple agent lanes (or at session start), **run `baseline orient` first** — a derived-state survey, so you never reconstruct state from a hand-maintained status doc (C16):

```bash
node "$SKILL_DIR/baseline.mjs" orient --repo <target>
```

- **Capability header** — which planes are reachable (tree / history / forge). Every unreachable plane degrades to a note, so orient works offline and never blocks.
- **Divergence first**, then **live lanes** (open PRs + each branch's latest session `next:`), **backlog** (open issues by milestone), and **this lane** (current branch + its `next:`).
- It's an *agent helper, never a gate*: read-only, `gh`-based, exits 0 even degraded — `--strict` turns forge-unreachability into exit 1; `--json` for machine use.
- **Install it as infrastructure:** wire `hooks/orient-session-start.sh` into Claude Code's `SessionStart` hook (see `hooks/README.md`) so orientation happens without being remembered. The Hermes twin ships in `integrations/hermes/baseline-orient/` — a plugin whose `on_session_start` hook + `/orient` command run the same survey; this directive remains the tool-agnostic fallback (C28).

## Modes

Figure out intent from the user's words; default to **score**.

### orient — session start · "where am I" · "what should I do next"
Run the survey (see **Orientation — the first act** above): `node "$SKILL_DIR/baseline.mjs" orient --repo <target>`. Read divergence → lanes → backlog → this lane's `next:`, then act. This is the first act in a lane repo, not a scored gate.

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
3. Present it: lead with **blockers** (they fail CI), then warnings worth fixing, grouped by category. Don't dump all 71 rows — summarize and offer to fix or scaffold.

### init — "set up / adopt / scaffold baseline"
**Descriptor-first, always.** The repo's `baseline.repo.json` is written before anything else — it's the one file baseline requires (schema: `schema/repo.schema.json`), and every applicability/severity derivation reads it. Its `type` supersedes filesystem auto-detection.
1. **Write the descriptor.** Copy the closest posture preset (or the blank template) to `<repo>/baseline.repo.json`, then set `type`, `lifecycle`, `maturity`, `owner`, `workflow`, `anchoring`:
   ```bash
   cp "$SKILL_DIR/config-presets/multi-lane-agents.repo.json" <repo>/baseline.repo.json   # V2 default: lanes on
   # or readiness-only.repo.json (just the score, V1-equivalent) · or templates/baseline.repo.json (blank)
   ```
   Multi-lane is the default — any solo dev gets lanes out of the box; use `readiness-only` for the score with no workflow contract.
2. **Tune the checks (optional).** Copy the closest `config-presets/*.json` to `<repo>/baseline.config.json` for paths/commands/thresholds, or start from `config.example.json`. Then scaffold only what's missing (never overwrite without asking):
   ```bash
   cp "$SKILL_DIR/config-presets/node-service.json" <repo>/baseline.config.json   # tuning: bootstrap_command, globs…
   cp "$SKILL_DIR/templates/CLAIMS.json"    <repo>/docs/CLAIMS.json      # only if it makes external claims
   mkdir -p <repo>/.project-baseline && cp "$SKILL_DIR/templates/signoff.json" <repo>/.project-baseline/signoff.json
   ```
3. Edit `baseline.config.json` to reality: `bootstrap_command` (clean-checkout install+test for BUILD-05), `makes_external_claims` (false skips CLAIM-*). Opt-in `*_globs` keys stay empty until adopted.
4. Wire the `baseline` job into CI as a **required** check (rule BUILD-06) — snippet is in `REFERENCE.md`.
5. Run a first score — `DESC-01` confirms the descriptor is present and valid.
- **Completion criterion:** `baseline.repo.json` exists and validates (DESC-01 PASS), `node check.mjs --repo <repo>` runs, and every scaffolded artifact is accounted for.

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
- **Descriptor:** a `baseline.repo.json` declares the repo's identity/posture; its `type` supersedes auto-detection, and `DESC-01` warns (and offers to scaffold) when it's absent or invalid.
- Config auto-detects; `baseline.config.json` at the repo root overrides (keys documented in `config.example.json`). The runner is zero-dependency and crash-resilient: an unevaluable check degrades to SKIP, never crashing the run.

## Common Pitfalls

1. **Copying `check.mjs` away from `rules.json` + `src/`.** It loads both from its own directory — invoke by absolute path instead.
2. **Presenting a warn as a blocker (or vice-versa).** Severity is in `rules.json` and the runner output — never upgrade/downgrade it.
3. **Faking a sign-off.** Manual rules exist because a script can't judge them; record a real dated `signoff.json` entry, don't rubber-stamp.
4. **Skipping BUILD-05 by habit.** Omit `--no-exec` when the repo is trusted and `bootstrap_command` is set — a green crown check is the strongest single signal.
5. **Gaming a warn to hit 100%.** An honest advisory warn (e.g. a dependency-updater rule on a zero-dep repo) beats a presence-theater fix. 0 blockers = build-ready is the real bar.

## Verification Checklist

- [ ] Ran the runner by its **absolute** path with `--repo <target>`
- [ ] Reported **blockers first**, then warnings, grouped by category (not a 71-row dump)
- [ ] For `fix`: re-scored and confirmed no new blockers
- [ ] For `init`: picked a preset/config, scaffolded only what was missing, ran a first score
- [ ] Any sign-off is a real dated judgment, not a rubber stamp
- [ ] `--self-check` still passes if `rules.json` was edited
