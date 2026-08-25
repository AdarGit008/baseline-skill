# CONTRACT — the plain-git twin

What baseline expects of a repo, written so a human (or any agent) can comply with
**git alone**. The `baseline` CLI automates this contract; it never replaces it.
Everything here is checkable — that's the point. What is *not* here any more is as
deliberate as what is: v3 keeps no lane workflow, no divergence rules, no
append-only history proof over records, no vendored-lock pin, and no rule a human
sign-off could satisfy. A rule nothing can check is a written promise, and this
document does not carry those.

## The loop

- **Orient first.** Start a session with `baseline orient` — five derived lines
  (`repo:` · `work:` · `graph:` · `knowledge:` · `score:`), read-only, never a gate.
  By hand: `git status`, whether `tdd.json` / `graphify-out/` / the okf bundle are
  there and how old they are, and the last score. Never reconstruct state from a
  hand-maintained status doc (CTX-12 blocks the stamp).
- **Score before you merge.** `node check.mjs --repo .` — exit 1 only on an always-on
  blocker (or a blocker in a pack you switched on). By hand: the rule table in
  `REFERENCE.md` says what each blocker looks for.
- **Log last.** If the repo keeps records, end or pause a session by writing one
  session record (below). The `next:` you leave is what the next session reads.

## The three plugins, by hand

baseline suggests **tdd-pi**, **graphify** and **okf-rag** and never requires them.
Its whole contract with each is one question a shell can ask:

| plugin | artifact | expected in git | the question |
|---|---|---|---|
| tdd-pi | `tdd.json` | tracked | `test -e tdd.json && git ls-files --error-unmatch tdd.json` |
| graphify | `graphify-out/` | ignored | `test -d graphify-out && git check-ignore -q graphify-out` |
| okf-rag | `$BASELINE_OKF_BUNDLE` | ignored (skipped when outside the repo) | `test -d "$BASELINE_OKF_BUNDLE"` |

That is the entire boundary: exists, file or directory, mtime, gitignore state.
baseline never opens the artifact — no `covers[]`, no `Built from commit:`, no
concept body during `check`. Each plugin is one always-on WARN row (`PLUG-01/02/03`):
absent → the install command, **printed and never run**; the git answer differing
from the `plugins` config → the mismatch. Never a FAIL, never an exit-code change.
Every WARN writes `.baseline/log/<PREFIX-NN>.log` with the paths inspected, the config
values used and git's answer, overwritten each run — so the finding can be read
without re-running. Keep `.baseline/` gitignored (the template does).

The knowledge seam runs the other way and is read-only: `baseline explain <rule-id>`
displays the concept at `$BASELINE_OKF_BUNDLE/baseline/rules/<id lowercase>.md` if
there is one, and the rule's own title and rationale if there is not. Display is
never a verdict. `baseline gen okf-concepts` stages one proposed concept per rule
under `.baseline/proposed/` — a deterministic extraction from the shipped docs — and
a human copies the batch into the bundle; nothing in baseline writes there.

## Packs, by hand

With no `baseline.config.json` every pack is off and only the always-on rules run.
Switching one on is an explicit edit, never a fact of the tree:

```json
{
  "makes_external_claims": true,          // the claims pack
  "decision_globs": ["docs/adr/*.md"],    // the decisions pack
  "project_type": "service",              // the service pack (config only — never the descriptor's type)
  "profiles": ["advanced", "descriptor"], // any pack by name (alias: packs; CLI: --profile <pack>)
  "want": ["docker"]                      // a tool declared by intent: its rules run before the Dockerfile exists
}
```

## Records — one unit, one file

If the repo keeps durable intent, it lives under `records/` (schemas in
`schema/record.*.schema.json`):

| kind | home | form |
|---|---|---|
| session | `records/sessions/<branch>/<YYYY-MM-DD>-<HHMMSS>-<agent>.md` | frontmatter + prose |
| judgment | `records/judgments/JDG-NNNN.json` | JSON |
| claim | `records/claims/CLM-NNNN.json` | JSON |
| decision | `records/decisions/ADR-NNNN.md` | header lines + prose |

Two rules look at what landed, anywhere in the tree: **REC-02** re-scans committed
content for secret shapes (blob content at HEAD, never the worktree) and **REC-05**
wants a push-time secret gate visible at rest (gitleaks-class config, or the shipped
`hooks/scrub-pre-push.sh` committed into the repo). The append-only and one-home
history checks of v2 are gone; append-only remains good practice — write the next
record rather than editing the last — but nothing enforces it.

### Decision records — the number is the identity

`ADR-NNNN` is what every citation and every relation field resolves to, so the number
is a **scarce name**, not a label. Two files carrying one number is a blocker (CTX-14):
a citation to ADR-0027 arrives at whichever file sorted first. When several branches
author decisions in parallel, check the number is free on the other open branches
before you write it — two branches can author `0027-a.md` and `0027-b.md`, pass every
check on their own trees, and merge with no git conflict at all; CTX-14 catches it
only once both land. `Supersedes` / `Superseded-by` / `Amends` / `Amended-by` are the
declared edges: CTX-02 wants a superseded record to link forward, CTX-07 wants every
edge to resolve to a file, CTX-13 wants an amendment declared at both ends. All four
run in the `decisions` pack.

### Session records (by hand)

Filename: `<YYYY-MM-DD>-<HHMMSS>-<agent>.md` (UTC, agent slug `[a-z0-9-]`) under
`records/sessions/<branch>/`. Collision-free by construction — no counters, ever.
Frontmatter (all required):

```markdown
---
record: session/1
lane: main
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

(`lane` is the schema field's name; its value is the branch.) `## Left open` +
`next:` is load-bearing. Prefer `baseline log -m "..." --next "..."` — it derives
everything, validates, and scrubs. Hand-written records are covered once the
pre-push hook is installed (`cp hooks/scrub-pre-push.sh .git/hooks/pre-push` per
clone; engine: `baseline scrub`).

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

- **Kinds:** `deviation` (an accepted rule violation) · `risk-acceptance` ·
  `break-glass` (an expiring override of a fail-closed admit/reconcile gate). A
  judgment records a decision; **it satisfies no rule** — v3 deleted the manual
  rules, and the schema's `sign-off` kind is kept only so older ledgers still
  validate.
- **The machine contract:** `expected_state` is the world you assumed (mismatch =
  DRIFTED, re-look); `tripwire` is the condition that VOIDS the judgment
  (`fact op value`, ops `eq|ne|gt|lt|exists|absent`; fired = TRIPPED, act);
  `review_by` lapses it (EXPIRED). Fact namespace: `descriptor.*`,
  `planes.{tree,history,forge}.*`, `git.{branch,head,shallow}`, `today`.
  An unresolvable fact path is a surfaced finding, never a guess.
- **Numbering:** next free `JDG-NNNN` in the directory. Two branches can collide on
  a number — git surfaces that as an add/add conflict at merge; **renumber the
  incoming record** and move on. Never reuse a number.
- Author with `baseline jdg new …`; evaluate with `baseline jdg check`
  (reconcile runs the same evaluation on cron and files issues).

### Descriptor changes (DESC-03, `descriptor` pack)

A PR that touches `baseline.repo.json` carries a judgment **in the same PR** whose
`subject` is exactly `baseline.repo.json` (the descriptor filename — `admit`
matches nothing cleverer than the exact string) and whose `kind` is `deviation` or
`risk-acceptance` (break-glass is outage relief with its own gate semantics; it never
doubles as descriptor-change approval). Snapshot the new posture in `expected_state`
with a tripwire on the changed axis — that part is craft, not machine-enforced. At
admit, ANY descriptor change without that same-range judgment is a **blocker
refusal**; the weakening classification (the schema's `x-strictness` ladders) rides
the finding text.

### The two files — the separation is final

`baseline.repo.json` (identity & posture) and `baseline.config.json` (tuning — packs,
`want`, `plugins`, paths, commands, thresholds) do **not** converge. The descriptor is
the **change-controlled** file, read at the *target ref* by admit and guarded by
DESC-03's same-PR judgment; the config is the **free worktree file**, editable without
ceremony. Converging them would put every `doc_lag_days` tweak behind judgment
ceremony to fix zero named failures.

## The scrub gate

Every tool-written record is scanned before it exists (`src/scrub.mjs`):
**deterministic signatures block** (SEC-01 parity + JWT + fine-grained PAT),
**heuristics warn** (severity never exceeds certainty). A block is non-lossy —
the draft survives under `.baseline/cache/` (keep that path **gitignored**; the
tool warns if it isn't) and the exact rerun is printed. A false positive becomes
a dated judgment in `.baseline/scrub-allowlist.json` via `--allow <finding-id>
--allow-reason "..."` (one flag surface across `log` and `jdg`) — the allowlist
stores a content-derived hash, never the value. Never bypass a block by
hand-writing the file; rotate the secret or record the judgment. Hand-written
records get the same scan from the pre-push hook (once installed) and REC-02
re-scans everything that landed.

**Documented residual risk:** the `--pushed` scan reads the allowlist from the
worktree, which may itself be uncommitted — the judgment doesn't necessarily ride
the push (REC-02 in CI is the backstop). `scan()` matches text shapes decoded as
utf8 — a UTF-16-encoded record is a known blind spot the delegation layer
(gitleaks-class scanners, server-side push protection) covers.

## Admit and reconcile — the merge-time verbs

Both are outside the always-on gate and both keep the live forge probe that `check`
and `orient` do not have.

**Admit** (`baseline admit [--repo DIR] [--target REF] [--json]`) re-derives at the
merge point and refuses (exit 1) on exactly three legs: **staleness** — the target
tip is not an ancestor of HEAD (merge or rebase and rerun; on GitHub, branch
protection's *require branches up to date* is this refusal's forge-side twin); an
**admit-context blocker** — DESC-03; **gating-source loss** — ancestry unprovable (a
shallow clone: use `fetch-depth: 0`) or the admitted range's diff unreadable. Exit 2
is an environment refusal (no target). Every verdict carries a receipt —
`provenance: inputs_digest <hash> · head → target · descriptor <blob-oid> · rules
<version> · checks · anchor` — a pure function over what it consulted; a closed
plane digests as the value `not-consulted`, never as a hole.

**Break-glass**: an unexpired `break-glass` judgment naming its `gate` is the
**only** tool-side override of a fail-closed admit/reconcile gate. It relieves
gating-source loss alone — never staleness, never DESC-03 — and it must **land on
the target ref via its own prior PR**; one riding the incoming branch relieves
nothing. A repo admin can always bypass branch protection; that valve is documented
rather than denied: reconcile's post-merge sweep files the issue demanding the
retroactive break-glass judgment (subject = the short merge sha).

**Reconcile** (`baseline reconcile [--repo DIR] [--json] [--dry-run] [--target REF]`)
revalidates the default branch on cron and files what it finds as issues. **No
writes to the repo, ever** — the tracker is the whole write surface, and every
filing is lifecycle-managed: an HTML marker `<!-- baseline:<id>:<subject> fp:<hash> -->`
plus the **`baseline` label**; absent → file · changed → comment · cleared → close
(only on positive re-evaluation — an n/a row clears nothing) · recurred → reopen when
the close was reconcile's own. A human close of an advisory filing is a judgment and
stays closed; the deterministic-integrity classes (an expired/tripped judgment, a
landed secret, a merged-while-red demand) reopen over any close. Findings never
redden the cron; a cron that cannot deliver (exit 1) does. A behind or dirty checkout
degrades to a labeled report-only run; a HEAD off the default branch's line refuses.

**Admit binding — the three rungs.** A merge queue (org repos; deferred). A required
check plus "require branches up to date" — the real merge-point binding. A private
repo on a free plan, where nothing is bindable: admit is advisory and the honest
guarantee is detection, not prevention. No rung pretends to be a stronger one.

## Generated views

A file whose first line is `<!-- baseline:generated <kind> — do not edit by hand;
regenerate: baseline gen <kind> -->` is machine-derived: **edit the records it
derives from, never the file** — the next regeneration replaces your edit, and
`gen --check` reds the CI until someone regenerates. `gen index` never overwrites a
file WITHOUT that marker (move it aside or pick a different `--out`; do not paste the
marker onto a hand-written file). Wire `gen --check` as an **advisory CI job**:
visibly red, outside the required set, never `continue-on-error: true`. On a vendor
bump, regenerate views with the NEW vendored copy and commit them alongside it.

## Vendoring

Vendoring is plain `cp -r` of the toolkit into `tools/baseline/` (at minimum
`baseline.mjs`, `check.mjs`, `rules.json`, `rules/`, `schema/`, `src/`), with the
repo-local `baseline.config.json` / `baseline.repo.json` at YOUR root. A bump is a
copy in one PR. v3 keeps no lock file and no freshness rule over the vendored tree —
reading a commit out of an artifact is exactly the plugin-data parse the metadata
boundary forbids, and the toolkit is not a plugin.
