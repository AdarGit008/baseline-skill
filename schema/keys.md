# Join keys

The relational join (`src/join.mjs`) may relate work items **only** through the keys declared
here. A relationship it cannot resolve through a declared key is a **finding**, never an
inferred guess — the discipline that keeps derived state honest (no NLP, no heuristics). The
descriptor's `join_keys` names which keys a repo has opted into.

## Forge keys (read by `admit` and `reconcile` — the forge is closed under `check` and `orient`)

| Edge | Key | Plane | How it's produced |
|---|---|---|---|
| PR ⇄ branch | `headRefName` | forge | GitHub sets it when the PR is opened |
| PR ⇄ issue | `closes` | forge | a `closes` / `fixes` / `resolves #N` reference in the PR body (GitHub closing keywords) |

An unresolvable `closes #N` (no such issue) is emitted as an `unresolvable-join` finding.

## Record keys

| Edge | Key | Carried by |
|---|---|---|
| session ⇄ branch | the directory (`records/sessions/<branch>/`) | session records |
| session ⇄ issue | `Baseline-Issue` trailer (one home: `src/util.mjs` TRAILER_ISSUE) | session records |
| JDG ⇄ subject | `subject` field (a rule id, a path, or `baseline.repo.json`) | judgment records |
| CLM ⇄ claim unit | record id | claim records |
| ADR ⇄ ADR | `Supersedes` / `Superseded-by` / `Amends` / `Amended-by` header fields | decision records (the `decisions` pack resolves them) |

`src/join.mjs` consumes only the keys whose records exist, so no key is joined before it can
be resolved. Plugin artifacts (`tdd.json`, `graphify-out/`, the okf bundle) carry no join key:
baseline reads their metadata only and never their content.
