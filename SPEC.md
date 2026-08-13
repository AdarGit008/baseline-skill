# Spec: Issue #46 — read PR closures from the forge, warn before a lane PR closes its own anchor

## Objective

Fix two coupled defects in how `baseline` discovers "which issues a PR closes":

1. **DIV-03 blind spot.** `div-closes-closed` (and orient's divergence headline) derive the
   closing set from a regex over the PR **body** (`issueCloses(pr.body)`). GitHub also closes
   issues through the **Development sidebar** link, which needs no keyword in the body. A
   sidebar-linked closure is invisible to baseline, so DIV-03 under-reports and — worse — a
   lane PR that *must not* close its anchor still closes it on merge, which then trips DIV-01
   as a blocker and deadlocks the lane (escape requires a new issue + new lane + cherry-pick).

2. **No pre-merge warning.** The only feedback an author gets is post-merge (DIV-01). The
   fix adds a preventive warn: an open PR whose closing set contains its own lane anchor.

The authority is the forge's `closingIssuesReferences` (GraphQL), which is a **superset** of
the body-text keyword set (it includes keyword-derived entries *and* sidebar links). The body
regex is retained as a graceful fallback when the GraphQL query fails.

### Success criteria

- `div-closes-closed` (DIV-03) and orient's divergence headline read the closing set from the
  forge when the forge is reachable, falling back to the body regex only on query failure.
- A sidebar-linked closure (no keyword in the body) is detected by DIV-03 and orient.
- A new rule **FLOW-08** (`pr-closes-own-anchor`, severity `warn`) fires on an open PR whose
  closing set contains its own lane anchor, at `check` and `admit` contexts, naming whether the
  closure is via sidebar link or body keyword.
- No regression: `test/{golden,orient,facts,records,lane,flow,admit,reconcile,gen}/run.mjs`
  all pass; `check.mjs --self-check` passes; golden pins are re-captured deliberately.

## Tech stack / commands

- Node >= 18 (repo has no `package.json`; tests are zero-dependency `node` scripts).
- Forge reads via `gh` (2.45.0 in this environment — `--json closingIssuesReferences` is **not**
  available there, so the GraphQL API is used).

```
self-check:  node check.mjs --self-check
facts:       node test/facts/run.mjs
flow:        node test/flow/run.mjs
records:     node test/records/run.mjs
golden:      node test/golden/run.mjs --verify
golden recapture: node test/golden/run.mjs --capture
orient/lane/admit/reconcile/gen: node test/<dir>/run.mjs
```

## Project structure (relevant)

```
src/facts/forge.mjs      — makeForge(): forge query surface (add prClosingIssues(n))
src/facts/index.mjs      — gatherFacts() / makeLaneWorld(): add prClosingIssues to lane world
src/evaluators.mjs       — CHECK_KINDS + div-closes-closed + new pr-closes-own-anchor
src/derive/divergence.mjs — deriveDivergence() (UNCHANGED; consumes pr.closes)
rules/flow.json          — add FLOW-08
test/flow/run.mjs        — behavioral matrix for FLOW/DIV (new cases)
test/facts/run.mjs       — facts/join/derive over replay (forge-closers assertions)
test/forge-fixtures/scenario/ — add pr-closers-*.json fixtures
test/golden/pins.json    — re-captured
test/records/run.mjs     — 90 → 91 rule count
```

## Key design decisions (recorded assumptions — no human to ask)

1. **Authority + fallback.** `closingIssuesReferences` (GraphQL) is authoritative; the body
   regex is the fallback when the per-PR GraphQL query fails. A failed closers query must never
   be coalesced to "closes nothing" — the caller falls back to the body regex (the prior
   behavior), so it is never *worse* than today.

2. **Per-PR query, not batched.** One `gh api graphql` call per open PR, memoized by the forge's
   `q()` cache. This matches the issue's verified form and the codebase's stated "GraphQL
   batching is deferred until fleet-scale rate pressure is real." PR list stays capped at 50.

3. **Rule identity.** FLOW-08, category `flow`, severity `warn`, `applies_to: all`, workflow
   `multi-lane | multi-lane-local`, contexts `check` + `admit`, **no** `branch_scope` (repo-wide,
   like DIV-03 — it scans all open PRs, not just the current branch). Certainty `deterministic`
   (a forge read). Kind name: `pr-closes-own-anchor`.

4. **Orient parity is in scope.** `gatherFacts` also switches `closes` to the forge-authoritative
   source, because the codebase's one-derivation rule forbids a check rule firing where orient
   stays quiet (see `test/facts/run.mjs` one-derivation parity assertion and the header comment in
   `derive/divergence.mjs`).

5. **"via sidebar vs keyword" is reported, not stored.** FLOW-08's detail distinguishes
   `via linked reference, not body text` (forge sees it, body regex does not) from
   `via closing keyword` (both see it). No provenance field is added to the persisted facts.

## Code style

Match the existing evaluator style: one `if (k === '...')` block per kind, a leading comment
naming the rule id and lesson, `return { ok: null, detail }` for SKIP (never a guess),
`{ ok: true }` for PASS, `{ ok: false }` for a finding. Detail strings render through
`sanitizeTTY` at the boundary; keep them plain.

```js
    if (k === 'pr-closes-own-anchor') {
      // FLOW-08: an open PR will close its own lane anchor on merge — the preventive twin
      // of DIV-01 (which fires AFTER the close and deadlocks the lane). Warn, never block.
      const w = LANEWORLD()
      if (!w.ns) return { ok: null, detail: 'no lanes.namespace declared' }
      if (!w.forge.available) return { ok: null, detail: `${w.forge.reason} — PR closures unreadable` }
      const prs = w.prsOpenOrNull()
      if (prs === null) return { ok: null, detail: 'PR listing failed at the forge — closures unreadable (not "no PRs")' }
      if (!prs.length) return { ok: true, detail: 'no open PRs — nothing to warn about' }
      const hits = scopedPrClosers(w).flatMap(pr => {
        const n = issueOf(w.ns, pr.branch)
        if (n == null || !pr.closes.includes(n)) return []
        const viaSidebar = pr.forgeCloses?.includes(n) && !pr.bodyCloses.includes(n)
        return [`PR #${pr.number} (${pr.branch}) will close its own anchor #${n} on merge (${viaSidebar ? 'via linked reference, not body text' : 'via closing keyword'}) — intended? If the lane continues past this PR, unlink the issue first`]
      })
      return hits.length
        ? { ok: false, detail: hits.slice(0, 3).join('; ') + (hits.length > 3 ? ` (+${hits.length - 3} more)` : '') }
        : { ok: true, detail: 'no open PR closes its own lane anchor' }
    }
```

## Testing strategy

- **TDD / Prove-It pattern**: write failing tests (RED) in `test/flow/run.mjs` and
  `test/facts/run.mjs` before the implementation, then make them GREEN.
- Forge reads are exercised **only** via replay fixtures (`BASELINE_FORGE_REPLAY`), never live
  network, so tests stay deterministic. New `pr-closers-<n>.json` fixtures use the raw GraphQL
  envelope shape (same convention as `lane-refs-refs_heads_lane_.json`).
- The full suite + self-check + golden re-capture is the completion bar.

## Boundaries

- **Always**: run the suite before commit; keep forge reads replay-backed; null → SKIP, never
  guess; detail strings honest about source.
- **Never**: add a dependency; send a live forge write; change rule severity semantics of
  existing rules; hardcode a guessed default branch.
- **Ask first** (n/a — autonomous; recorded as assumptions): none outstanding; the one design
  fork the issue itself flagged (body-regex fallback semantics) is resolved in decision #1.

## Open questions

None — all ambiguities resolved and recorded as assumptions above. (If a human later disagrees,
the single most revisitable choice is decision #2: per-PR vs batched GraphQL.)
