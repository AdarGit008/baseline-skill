# Ship Report — Issue #47

## Decision: **GO** ✅

## Scope

Two units, one branch:

1. **REC-01's sanctioned-edit route** (`619dea6`, landed on `main`) — the rule's `fix`
   told an author to record a JDG and leave a tombstone, but the evaluator never read
   the ledger, so the warn could not be cleared without rewriting history.
2. **`globToRe` → `globMatcher`** — the security review of (1) failed. Routing a
   judgment `subject` into the glob helper made a latent ReDoS reachable, and the two
   mitigations first proposed were both measured to be ineffective. The helper is now
   a non-backtracking sweep.

## Review outcome

| Axis | Verdict | Action |
|------|---------|--------|
| Correctness | PASS | none |
| Readability | PASS | none |
| Architecture | PASS | none |
| Security | **FAIL on first pass** → PASS | Rewrote the matcher (see below) |
| Performance | PASS | none |

The security failure is the substance of this ship. First pass proposed lazy
quantifiers plus a `maxLength: 256` cap on `judgment.subject`, and the first draft of
the review signed it off by reading the code's comment. Measurement contradicted it:

- Greedy regex, 68-char hostile glob, non-matching path: **892 ms**. Lazy: **891 ms**.
  Laziness reorders the search, it does not shrink it.
- Cost grows ~3.9x per 6 glob characters, so the 256-char cap permits an effectively
  permanent hang. A cap tight enough to be safe is too tight for a real record path
  (48 chars is typical).
- Not new to #47: `lanes.families` already reached the same helper at **374 ms** on its
  existing 64-char cap.

Fix: `globMatcher` compiles to a token list and matches with one sweep over the
reachable-position set — O(tokens x path), no search tree.

| case | old | new |
|---|---|---|
| 68-char hostile glob | 892 ms | 0.11 ms |
| 256-char hostile glob (at the cap) | never finished | 1.00 ms |
| `lanes.families` at its 64-char cap | 374 ms | 0.06 ms |

`maxLength: 256` is retained as defense in depth, with its schema description corrected
to say so rather than claiming to be the fix.

## Deferred (non-blocking, filed as follow-ups)

- `src/evaluators.mjs:470` re-compiles the matcher per mutation; a precompiled list is
  the obvious optimization when many-mutations x many-judgments pressure shows up.
- An expired tombstone re-lights the warn for an immutable historical edit (SPEC
  decision #4). Left for dogfood data to settle.
- `lanes.families`' 64-char cap is now conservative rather than load-bearing; it could
  be relaxed, but nothing needs it relaxed today.

## Verification

- `check.mjs --self-check` green (91 rules, internally consistent).
- `test/{records,orient,facts,lane,flow,admit,reconcile,gen}/run.mjs` all green.
- `test/golden/run.mjs --verify` green — 18 fixtures identical to pins, **no re-capture**.
- Self-score `node check.mjs --repo . --no-exec` = **0 blockers**, 22 pass / 1 warn,
  readiness 96%.
- **Differential test**: 41,980 glob/path pairs (curated edge cases + fuzz) compared
  old regex vs new matcher — **0 mismatches**. This is what licenses the rewrite of a
  primitive with nine call sites.
- New regression coverage in `test/records/run.mjs`: cap probe, no-hang timing bound,
  schema bound at 256/257, and five glob-semantics pins (`**/` slash-swallowing,
  `*` not crossing `/`, `**` crossing it, `?` arity, literal dots).

## Rollback plan

Trigger: any post-merge regression in a vendoring consumer (REC-06 hash-pinned), CI, or
a glob-matching behavior report from a consumer repo.

1. `git revert --no-edit <matcher-commit> 619dea6` (reverse order), or
   `git reset --hard 9d30bda` on the branch.
2. Re-run `node check.mjs --self-check && node test/golden/run.mjs --verify` and the 9
   runners.
3. No data migration. The schema change is additive-restrictive (`maxLength`) — a
   revert cannot invalidate an existing record, since anything valid under the cap is
   valid without it.

Time to rollback: < 5 minutes (pure source revert, no deploy, no data).

## Risk note

The riskiest element is not the feature but the rewrite of a primitive with nine call
sites — a silent semantic drift in glob matching would misfile lanes, mis-scope repo
globs, and silently change rule verdicts. That risk is retired by the 41,980-pair
differential test plus a golden corpus that verified clean with no re-capture, which
together mean no shipped verdict moved.

Not otherwise high-risk/irreversible (no auth, secrets, destructive migration, payment,
or deploy).
