# CONTRACT — the plain-git twin

What the baseline V2 workflow expects of a repo, written so a human (or any agent)
can comply with **git alone** (C28). The `baseline` CLI automates this contract;
it never replaces it. Everything here is checkable — that's the point.

## The loop

- **Orient first.** Start a session with `baseline orient` (or read `records/` by
  hand: newest session log per lane, its `next:` line, open PRs/issues). Never
  reconstruct state from a hand-maintained status doc.
- **Log last.** End or pause a session by writing one session record (below).
  The `next:` you leave is what the next session's orient surfaces.

## Records — one unit, one file, append-only

All durable intent lives under `records/` (schemas in `schema/record.*.schema.json`):

| kind | home | form |
|---|---|---|
| session | `records/sessions/<lane>/<YYYY-MM-DD>-<HHMMSS>-<agent>.md` | frontmatter + prose |
| judgment | `records/judgments/JDG-NNNN.json` | JSON |
| claim | `records/claims/CLM-NNNN.json` | JSON |
| decision | `records/decisions/ADR-NNNN.md` | header lines + prose |

**Append-only:** never edit a committed record — write the next one. (REC-01
proves this from history: modify/delete/rename of a record is a finding, and a
blob-at-introduction comparison catches merge-hidden edits.)

### Session records (by hand)

Filename: `<YYYY-MM-DD>-<HHMMSS>-<agent>.md` (UTC, agent slug `[a-z0-9-]`) under
`records/sessions/<lane>/`, where **lane = branch name**. Collision-free by
construction — no counters, ever. Frontmatter (all required):

```markdown
---
record: session/1
lane: v2/m4b-jdg-ledger
agent: adar
started: 2026-07-11T15:00:00Z
---

## Did
what happened and why — the forensic tier: reasoning, not just actions

## Dead ends
what was tried and abandoned, so nobody retries it

## Left open
next: the one most useful next step
```

`## Left open` + `next:` is load-bearing — orient reads exactly that shape.
Prefer `baseline log -m "..." --next "..."` — it derives everything, validates,
and scrubs. Hand-written records are covered once the pre-push hook is installed
(`cp hooks/scrub-pre-push.sh .git/hooks/pre-push` per clone; engine: `baseline scrub`).

### Judgment records

A judgment is **dated, owned, scoped, reasoned, and it expires**:

```json
{
  "record": "judgment/1",
  "id": "JDG-0007",
  "kind": "risk-acceptance",
  "date": "2026-07-11",
  "by": "adar",
  "subject": "SEC-13",
  "reason": "why this is acceptable — exists in no diff",
  "review_by": "2026-10-01",
  "expected_state": { "descriptor.maturity": "prototype" },
  "tripwire": { "fact": "descriptor.maturity", "op": "ne", "value": "prototype" }
}
```

- **Kinds:** `sign-off` (satisfies a manual rule whose id is `subject` — the
  unified ledger outranks the legacy `signoff.json`, and a **lapsed sign-off is
  not signed**; the **newest** sign-off per subject governs, so a lapsed newest
  is not rescued by an older unexpired record — re-judge) · `deviation` ·
  `risk-acceptance` · `break-glass`.
- **The machine contract:** `expected_state` is the world you assumed (mismatch =
  DRIFTED, re-look); `tripwire` is the condition that VOIDS the judgment
  (`fact op value`, ops `eq|ne|gt|lt|exists|absent`; fired = TRIPPED, act);
  `review_by` lapses it (EXPIRED). Fact namespace: `descriptor.*`,
  `planes.{tree,history,forge}.*`, `git.{branch,head,shallow}`, `today`.
  An unresolvable fact path is a surfaced finding, never a guess.
- **Numbering:** next free `JDG-NNNN` in the directory. Two lanes can collide on
  a number — git surfaces that as an add/add conflict at merge; **renumber the
  incoming record** and move on. Never reuse a number.
- Author with `baseline jdg new …`; evaluate with `baseline jdg check`
  (M6's reconcile runs the same evaluation on cron and files issues).

### Descriptor changes (DESC-03, enforced at M6)

A PR that touches `baseline.repo.json` carries a JDG **in the same PR** whose
`subject` is exactly `baseline.repo.json` (the descriptor filename — the one
constant the tool owns), snapshotting the new posture in
`expected_state` with a tripwire on the load-bearing axis. Posture-*weakening*
diffs become blocker-severity at admit (M6).

### Break-glass (FS5, enforced at M6)

A `break-glass` JDG is the **only** override of a fail-closed `admit`/`reconcile`
gate. It names its `gate`, it expires fast, and it **lands on main via its own
prior PR — it cannot ride inside the change it unblocks.** Solo-mode honesty:
self-merge remains possible; the control is audit-visibility + expiry, not
multi-party authorization.

## The scrub gate

Every tool-written record is scanned before it exists (`src/scrub.mjs`):
**deterministic signatures block** (SEC-01 parity + JWT + fine-grained PAT),
**heuristics warn** (severity never exceeds certainty). A block is non-lossy —
the draft survives under `.baseline/cache/` (keep that path **gitignored**; the
tool warns if it isn't) and the exact rerun is printed. A false positive becomes
a dated judgment in `.baseline/scrub-allowlist.json` via `--allow <finding-id>
--allow-reason "..."` (one flag surface across `log` and `jdg`) — the allowlist
stores a content-derived hash, never the value.
Never bypass a block by hand-writing the file; rotate the secret or record the
judgment. Hand-written records get the same scan from the pre-push hook (once
installed) and REC-02 re-scans everything that landed (warn until M7's promotion).

**Documented residual risk (C34):** the `--pushed` scan reads the allowlist from
the worktree, which may itself be uncommitted — the judgment doesn't necessarily
ride the push (REC-02 in CI is the backstop). `scan()` matches text shapes
decoded as utf8 — a UTF-16-encoded record is a known blind spot the delegation
layer (gitleaks-class scanners, server-side push protection) covers. And until
M6's `admit`, the FLOW posture gate reads the *worktree* descriptor, so a branch
that weakens posture can self-silence FLOW-06 — the base-ref read lands with
admit (FS1).

## Lanes (M5) — the plain-git twin

Everything `baseline lane` does is expressible in plain git; the tool adds the
gates, the labels, and the honesty — never a private data model.

- **Claim** = create the namespaced ref at origin, first push wins. The message
  needs REAL newlines (bash does not expand `\n` inside double quotes, so a
  literal-`\n` message mints a trailer-less lane — the exact thing the trailers
  prevent), so build it with `printf`:
  ```sh
  msg=$(printf 'claim lane/N: issue #N\n\nBaseline-Issue: #N\nBaseline-Agent: <agent>')
  sha=$(git commit-tree "$(git rev-parse origin/main^{tree})" -p "$(git rev-parse origin/main)" -m "$msg")
  git push origin "$sha:refs/heads/lane/N"
  ```
  The trailers are the declared `join_keys` — hand-typed claims MUST carry both
  or every downstream join lies.
- **Lease** = derived, never stored: freshness = **max(tip committedDate, PR
  updatedAt)** (FS10 as amended — GraphQL no longer carries `Commit.pushedDate`)
  vs `lanes.lease_ttl`; LIVE < ttl/2 ≤ STALE < ttl ≤ ABANDONED. Git-plane-only
  derivation (committer clock, no PR corroboration) is low-confidence and says so.
- **Reclaim** = an empty child of the observed tip under the NEW agent's trailer,
  pushed with `--force-with-lease=refs/heads/lane/N:<observed-tip>` (an exact CAS:
  any move mid-flight — work, rewind, deletion — must reject). Only a lane that
  DERIVES ABANDONED may be taken; a live takeover requires an unexpired
  `kind: deviation` judgment naming the lane (the `--jdg` hatch). The dated
  takeover record rides `records/sessions/<lane>/` like any session record.
- **The FLOW discipline by hand:** anchor lanes to issues (FLOW-01), write the
  session record on the branch (FLOW-02) with a filled `next:` (FLOW-03), keep
  branches in declared families (FLOW-04 — `lanes.namespace` + `lanes.families`),
  push the newest record before pausing (FLOW-05), don't squat dead lanes
  (FLOW-07). Family branches (`release/*`) owe only placement, not lane records.
  DIV findings (closed issue under an active lane, `next:` at a dead issue, a PR
  closing a closed issue) are contradictions to RESOLVE, not warnings to mute.

## Reserved (lands later, documented now)

- **M6 — admit/reconcile:** merge-point re-derivation, fail-closed with
  break-glass relief; reconcile files findings as issues, read-only on main.
- **M7 — contraction:** status-doc surfaces retired; `signoff.json` and the
  legacy `CLAIMS.json` dual-reads end; pointer install + lock.
