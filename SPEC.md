# Spec: Issue #47 — REC-01's sanctioned-edit route must actually resolve

## Objective

REC-01 ("Committed records are append-only") tells the author, in its own `fix`
field, that a landed record that must change is a judgment: *"record a JDG and leave
the tombstone."* But the `records-append-only` evaluator
(`src/evaluators.mjs`, `k === 'records-append-only'`) never reads the judgment
ledger. Recording the JDG changes nothing — the warn reports the same mutation
count forever.

This is worse than a cosmetic warn:

1. **The warn cannot be cleared by behaving well.** A mutation is permanent
   history; the only way to clear the rule is to rewrite history, which is the act
   the rule exists to prevent. A permanently-lit warn stops being read after two
   sprints — and REC-01 is the rule you least want people tuning out.
2. **It scores a repair identically to a rewrite.** Real case (`mcgyvr`, vendors
   2.5.0): swapping a rot-prone citation for sha256-pinned evidence made a record
   *more* forensically sound — REC-01's whole purpose — and the rule flagged it
   exactly as it would an edit that fakes a result.

**Fix:** REC-01 reads the judgment ledger the way DESC-03 already does. A mutation
whose path is covered by a sanctioning judgment is reported as *sanctioned* and
excluded from the finding count. Unsanctioned mutations still fail. The sanctioned
route named in the rule's `fix` becomes true: an author can reach clean without
rewriting history.

### Success criteria

- A committed mutation to a record under `records/`, covered by an unexpired
  sanctioning judgment naming that path, is excluded from REC-01's finding count.
- If every mutation is sanctioned, REC-01 returns `ok: true` (PASS) and the detail
  names the sanctioning judgment id(s).
- If any mutation is unsanctioned, REC-01 returns `ok: false` (WARN) counting only
  the unsanctioned mutations, and the detail separates sanctioned from unexplained.
- `break-glass` judgments never sanction (outage relief, not record-edit approval —
  the DESC-03 reasoning, applied here).
- An expired judgment (`review_by` in the past) does not sanction; the mutation
  counts and the detail stays honest about it.
- No regression: `test/{records,golden,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs`
  all pass; `check.mjs --self-check` passes; golden `--verify` unchanged (REC-01 is
  SKIP in every golden fixture — no judgment records there).

## Tech stack / commands

- Node >= 18, zero dependencies. Forge reads are replay-backed; this change is
  **git-plane + tree-plane only** — no new forge surface.
- Judgment loading reuses `loadJudgments` (`src/jdg.mjs`) and the existing
  `globToRe` (`src/util.mjs`) matching primitive — no new helpers, no new deps.

```
self-check:  node check.mjs --self-check
records:     node test/records/run.mjs          (focused suite for this change)
golden:      node test/golden/run.mjs --verify
full:        node test/{orient,facts,lane,flow,admit,reconcile,gen}/run.mjs
golden recapture: node test/golden/run.mjs --capture   (only if a pin genuinely moved)
```

## Project structure (relevant)

```
src/config.mjs      — resolveConfig: return the FULL judgment list (JUDGMENTS),
                      not just the sign-off map (JDGS)
check.mjs           — thread JUDGMENTS into makeEvalCheck
src/admit.mjs       — thread JUDGMENTS into makeEvalCheck (REC-01 has admit context)
src/reconcile.mjs   — thread JUDGMENTS into makeEvalCheck (REC-01 has reconcile context)
src/evaluators.mjs  — records-append-only: classify each mutation as sanctioned /
                      unexplained; hoist the sanction-kind set to one constant
rules/rec.json      — rewrite REC-01's `fix` to name the exact tombstone command
CONTRACT.md         — document the tombstone route + matching/expiry semantics
REFERENCE.md        — REC-01 row: note the sanctioned-edit route
CHANGELOG.md        — [Unreleased] entry
test/records/run.mjs — RED tests: sanctioned / unsanctioned / wrong-subject /
                      break-glass / expired / glob-scope / mixed / all-sanctioned,
                      plus one check.mjs end-to-end tombstone flow
```

## Key design decisions (recorded assumptions — autonomous, no human to ask)

The issue flags exactly one design fork and answers it; the rest are recorded here
so a later human can revisit the cheapest ones.

1. **Tombstone is backfillable (NOT same-range).** The JDG need not ride the same
   commit range as the mutation (DESC-03's rule). It is read from the ledger at
   evaluation time, whenever it was recorded. This is the issue author's own
   reading ("REC-01 wants the latter") and is what *"leave the tombstone"* means:
   a later, permanent record. DESC-03's same-range constraint is deliberately NOT
   inherited — the two rules ask different questions (atomicity of a gated change
   vs. a permanent sanction of an immutable fact).

2. **Matching = `subject` glob-matches the reported mutation path** via the existing
   `globToRe` (the one canonical helper, already used by lane placement). An exact
   path (`records/claims/CLM-0001.json`) is a literal glob and matches exactly; a
   scope (`records/claims/**`, `records/sessions/main/*.md`) covers a set. This is
   "matched on subject, as DESC-03 matches", generalized from one filename to a
   path/scope. The tombstone names the path as it appears in the finding detail.

3. **Sanctioning kinds = {sign-off, deviation, risk-acceptance}.**
   `break-glass` is excluded — it is outage relief with its own gate semantics; the
   exact reasoning DESC-03 already encodes ("break-glass is outage relief, never
   descriptor-change approval"). The set is hoisted to one module-level constant
   shared by REC-01 and DESC-03 (one home).

4. **The sanction is active only while unexpired** (`review_by >= TODAY`, the
   run's one clock already computed in `makeEvalCheck`). A lapsed tombstone stops
   sanctioning and the mutation counts again — forcing a re-look, per the ledger's
   "every judgment lapses" rule. This matches DESC-03 (`review_by >= TODAY`) and
   the signoff bridge (a lapsed sign-off is honestly not signed). *(Cheapest to
   revisit: a permanent tombstone would instead sanction forever; the code is a
   one-line flip if dogfood data says re-judging immutable history is ceremony.)*

5. **Ledger source = the worktree ledger** via `resolveConfig` (the same
   `loadJudgments` the signoff bridge uses), threaded as a new `JUDGMENTS` param to
   `makeEvalCheck`. Schema-invalid judgments are already excluded by
   `loadJudgments`, so a malformed tombstone can never sanction. In `admit` and
   `reconcile` the worktree ledger is the incoming-branch / tip ledger, which is
   exactly the ledger a tombstone would ride or already live in.

6. **Disposition is reported, not just counted.** The detail separates sanctioned
   from unexplained and names the sanctioning id(s). The issue's secondary ask —
   *distinguishing pure-append edits from restatements via the diff* — is **out of
   scope**: it is explicitly marked secondary and "where the diff makes that cheap
   to tell"; a content diff over full history is not cheap and would buy a new
   correctness surface. Deferred as a follow-up.

## Code style

Match the existing evaluator style: a leading comment naming the rule id and the
lesson, `ok: null` for SKIP (never a guess), `{ ok: true }` for PASS,
`{ ok: false }` for a finding. Detail strings render through `sanitizeTTY` at the
boundary — keep them plain. Reuse `globToRe` and the one `TODAY` clock already in
scope; do not add a second matching helper or a second clock.

```js
// module scope (beside DIV_REF_CAP):
// The judgment kinds that can SANCTION a change (REC-01's tombstone) or approve a
// descriptor change (DESC-03) — break-glass is deliberately absent: it is outage
// relief with its own gate semantics, never record-edit or descriptor approval.
const SANCTION_KINDS = ['sign-off', 'deviation', 'risk-acceptance']
```

## Testing strategy

- **TDD / Prove-It**: write the RED tests in `test/records/run.mjs` first (they fail
  on the current evaluator), then implement to GREEN, then run the full suite.
- **Unit level** (extend the existing "REC evaluators against real history" block):
  pass `JUDGMENTS` directly to `makeEvalCheck` and assert the classifier. Use
  extreme `review_by` dates (`2000-01-01` / `2999-01-01`) so the unit process's
  real clock never matters.
- **End-to-end level** (new block, mirrors the t12 pattern): a repo with a committed
  record, a committed edit, then a real `records/judgments/JDG-0001.json` tombstone
  committed — run `check.mjs --json` and assert REC-01 flips WARN→PASS. This is the
  guard against forgetting to thread `JUDGMENTS` through `resolveConfig`.
- Golden corpus is untouched (REC-01 is SKIP in every golden fixture); `--verify`
  must stay green with **no** re-capture.

## Boundaries

- **Always**: run the suite before commit; null → SKIP, never guess; detail strings
  honest about source; no new dependencies.
- **Never**: change rule severity or context; change existing REC-01 semantics for
  repos with no judgments (identical output); add a forge read; weaken the
  unsanctioned-mutation finding.
- **Deferred (out of scope)**: the pure-append-vs-restatement diff distinction
  (issue's secondary ask); a severity-by-posture seam (M7's already-ruled revoke).

## Open questions

None — all ambiguities resolved and recorded as assumptions above. The single most
revisitable choice is decision #4 (expiry: unexpired-only vs permanent tombstone);
it is the cheapest to flip and the one the dogfood data would settle first.
