# v3 — simplify baseline: enabler, not enforcer

> **This document is not the authority. The tests are.**
> Every statement below must be enforced by a test in `test/red/`. Where this
> document and a red test disagree, the test wins and this document is wrong.
> Prose drifts; a test does not. That is the whole premise of the repo.

## 0. The judgment being made

baseline-skill today is 94 rules / 28 blockers / 5,240 LOC / ~100k tokens of
prose. Sixteen of its 28 blockers gate the author's *bookkeeping* (lanes,
divergence, records, descriptors), not the repo. It makes the author slower,
some checks are stale for the workflow, and it burns agent context.

v3 keeps the premise — *don't trust a written promise, make something check
it* — and drops the enforcement of a workflow that no longer exists.

## 1. The four-part shape

baseline stops being the whole system and becomes one part of four.

| Piece | Owns | Reaches baseline via |
|---|---|---|
| **baseline** | verdicts — deterministic, offline, one exit code | — |
| **tdd-pi** | what is open (red/green tests) | `tdd.json`, committed |
| **okf-rag** | why things matter (prose, rationale) | `get_knowledge()`, HITL-curated |
| **graphify** | what is where (code structure) | `graphify-out/`, local, gitignored |

**Invariants (each needs a red test):**

- **V1** baseline imports no code from tdd-pi, okf-rag, or graphify. File
  contracts only. The runner stays zero-dependency Node.
- **V2** baseline runs to a complete, correct verdict with all three vendors
  absent. Absence is never a failure, never a warning — it is `n/a`.
- **V3** a verdict never depends on a retrieval. `get_knowledge` may enrich an
  explanation; it may never change PASS/FAIL/WARN/SKIP.
- **V4** baseline never writes to the OKF bundle. It may write a *proposed*
  concept file to a staging path for human approval. Nothing else.

## 2. Rule ids carry three parts

Today: `CATEGORY-NN`. v3: `CATEGORY-NN-semantic-slug`.

```
SEC-01-no-committed-secrets      blocker
BUILD-05-task-1-passes-clean     blocker
CTX-12-status-is-derived         blocker
REC-06-vendor-declares-commit    warn
```

The id says what the rule checks, so a finding is readable with no lookup —
which is what lets `SKILL.md` shrink and the doctrine move out of context.

**Invariants:**

- **V5** every rule id matches `^[A-Z]+-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$`.
- **V6** slugs are unique across the whole rule set.
- **V7** the `CATEGORY-NN` prefix of every surviving rule is unchanged from
  v2.5.0 — the slug is additive, so a v2 id remains resolvable.

## 3. Delete 15 rules

| Drop | Count | Blockers | Why |
|---|---|---|---|
| `FLOW-01`…`FLOW-09` | 9 | 7 | Lane workflow is gone; TDD is the workflow. |
| `DIV-01/02/03` | 3 | 3 | Divergence existed only because lanes did. |
| `MERGE-02` | 1 | 1 | Sister-lane dependencies — same reason. |
| `REC-01`, `REC-04` | 2 | 0 | The records ledger is gone; okf-rag is the authority. |

94 → **79 rules**. 28 → **9 always-on blockers**.

**Invariants:**

- **V8** no rule with a `FLOW-`, `DIV-`, or `MERGE-` prefix exists in the rule set.
- **V9** `REC-01` and `REC-04` do not exist.
- **V10** no `src/` module, evaluator kind, or CLI verb exists solely to serve a
  deleted rule. Deleting the rules deletes their machinery.
- **V11** the rule set contains exactly 79 rules and exactly 9 always-on blockers,
  and every count printed anywhere is derived from the rule set, never literal.

### The 9 always-on blockers

`BUILD-01` manifest · `BUILD-03` CI present · `BUILD-05` task 1 passes clean ·
`TEST-01` tests exist · `SEC-01` no committed secrets · `SEC-02` .env ignored ·
`COMM-01` LICENSE · `CTX-05` no broken doc links · `CTX-12` status is derived.

- **V12** these 9 and only these 9 can produce a non-zero exit code with no
  opt-in packs active.

## 4. Retarget three REC rules, delete the ledger

- `REC-02` (scrub-clean) and `REC-05` (push-time secret gate) retarget from
  "records" to **anything you commit**. They keep their blocking/warn behavior.
- `REC-06` retargets to: **every vendored artifact declares the commit it was
  built from.** It becomes the freshness check for `tdd.json`, the OKF bundle,
  and `graphify-out/`.

**Invariants:**

- **V13** `REC-02` and `REC-05` fire on a secret committed outside `records/`.
- **V14** `REC-06` fails when a present vendor artifact carries no source commit,
  and is `n/a` when the artifact is absent.

## 5. Five opt-in packs

Nothing below runs unless enabled or obviously needed.

| Pack | Rules | Activates when |
|---|---|---|
| `claims` | `CLAIM-00`…`CLAIM-07` (8) | `makes_external_claims: true` |
| `decisions` | `CTX-02`, `CTX-07`, `CTX-13`, `CTX-14` (4) | `decision_globs` non-empty |
| `descriptor` | `DESC-01/02/03` (3) | listed in `profiles` |
| `service` | `OPS-01`…`OPS-07` (7) | `project_type: service` |
| `advanced` | SBOM, code-scan, mutation, symbol-integrity | listed in `profiles` |

**Invariants:**

- **V15** with no config file at all, no rule from any pack is evaluated, and no
  pack rule appears in output — not as WARN, not as SKIP.
- **V16** a pack blocker (e.g. `CLAIM-00`) can fail CI when its pack is active
  and can never fail CI when it is not.

## 6. Derive the scope from the repo

Today a docs repo drags all 94 rules through its run. v3 detects what the repo
actually uses — package manager, test runner, CI, linters, hooks, Docker — and
evaluates only rules whose subject is present or declared.

**Invariants:**

- **V17** a rule whose tool is absent resolves `n/a` and prints nothing. Not a
  warn, not a skip line, not a counted result.
- **V18** on a docs-only repo the evaluated rule count is under 35.
- **V19** detection reads the repo only. No network, no `gh`, no ambient env.
- **V20** declaring a tool you do not yet have (`"want": ["docker"]`) activates
  its rules — intent counts as presence.

## 7. The three seams

### 7.1 `tdd.json` — evidence, never a mandate

baseline reads the committed DB written by tdd-pi. Red tests are open work.
This flips the five sign-off rules — `TEST-03`, `TEST-04`, `TEST-06`,
`CLAIM-05`, `CTX-04` — from "write a ledger entry" to "a red test already
proves this."

- **V21** with a `tdd.json` whose red test covers the invariant, the matching
  sign-off rule resolves by evidence with no ledger entry present.
- **V22** with no `tdd.json`, all five resolve `n/a` — never WARN, never a nag.
- **V23** baseline never checks *whether TDD was followed*. No rule asserts the
  existence of a red test as such; rules assert that a claim has a falsifiable
  criterion, of which a red test is one accepted form.

### 7.2 `graphify-out/` — orientation only

`graphify-out/` is gitignored, so it is local optional state.
`GRAPH_REPORT.md` records `Built from commit: <sha>`; compare against HEAD.

- **V24** `orient` reports the graph as fresh, stale, or absent, and never
  changes an exit code.
- **V25** a stale or absent graph produces a suggestion, never a finding.

### 7.3 `get_knowledge()` — explanations only

`baseline explain SEC-01-no-committed-secrets` calls
`get_knowledge("baseline/rules/sec-01-no-committed-secrets")`.

- **V26** with okf-rag unreachable, `explain` prints the rule's one-line title
  and exits 0. The degrade path is the default path.
- **V27** every rule id resolves to an OKF concept id. Checked offline against
  the local bundle; this is the one check that stays on the prose layer.
- **V28** no `get_knowledge` result is read during `check`.

## 8. orient v2 and the SKILL.md diet

Orient prints five lines and blocks on nothing:

```
repo:      baseline-skill @ f8e31bc
work:      3 red tests open (tdd.json)
graph:     stale — built at 49dceb3, HEAD f8e31bc
knowledge: okf bundle reachable
score:     0 blockers · 4 advisory
```

The SessionStart hook leaves the default install and becomes opt-in.

`SKILL.md`: **4,723 tokens → under 800.** It keeps what baseline does, the one
command, three modes (orient / score / fix), the 9 blockers by name, and
"everything else, ask `get_knowledge`."

**Invariants:**

- **V29** `orient` emits at most 5 lines on a clean repo and always exits 0.
- **V30** `SKILL.md` is under 800 tokens (measure: bytes/4 < 800).
- **V31** `install.sh` does not wire the SessionStart hook unless asked.
- **V32** every doc still shipped states no count that is not derived.

## 9. Correct the drift this repo exists to catch

`baseline.config.json:10` and `docs/start-here.md` say 90 rules; there are 94.

**Amended (D1, §10).** The check-kind claim in the first draft of this plan was
wrong. `CHECK_KINDS` in `src/evaluators.mjs:53` registers **45**; rules declare
**44** distinct top-level kinds; `json-field` is registered but is reachable only
nested inside an `any-of`/`implies` composite. README's "45" was defensible.
v3 deletes `json-field` from the registry so registry and usage both read 44 and
the number stops depending on a reading.

- **V33** no shipped file contains a rule count or check-kind count as a literal
  that disagrees with the rule set, and `registry == top-level == 44` — the two
  derivations agree, so no reading has to be chosen.

## 10. Decisions taken 2026-08-25

Five conflicts the three independent RED-test authors surfaced, resolved by the
maintainer. Each adds or amends an invariant.

**D1 — `json-field` is deleted from `CHECK_KINDS`.** No rule uses it as its own
kind. Removing it collapses 45-vs-44 into one number. Amends V33; see §9.

**D2 — the OKF migration is a deterministic extraction, not authorship.** The
79 rules' prose already exists in `REFERENCE.md`'s rule table and `GLOSSARY.md`.
A one-time generator moves it; no model is involved, and the maintainer approves
the batch before anything enters the bundle.

**D3 — there is no ongoing propose path.** After the migration, a new rule's
concept is hand-written. `baseline explain` grows no `--propose` flag. One less
code path that can write near the bundle.

**D4 — `n/a` is silent to humans and explicit to machines.** "Didn't apply" and
"passed" are different facts and CI tooling needs to tell them apart.

**D5 — `orient` pulls, then reads.** Its only network act is `git pull` as step
0. After that it touches no forge and never spawns `gh`.

**Invariants:**

- **V34** `baseline explain` exposes no `--propose` flag, and no command writes
  into the OKF bundle path under any flag.
- **V35** the migration generator (`baseline gen okf-concepts`) writes only under
  `<repo>/.baseline/proposed/`, is byte-deterministic across runs on the same
  input, and makes no network call and no model call. Every concept it emits is
  traceable to a source span in a shipped doc.
- **V36** an `n/a` rule is absent from human output entirely, and present in
  `--json` as `state: "n/a"` with a non-empty `reason`. It is never a SKIP row.
- **V37** `orient` runs `git pull` as its first act and performs no other git
  write and no forge access; `gh` is never spawned. A failed pull degrades to a
  note, and `orient` still exits 0.
