# v3 — simplify baseline: enabler, not enforcer

**Status (2026-08-25).** Landed on branch `v3/red-tests` at `705e43a`, WP1–WP7 plus
the WP8 release package: `node test/red/run.mjs --green` exits 0 — 454/454 assertions,
38/38 live invariants — and every CI step is green. Open: the D13 ledger follow-up
(`log` / `jdg` / `scrub` / `admit` / `reconcile` and the `records/` tree), its own PR.

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
| **obsidian-tdd** | what is open (red/green tests) | `tdd.json`, committed |
| **okf-rag** | why things matter (prose, rationale) | `get_knowledge()`, HITL-curated |
| **graphify** | what is where (code structure) | `graphify-out/`, local, gitignored |

baseline also ships one always-on `PLUG` rule per plugin (§11 D8): `PLUG-01`
obsidian-tdd, `PLUG-02` graphify, `PLUG-03` okf-rag. Each is one WARN — artifact
absent → the install command; present but gitignore state differs from config →
the mismatch; otherwise PASS. It reads metadata only (D7): path, file or
directory, mtime, gitignore state. Plugins are suggested, never required (D6).

**Invariants (each needs a red test):**

- **V1** baseline imports no code from obsidian-tdd, okf-rag, or graphify. File
  contracts only. The runner stays zero-dependency Node.
- **V2** baseline runs to a complete, correct verdict with all three vendors
  absent. Absence is never a failure, never a warning — it is `n/a`.
  — amended by §11 (D8): absence of a plugin is one WARN, never a FAIL, never
  an exit-code change.
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
```

— `REC-06-vendor-declares-commit` withdrawn by §11 (D11): the rule is deleted;
the three surviving exemplars are the verbatim slugs D13 names.

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

94 → 79 → **76 rules** (§11 D11: the five `signoff` rules and `REC-06` leave,
three `PLUG` rules arrive). 28 → **9 always-on blockers**.

**Invariants:**

- **V8** no rule with a `FLOW-`, `DIV-`, or `MERGE-` prefix exists in the rule set.
- **V9** `REC-01` and `REC-04` do not exist.
- **V10** no `src/` module, evaluator kind, or CLI verb exists solely to serve a
  deleted rule. Deleting the rules deletes their machinery.
- **V11** the rule set contains exactly 79 rules and exactly 9 always-on blockers,
  and every count printed anywhere is derived from the rule set, never literal.
  — amended by §11 (D11): the rule set contains exactly 76 rules; the
  "never literal" clause stands.

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
  — withdrawn by §11 (D11): `REC-06` is deleted; reading a commit out of an
  artifact is the plugin-data parse D7 forbids. The three `PLUG` rules replace it.

**Invariants:**

- **V13** `REC-02` and `REC-05` fire on a secret committed outside `records/`.
- **V14** `REC-06` fails when a present vendor artifact carries no source commit,
  and is `n/a` when the artifact is absent.
  — withdrawn by §11 (D11).

## 5. Five opt-in packs

Nothing below runs unless enabled or obviously needed.

| Pack | Rules | Activates when |
|---|---|---|
| `claims` | `CLAIM-00`…`CLAIM-07` minus `CLAIM-05` (7, §11 D11) | `makes_external_claims: true` |
| `decisions` | `CTX-02`, `CTX-07`, `CTX-13`, `CTX-14` (4) | `decision_globs` non-empty |
| `descriptor` | `DESC-01/02/03` (3) | listed in `profiles` |
| `service` | `OPS-01`…`OPS-07` (7) | `project_type: service` |
| `advanced` | SBOM, code-scan, mutation, symbol-integrity | listed in `profiles` |

Any pack also activates from the `profiles` list (alias `packs`) or
`--profile <pack>`; the switches above are shortcuts, and a descriptor `type`
never activates a pack (§11 D13).

**Invariants:**

- **V15** with no config file at all, no rule from any pack is evaluated, and no
  pack rule appears in output — not as WARN, not as SKIP.
- **V16** a pack blocker (e.g. `CLAIM-00`) can fail CI when its pack is active
  and can never fail CI when it is not.

## 6. Derive the scope from the repo

Today a docs repo drags all 94 rules through its run. v3 detects what the repo
actually uses — package manager, test runner, CI, linters, hooks, Docker — and
evaluates only rules whose subject is present or declared. A rule's tool
requirement is an explicit rule field (`"tool": "docker"`), validated by
selfcheck; `want` overrides it (§11 D13).

**Invariants:**

- **V17** a rule whose tool is absent resolves `n/a` and prints nothing. Not a
  warn, not a skip line, not a counted result.
- **V18** on a docs-only repo the evaluated rule count is under 35.
- **V19** detection reads the repo only. No network, no `gh`, no ambient env.
- **V20** declaring a tool you do not yet have (`"want": ["docker"]`) activates
  its rules — intent counts as presence.

## 7. The three seams

### 7.1 `tdd.json` — presence only

**Amended by §11.** baseline never opens `tdd.json` (D7); it asks whether the
file exists and whether its gitignore state matches config, and answers with
one WARN row, `PLUG-01` (D8). The five sign-off rules this seam was to feed by
evidence — `TEST-03`, `TEST-04`, `TEST-06`, `CLAIM-05`, `CTX-04` — are deleted
(D11): a rule nothing can check is a written promise.

- **V21** with a `tdd.json` whose red test covers the invariant, the matching
  sign-off rule resolves by evidence with no ledger entry present.
  — withdrawn by §11 (D11).
- **V22** with no `tdd.json`, all five resolve `n/a` — never WARN, never a nag.
  — withdrawn by §11 (D11).
- **V23** baseline never checks *whether TDD was followed*. No rule asserts the
  existence of a red test as such; rules assert that a claim has a falsifiable
  criterion, of which a red test is one accepted form.
  — withdrawn by §11 (D11).

### 7.2 `graphify-out/` — orientation only

`graphify-out/` is gitignored, so it is local optional state.
`GRAPH_REPORT.md` records `Built from commit: <sha>`; compare against HEAD.
— amended by §11 (D7): baseline never opens `GRAPH_REPORT.md`; the graph's age
is the directory's mtime.

- **V24** `orient` reports the graph as fresh, stale, or absent, and never
  changes an exit code.
  — amended by §11 (D7): `orient` reports the graph as present or absent and
  its age from mtime; it reads no content.
- **V25** a stale or absent graph produces a suggestion, never a finding.
  — amended by §11 (D7, D8): `orient` reports present or absent and age from
  mtime as a suggestion; an absent graph's one finding is `PLUG-02`'s WARN row
  under `check`.

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
work:      tdd.json present · tracked · 2h old
graph:     graphify-out/ present · ignored · 3d old
knowledge: okf bundle present
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
  — amended by §11 (D11): `signoff` and `vendored-lock` leave the registry and
  `plugin-presence` joins it, so both derivations read 43; the equality stands.

## 10. Decisions taken 2026-08-25

Five conflicts the three independent RED-test authors surfaced, resolved by the
maintainer. Each adds or amends an invariant.

**D1 — `json-field` is deleted from `CHECK_KINDS`.** No rule uses it as its own
kind. Removing it collapses 45-vs-44 into one number. Amends V33; see §9.

**D2 — the OKF migration is a deterministic extraction, not authorship.** The
rules' prose (76 after §11 D11) already exists in `REFERENCE.md`'s rule table
and `GLOSSARY.md`.
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

## 11. Decisions taken 2026-08-25, second round — the plugin boundary

The first round left the three seams reading plugin *data*: `tdd.json`'s
`covers[]`, a `source_commit` inside a vendor artifact, `Built from commit:`
inside `GRAPH_REPORT.md`. Every one of those is a second parser for someone
else's file. The maintainer drew the line one step back. Where §1, §4 or §7
disagree with this section, this section wins; where a red test disagrees with
this section, the test is rewritten.

**D6 — baseline is workflow scaffolding, and plugins are suggested, not
required.** obsidian-tdd, okf-rag and graphify are the default suggestions. Install
is per approval: baseline prints the install command, and never runs it.

**D7 — the boundary is metadata.** For a plugin artifact baseline may read: does
the path exist, is it a file or a directory, its mtime, and its gitignore state.
It never opens the artifact. No `covers[]`, no `source_commit`, no
`Built from commit:`. `explain` may *display* a concept from the OKF bundle —
display is not a verdict (V3 stands).

**D8 — one WARN per plugin.** Each plugin is exactly one rule, in a new
always-on family `PLUG` (`rules/plug.json`, category `plugins`, severity
`warn`, kind `plugin-presence`): `PLUG-01` obsidian-tdd, `PLUG-02` graphify,
`PLUG-03` okf-rag. Verdict: artifact absent → WARN naming the install command;
present but gitignore state differs from config → WARN naming the mismatch;
otherwise PASS. A plugin never produces a second row, a FAIL, or an exit-code
change. The WARN is a `check` row (CI sees it), not an `orient` line.

**D9 — the only git question baseline asks about a plugin is "tracked or
ignored, per the user's setup".** Config key `plugins`, one entry per plugin,
`{ "path": <relative path or env-derived>, "ignored": true|false }`. Defaults:
`tdd.json` tracked; `graphify-out/` ignored; the OKF bundle at
`$BASELINE_OKF_BUNDLE` ignored, and the gitignore question is skipped when that
path is outside the repo.

**D10 — every WARN leaves a log.** A WARN row prints the path
`.baseline/log/<RULE-ID>.log`; the file records the paths inspected, the config
values used, and the gitignore answer, so the finding can be investigated
without re-running. Overwritten each run. `.baseline/log/` joins
`.baseline/cache/` in the gitignore template. `--json` carries the same path
as `log`.

**D11 — the five `signoff` rules and `REC-06` are deleted.** `TEST-03`,
`TEST-04`, `TEST-06`, `CLAIM-05`, `CTX-04` were severity `manual`: a human
ledger entry was their only evidence, and D7 forbids the `tdd.json` reading
that §7.1 offered in its place. A rule nothing can check is a written promise.
`REC-06` (`vendored-lock`) is replaced by the three `PLUG` rules. The kinds
`signoff` and `vendored-lock` leave `CHECK_KINDS` (V10, V33). The rule set is
therefore **76** rules (79 − 6 + 3); V11's count is amended, its "never
literal" clause stands. `REC-02` and `REC-05` (§4, V13) survive; REC-05 is narrowed to at-rest push-time evidence (a committed gitleaks config or pre-push hook) so it no longer duplicates SEC-12, whose question is CI/pre-commit scanning.

**D12 — the forge is closed under `check` and `orient`.** `GOV-01`, `GOV-02`
and `OPS-07` are forge-sourced and survive; under `check` and `orient` they
resolve `n/a` with reason `forge not consulted` (V19, V37). `admit` and
`reconcile` keep the live probe.

**D13 — the first-round questions, settled.** `explain --propose` does not
exist (D3 wins; seams V4's two `--propose` assertions are rewritten against
`gen okf-concepts`). The ledger removal in this burn-down is the minimum the
tests pin (`lane` verb, `signoff` kind, `REC-01`/`REC-04`); `log`, `jdg`,
`scrub`, `admit`, `reconcile` are a follow-up PR. A rule's tool requirement is
an explicit rule field (`"tool": "docker"`), validated by selfcheck; `want`
overrides it. Any pack activates from a `profiles` list (alias `packs`) or
`--profile <pack>`; the §5 switches are shortcuts; a descriptor `type` never
activates a pack. The 76 slugs are drafted by the implementer from titles, the
§2 exemplars verbatim, reviewed as one file diff.

**Superseded:** V14, V21, V22, V23 are withdrawn. V2 is amended: absence of a
plugin is one WARN, never a FAIL, never an exit-code change. V24 and V25 are
amended: `orient` reports the graph as present or absent and its age from
mtime; it reads no content. V11 reads 76.

**Invariants:**

- **V38** `rules/plug.json` holds exactly three rules, `PLUG-01`, `PLUG-02`,
  `PLUG-03`, all severity `warn`, all kind `plugin-presence`, none in a pack,
  none a blocker. No other rule reads a plugin artifact path.
- **V39** with all three artifacts absent, `check` on a clean repo emits exactly
  three WARN rows, one per `PLUG` rule, each naming an install command and a
  `.baseline/log/PLUG-0N.log` path that exists after the run; exit code 0.
- **V40** with an artifact present and its gitignore state matching config, the
  `PLUG` row is PASS and no log is written for it; with the state differing
  (e.g. `graphify-out/` tracked), the row is WARN, names the mismatch, and the
  log records the config value and the git answer.
- **V41** no code path under `check` or `orient` opens a plugin artifact for
  reading. `tdd.json` content, `GRAPH_REPORT.md` content and bundle content
  are never read during `check`; `explain` may read the bundle.
- **V42** `GOV-01`, `GOV-02`, `OPS-07` resolve `state: "n/a"`, reason
  `forge not consulted`, under `check` and `orient`, and `gh` is not spawned.
