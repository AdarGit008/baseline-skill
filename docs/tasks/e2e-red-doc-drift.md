# Implementation Plan: e2e finding #2 — the live reference docs still narrate v3

## Overview

The shipped rule set is v4 — 13 rules, severity vocabulary `{blocker, none}`, no packs, no
warn tier, no descriptor/claims/records/repro/ops families — but the pages whose whole job
is to describe *now* still narrate v3: `REFERENCE.md` opens with "project-baseline v3" and
"Everything else warns", keeps a whole **Packs** section, and names `DESC-03`, `CTX-11` +
`doc_lag_days`, the `docker`/`REPRO-04` tool, `BUILD-05`, `OPS-07`, and the `CLAIM` family;
`CONTRACT.md` documents pack switches (`makes_external_claims`, `decision_globs`,
`project_type: service`, `profiles`) and `doc_lag_days`; `GLOSSARY.md` defines a **Pack**
entry, warn-tier language and a **Warn** entry, and `sign-off`; `SECURITY.md` names
`BUILD-05` once. `start-here.md` is already correct ("There is no warn tier").

This plan corrects the docs, not the code: the live pages are *views*, and where a view and
the rule set disagree the view is the bug. The RED invariant **V47 — "the live reference
docs describe the shipped v4 architecture"** (new area `docs`, `test/red/docs.mjs`) is the
guard that flips green when the pages stop advertising the retired machinery. It derives
every list from the code (`SURVIVING_IDS`, the empty `PACKS` map, the loaded rule set), so
it can only be satisfied by the docs actually matching the shipped set.

## The decision: the docs are views; the code is authority

v4 removed the warn tier, the opt-in packs, the descriptor family, and 68 of the 76 rules,
and the live reference docs must say so — in their own words, not by importing the code's.
`MIGRATION.md` and `CHANGELOG.md` stay historical **by design**: they name removed things
to tell you what happened to them, and V47 deliberately excludes them (along with
`docs/v2/`, `docs/v3/`, `docs/v4/rule-review.md` and `docs/tasks/`, which are provenance).
The four live pages — `REFERENCE.md`, `CONTRACT.md`, `GLOSSARY.md`, `SECURITY.md` — must
describe the v4 shape: the trust circle (`plugins`) and the baseline rules layer
(`baseline_rules`) as the two opt-ins, `blocker`/`none` severities, and no pack, no warn
tier, no retired rule id.

## Task list

### Phase 1: REFERENCE.md narrates v4
- [ ] Task 1: rewrite the prose, keep the generated table
  - Acceptance: the title drops "v3"; "Everything else warns" is gone; the **Packs** section
    and every `pack`/`packs` switch description are removed or rewritten to "packs are gone"
    (the two opt-ins are the trust circle and the baseline rules layer); no retired rule id
    remains in prose (`BUILD-05`, `BUILD-06`, `CTX-11`/`CTX-12`/`CTX-05..09`, `REPRO-04`,
    `OPS-07`, `GOV-01/02`, `DESC-01/02/03`, `CLAIM-*`, `REC-*`); the `tool`/`docker`/`want`
    machinery, the `warn`-tier framing ("warn is advisory", "PASS / WARN / FAIL", "One WARN
    per absent"), and the retired config keys (`bootstrap_command`, `doc_lag_days`,
    `decision_globs`, `freshness_globs`, `generated_globs`, `grounding_docs`,
    `makes_external_claims`, `profiles`) are gone. The **rule table and check-kind list**
    stay generated and current — do not hand-edit them (their glosses, if stale, are fixed
    in `docs/assets/gen-reference-rules.mjs` and regenerated).
  - Verify: `node test/red/docs.mjs` — the four `REFERENCE.md` lines go green; the diagrams'
    labels (regenerated via `docs/assets/gen-evaluate-stack.mjs`) no longer mention packs.
  - Files: `docs/REFERENCE.md`, `docs/assets/gen-reference-rules.mjs` (glosses only),
    `docs/assets/gen-evaluate-stack.mjs` (labels only), regenerated `docs/REFERENCE.md` table.

### Checkpoint 1
- [ ] REFERENCE.md stops advertising v3: `node test/red/run.mjs docs` shows REFERENCE.md's
      four assertions green, and the generated table/check-kinds still byte-match their
      generator (`baseline gen --check` / the generator's own `--check`).

### Phase 2: CONTRACT.md config and pack prose to v4
- [ ] Task 2: replace the "Packs, by hand" section and the config-key prose
  - Acceptance: "With no baseline.config.json every pack is off" is gone; the `claims` /
    `decisions` / `service` / `descriptor` pack switches (`makes_external_claims`,
    `decision_globs`, `project_type: service`, `profiles`) are removed; `doc_lag_days` is
    gone; the config surface is described as the trust circle (`plugins`, keyed
    `obsidian-tdd`/`graphify`/`okf-rag`) plus `baseline_rules` (and the `test_state_sources`
    / `knowledge_sources` source scopes). The `decisions pack` sentence and `DESC-03`
    descriptor-change section are rewritten to the v4 truth or removed.
  - Verify: `node test/red/docs.mjs` — CONTRACT.md's retired-id, pack, warn and config-key
    lines all go green (note: the judgment example's `"subject": "SEC-13"` must become a
    surviving id or a placeholder).
  - Files: `docs/CONTRACT.md`.

### Checkpoint 2
- [ ] CONTRACT.md agrees with the v4 config: `node test/red/run.mjs docs` shows CONTRACT.md
      green, and no other area regresses.

### Phase 3: GLOSSARY.md retires the v3 terms
- [ ] Task 3: retire or remove the pack, warn-tier, sign-off and descriptor entries
  - Acceptance: the **Pack** entry is removed (or marked retired with a pointer to
    `MIGRATION.md`); the **Warn** entry and warn-tier framing in **Blocker**/n/a
    ("Contrast warn") are removed (the severity vocabulary is `blocker`/`none`); the
    **Descriptor** entry's `descriptor pack (DESC-01/02/03)` becomes the v4 truth or is
    removed; `sign-off` language and the stale `BUILD-05`, `REPRO-04`, `GOV-01`,
    `CLAIM-07`, `CTX-12` references are rewritten; the **Plugin** entry's "always-on WARN
    rule" becomes the v4 membership gate (blocker for a member, `n/a` for a non-member).
  - Verify: `node test/red/docs.mjs` — GLOSSARY.md's four lines go green.
  - Files: `docs/GLOSSARY.md`.

### Checkpoint 3
- [ ] GLOSSARY.md defines the v4 vocabulary: `node test/red/run.mjs docs` shows GLOSSARY.md
      green.

### Phase 4: SECURITY.md (minor) and the gate
- [ ] Task 4: fix SECURITY.md's BUILD-05 mention (decided: included in the live-doc set)
  - Acceptance: the "documented risk BUILD-05 covers" clause no longer names a retired
    rule (reword to the v4 risk — running a repo's bootstrap is out of scope — without the
    id, or name the surviving evidence).
  - Verify: `node test/red/docs.mjs` — SECURITY.md's retired-id line goes green.
  - Files: `docs/SECURITY.md`.
- [ ] Task 5: V47 flips green — the acceptance criterion
  - Acceptance: `node test/red/run.mjs --green` exits 0 with the `docs` area green and every
    other area unchanged (green except the unrelated `surface` V46, which stays red until
    finding #1's own fix lands).
  - Verify: `node test/red/run.mjs --green` → `docs V47 0/23 green`, exit 0 once V46 is
    also fixed; until then `docs` is green while `surface` alone stays red.
  - Files: `test/red/docs.mjs`, `test/red/run.mjs` (already written RED; this task only
    confirms the flip).

## Notes

- **V46 is a separate fix.** Finding #1 (SKILL.md's `fix` mode) is pinned as V46 in
  `surface`, still RED on purpose. Both will stay red until their respective docs are
  corrected; V47 and V46 are independent and must not be conflated.
- **The rule table is already current.** `docs/REFERENCE.md`'s generated rule table and
  check-kind list ship the 13 v4 rules. Task 1 rewrites only the prose *around* them; any
  stale gloss lives in `docs/assets/gen-reference-rules.mjs`, not in the generated output,
  so fix the generator and regenerate — never hand-edit the generated region.
- **`start-here.md` is clean and stays clean.** It already says "There is no warn tier".
  V47 asserts it stays that way (0 hits), so don't add pack/warn/retired-id language to it.
- **V47 derives everything from code.** Its retired-id scan is `any PREFIX-NN not in
  SURVIVING_IDS`, its pack check is `PACKS === {}`, its warn check is the loaded severity
  vocabulary, and its config-key list is read from `src/config.mjs`'s own "retired ten
  keys" sentence. The fix must therefore change the docs, never the derivation.
