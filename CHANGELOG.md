# Changelog

All notable changes to the `/baseline` skill are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com); the runner is versioned in
`rules.json` and `SKILL.md`.

## [Unreleased]

### Added
- **CI secret-scan gate (SEC-12)**: `gitleaks` wired into `ci.yml` as a server-side
  complement to the pre-push scrub hook, with a `.gitleaks.toml` that allowlists the
  `test/` corpus (which carries intentional fake secrets exercising SEC-01).

### Notes
- **SEC-05 accepted as not-relevant**: this repo is zero-dependency (no manifest or
  lockfile), so the dependency-update-bot rationale does not apply — documented in
  `baseline.config.json` rather than papered over with a no-op bot.
- README's "See it pass" now frames **baseline-demo** as the worked self-application
  example (the tool points at the dogfood repo rather than dogfooding itself).

## [2.5.0] — 2026-07-19

### Added — V2 M7c: lock + residue (87 → 90 rules; closes the M7 module)
- **`baseline gen lock` + `tools/baseline.lock.json`**: pin the vendored
  `tools/baseline/` tree — exactly `{version, tree_hash}` (version from the
  vendored tree's own `rules.json`; sha256 over sorted path+content-hash pairs, raw
  bytes, worktree semantics). The consumption model stays vendored (pointer
  flip cut to V3); the pin is what ships.
- **REC-06** (warn, deterministic): unpinned vendored tree, unparseable lock,
  or hash skew — the skew finding names the lock's pinned version AND the
  tree's current one; no vendored tree at the canonical path → SKIP.
- **OPS-07** (warn, deterministic, knob-free): ONE recorded forge query of the
  reconcile workflow's state — `active` passes, any other state fails naming it
  (the `disabled_*` family in practice; `disabled_inactivity` is GitHub's
  60-day auto-disable, the named death mode); no reconcile workflow in the tree → SKIP. New forge read:
  `workflowState(file)`, record/replay-additive.
- **DESC-02** (blocker, deterministic — the M7b panel's filing): a
  present-but-invalid `baseline.repo.json` is the loudest row in the run, not
  a warn beside a wall of posture-off skips. DESC-01 narrows to presence
  (warn, unchanged severity) — the FLOW-02/03 presence/content divide; DESC-02
  SKIPs on absence and deliberately does NOT run at admit (an invalid target
  descriptor must not hostage its own fix-PR; check/reconcile detection is the
  guarantee, DESC-03 stays the change gate).
- **gen index pool union**: the session-record pool is tracked∪walked, so the
  record `baseline log` just wrote (never staged, by design) rides the same
  regeneration — log→regen→commit is one pass with no one-session lag (the
  seam the demo transition cycle hit live).
- **Reconcile caps, JDG_PARSE_CAP parity**: the judgment sweep and the
  landed-record re-scan are bounded at 500 (the constant one-homed in
  `src/jdg.mjs`, shared with admit), truncation labeled in the report and
  summary; out-of-cap entries neither file nor clear that run.
- **CONTRACT reconcile YAML**: `permissions:` granted per-job (top-level stays
  read-only) — the tool's own SEC-11 guidance applied to its own spec; the S9
  manual-copy paragraph documents the canonical vendoring procedure.

### Removed — V2 M7b: the contraction (88 → 87 rules; the expand/contract debt paid)
- **CTX-01 and the `status-stamp` check kind** (39 → 38 kinds): the stored-status
  surface is gone — no rule demands a hand-maintained freshness stamp anywhere.
  Its knobs died with it: `DEFAULTS.status_file`, `stamp_max_lag_commits`, the
  engine's `status_file:false` descriptor-honored carve-out (with zero remaining
  `requires` consumers outside the claims family, the generic `requires:false`
  opt-out branch retired too — a future key adds its semantics consciously).
- **The legacy sign-off read**: `.project-baseline/signoff.json` no longer
  satisfies a manual rule — the JDG ledger (`records/judgments/`, `kind:
  sign-off`, subject = rule id) is the ONLY path. `signoff_file` config key,
  `templates/signoff.json`, and the SKILL teaching retired with it; the five
  manual rules are otherwise unchanged. The skill's own CTX-04 entry was
  re-minted as `records/judgments/JDG-0001.json` in this PR — the migration,
  dogfooded.
- **The legacy claims read**: the CLAIM checks read `records/claims/CLM-*.json`
  ONLY — an unmigrated `docs/CLAIMS.json` is never counted (CLAIM-07 keeps
  flagging it; the empty-register finding names the migration).
  `loadLegacyClaims` survives with exactly one consumer: `gen migrate-claims`,
  MIGRATION.md's executor. `templates/CLAIMS.json` (a scaffold for the artifact
  the tripwire flags) deleted.
- **`owner` dropped from the descriptor** (schema `required` + property, both
  `*.repo.json` presets, the template, the S7 consumer map): grep-proven zero
  consumers — lane identity is the `Baseline-Agent` trailer, ownership is
  CODEOWNERS' job (GOV-03). The schema is `additionalProperties:false`, so a
  WORKTREE descriptor still carrying `owner` is invalid — remove the key (the
  demo's own edit dogfoods DESC-03's same-PR-judgment ceremony on its next
  adoption PR). Ref-reads of already-committed descriptors ignore unknown
  fields, so admit against an owner-bearing target still works — the shedding
  PR is admittable (without this, every schema contraction re-creates the M6
  relief-circularity).
- **`templates/start-here.md` and `config-presets/context-management.json`** —
  the status-doc scaffold and the preset whose center of gravity was the
  stored-status keys.

### Changed — V2 M7b: CTX-12 rewritten; the separation ruled FINAL; MIGRATION.md
- **CTX-12 is the stored-status signature, at blocker**: de-config-keyed
  (`requires`/`file_from_config` died with the key), glob-scanned (`**/*.md`),
  line-anchored (`^\s*` + the stamp marker at line start, flags `im`) — the
  deterministic signature IS the whole check; the issue's "heuristic residue"
  leg was CUT (no such heuristic exists; revive: observed evasion on a real
  repo). In-slice self-housekeeping: the skill's own `docs/start-here.md`
  stamp — which this very rule would have blocked — deleted in the same PR.
- **`baseline.repo.json` / `baseline.config.json` separation is FINAL**
  (CONTRACT.md): the descriptor is the change-controlled file read at the
  target ref; the config is the free worktree file. Convergence CUT — revive
  only on demonstrated per-field change-control demand.
- **MIGRATION.md** (doc-only — the `fix` command stays CUT): the four V1
  artifacts, each with its existing detector (DESC-01 · CTX-12 · the manual
  rules' unsatisfied sign-offs · CLAIM-07), and every step an existing command
  (preset copy · stamp deletion · `jdg new` re-mint · `gen migrate-claims`).
  Worked example: baseline-demo's minted `pre-v2` tag, migrated by the doc
  alone — transcript in the PR.
- **Stale fix-string sweep**: DESC-01 (rule + evaluator detail) no longer names
  the nonexistent `init` command nor the dropped `owner` field; presets/docs
  stop teaching `status:` doc pointers (derived `orient` is the status surface).
- Corpus re-pin **2 of the ruled 3** (CTX-01's death + the CTX-12 rework):
  pre-flight diff published in the PR before capture.

### Changed — V2 M7a: the promotion (10 rules warn → blocker; blocker-DIVERGED refuses)
- **Severity flips** (per the M7 ruling, PLAN §8): FLOW-01..05, FLOW-07 · DIV-01..03 ·
  MERGE-02 — all deterministic, all already posture-gated (`workflow: multi-lane |
  multi-lane-local`), so the promotion is rule DATA plus two conscious law changes,
  no new mechanism. REC-01/02 stay warn (the only ungated candidates; a
  severity-by-posture seam has no consumer — revive on real demand for
  REC-02-at-admit). Pre-flight diff, published before capture: **6 fixtures, 7 row
  re-tags WARN→FAIL, 3 exit flips, 1 detail reword** (+ the two M6a backfill
  fixtures below) = re-pin 1 of the ruled 3.
- **Blocker-DIVERGED refuses without losing its verdict**: the engine keeps the
  DIVERGED tag; the counting seams share one predicate (`report.isBlocking`) across
  check's exits and admit's refusal leg (b) — a DIVERGED refusal line says so. The
  M5c div⇒warn and M6a merge⇒warn selfcheck laws lifted in the same commit.
- **The merged-lane COMPLETED exemption** (the panel's live-hostage guard): a lane
  whose tip is an ancestor of the default branch derives COMPLETED — exempt from
  DIV-01 (its closed anchor is agreement) and the lease clock, sorted last in
  orient with the prune recipe. Provable-only: unknown tips derive on the normal
  clock.
- **The JDG-only admission path is promotion-proof**: a pure judgment-additions
  range cannot carry a session record by its own ruled shape, so promoted lane
  blockers (FLOW-02) are excluded from leg (b) under jdgOnly — the relief valve
  M6a built cannot be re-closed by M7a (findings still ride the output; DESC-03
  cannot fire there by construction). Caught by the suite, pinned by the corpus.
- **DESC-03 kind pin**: {sign-off, deviation, risk-acceptance} satisfy;
  break-glass is EXCLUDED (outage relief never doubles as descriptor-change
  approval) — with a named hint when a break-glass rides the range with the right
  subject.
- **M6a golden-pin backfill**: the relieved break-glass envelope (new `shallow`
  harness knob — a --depth 1 --no-single-branch clone of the bare origin) and the
  partially-degraded-forge admit shape are now pinned.
- Ruled explicitly (CONTRACT): promoted blockers keep `on_unreachable: skip` —
  gating power exists only where facts are readable; the fail-closed floor stays
  admit's command legs + reconcile detection.
- **Gate to M7b** (per the ruling): one clean demo lane cycle at blocker
  severity — claim → work → log → push → admit green → merge, on baseline-demo.

## [2.4.0] — 2026-07-18

### Added — V2 M6c: `baseline gen index` + `gen --check`, `inputs_digest` provenance
- **The generated-view contract** (C05 as amended — in-PR views only; the snapshot
  ceremony and its hash/as_of headers stay cut): a view is a tracked markdown file
  whose first line is the static marker `<!-- baseline:generated <kind> — do not
  edit by hand; regenerate: baseline gen <kind> -->`. `gen index` writes a
  DETERMINISTIC index (judgments/claims ledgers, per-lane session counts with
  filename-derived dates, docs map with first-heading titles) — everything sorted,
  links relative to the out file's dir (CTX-05's resolver semantics; a root-form
  link would redden the consumer's own check), refuses to overwrite a marker-less
  hand-written file (uncapped probe — a >512KB hand file is not "absent").
- **`gen --check`** — the CI drift guard: discovery over the tracked∪walked pool
  with uncapped reads (no silent green over a big drifted view), regenerate +
  byte-compare. Zero marked views → exit 0 (the ruled pre-adoption state); drift →
  exit 1 with a VERBATIM-RUNNABLE remedy derived from the invocation's own argv
  (vendored consumers have no `baseline` binary) + the predates-this-PR and
  vendor-bump clauses; unknown kinds and unreadable views fail named, never
  skipped. Advisory CI means a visibly red job OUTSIDE the required set — never
  `continue-on-error`.
- **`inputs_digest`** (`src/digest.mjs`, pure): sha256 over the six ruled inputs —
  head SHA · target SHA · descriptor blob OID at target (`gitBlobAt`, the ruled
  content-addressed hash) · rules version · check-run (name, conclusion, head_sha)
  tuples (FULL-tuple sort — GitHub re-runs mint same-name ties) · anchored-issue
  state. Absence is a VALUE ('not-consulted' / none): runs that consulted
  different planes digest differently. `baseline admit` prints the one provenance
  line and mirrors its fields in `--json` (`provenance`), REFUSAL-INERT by
  contract; `checkRuns(HEAD)` is admit's one marginal forge read, degraded by the
  same one-home closure (posture / JDG-only) as everything else. Cost, stated
  plainly: on a SINGLE-LANE repo, admit previously never built the lane world
  (every lane rule gates off) — provenance now probes the forge there too (2–4 gh
  spawns per admit; a merge-time command, and the tuples are a ruled input with
  no posture carve-out — a single-lane repo's check runs are exactly as real).
- Tests: `test/gen/run.mjs` (digest canonicalization incl. tie-break permutation;
  marker round-trip; determinism; union-pool discovery; drift remedy text;
  refusals; BOM/CRLF loudness; >512KB honesty) + admit provenance asserts.
  Re-pins: **0** (verified — the golden projections never see the new field).
  Slice panel (scope-cutter / friction skeptic / dependency auditor): all
  AMEND-THEN-GO; every amendment applied (marker human clause, argv-derived
  remedy, advisory≠continue-on-error, full-tuple sort, JSON line-mirror,
  link-form law, uncapped reads, anchor-none mapping, explicit sorts).

### Added — V2 M6b: `baseline reconcile`, the forge mutation channel, GOV-01/02 live asserts
- **`baseline reconcile`** — post-merge revalidation of the default branch (MERGE-03's
  dissolution: the cron against main IS post-merge revalidation, C37). Four finding
  sources: the engine at context `reconcile` (75 repo-scoped rules declare it; lane
  rules are excluded structurally, exec rules stay check-only); the **JDG sweep** at
  the tip via `evaluateJudgment` (tripped/expired + invalid file; drifted/unresolvable
  ride the report — `review_by` is the backstop); the **landed-record re-scan** (scrub
  over `records/**` blobs at the tip, allowlist read at the tip, deterministic tier
  only); **merged-while-red** over the merged-PR window (admit-named check runs with
  conclusion `failure` at merged HEAD shas — a squash merge's red admit never lands on
  the tip; subject = the short merge sha, cleared by the EXISTENCE of a covering
  judgment, never by time).
- **The dedup lifecycle** — `baseline:<id>:<subject>` in an HTML marker + the
  `baseline` label: file → comment-on-change (fingerprint over the ONE volatility
  spec, `util.normalizeVolatile` — aging findings never re-comment) → close naming
  the sha (positive re-evaluation only; a SKIP is never a clear) → reopen on
  recurrence when the close was reconcile's own (`bot-closed` marker stamp). **A human
  close is a judgment**: advisory rows stay closed (one comment max on new content);
  judgment/scrub/merged-while-red reopen over any close. Cap 10 creations+reopens,
  overflow in one self-draining rollup; truncated scans suppress creates.
- **The forge mutation channel** (`makeForge().mutate`) — live=write ·
  replay=assert-the-ordered-plan (plan AND normalized argv; a mismatch is a harness
  violation, never relieved) · `--dry-run` prints the plan. Posture/JDG closures
  refuse writes in every mode; recordings ride `BASELINE_FORGE_RECORD` as
  `mut-NNN.json`.
- **The binding law**: mutations require the evaluated tree == the fetched tip,
  clean; behind-on-the-line or dirty degrades to labeled **report-only** (exit 0,
  recipe included); off the line is exit 2. Exit 1 = *delivery* failed — including a
  clean run that cannot read the tracker (a dead cron must not stay green);
  `break-glass (gate: reconcile)` at the tip relieves live outages only (its first
  real consumer, selection shared with admit via `selectBreakGlass`).
  `multi-lane-local` is exit 2 up front — the posture closes the write surface.
- **GOV-01/02 flipped to live asserts** on the readable surface (new
  `forge-protection` kind, 38 → 39; certainty → deterministic): rules-for-branch
  (plain read) → the `protected` flag (classic only — never asserts absence while
  rules are unreadable) → the classic endpoint under `BASELINE_GOV_ADMIN=1`. A
  token-scoped denial is SKIP("protection unreadable with this token"), never
  source-loss; the committed-ruleset-file greps are gone (files prove nothing about
  enforcement). GOV-01 passes only on merge-PROTECTIVE rule types (a signatures-only
  ruleset is not merge protection); GOV-02 reads every layered rule (`.some`, not
  first-of-type) and falls to the classic ladder instead of FAILing past it. Cost,
  stated plainly: `check` on a repo with a declared default branch + forge access now
  spawns gh for these two rules (one probe + two reads, memoized per run; labeled
  SKIP offline — pre-M6b every forge rule was posture-gated). **The ONE M6 corpus
  re-pin** (GOV detail strings: 20 rule rows + the human-scorecard lines, no
  tag/summary churn).
- **Orient**: open baseline-filed issues headline as one line after divergence
  (label-filtered from the existing query; zero-case renders nothing), and a
  divergence row reconcile already filed carries `→ filed as #N` on the same line.
- Tests: `test/reconcile/run.mjs` (lifecycle matrix, channel replay incl. argv
  negative, binding law, merged-while-red, GOV ladder, reverse clears, exits) + the
  `reconcile-repo` golden fixture (dry-run plan pinned, organic cap+rollup).
  Slice-level design panel (scope-cutter / friction skeptic / dependency auditor):
  all AMEND-THEN-GO; pre-merge 8-angle panel (correctness · lifecycle-adversarial ·
  determinism/replay · security/injection · exit-contract · GOV-truth · docs-drift ·
  coverage): every confirmed finding fixed in-branch.

### Added — V2 M6a: `baseline admit`, DESC-03, MERGE-02, the context-gated engine (86 → 88 rules)
- **`baseline admit`** — merge-point revalidation (C30/C35): *a verdict is valid only for
  the state it evaluated*. Refusal is the COMMAND's contract (exit 1): (a) staleness —
  the target tip is not an ancestor of HEAD (deterministic ancestry, judged before any
  rule; a shallow/erroring ancestry is honestly SOURCE-LOSS, never a fake stale);
  (b) an admit-context blocker FAIL; (c) gating-source loss. Warn rules SKIP labeled on
  unreachable sources exactly as in `check` — advisory findings never acquire
  blocker-grade denial power via unavailability (C33, scoped by the M6 ruling).
- **FS1 enforced**: admit reads the governing descriptor from the TARGET ref
  (`loadDescriptor`'s ref seam, finally threaded) — a PR cannot weaken the posture that
  judges it. **FS5 enforced**: break-glass honored from the target ref only (new
  `loadJudgmentsAt`), covering source-loss refusals alone; the **JDG-only admission
  path** keeps the relief valve reachable during the outage it relieves (a pure
  judgment-additions range with an unexpired `break-glass (gate: admit)` admits from
  tree+history alone — `makeForge` grew the one-home `closedReason` so the closure
  holds under replay, labeled honestly).
- **DESC-03** (blocker, deterministic, admit-only): a descriptor change in the admitted
  range needs a same-range judgment whose subject is exactly `baseline.repo.json` —
  ONE spelling, now emitted identically by FLOW-06's fix text, CONTRACT.md, and the
  rule itself. The weakening classification is **schema data** (`x-strictness` orders
  on workflow/anchoring/maturity + gate-consumed set-rules, `src/derive/posture.mjs`)
  and rides the finding text as M7's per-axis seam.
- **MERGE-02** (warn, deterministic, admit-only; `rules/merge.json`): unmerged
  sister-lane dependencies from the git plane alone; the `Baseline-Stacked-On` trailer
  (whole-token) declares a stack and lifts the finding. MERGE-01 dissolved into the
  admit command, MERGE-03 into reconcile (M6b) — per the panel ruling.
- **Context-gated engine**: the first real consumer of rule `contexts` — a run at
  context X excludes rules not declaring X (no wrong-context wallpaper rows). All
  pre-M6 rules declare `check`, so check output is byte-identical at rest: the 10
  existing golden fixtures re-pinned NOTHING. Selfcheck grew the merge⇒warn law and
  the x-strictness⇄enum lockstep assert.
- Golden harness: `command` dispatch (fixtures may pin `admit`'s envelope), ordered
  `branches` (sister/stack shapes), `branch_message` (trailer-carrying commits),
  `main_advance` (the C35 stale shape); four additive admit fixtures (stale ·
  desc-weaken · sister-dep · jdg-only). New `test/admit/run.mjs` (41 asserts over
  local bare origins, incl. real shallow clones via `file://`).
- Review hardening (4-reviewer / 8-angle panel, all confirmed findings fixed
  in-branch): the DESC-03 **rename bypass** closed (admit's range diffs run
  `--no-renames`, plus a descriptor-absent-at-HEAD belt); the **JDG-only path is
  strict** (one invalid or misnamed rider and the range falls to the normal
  contract) and capped (500 parsed judgment additions — beyond it, fail-closed);
  DESC-03's diff loss is a **leg-(c) refusal**, never a fail-open SKIP; target
  descriptor + relief ledger read **at the resolved tip**, not the mutable ref;
  FLOW-06 back to check-context only (the ruling's disjoint-contexts clause —
  DESC-03 owns admit); trailer scan buffered to 64MB (no silent stack-declaration
  loss on big ranges); MERGE-02 skips the PR's own lane seen under its
  remote-tracking name; test runners strip ambient `GITHUB_HEAD_REF`/`BASELINE_*`
  (the pull_request-CI leak); `validate.mjs` uses hasOwn (a `__proto__`-named
  field can't dodge additionalProperties); `default_branch` schema-bounded;
  `--json` gains `jdgRelief` and honest `target.source` labels.
- CI-shape ergonomics: detached-HEAD admit derives lane identity from
  `GITHUB_HEAD_REF` (the forge's own env); `--target` accepts any ref/SHA.

## [2.3.0] — 2026-07-15

V2 milestones M4 (records + unified judgment ledger + scrub) and M5 (lanes — claim,
leases, FLOW/DIV rules), 69 → 86 rules, all six slices below. Minor bump: additive
rules, new CLI surfaces (`log`, `jdg`, `scrub`, `gen`, `lane claim|reclaim`), additive
schema fields; no breaking changes.

### Added — V2 M5c: FLOW/DIV rules, the DIVERGED verdict, check's lane-world plumbing (78 → 86 rules)
- **`check` gains the capability-probe + forge-facts plumbing it lacked** (the M5 panel's
  blocker): a LAZY lane world (`makeLaneWorld`) — probe + forge + lane gathering + lease
  derivation, computed once on first demand and never for a single-lane/off-posture run —
  the SAME gathering + derivation `orient` renders and `lane reclaim` gates on. One
  answer, three surfaces. Exit-stable offline: every unreachable plane degrades to a
  labeled SKIP; `multi-lane-local` runs carry "forge not consulted (multi-lane-local
  posture)" — the posture named, never faked as unreachability.
- **Five FLOW rules** (warn + promotion prose, no overlap, no wallpaper): **FLOW-01**
  lane anchoring per the descriptor `anchoring` knob — existence + resolution ONLY
  (`off` skips, `relaxed` wants a parseable anchor, `strict` also wants forge
  resolution; open-ness is DIV-01's alone) — the knob's consumer, flipping `anchoring`
  active in FIELD_CONSUMERS; **FLOW-03** filled-in `next:` (fires only on a PRESENT
  record — absence stays FLOW-02's); **FLOW-04** branch placement against
  `lanes.namespace` + the new additive **`lanes.families`** (the real branch inventory —
  adopt/*, release/* — declares itself instead of warning forever); **FLOW-05** push
  discipline as the arbitrated threshold-free predicate ("newest session record exists
  locally but is absent at origin", judged against the last-fetched origin state and
  saying so); **FLOW-07** lease liveness, warning ONLY at derived ABANDONED.
- **`rules/div.json` — DIV-01..03 and the DIVERGED engine tag**: issue-closed-lane-active,
  `next:`-at-closed-issue, done-with-nothing-merged. Extracted `derive/divergence` (pure)
  holds the ONE classifier: orient's headline calls it, and the DIV rules re-run it
  branch-scoped through check's lane world — both import its `isClosed`, `refs`, and
  `closes`, so "closed" and "which #N counts" have a single definition that can't drift
  between the two surfaces (a parity test pins the agreement). A firing DIV rule tags
  **DIVERGED** — its own verdict in the scorecard, `summary.diverged` in `--json`,
  category `div` — with certainty deterministic, severity warn, and the **exit code
  unchanged until M7** (the `lanes-repo` pin proves it: exit 0 WITH a DIVERGED; a
  `--self-check` law holds div ⇒ warn so the engine's DIVERGED-before-blocker ordering
  can't silently swallow a future promotion). An `unknown` issue state is never divergence.
- **Engine `workflow` is string-or-array** (the FLOW-02/06 family conversion rides this
  re-pin: both now serve `["multi-lane", "multi-lane-local"]`), and `--self-check`
  validates rule postures against the descriptor schema's enum itself — lockstep by
  construction. Eight new check kinds (`lane-*`, `div-*`).
- **Golden harness grows `_fixture.json` `forge_replay` + `bare_origin`** — a committed
  `_forge/` dir becomes the checker's replay (zero network), and a local bare origin
  materializes so push-discipline/lease paths pin. New **`lanes-repo`** fixture: claimed
  `lane/7`, pushed record, CLOSED anchor issue in replay → FLOW-01..05 PASS, FLOW-07
  ABANDONED WARN, **DIV-01 DIVERGED**, exit 0. The ONE M5 corpus re-pin (10 fixtures,
  860 verdicts); lease ages (`Nh`/`Nd`) normalized in pins. **`test/flow/run.mjs`** — the
  fire-direction matrix static fixtures can't reach (family-residency SKIP, stray →
  FLOW-04-only, the uncommitted-draft non-contradiction, empty-`next:`/unpushed WARNs,
  DIV-01/02/03 firing as DIVERGED with exit 0, multi-lane-local posture labels, the
  ReDoS-glob refusal) against local bare origins + committed replay dirs.
- **8-angle review hardening** (all confirmed findings fixed in-branch): the one-classifier
  wiring above; the **lane-residency gate** — a declared-family branch (`release/*`) gets
  FLOW-04 and NOTHING else, never four unsatisfiable warns (the wallpaper the families
  mechanism exists to prevent); FLOW-03/05/DIV-02 share FLOW-02's **committed** presence
  definition, so an uncommitted draft record can't make the report contradict itself;
  `div-closes-closed` is null-honest (a FAILED PR query SKIPs, never a fabricated "no open
  PRs"); FLOW-01 strict-unknown SKIPs (parity with DIV-01 — a transient query miss never
  brands a real anchor bogus); check threads the **probe's specific cause** ("gh not
  installed" / "not authenticated" / "no forge repo here"), not a generic label; FLOW-07
  shows git-plane low-confidence provenance; the git-plane lane list is **capped at 100 +
  labeled** (a hostile origin can't fan out thousands of git spawns) and check skips the
  owner-enrichment fetch entirely (no rule reads it — kills a 60s black-hole stall);
  `globToRe` collapses adjacent `.*` and the schema **bounds `lanes.families`** (≤64 chars,
  ≤64 items — validator gains `maxLength`/`maxItems`), closing a ReDoS; repo-authored
  strings are stripped of terminal control bytes at the render boundary (no cursor-move
  spoofing a printed FAIL); `newestLocalLog` survives a hostile `*.md` directory (orient no
  longer crashes — FS9); the DIVERGED scorecard row aligns (padEnd fix); the golden harness
  strips the tool's own `BASELINE_LOG_NOW`/`FORGE_REPLAY` from the child env (a
  time-traveling dev can't drift or bless pins) and cleans side-dirs on a throw.
- Docs: REFERENCE (both new sections + kinds), SKILL (reclaim + lease teaching, 86),
  CONTRACT (the lanes plain-git twin — claim/lease/reclaim/FLOW by hand; the claim recipe
  uses `printf` so the trailers land as real newlines), GLOSSARY
  (Lease, DIVERGED).

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
