---
name: baseline
description: This skill should be used when the user asks to "run baseline", "check baseline", "/baseline", "score this repo", check a project's build-readiness or project-readiness, audit a repo against a standard, or scaffold/adopt the project-baseline standard. Runs a zero-dependency readiness checker (69 rules across build, tests, security & supply-chain, reproducibility, operability, change-governance, community, context/doc-drift, and claims discipline), interprets the scorecard, and helps fix or scaffold what's missing.
version: 2.1.1
---

# project-baseline

A **testable readiness standard**: 69 rules, each backed by a check a zero-dependency Node runner executes on a repo *at rest*. Blockers fail CI (exit 1); the judgment calls a script can't make resolve via a dated sign-off ledger. The whole point: *don't trust a written promise — make something check it.*

The toolkit lives next to this file: `check.mjs` (runner), `rules.json` (the 69 rules), `config.example.json`, `templates/`, `README.md` (full reference), and `GLOSSARY.md` (plain-language definitions of the DevOps/supply-chain terms).

**Resolve the skill directory first.** `$SKILL_DIR` below means *the absolute path of the directory that contains this SKILL.md* — resolve it to a concrete path before running any command (do not pass the literal string `$SKILL_DIR` to the shell). It is typically `~/.claude/skills/baseline`. `check.mjs` loads `rules.json` from its own directory, so the two must stay co-located; always invoke the runner by its absolute path (`node "<abs>/check.mjs" …`) rather than copying it elsewhere. The runner needs only Node ≥ 18 and `git`; if `node` is missing, tell the user rather than guessing.

## When invoked

Figure out intent from the user's words and pick a mode. Default to **score** if unspecified.

### Mode: score (default) — "run baseline", "/baseline", "check this repo"
1. Pick the target repo: an explicit path in the request, else the current working directory. Confirm it looks like a repo (has a manifest or `.git`).
2. Run the runner (human-readable):
   ```bash
   node "$SKILL_DIR/check.mjs" --repo <target>
   ```
   - Add `--no-exec` if you must NOT execute the repo's bootstrap/test command (BUILD-05) — e.g. untrusted repo, no time to run tests, or the command isn't configured. Prefer running it when safe, since BUILD-05 is the crown check.
   - Add `--profile advanced` if the user wants the expert rules (SBOM, code-scanning, mutation testing, symbol-integrity, dependency-vuln-scan, coverage-floor). The `service` profile turns on automatically for `project_type=service`.
   - Add `--json` when you want to parse results programmatically rather than show the scorecard.
3. Present the result to the user, leading with **blockers** (these fail CI), then warnings worth fixing. Group by category. Don't dump all 69 rows — summarize: readiness %, blocker count, and the specific FAILs/notable WARNs with their one-line detail. Offer to fix or scaffold.

### Mode: init — "set up baseline here", "adopt the standard", "scaffold baseline"
1. Copy the toolkit into the repo (suggest `tools/baseline/`), or reference it in place.
2. Scaffold the artifacts, only if missing (never overwrite without asking):
   ```bash
   cp "$SKILL_DIR/config.example.json" <repo>/baseline.config.json
   cp "$SKILL_DIR/templates/CLAIMS.json"   <repo>/docs/CLAIMS.json      # only if the repo makes external claims
   cp "$SKILL_DIR/templates/start-here.md" <repo>/docs/start-here.md    # if no status doc exists
   mkdir -p <repo>/.project-baseline && cp "$SKILL_DIR/templates/signoff.json" <repo>/.project-baseline/signoff.json
   ```
3. Edit `baseline.config.json` to the repo's reality: set `project_type`, `bootstrap_command` (the clean-checkout install+test command for BUILD-05), and `makes_external_claims` (false skips the CLAIM-* rules). The opt-in `*_globs` keys (freshness/generated/grounding) stay empty until the repo adopts those conventions.
4. Show them the CI wiring from `README.md` and make the `baseline` job a required check (that's rule BUILD-06).
5. Run a first score.

### Mode: fix — "fix the baseline failures", "get this to green"
1. Score first. For each blocker/warn the user wants addressed, apply the rule's own `fix` field (read it from `rules.json`) as concrete edits to the repo — add the missing LICENSE, pin the action to a SHA, add the `.env` to `.gitignore` and rotate the secret, add the negative test, etc.
2. For `manual` (sign-off) rules, don't fake a check — help the user do the judgment (blast-radius, prior-art pass, wedge/moat) and record a dated entry in `.project-baseline/signoff.json`.
3. Re-score to confirm.

### Mode: explain — "what does SEC-03 check", "why did CTX-05 fail"
Read the rule from `rules.json` (each has `title`, `rationale`, `fix`, `source`, and the `check`) and explain it plainly, plus what the runner actually looked for. For unfamiliar jargon (SBOM, SLSA, provenance, sign-off ledger, …), `GLOSSARY.md` in this directory has plain-language definitions.

## How the runner decides (so you can interpret detail lines)

- **PASS / FAIL / WARN / SIGN-OFF / SKIP** per rule. Only `blocker` FAILs set exit code 1.
- **SKIP** means the rule didn't apply: wrong `project_type` (`n/a for <type>`), an off profile (`profile 'advanced' off`), an opt-in feature not adopted, or nothing to check. A skip never counts against readiness.
- **Profiles:** `core` always runs; `service` auto-runs when `project_type=service`; `advanced` runs only with `--profile advanced` or `profiles:["advanced"]` in config.
- **Claims are opt-in:** CLAIM-* only run if a claims register exists or `makes_external_claims:true` is set explicitly. A repo with no claims register is not penalized.
- Config auto-detects sensibly; `baseline.config.json` at the repo root overrides. Keys are documented in `config.example.json`.
- The runner is zero-dependency (Node ≥ 18 + git) and crash-resilient: a rule whose check can't evaluate degrades to SKIP, never taking down the run.

## Notes

- Never present a warning as a blocker or vice-versa — the severity is in `rules.json` and the runner's output.
- Prefer running BUILD-05 for real (omit `--no-exec`) when the repo is trusted and the bootstrap command is set — a green crown check is the strongest single signal.
- The full rationale, rule table, category descriptions, and CI snippet are in this directory's `README.md` — read it if the user wants depth.
