# Code Review — Issue #47 (five-axis)

Reviewed diff: `9d30bda..HEAD` — the REC-01 sanctioned-edit route (2 commits, landed)
plus the `globMatcher` rewrite the security axis forced.

## Verdict: **Approve**

The feature is correct and well covered. The security axis failed on first pass and
the fix is included in this review, not deferred — see below. Two non-blocking
observations at the end.

## Correctness — PASS

- `src/evaluators.mjs:470` classifies a mutation by filtering `JUDGMENTS` on
  `SANCTION_KINDS.includes(j.kind) && j.review_by >= TODAY && globMatcher(j.subject).test(path)`.
  The three predicates are exactly the recorded contract: unexpired, sanction-class,
  subject-matching. `break-glass` is excluded by the shared constant (line 23), and
  an expired tombstone stops sanctioning.
- `src/evaluators.mjs:459-468` carries each mutation as `{ path, text }` with `path`
  the reported path (`e.to || e.path` for MDR, `p` for the layer-2 merge-hidden cases),
  so the tombstone names what the finding shows. The `touched` set still keys on
  `e.path` — layer-2 de-duplication is unchanged.
- `src/evaluators.mjs:477-479`: no mutations → the detail string is byte-identical to
  before; all-sanctioned → `ok: true`; mixed → counts only `unexplained` and appends a
  `— N sanctioned (...)` disposition. Golden `--verify` is green with no re-capture.
- `src/config.mjs:84-85` splits the existing `loadJudgments` call so `JDGS` (sign-off
  map) and `JUDGMENTS` (full list) share one parse; `selectSignoffs` receives the same
  array it did before — behavior-preserving.
- `SANCTION_KINDS` is hoisted and reused by DESC-03 (`src/evaluators.mjs:915`) — a pure
  deduplication, no semantic change to the descriptor gate.

## Readability & Simplicity — PASS

- Names are descriptive (`sanctionsOf`, `mutations`, `unexplained`); the leading comment
  names the issue and the contract, matching the file's style.
- `globMatcher`/`sweep` (`src/util.mjs:92`, `:112`) is longer than the regex it replaces
  — 60 lines against 15. That is the cost of not backtracking, and the header comment
  carries the measurements plus an explicit "do not fix this back to a regex," because
  the regex form is the obvious-looking thing a future reader would restore.

## Architecture — PASS

- The ledger reads through the existing `resolveConfig` → `makeEvalCheck` seam, the same
  path `JDGS` already takes — no new loader, no new module, no forge surface.
- `SANCTION_KINDS` is one home for its two consumers (REC-01 + DESC-03), exactly the
  repo's "one home or the two consumers drift" discipline.
- The rename `globToRe` → `globMatcher` is not cosmetic: the function no longer returns
  a RegExp, and a name that lied would invite a caller to reach for `.source` or `.exec`.
  All nine call sites used only `.test()`, so the new return shape is a drop-in.

## Security — **FAIL on first pass, fixed in this change**

The original submission tried to harden `globToRe` with lazy quantifiers plus a
`maxLength: 256` bound on `judgment.subject`, and the first draft of this review passed
it. Both were measured before the axis was signed off. **Neither works.**

`globToRe` compiled a glob to `^…$` regex, so `**a**a**a…` became `^.*a.*a.*a…$` —
catastrophic backtracking on a path that does not match. Measured through the shipped
helper, non-matching input:

| glob chars | time |
|---|---|
| 44 | 4.6 ms |
| 50 | 14.6 ms |
| 56 | 56.3 ms |
| 62 | 238 ms |
| 68 | 892 ms |

~3.9x per 6 characters. That matters here because #47 is what makes a judgment
`subject` — ledger-authored text — flow into the matcher.

- **Lazy quantifiers do not fix it.** Same glob, same path: greedy 892ms, lazy 891ms.
  Laziness reorders the search; it does not shrink the search space. The comment
  claiming "lazy scanning is linear per segment" was false.
- **The 256-char cap does not fix it.** At ~3.9x per 6 chars, 256 chars is roughly
  `3.9^31` beyond the 892ms row — an effectively permanent hang. Any cap loose enough
  to hold a real record path (`records/sessions/main/2026-07-01-100000-agent.md` is 48
  chars) is loose enough to hang.
- The hazard was **not new to #47**: `lanes.families` already reached the same helper,
  and measured 374ms at its existing 64-char cap. #47 only made it reachable from a
  second, wider surface.

**The fix**: `globMatcher` (`src/util.mjs:92`) compiles the glob to a token list and
matches with one non-backtracking sweep (`:112`) that carries the set of reachable path
positions as a bitmap — O(tokens x path), no search tree. Results:

| case | old | new |
|---|---|---|
| 68-char hostile glob | 892 ms | 0.11 ms |
| 256-char hostile glob (at the cap) | never finished | 1.00 ms |
| `lanes.families` at its 64-char cap | 374 ms | 0.06 ms |
| 10k realistic path matches | — | 17.5 ms (1.75 µs each) |

Semantics are preserved byte-for-byte: 41,980 glob/path pairs (curated edge cases +
fuzzed) compared against the old regex, **0 mismatches**. The sweep deliberately keeps
the regex's quirks — `.*` and `.` stop at a newline, `[^/]*` does not — so no caller
sees a behavior change. `test/records/run.mjs` pins both the timing bound and those
semantics.

`maxLength: 256` is kept as defense in depth, and its schema description now says so
rather than claiming to be the ReDoS defense.

Otherwise: no secrets, no injection; subject/path strings render through the existing
`sanitizeTTY` boundary.

## Performance — PASS

- `sanctionsOf` is O(mutations x judgments) and now recompiles a *token list* rather
  than a RegExp per call. Both inputs are bounded (history events, a schema-valid
  ledger); no new spawns, no network.
- The matcher rewrite is a net win everywhere, not a tax: the repo-wide `match()` in
  `src/repo.mjs:51` runs every glob against every file, and it got faster.

## Findings (non-blocking)

- **Optional** — `src/evaluators.mjs:470` re-compiles `globMatcher(j.subject)` for every
  mutation. A precompiled `[{ m, id }]` list built once per evaluation would remove the
  re-parse. Cheaper to justify now than before (compilation is a token scan, not a
  regex parse), still not worth doing until a repo shows many-mutations x
  many-judgments pressure.
- **Consider** — an expired tombstone re-lights the warn for an immutable historical
  edit, forcing periodic re-judgment. This is the SPEC's recorded decision #4 and the
  cheapest to revisit (one-line flip to permanent); the alternative trades "ledgers
  lapse" consistency for less ceremony. Flagged for the dogfood data to settle.

## Process note

The first draft of this review signed off the security axis by reading the code's own
comment instead of measuring it. The claim was false and the axis was wrong. Security
claims about pathological input get a measurement in this repo, not a reading.

## Verification story

`check.mjs --self-check` green · `test/records/run.mjs` green (9 REC-01 assertions + 10
new for the matcher: cap probe, no-hang timing bound, schema bound at 256/257, and five
glob-semantics pins) · `test/{orient,facts,lane,flow,admit,reconcile,gen}/run.mjs` green
· `test/golden/run.mjs --verify` green, 18 fixtures identical, **no** re-capture ·
41,980-pair differential test old-vs-new, 0 mismatches.
