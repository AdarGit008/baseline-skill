# CONTRACT — the plain-git twin

> **This page is not an authority — the code is.** `schema/*.json`, `templates/` and the runner in `src/` decide; this page only
> describes them. Where the two disagree, the code is right and this page is a bug.

What baseline expects of a repo, written so a human (or any agent) can comply with
**git alone**. The `baseline` CLI automates this contract; it never replaces it.
Everything here is checkable — that's the point. What is *not* here any more is as
deliberate as what is: v4 keeps no lane workflow, no divergence rules, no
append-only history proof over records, no vendored-lock pin, no warn tier, and no
rule a human sign-off could satisfy. A rule nothing can check is a written promise,
and this document does not carry those.

## The loop

- **Orient first.** Start a session with `baseline orient` — five derived lines
  (`repo:` · `work:` · `graph:` · `knowledge:` · `score:`), read-only, never a gate.
  By hand: `git status`, whether `tdd.json` / `graphify-out/` / the okf bundle are
  there and how old they are, and the last score. Never reconstruct state from a
  hand-maintained status doc — `orient` is the status surface.
- **Score before you merge.** `node check.mjs --repo .` — exit 1 only on a
  [blocker](GLOSSARY.md#blocker), including a trust-circle member's. By hand: the
  rule table in `REFERENCE.md` says what each blocker looks for.
- **Log last.** If the repo keeps records, end or pause a session by writing one
  session record (below). The `next:` you leave is what the next session reads.

## The three plugins, by hand

baseline suggests **obsidian-tdd**, **graphify** and **okf-rag** and never requires them.
Its whole contract with each is one question a shell can ask:

| plugin | artifact | expected in git | the question |
|---|---|---|---|
| obsidian-tdd | `tdd.json` | tracked | `test -e tdd.json && git ls-files --error-unmatch tdd.json` |
| graphify | `graphify-out/` | ignored | `test -d graphify-out && git check-ignore -q graphify-out` |
| okf-rag | `$BASELINE_OKF_BUNDLE` | ignored (skipped when outside the repo) | `test -d "$BASELINE_OKF_BUNDLE"` |

That is the entire boundary: exists, file or directory, mtime, gitignore state.
baseline never opens the artifact — no `covers[]`, no `Built from commit:`, no
concept body during `check`. A fourth tool, **my-onto**, is declared in the roster
with no path and no rule severity: it probes as absent, resolves `n/a`, and is
silent — honest about a tool that does not exist yet.

**Membership decides whether the rule gates.** Each plugin is one rule
(`PLUG-01/02/03`). A plugin whose **name is a key** of `baseline.config.json`
`plugins` is a **member** of the repo's trust circle, and its rule is a
[blocker](GLOSSARY.md#blocker) for it:

| standing | how it is stated | verdict |
|---|---|---|
| **member** | the plugin's name is a key of `plugins` | the rule gates: artifact absent → **FAIL naming the install command** (printed, never run); present but the gitignore state differs from config → **FAIL naming the mismatch** (the config value and git's answer); otherwise **PASS**. A FAIL exits 1 |
| **suggested** | the key is absent — the shipped default, untouched | **`n/a`**, excluded from the exit gate, no log. baseline offers the tool in the report and in `baseline trust setup`; it can never fail a build |
| **declined** | the key is present with `false` or `null` | `n/a`, exactly like suggested — the decision is simply on the record |

So *absent and not a member* is `n/a`; *member and missing* is a blocker. A repo that
adopted nothing scores green on the plugin family, and one that adopted a tool gets
the gate it asked for. Every finding writes `.baseline/log/<PREFIX-NN>.log` with the
paths inspected, the config values used, and git's answer — overwritten each run,
removed when the row returns to PASS. Keep `.baseline/` gitignored (the template does).

The knowledge seam runs the other way and is read-only: `baseline explain <rule-id>`
displays the concept at `$BASELINE_OKF_BUNDLE/baseline/rules/<id lowercase>.md` if
there is one, and the rule's own title and rationale if there is not. Display is
never a verdict. `baseline gen okf-concepts` stages one proposed concept per rule
under `.baseline/proposed/` — a deterministic extraction from the shipped docs — and
a human copies the batch into the bundle; nothing in baseline writes there.

## The two opt-ins, by hand

Config is `baseline.config.json`; everything auto-detects, so only what you override
is present. The two opt-ins have opposite defaults and are both read off the config
text, never guessed from the tree:

```json
{
  "plugins": { "graphify": {}, "obsidian-tdd": { "path": "tools/tdd.json" } },
  "baseline_rules": true,
  "test_state_sources": ["src/**"],
  "knowledge_sources": ["docs/**"]
}
```

- **Trust circle — opt in, default out.** A `plugins` key *is* adoption. Key presence
  makes membership a fact rather than a guess: `{"graphify": {}}` adopts at the
  shipped defaults and is indistinguishable *in value* from a repo that wrote nothing
  — but not *in key*. `$BASELINE_OKF_BUNDLE` sets a member's path and never creates
  membership, because CI clones tracked files and not a shell. `baseline trust add
  <tool>` writes the key, `baseline trust remove <tool>` deletes it.
- **Baseline rules layer — opt out, default in.** Every non-plugin rule
  (`BUILD-03`, `BUILD-04`, `GOV-03`, `SEC-01`, `SEC-02`, `CTX-19`) is one layer.
  `"baseline_rules": false` opts it out (those rules resolve `n/a`, out of the exit
  gate); absent or `true` leaves it in. Only the literal `false` mutes — in is the
  safe direction. `baseline trust setup --baseline-rules in|out` writes it; `in`
  deletes the key, because an absent key *is* in.

**Source scopes.** `test_state_sources` and `knowledge_sources` are the globs the two
ordering rules (CTX-16, CTX-17) read; both default to empty, and an empty scope leaves
the rule `n/a` — baseline cannot guess what a derived store is meant to cover. There
is no day-threshold twin for either: "behind" is an ordering, not a deadline.

## Records — one unit, one file

If the repo keeps durable intent, it lives under `records/` (schemas in
`schema/record.*.schema.json`):

| kind | home | form |
|---|---|---|
| session | `records/sessions/<branch>/<YYYY-MM-DD>-<HHMMSS>-<agent>.md` | frontmatter + prose |
| judgment | `records/judgments/JDG-NNNN.json` | JSON |
| claim | `records/claims/CLM-NNNN.json` | JSON |
| decision | `records/decisions/ADR-NNNN.md` | header lines + prose |

Write sessions with the CLI — one command, nothing to remember:

```bash
node baseline.mjs log -m "what happened and why" --next "the one most useful next step"
# branch, agent and timestamp derived · stdin accepted · never $EDITOR
```

Every write passes the **scrub gate** (below). Filenames are collision-free by
construction: no counters, `O_EXCL`, same-second-same-agent refuses loudly. Append-only
remains good practice — write the next record rather than editing the last — but
nothing enforces it.

### Decision records — the number is the identity

`ADR-NNNN` is what every citation and every relation field resolves to, so the number
is a **scarce name**, not a label. Two files carrying one number is a defect: a
citation to ADR-0027 arrives at whichever file sorts first. When several branches
author decisions in parallel, check the number is free on the other open branches
before you write it — two branches can author `0027-a.md` and `0027-b.md`, pass every
check on their own trees, and merge with no git conflict at all. `Supersedes` /
`Superseded-by` / `Amends` / `Amended-by` are the declared edges; keep them at both
ends so the graph of decisions stays traversable.

### Session records (by hand)

Filename: `<YYYY-MM-DD>-<HHMMSS>-<agent>.md` (UTC, agent slug `[a-z0-9-]`) under
`records/sessions/<branch>/`. Frontmatter (all required):

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
  "subject": "SEC-01-no-committed-secrets",
  "reason": "why this is acceptable — exists in no diff",
  "review_by": "2026-10-01",
  "expected_state": { "descriptor.maturity": "prototype" },
  "tripwire": { "fact": "descriptor.maturity", "op": "ne", "value": "prototype" }
}
```

- **Kinds:** `deviation` (an accepted rule violation) · `risk-acceptance` ·
  `break-glass` (an expiring override of a fail-closed admit/reconcile gate). A
  judgment records a decision; **it satisfies no rule**.
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

### Descriptor changes (the admit gate)

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

`baseline.repo.json` (identity & posture) and `baseline.config.json` (tuning —
`plugins`, `baseline_rules`, source scopes, `project_type`) do **not** converge. The
descriptor is the **change-controlled** file, read at the *target ref* by admit and
guarded by the same-PR judgment above; the config is the **free worktree file**,
editable without ceremony. Converging them would put every config tweak behind
judgment ceremony to fix zero named failures.

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
records get the same scan from the pre-push hook (once installed), and reconcile
re-scans everything that landed at the tip.

**Documented residual risk:** the `--pushed` scan reads the allowlist from the
worktree, which may itself be uncommitted — the judgment doesn't necessarily ride
the push (the landed-record re-scan in reconcile is the backstop). `scan()` matches
text shapes decoded as utf8 — a UTF-16-encoded record is a known blind spot the
delegation layer (gitleaks-class scanners, server-side push protection) covers.

## Admit and reconcile — the merge-time verbs

Both are outside the always-on gate and both keep the live forge probe that `check`
and `orient` do not have.

**Admit** (`baseline admit [--repo DIR] [--target REF] [--json]`) re-derives at the
merge point and refuses (exit 1) on exactly three legs: **staleness** — the target
tip is not an ancestor of HEAD (merge or rebase and rerun; on GitHub, branch
protection's *require branches up to date* is this refusal's forge-side twin); an
**admit-context blocker** — the descriptor-change gate above; **gating-source loss** —
ancestry unprovable (a shallow clone: use `fetch-depth: 0`) or the admitted range's
diff unreadable. Exit 2 is an environment refusal (no target). Every verdict carries
a receipt — `provenance: inputs_digest <hash> · head → target · descriptor <blob-oid>
· rules <version> · checks · anchor` — a pure function over what it consulted; a
closed plane digests as the value `not-consulted`, never as a hole. Advisory findings
ride the output without ever acquiring blocker-grade denial power through
unavailability.

**Break-glass**: an unexpired `break-glass` judgment naming its `gate` is the
**only** tool-side override of a fail-closed admit/reconcile gate. It relieves
gating-source loss alone — never staleness, never the descriptor gate — and it must
**land on the target ref via its own prior PR**; one riding the incoming branch
relieves nothing. A repo admin can always bypass branch protection; that valve is
documented rather than denied: reconcile's post-merge sweep files the issue demanding
the retroactive break-glass judgment (subject = the short merge sha).

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
copy in one PR. v4 keeps no lock file and no freshness rule over the vendored tree —
reading a commit out of an artifact is exactly the plugin-data parse the metadata
boundary forbids, and the toolkit is not a plugin.
