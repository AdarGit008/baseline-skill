# Changelog

All notable changes to the `/baseline` skill are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com); the runner is versioned in
`rules.json` and `SKILL.md`.

## [Unreleased]

### Added — V2 M5b: derived leases, `baseline lane reclaim`, orient lane lines
- **`src/derive/lanes.mjs`** — the PURE lease derivation (C31): LIVE | STALE | ABANDONED,
  nothing stored to go stale. Freshness is FS10 **as amended by the M5 ruling** (GitHub's
  GraphQL schema no longer carries `Commit.pushedDate`): **max(tip committedDate, PR
  updatedAt)** — the later signal wins, erring toward LIVE (a premature ABANDONED invites a
  premature reclaim, the one direction that steals a live lane), provenance riding each lane
  as a label. STALE begins at **ttl/2 — a named provisional constant** (`STALE_FRACTION`),
  deliberately not a descriptor knob (M7 revisits on dogfood data). Clock skew clamps to age
  0, labeled; a lane with no resolvable freshness derives state **null** — surfaced, never
  guessed, and not reclaimable without a deviation judgment. A **fresh claim derives LIVE
  at age 0** (pinned). Inputs
  are plain JSON-able data — the M6 `inputs_digest` seam.
- **Forge lane-refs in ONE GraphQL `refs()` query** (`makeForge.laneRefs`) — every lane
  tip's `committedDate` + associated-PR `updatedAt` in a single round trip,
  record/replay-additive (the fixture is the raw GraphQL envelope; `Ref.name` arrives
  RELATIVE to the refPrefix — verified live — so fixtures carry API-shaped names). The
  **git plane is the fallback** when the forge is unreachable — and the normal mode under
  `multi-lane-local` (CF5): tips via `ls-remote` (authoritative, never the clone's stale
  tracking refs), objects via one glob fetch into `refs/baseline/lanes/*`; committer-clock
  freshness is labeled **low confidence**. Lane owner = the **newest commit anchoring the
  lane's issue** (`Baseline-Issue` grep), its `Baseline-Agent` trailer — a takeover
  displaces a claim by being newer, and same-issue commits merged into the branch base
  can't shadow it.
- **`baseline lane reclaim <issue|ref>`** (`src/lane.mjs`) — takeover of a
  **derived-ABANDONED lane only**, judged by the same gathering + derivation orient renders
  (one answer, or the tool argues with itself), with the state **rebuilt from the fetched
  git objects whenever the forge's answer names a different tip** than the takeover's
  parent (a lagging or replayed listing must never derive ABANDONED from one commit and
  parent on another). The takeover commit is an empty child of the observed tip carrying
  the new agent's trailer, pushed under an **exact-value CAS**
  (`--force-with-lease=<ref>:<tip>`): ANY move mid-flight — new work, a rival takeover, a
  force-rewind, even deletion (a merged PR's auto-delete) — rejects, and the re-ask names
  the truth: the lane is active (exit 3), it vanished (exit 2, nothing recreated), or the
  report was lost while origin holds our takeover (win). A rival takeover under this
  agent's own identity is adopted from origin's tip, never our unpushed sha; a lane
  **already standing under this agent's trailer completes idempotently** (the crash-rerun
  rule — never a demand to file a deviation against your own lane). The **dated takeover
  record is machine-written through the existing `baseline log` writer** (scrub gate
  included, no human ceremony; a scrub block relays the draft + exact `--from`/`--allow`
  rerun — non-lossy, and heuristic warns ride the notes); the **issue comment is
  best-effort** and posture-gated (skips are labeled with their reason, replay never
  writes). **`--jdg <id>`** is the live-takeover escape hatch: an **unexpired
  `kind: deviation` judgment naming the lane** (whole-token match — `lane/70` does not
  cover `lane/7`) authorizes takeover of a non-ABANDONED lane, so nobody routes around the
  tool. Reclaiming your own abandoned lane renews the lease, named as such. Checkout
  results are reported honestly (`branched`/`checkout` in JSON, the switch hint on
  failure — a session log written off-lane lands on the wrong branch). Exit: 0 reclaimed ·
  2 usage/refusal · 3 lost race.
- **Orient lane lines** — the `Lanes` section renders the derived lease view when the
  descriptor declares `lanes.namespace`: state icon + ref + issue anchor + age + agent,
  provenance labels riding each line, **ABANDONED/STALE sorted first**, the reclaim recipe
  on abandoned lanes, and **claimed-but-PR-less lanes finally appear** (C31 — the invisible
  claim was the gap). A truncated forge page (>100 refs) is labeled, never silent.
  **JSON re-home**: `lanes` is now the derived lease view (+ `lanesMeta`); the open-PR
  list that used to live there is **`prs`** — repos with no namespace keep the old
  PR-survey section, and `multi-lane-local` sections name the posture instead of faking
  unreachability (`gatherFacts` now hands the descriptor posture to `makeForge`, the one
  closure home).
- **`test/lane/run.mjs`** — derive-boundary pins (STALE exactly at ttl/2, ABANDONED exactly
  at ttl, skew clamp, max() provenance both directions, sort order), reclaim e2e on local
  bare origins (LIVE refusal moves nothing; takeover is an empty child commit; record +
  trailer + checkout pins), the **two-rival concurrent reclaim race** (exactly one winner,
  the loser told the truth), every `--jdg` refusal direction, `multi-lane-local`
  forge-free reclaim, own-lane renewal. `test/orient/run.mjs` — git-plane lane lines,
  time-traveled ABANDONED + reclaim recipe, posture labels, `--json` shape.
  `test/facts/run.mjs` — the forge lane-refs replay path over a committed GraphQL fixture.
  Lease time-travel rides `BASELINE_LOG_NOW` — the ONE clock shared with the record
  tooling. Corpus untouched (no rule changes — M5c owns the one re-pin).
- **8-angle review hardening** (race/atomicity · ruling compliance · derive correctness ·
  layering/replay · failure honesty · security · test adequacy · UX/docs — all confirmed
  findings fixed in-branch): the lease-CAS push and tip-mismatch rebuild above; pid-unique
  private refs + one-shot commit+tree reads (two concurrent invocations in ONE clone can
  no longer cross-read each other's fetch and mint a content-mutating takeover); replay
  runs no live fetches (owner enrichment skips, labeled — fixtures control agents via the
  tip message); ONE render clock (PR ages derive from the same `now` as lane ages; an
  unparseable `BASELINE_LOG_NOW` falls back labeled in orient, refused in CLIs); trailer
  reads mirror git semantics (LAST trailer-shaped line — a squash body quoting the key
  can't shadow the block; git-plane `laneOwner` was already trailer-exact); the PR⇄lane
  join keys on PR number when the commit-anchored PR is known (a fork branch merely named
  like the lane can't override it), unfetched session-log state says so (`hasLog: null`),
  and the PR sub-page (now `first:20`) carries `pageInfo` + a label when truncated —
  freshness can only be understated, never silently; `lease_ttl` rejects zero at the
  schema AND the parser (a `0d` descriptor can't brick every lane with a mislabeled
  cause — underived labels now name the actual missing input); orient's reclaim recipe is
  anchor-gated (never a verbatim command the tool refuses) and anchor-less abandoned lanes
  get the honest line; `check-ref-format` gates reclaim's ref like claim's; per-action
  `--help` answers help (exit 0); the double-blind push failure (report lost AND re-ask
  unreachable) says the state is UNKNOWN instead of asserting "nothing reclaimed".

### Added — V2 M5a: `baseline lane claim` — atomic branch creation at origin
- **`baseline lane claim <issue>`** (`src/lane.mjs`) — the M5 claim primitive (FS2/S3): the ref
  IS the claim. The branch name is the descriptor's `lanes.namespace` with the issue number
  substituted — exactly that, **no slug** (M5 panel: two spellings would both push-succeed and
  mint two lanes for one issue), and ref creation inside origin's ref transaction is first-wins.
  **Checkout-free**: `fetch` → `commit-tree` (an empty commit stamped with `Baseline-Issue` +
  `Baseline-Agent` trailers, validated against descriptor `join_keys` — C38, keys are
  machine-generated, never hand-typed) → `push <sha>:refs/heads/<ref>`; the loser exits **3**
  having never touched HEAD, worktree, or local branches — clean-loser is structural, not
  cleanup. On push rejection the CLI re-asks origin: ref now exists → lost race (exit 3, tip
  named); still absent → transport/policy failure (exit 2, git's reason) — never a fake race.
  Issue verification is **posture-gated**: an issue positively known closed refuses the claim
  (divergence at birth, the reopen command named); unverifiable proceeds labeled; workflow
  **`multi-lane-local`** (new `workflow` enum value, CF5) never consults the forge and says so —
  "forge not consulted (multi-lane-local posture)", the posture named, never faked
  unreachability. Undeclared `ground_truth_boundary.default_branch` is **asked of origin**
  (`ls-remote --symref origin HEAD`), labeled, never guessed.
- **M5 sliced by adversarial panel** (scope-cutter / friction skeptic / dependency auditor —
  all AMEND): M5a claim (this slice) · M5b leases + reclaim + orient · M5c FLOW/DIV rules +
  DIVERGED verdicts + the one corpus re-pin. Ruling record: PLAN.md §8 M5 amendment block.
  Descriptor field flips are earned per slice: `lanes` + `join_keys` active at M5a; `owner`
  has no M5 consumer (lane identity is the trailer) — filed consume-or-drop on #24.
- **`test/lane/run.mjs`** — the claim suite against local bare origins: the two-clone
  **concurrent race** (exactly one winner, one clean exit-3 loser — issue #22 checkbox 1,
  structurally), trailer/base pins, refusal coverage (no descriptor / bad namespace /
  join_keys omitting a trailer / closed issue via forge replay / no origin), the
  multi-lane-local never-consults proof (a CLOSED replay fixture that is irrelevant because
  the forge is never asked), and a rejecting pre-receive origin (exit 2 with git's reason).
- Consolidation: the whole agent-identity derivation is ONE helper now —
  `resolveAgent` (`src/probe.mjs`) over the shared `slug` (`src/util.mjs`) — and the lane
  trailer names live beside it (`TRAILER_ISSUE`/`TRAILER_AGENT`, pointed at by
  `schema/keys.md`): `log` frontmatter and claim trailers derive the same name or the
  lane⇄agent join lies.
- **Hardened by an 8-angle pre-merge review** (all confirmed findings fixed in-branch):
  a push whose success report is lost after origin applied the ref is recognized by
  tip==sha as a **win, never a fake loss**; a lane already standing under this agent's
  own trailer settles as an **idempotent win** (a crashed claimer rerunning is never told
  it "lost" to itself); the claim base is fetched into a **private ref** — FETCH_HEAD is
  never read (a concurrent IDE autofetch could hand the claim an arbitrary branch's tip);
  an **absent `join_keys` refuses like an incomplete one** (undeclared trailers are never
  stamped); a stateless forge answer stays **unverified**, never announced "open";
  single-branch clones get the lane **opted into the fetch refspec** (detected by the
  set-upstream refusal itself) so upstream just works; the stale-local-branch note no
  longer prints a checkout recipe that would land on the wrong tip; `makeForge` owns the
  **posture closure** (a multi-lane-local forge stays closed even under replay — one home
  for the label, inherited by M5b/M5c); the schema now `pattern`-enforces the
  one-`*` namespace invariant; the rule-side workflow enum matches the descriptor's;
  claim runs on `liteRepo` (no tree walk) with **one preflight round trip** answering
  reachability + origin HEAD + ref existence. Deliberately open (recorded on the PR):
  FLOW-02/06 stay `multi-lane`-exact until M5c's family-array conversion + re-pin.

### Added — V2 M4c: the record checks — REC/FLOW rules, claims explosion, the push-boundary scrub
- **`rules/rec.json`** (78 rules total, 13 modules) — REC-01 **append-only proof** from history
  (`--diff-filter=MDR` events + full-history add-blob comparison closing the CF7 delete-recreate
  and merge-hidden holes; shallow history = SKIP, never a guess), REC-02 **landed-records scrub**
  (the same `scan()` as the write gate, over blob content **at HEAD**; deterministic findings fire
  the rule — warn until M7's promotion flips them to blocker — heuristics stay soft), REC-04
  **one-home duplication detector** (warn-pinned per CF10), REC-05 **push-time gate delegation**
  (F7: PASSes on at-rest evidence — gitleaks-class wiring or a committed scrub-pre-push hook;
  GitHub push protection satisfies the intent but isn't observable at rest, so M6's forge rules
  assert it live; warns when nothing visibly owns the push boundary).
- **`rules/flow.json`** — FLOW-02 (a lane carries its own session record) + FLOW-06 (a gated
  subject changes with its record in the same range — the DESC-03 preview, CF9). Both are
  **data-gated, not special-cased**: rules declare `workflow`/`branch_scope`, the engine turns
  them into SKIPs on single-lane repos, missing descriptors, and the default branch — "no
  wallpaper warns" is structural. `--self-check` validates the new fields.
- **Claims explosion (C17)** — `baseline gen migrate-claims` writes per-claim
  `records/claims/CLM-NNNN.json` (V1 id survives as `slug`, numbering continues past existing
  records, O_EXCL, schema-invalid claims refused per claim, idempotent). The CLAIM checks
  **dual-read** both homes (records shadow migrated legacy ids) until M7; CLAIM-07 warns the
  monolith into motion; CLAIM-00 accepts either home. Activation is **maturity-gated** (C24):
  descriptor `prototype` skips CLAIM unless explicitly opted in — the skip says why. CLAIM-06
  (spec acceptance-criteria) joins the family gate per the M4c review ruling: the CLAIM family
  is now uniformly opt-in, keeping "no wallpaper warns" whole for never-opted-in repos.
- **`baseline scrub`** — the pre-push hook's engine: worktree files or `--pushed SHA
  [--since SHA]` committed-blob ranges; `--allow <id> --allow-reason "..."` writes the same dated
  allowlist judgments as `log`/`jdg`. **`hooks/scrub-pre-push.sh`** scaffolds the push-boundary
  layer for hand-written records (missing runtime fails OPEN with a loud warning — documented
  residual risk; REC-02 in CI is the backstop).
- **`status_file: false` honored** with a valid descriptor present (M4 ruling item 7): CTX-01 and
  CTX-12 skip as `opted out`; without a descriptor the opt-out is refused with the fix named —
  a bare repo can't silence CTX by config alone. Relief for derived-orient repos ahead of M7.
- Engine threading: `runRules` now receives the descriptor, current branch, and declared default
  branch; `FIELD_CONSUMERS` flips `workflow`/`ground_truth_boundary`/`maturity` to active (S7);
  `lifecycle` re-reserved to M7 (M4 shipped no consumer — #24 decides consume-or-drop).
- Suite +68 assertions (engine gates, REC evaluators against real history — evil merges
  included — the lane loop end-to-end, gen/scrub e2e, the hook's stdin protocol); golden harness
  gains deterministic `git init -b main` + a `_branch/` lane-commit overlay; new **`flow-repo`**
  fixture pins FLOW-02 PASS / FLOW-06 WARN / REC-01 WARN / REC-05 PASS (committed hook) / CTX
  opt-out SKIPs at 0 blockers. Corpus re-pin is additive — every pre-M4c verdict unchanged.

### Fixed — M4c pre-merge review (9-angle adversarial pass)
- **Lane identity**: detached HEAD (every CI checkout) is no longer a lane called `(detached)` —
  the engine gate and `log` now share one `laneOrNull()` decision; an **undeclared default
  branch SKIPs** lane rules instead of guessing `main`; a freshly-cut lane with no work SKIPs
  FLOW-02 (the record couples to work, not branch creation); `baseRef()` prefers the newer of
  local/origin default. `--self-check` law: `branch_scope` requires `workflow`.
- **Scrub gate integrity**: `--pushed` walks every commit in the range (a secret added then
  removed mid-range still blocks), `-z`/quotePath-safe listing (a `café.md` record can no longer
  silently skip the scan — also fixed in `ls-files`/`log --name-status` for REC-01/REC-02),
  unresolvable `--since` falls back to a loud whole-tree scan instead of bricking the push with
  a wrong error, unreadable blobs are loud exit-2 (never "clean"), committed `.baseline/cache/`
  paths hard-block, and all scan surfaces decode utf8 so finding ids match across log/CI/hook.
  The hook distinguishes findings (exit 1, blocks) from errors (exit ≥2, fails open loudly) and
  shields its stdin ref list.
- **REC evaluators**: REC-02 scans what LANDED (HEAD blobs — a dirty worktree can no longer flip
  the verdict) and surfaces unscannable files instead of counting them clean; REC-01 uses
  `--full-history` add-blob sets (side-branch-only records killed inside a merge are caught; two
  lanes adding the same record then resolving to one side is no longer a false edit) and a rename
  is ONE finding (no bogus merge-hidden line); REC-04 sees `records/decisions/`, strips BOMs, and
  counts unparseable files; REC-05's evidence pattern actually matches the shipped scaffold hook
  (and the golden corpus now pins the PASS arm).
- **Claims migration**: the migration key is the slug, everywhere — a record id can no longer
  shadow an unmigrated legacy claim (green-by-omission), id-less legacy claims are refused
  loudly instead of duplicating on every rerun, duplicate ids within one monolith mint one
  record, corrupt existing records abort before any write, non-array `citations` refuse the
  claim, and stripped citation subfields report into the dropped-loudly channel. `CLAIM_FIELDS`
  now derives from the schema. `claims_file: false` reads as absence, not `JSON.parse(false)`.
- **CLI surfaces**: `--help`/`-h` reach help everywhere (top level was running a full check;
  `gen migrate-claims --help` was performing the migration), `gen`/`scrub` reject unknown flags
  instead of acting on misunderstood argv, record writers report "a file exists where the
  directory belongs" instead of stack-tracing, and every `--allow` hint spells the real flag
  (`--allow-reason`).

### Added — V2 M4b: the judgment ledger — `baseline jdg`, the machine contract, one sign-off home
- **`src/jdg.mjs`** — the unified ledger surface. `jdg new` authors schema-valid, scrub-gated,
  numbered `records/judgments/JDG-NNNN.json` (break-glass ⇒ `--gate admit|reconcile`; `--review-by`
  mandatory — every judgment expires); `jdg check` evaluates every judgment's **machine contract**
  against derived facts: `expected_state` mismatch = DRIFTED, `tripwire` fired = TRIPPED,
  `review_by` past = EXPIRED, unknown fact path = UNRESOLVABLE (surfaced, never guessed — C36).
  Worst-wins lattice; exit 1 on tripped/expired/invalid. Fact namespace: `descriptor.*` ·
  `planes.*` · `git.*` · `today`, with a `--facts` overlay (fixtures now, M6's reconcile sweep later).
- **signoff→JDG bridge** — a `kind: sign-off` judgment whose `subject` is a manual rule's id
  satisfies it while unexpired; a **lapsed sign-off is honestly NOT signed** and outranks the
  eternal legacy entry. Legacy `.project-baseline/signoff.json` keeps byte-identical V1 semantics
  until M7. New golden fixture **`jdg-repo`** pins the JDG-only path (0 blockers, no signoff.json);
  re-capture normalized pin key order to the post-split output order (verified zero semantic drift).
- **`CONTRACT.md`** — the plain-git twin (C28): the orient-first/log-last loop, record homes +
  hand-written forms, the judgment machine contract + numbering/merge-renumbering, the scrub gate,
  the **FS5 break-glass discipline** (own prior PR on main; enforcement lands at M6 admit), and
  the reserved M5/M6/M7 surfaces. Ships with installs.
- **Deferred-from-M4a consolidations** — `util.mjs` gains `makeOpt`/`makeOptText`/`makeOptAll`
  (check/orient/log/jdg share one argv parser) and `FRONTMATTER_RE` (one boundary opinion; fixes
  doc-freshness's LF-only regex that made CRLF-saved docs invisible to CTX-06). Corpus-proof.
- Suite grows to **87 assertions** incl. the DESC-03-shape acceptance bullet: a descriptor-change
  JDG validates and its tripwire fires on posture weakening.
- **Review pass (4-angle adversarial, all findings fixed):** evaluator findings are structured
  (`{code, fact, want, got, text}` — M6 dedup-keys firings without parsing prose) and `facts.today`
  is the ONE clock (overlays time-travel expiry too); the signoff bridge loads via the strict
  `loadJudgments` + `selectSignoffs` (a malformed `review_by` can never read as signed-forever);
  one clock helper (`util.nowUTC`) ends the raw-env `TODAY` slice; `deepEq` is order-insensitive
  (JSON key order is not a changed world); tripwire values keep inner whitespace verbatim;
  `jdg new` blocks are non-lossy (draft + `--from` replay) with the same `--allow/--allow-reason`
  surface as `log` (log's allowlist flag renamed from `--reason`, which `jdg` needs for the
  judgment itself); value flags refuse to swallow a following flag (`--repo`/`--by`/`--facts`
  followed by a flag is a usage error, not a record attributed to "true"); the forge probe is
  skipped unless a judgment references `planes.forge`; `liteRepo` (repo.mjs) replaces the third
  hand-rolled repo shim. Behavior note: doc-freshness's CRLF fix means a CRLF doc whose stamp sat
  in the body (outside frontmatter) no longer passes by accident — LF and CRLF now agree.

### Added — V2 M4a: the Ledger's shapes — rules split, record schemas, `baseline log` + scrub
- **`rules/` split (11 per-category modules) behind a manifest loader** (`src/rules.mjs`):
  `rules.json` keeps the runner's identity (name/version/project_types/profiles) plus the ordered
  module list. Corpus-neutral by construction — stable partition, pins keyed by rule id. Unblocks
  M5's "extends `rules/flow.json`" premise (#22) and M4c's `rules/rec.json`. One externally visible
  change: `--json` `results` order is now category-grouped (the late-added rules interleave into
  their categories instead of sitting at the tail) — verdicts, ids, and the human report are
  unchanged; positional consumers of `results[i]` must key by id. The loader fails LOUD on a
  manifest without `modules` (stale monolith skew) and on a `rules/*.json` file the manifest
  doesn't list — a rule can't exist yet silently never run.
- **Record schemas** — `schema/record.{session,judgment,claim,adr}.schema.json`, validated by the
  descriptor's zero-dep subset validator (now shared as `src/validate.mjs`); `src/records.mjs` is
  the kind registry + frontmatter/ADR-header seam. The judgment schema **expresses break-glass**
  (kind + `gate`) — FS5 *enforcement* stays M6, per the #21 amendment. Templates: `session-log.md`,
  `judgment.json`, `claim.json`.
- **`src/scrub.mjs`** — one `scan()` for every layer (C34): the deterministic tier (SEC-01 parity
  + JWT + fine-grained PAT) blocks; the heuristic tier (assignment shapes, entropy-floored blobs —
  a 40-hex commit SHA never trips) warns; deterministic spans are censored before the heuristic
  pass so one value never reports under two names. `.baseline/scrub-allowlist.json` holds **dated
  judgments keyed by content-derived finding id** — the flagged value itself is never stored.
- **`baseline log`** — the pinned one-liner (#21 amendment, item 4): `baseline log -m "..."
  [--next "..."]`; lane/agent/timestamp derived (lane = branch, unborn branches included — the M5
  seam), stdin accepted, never `$EDITOR`. Writes `records/sessions/<lane>/<date>-<time>-<agent>.md`
  (CF1: `O_EXCL`, no counters) in exactly the `## Left open` / `next:` shape orient already reads.
  Scrub blocks are **non-lossy**: the full draft survives under `.baseline/cache/` and the exact
  rerun is printed (`--from <draft> --allow <finding-id> --reason "..."`).
- **`test/records/run.mjs`** (41 assertions, a CI step): lossless split, per-kind schema
  accept/reject, scrub tiers + allowlist + finding-id stability, log end-to-end including the
  orient round-trip, O_EXCL collision refusal, and draft replay with a dated judgment.
- Ruling record: the #21 amendment comment (FS5 rewording · REC-02 warn resolution · `rec.json`
  home · pinned log UX · hardened dogfood acceptance) and the M7 delete-list addition on #24.

### Added — V2 M3d: the Hermes plugin (M3 complete)
- **`integrations/hermes/baseline-orient/`** — a NousResearch hermes-agent plugin that opens each
  session oriented: a `register(ctx)` entry point registering an **`on_session_start`** hook and an
  **`/orient`** slash command, both shelling out to `baseline orient`. No provider keys, no network of
  its own.
- Grounded in the official hermes-agent plugin API (`ctx.register_hook` over `VALID_HOOKS`,
  `ctx.register_command`) — **not** the memory-provider `prefetch`/`system_prompt_block` surface the
  plan originally sketched (those are `MemoryProvider` methods, not general hooks).
- Conformance-authored: valid Python + `plugin.yaml`, structured like the official reference plugins,
  but **not runtime-tested** (no Hermes on the authoring box). The `/orient` command is spec-confirmed;
  the `on_session_start` injection return-shape needs one verification pass on a live Hermes.

### Added — V2 M3c: rule metadata backfill + CTX-12 (the Lens's contract)
- **Every rule now declares `sources` / `on_unreachable` / `contexts` / `certainty`** (introspectable
  data): which ground-truth planes it reads, what it does when one is unreachable, the contexts it
  runs in, and how certain its verdict is. 38 deterministic, 28 heuristic, 5 judgment.
- **`--self-check` enforces two structural laws** (STRATA graft): a **blocker must be deterministic**
  and a **sign-off must be judgment** — plus per-field validity and a layering check (readiness rules
  can't consume FLOW facts, inert until M5). The existing rule set satisfies both with zero conflicts.
- **CTX-12** — the stored-status **tripwire** (71 rules at this slice; M4c takes the set to 78): warns when a hand-maintained
  `last-verified:` stamp is present (the artifact V2 replaces with derived `orient`). Warn now while
  CTX-01 still gates the stamp; promotes to blocker once migration completes (M7).
- Golden corpus re-pinned: only CTX-12 added (metadata fields are inert to verdicts).

### Deferred (M3 continues)
- **M3d** — the Hermes `prefetch`/`system_prompt_block` plugin (needs the Hermes plugin API).

### Added — V2 M3b: the typed Lens plumbing
- **`src/facts/{tree,git,forge}.mjs`** — typed, provenance-carrying facts. The forge adapter wraps
  `gh` with **record/replay**: `BASELINE_FORGE_REPLAY=<dir>` reads committed fixtures (deterministic,
  no network) and `BASELINE_FORGE_RECORD=<dir>` captures them, so downstream lane/admit tests replay
  a fixed forge. (Batched GraphQL is deferred to fleet scale — M5.)
- **`.baseline/cache/facts.ndjson`** (`src/cache.mjs`) — gitignored, advisory-only (gates never read
  it, FS8); write-through on live fetch, `observed_at` per entry.
- **`src/join.mjs`** + **`schema/keys.md`** — the relational join over declared keys only (C38):
  PR⇄branch and PR⇄issue (`closes #N`) active now; record joins declared but inert until M4/M5. An
  unresolvable join is a **finding, never a guess**.
- **`src/derive/status.mjs`** — a pure function (facts + join → the derived status view), replayable;
  surfaces divergence first (next:→closed issue, closed-issue-live-branch).
- **`orient` refactored onto `facts → join → derive → render`** — one forge path; it gains the cache
  + record/replay and the same fixtures. `orient --json` now emits the derived-status shape
  (`planes` / `forgeAvailable` / `thisLane` / `findings`).
- `test/facts/run.mjs` — deterministic scenario over committed replay fixtures (clean close,
  divergence, unresolvable-join finding); wired into CI. (M3c + M3d remain — see `docs/v2/PLAN.md` §8.)

### Added — V2 M3a: `baseline orient` (the Lens goes live)
- **`baseline.mjs`** — the unified CLI entry point. `orient` is new; `check` (the default)
  delegates to the intact `check.mjs`, so the golden corpus and CI keep invoking it directly.
- **`baseline orient`** — a derived-state survey for session start (C16): a capability header
  (tree / history / forge reachability), divergence first, live lanes (open PRs + each branch's
  latest session `next:`), backlog (open issues by milestone), and this lane's `next:`.
  `gh`-based, descriptor-aware, `--json` / `--strict`. Generalizes the ADR-0009 `orient.mjs`.
- **Capability probe** (`src/probe.mjs`) — plane reachability; every unreachable plane degrades
  to a labelled note, so orient works offline and **never hard-refuses** (C33 / FS9); `--strict`
  turns forge-unreachability into exit 1.
- **Claude Code SessionStart hook** (`hooks/orient-session-start.sh` + `hooks/README.md`) runs
  orient as the session's first act; SKILL.md carries the tool-agnostic first-act directive (C28).
- `test/orient/run.mjs` — availability tests (offline / no-forge degradation), wired into CI.

### Deferred (M3 continues in later slices)
- Typed facts layer + `.baseline/cache` + `src/join.mjs` + `derive/status.mjs` + forge
  record/replay fixtures (M3b); the `sources/on_unreachable/contexts/certainty` metadata backfill
  + CTX-12 (M3c); the Hermes `prefetch`/`system_prompt_block` plugin (M3d).

### Added — V2 M2: the repo descriptor
- **`baseline.repo.json`** — the schema-validated repo descriptor (C39): the one stored piece
  of intent every applicability/severity derivation consumes. Declares `type`, `lifecycle`,
  `maturity`, `owner`, `workflow`, `anchoring` (+ optional forge / lanes / join-keys / staleness).
  Schema at `schema/repo.schema.json`, loaded and validated by a zero-dependency subset validator
  in `src/descriptor.mjs`. Read from the working tree or a git ref (the target-ref seam).
- **`type` supersedes filesystem auto-detection** when a valid descriptor is present, so a tooling
  `package.json` can't misclassify a docs repo as `node`; absent/invalid → auto-detect still governs.
- **DESC-01** (new `desc` category — 70 rules across 11 categories): descriptor absent or
  schema-invalid → WARN + scaffold fix; present and valid → PASS. Transitional — adopt incrementally.
- **Posture presets** `config-presets/multi-lane-agents.repo.json` (the V2 default) and
  `readiness-only.repo.json` (V1-equivalent), plus the `templates/baseline.repo.json` scaffold.
- **`--self-check`** now enforces the descriptor invariant (S7 / DESC-02): every schema field has a
  declared consumer (active, or reserved for a named later module).
- **`init` is descriptor-first** — writes `baseline.repo.json` before anything else; no longer
  scaffolds a status doc.
- Golden corpus: two new fixtures (`descriptor-repo`, `descriptor-invalid`); pins re-captured.

### Deferred (honest slice)
- **DESC-03** (descriptor change-control) and **target-ref *enforcement*** are wired at the loader
  seam but not yet active — their teeth need JDG records (M4) and the `admit` context (M6). See
  `docs/v2/PLAN.md` §8.

## [2.2.0] — 2026-07-05

### Added
- `REFERENCE.md` — the full reference (rule table, category descriptions, CI wiring)
  plus **architecture & flow diagrams** drawn from `check.mjs`.
- `GLOSSARY.md` — plain-language definitions of the DevOps/supply-chain terms, linked
  from the docs. Both are copied on install.
- Distribution-mode self-scoring: `baseline.config.json` (`project_type: docs`) so the
  repo is scored against the rules that fit a distribution repo, plus a status doc,
  sign-off ledger, `SECURITY.md`, `CODEOWNERS`, and this changelog.
- **`project_types` + explicit `applies_to` on every rule**, and a `--self-check`
  mode that validates rule-set integrity (no missing/typo'd `applies_to`, unknown
  check kind, profile, severity, category, `requires` key, or duplicate id) and prints
  a per-type coverage matrix. Guards against silently-dangling rules.
- **Hermes-native:** `SKILL.md` now uses the Hermes peer conventions (frontmatter
  superset with `author`/`license`/`platforms`/`metadata.hermes`, "Use when…"
  description, peer structure) while staying valid for Claude Code. `install.sh --hermes`
  installs into `~/.hermes/skills/software-development/baseline`.
- `config-presets/` — ready-made `baseline.config.json` starting points
  (context-management, node-service, python-library, internal-tool, product-with-claims),
  each annotated and copied on install.

### Changed
- Removed an internal end-of-session reference from CTX-01's `fix` text.
- Genericized the v1 provenance line (dropped specific private repo names).
- Re-scoped TEST-03/TEST-04 to code repos (`node`/`python`/`service`/`library`); a
  docs/distribution repo now skips them instead of needing "n/a" sign-offs.

## [2.1.1] — 2026-07-05

### Changed
- Bulletproofing pass: 62 defects fixed across 4 adversarial rounds (severity
  inversion in CTX-01, a shell-injection in the git helpers → `execFileSync`,
  comment-blind greps → quote-aware stripping); ~70 regression assertions green.

## [2.1.0] — 2026-07-05

### Added
- Backfilled 8 rules (SEC-11/12/14, QUAL-04, BUILD-10, TEST-07, CTX-11) and 3 check
  kinds (workflow-permissions, implies, doc-code-age). The standard is now **69 rules**.
