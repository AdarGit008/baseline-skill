# Implementation Plan: e2e finding #1 — SKILL.md promises a `fix` mode the CLI never shipped

## Overview

SKILL.md's **Modes** section lists four modes — orient, score, fix, explain — but
`baseline.mjs` routes no `fix` command, and never did (no `runFix` anywhere in git history).
`node baseline.mjs fix --repo .` answers `unknown command 'fix'`. The per-rule `fix` FIELD is
real but advisory prose: it rides `--json` result rows, `baseline explain <id>`, and the
generated REFERENCE table, and is never auto-applied.

This plan corrects the doc, not the dispatcher: the `fix` bullet is guidance, not a mode, so
it comes out of the Modes list, the frontmatter description stops implying a `baseline fix`
CLI, and the RED invariant V46 — "every mode SKILL.md names is a verb baseline.mjs actually
routes" — is the guard that flips green when the two agree.

## The decision: do not implement `baseline fix`

The `fix` texts are prose for a human — e.g. "add a CI workflow that lints and tests",
"git rm --cached the .env file". Several are destructive (SEC-02 removes a file from the
index), so auto-applying them would violate the repo's own no-destructive-without-approval
rule, and a generic prose-applier cannot perform a task like "add a CI workflow" anyway. The
field stays advisory: the agent reads it and does the work with the human's approval. The
bug is the promise, not the missing code.

## Task list

### Phase 1: the doc stops promising an unimplemented verb
- [ ] Task 1: remove the `fix` bullet from the Modes list
  - Acceptance: the **Modes** section names orient, score, explain only. The `fix` guidance
    itself is not lost — the per-rule `fix` fields remain the agent's instructions, and the
    description still names the activity (Task 2).
  - Verify: no `fix` bullet remains under `## Modes`; `node baseline.mjs fix --repo .` still
    says `unknown command 'fix'` (the doc no longer promises otherwise).
  - Files: `SKILL.md`

### Checkpoint 1
- [ ] The **Modes** section and the dispatcher agree: every remaining mode is a real verb.
      `node test/red/run.mjs surface` — the V46 `fix` line goes green the moment the bullet
      is gone (it cannot green while the bullet remains).

### Phase 2: the description keeps the intent, drops the implication
- [ ] Task 2: reconcile the frontmatter description
  - Acceptance: the description still tells the agent it helps *fix blockers* (the activity —
    read each failing rule's `fix` guidance and apply it with the user's approval), but the
    wording no longer reads as a `baseline fix` CLI mode alongside "score a repo" and
    "orient at session start".
  - Verify: the word `fix` still appears in SKILL.md (so V30 stays green), and no phrase in
    the description names a `fix` command.
  - Files: `SKILL.md`

### Phase 3: the guard
- [ ] Task 3: V46 flips green — the acceptance criterion
  - Acceptance: `node test/red/run.mjs --green` exits 0 with the burn-down all green. V46's
    "every mode SKILL.md names routes" now holds because the Modes section names only
    orient / score / explain, and each maps to a verb the dispatcher routes (`score` maps to
    the default `check`).
  - Verify: `node test/red/run.mjs --green` → `0/N assertions still red across 0/11 areas`,
    exit 0.
  - Files: `test/red/surface.mjs`, `test/red/run.mjs` (already written RED, this task only
    confirms the flip)

## Notes

- **No install.sh change.** install.sh copies SKILL.md to every install target
  (Claude/Hermes/Pi); the corrected SKILL.md ships automatically. Do not add a redundant
  copy step.
- **V30 stays green by construction.** V30 asserts the word `fix` still appears somewhere in
  SKILL.md — the description's "fix blockers" satisfies it — so removing the Modes bullet
  does not break the existing invariant; it is the reason Task 2 must keep the word.
