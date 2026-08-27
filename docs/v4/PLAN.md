# v4 — the trust circle: what a repo adopts, baseline puts in its CI

**Status.** As built on branch `v4/ctx-rules`. Derived by reading the code, not by
recalling the design: every claim below was checked against `rules/`, `src/` and
`test/red/` at the commit this was written on.

> **This document is not the authority. The tests are.**
> Every statement below is enforced by an assertion in `test/red/`. Where this document
> and a red test disagree, the test wins and this document is wrong. Where it and the
> runner disagree, the runner wins. Prose drifts; a test does not. That is the whole
> premise of the repo, and v4 applies it to the repo's own prose (§8).

## 0. The judgment being made

v3 was 76 rules across 13 categories, with a warn tier, opt-in packs, a forge seam,
and rules whose evidence CI could not see. The product thesis that replaced it is one
sentence, the user's own:

> *"user adds a skill/tool to trust circle. baseline skill adds it to your CI."*

That moves opt-in from the RULE level to the TRUST-CIRCLE level. A repo that adopted
nothing stays unenforced — the enabler is preserved — and a repo that adopted a tool
gets that tool's discipline as a CI gate. Everything else in v4 follows from making
that thesis actually executable.

## 1. One script over repo files, exiting 0 or 1

CI runs one script over the repository's **files** and gets back an exit code. That is
the whole blocker mechanism; there is no second one.

- **No warn tier.** Every rule that claims a severity claims `blocker`. `AND`-gated:
  any finding fails the build, and there is nothing to demote a rule into.
- **`n/a` is excluded from the gate.** A rule with no subject in the tree resolves
  `state: "n/a"` with a reason — silent to humans, carried in `--json`, never counted.
  An honest `n/a` is not a gap to fill.
- **No packs.** `rules.json` still carries a `packs` key; it is `{}`, and `test/red/`
  reads "no pack exists" from that data rather than from a deleted symbol.
- **Everything deterministic.** `blocker ⇒ deterministic` is a law `--self-check`
  enforces. A heuristic cannot gate a build, so the heuristic rules were cut, not demoted.
- **The inputs are repo files.** A committed stamp qualifies; a daemon, an mtime, or a
  path outside the repo does not. This is what killed the docker family outright and
  what forced the stamp design in §5.

**The severity vocabulary carries a third value that is not a tier:** `none`. It is the
*absence* of a claim, and `src/selfcheck.mjs` binds it in both directions —
`severity 'none' ⇔ check kind 'frozen'`. So `none` can never become a way to ship a rule
that gates nothing while looking like a rule.

## 2. The rule set

**13 rules — 12 that claim a severity, 1 frozen — across 5 categories.** That is the one
count this plan commits to; it is *derived* on every run by `node check.mjs --self-check`,
and `SURVIVING_IDS` in `test/red/_lib.mjs` is the list the red suite compares the loaded
set against. No other document may state it (§8).

| category | rules | half |
|---|---|---|
| security | `SEC-01-no-committed-secrets`, `SEC-02-env-files-ignored` | baseline layer |
| build | `BUILD-03-ci-workflow-present`, `BUILD-04-env-template-present` | baseline layer |
| governance | `GOV-03-codeowners-names-owner` | baseline layer |
| plugins | `PLUG-01-obsidian-tdd`, `PLUG-02-graphify`, `PLUG-03-okf-rag` | trust circle |
| context | `CTX-15`, `CTX-16`, `CTX-17`, `CTX-18` (frozen), `CTX-19` | circle, except CTX-19 |

68 rules were deleted and 8 categories disappeared entirely (claims, community,
descriptor, ops, quality, records, repro, test). The verdict on every one of the 76,
with its reason, is [`rule-review.md`](rule-review.md) — history, not a specification.

## 3. Two opt-ins, opposite defaults

This is the shape of v4 that is easiest to get wrong, so both halves live on one
surface (`baseline trust setup`) and both print their state on every check.

### The trust circle — opt **in**, default **out**

A plugin is a **member** when its name is a **key of `plugins` in
`baseline.config.json`**. Membership is read before any value is looked at, so a member
at default values is still a member. A key whose value is `false` or `null` is an
explicit **decline**: recorded, not a member.

- Adopted → the member's rules **gate this build**.
- Not adopted → **suggestion**: `n/a`, printed by the report as an offer, never able to
  reach an exit code.
- `baseline trust add <name>` / `trust remove <name>` do exactly one thing: edit that key
  set. Membership stays a fact anyone can read out of a tracked file.
- The env var (`BASELINE_OKF_BUNDLE`) is deliberately **not** a membership signal. CI
  clones tracked files, not a shell; an env-created member would gate differently on two
  machines. Adoption is a committed fact or it is not one.

The **roster** (what baseline supports) is derived from `PLUGIN_DEFAULTS` in
`src/repo.mjs`, never a second hardcoded list: `obsidian-tdd`, `graphify`, `okf-rag`,
`my-onto`. The roster is not the circle.

### The baseline rules layer — opt **out**, default **in**

Every rule *outside* the trust circle (told apart exactly as the runner tells them apart:
`check.plugin` is a non-empty string ⇒ plugin rule) belongs to one layer, switched by the
config key `baseline_rules`.

- **Absent key ⇒ IN.** A config that never heard of this key behaves exactly as it did
  before the layer existed, and that is also the only safe direction.
- Opting out mutes those rules to `n/a`, out of the gate. `baselineLayerOf` resolves
  `false` and `null` to OUT; a `0`, a `"false"` string, an object, or anything else
  resolves IN. There is no spelling that silently hides a failing rule.
- **Never silent.** Muting is still a ROW: `--json` carries every muted rule by id with
  the reason, and the human report prints the layer's state on every run. Opting out is a
  decision on the record.
- `baseline trust setup --baseline-rules in|out` is the one thing that writes it.

## 4. No network on the check path — structurally

v3 closed the forge with a flag. v4 deleted the seam. The three forge-sourced rules
(`GOV-01`, `GOV-02`, `OPS-07`) and the lane world they read through are gone, so **no path
from `check` can reach `gh`, `curl` or `wget`** — the closure is the absence of the seam,
not a guard over it. `FORGE_CLOSED` survives in `src/check-run.mjs` only as a vestigial
reason string that nothing consumes.

`check` and `orient` share one pipeline (`indexRepo → resolveConfig → makeEvalCheck →
runRules`) so the two can never drift. **`orient` is the one exception to "no network":**
step 0 is `git pull --ff-only --quiet`, its only network act, and it degrades to a named
reason and exit 0 on any failure. `admit` and `reconcile` keep their own forge machinery
and do not come through this pipeline.

## 5. The stamp contract, and why it has two tiers

CI clones **tracked files only**. That is the whole problem the trust circle had to solve,
because most of what these tools produce is not tracked:

| member | artifact | visible to CI? | stamp |
|---|---|---|---|
| `obsidian-tdd` | `tdd.json`, tracked | yes | **none** — git's committer date is the fact |
| `graphify` | `graphify-out/`, gitignored | no | **verifiable** |
| `okf-rag` | `$BASELINE_OKF_BUNDLE`, outside the repo | no | **recorded only** |
| `my-onto` | does not exist | — | **silent** |

Stamps live at `.baseline/trust/<member>.json` and they are **baseline's files**, written
and maintained by `baseline trust stamp`, never the tools'. baseline owns the wiring for
every member of the circle.

**VERIFIABLE (graphify).** The stamp copies the per-file content hashes graphify already
recorded in its manifest, and `trust verify` — and `CTX-15` on the check path —
**recompute** them over the tracked code files in the tree. A stamp is not unforgeable, but
it can never assert a freshness the tree contradicts, which is the property a CI gate
actually needs. Scope is **code files only**, and the scope the stamp covered travels in the
stamp: `semantic_hash` moves when an LLM extraction changes, so gating on it would fire
"your graph is stale" at a tool upgrade.

**RECORDED ONLY (okf-rag).** The bundle is outside the repo and human-curated, so baseline
records "indexed as of commit X" and says, *on every surface that prints it, pass and fail
alike*, that it cannot check it. A passing row means "the claim is not self-evidently
stale", never "the store is fresh". The mechanism carries the distinction too, not just the
wording: `trust stamp` refreshes verifiable stamps on its own but re-records an unverifiable
claim **only** when the member is named with `--member`. Re-asserting something baseline
cannot check is a human act.

**Determinism.** Repo-relative posix keys sorted code-unit, hashes over raw worktree bytes,
and `.gitattributes` pins `* -text`. Same repo state ⇒ byte-identical stamp, here and in CI.

## 6. CTX-15..19 — the five new rules

One law over all five: **every answer is a pure function of the repo's committed state**,
so the same commit scores the same on a laptop and on a CI runner. That rules out mtimes
(`git clone` stamps every file with the checkout time — an mtime reads as maximally fresh
on the one machine that matters most) and leaves exactly two kinds of evidence: git's own
committer dates, and the stamps baseline commits. **There is no day threshold anywhere.**
"Behind" is an ORDERING; a number of days would be a policy baseline has no standing to
pick for someone else's repo.

- **CTX-15 `graph-not-lagging-code`** (kind `graph-stamp-fresh`) — graphify's stamp
  recomputed against the tracked code files. Every unreadable, missing or unrecognized
  manifest or stamp is `n/a`: the manifest's format is graphify's business, not a defect of
  the repo under check. An untracked stamp *is* a finding — CI would never see it.
- **CTX-16 `test-state-not-lagging-code`** (kind `artifact-not-lagging`) — the only member
  whose artifact is tracked, so no stamp: `tdd.json`'s commit must not **predate** the
  newest commit under `test_state_sources`. Committing the tests *with* the code gives them
  the same date, which is not earlier, so it passes — the discipline the rule protects must
  never read as a finding. The artifact's **content is never read**; only its commit date.
  An unset scope is `n/a` rather than a guess.
- **CTX-17 `knowledge-not-lagging-code`** (kind `stamp-not-lagging`) — orders the RECORDED
  commit against the newest commit under `knowledge_sources`. A recorded commit that is not
  in this history (a shallow clone, or a claim about another repo) is `n/a`, because a claim
  that cannot be ordered has not been shown to be stale. No retrieval, no embedding, no read
  of the bundle: **no verdict in this rule set depends on a retrieval.**
- **CTX-18 `ontology-not-lagging-code`** (kind `frozen`, severity `none`) — `my-onto` does
  not exist yet. The rule is declared so the roster is honest about the fourth member rather
  than quietly being three, emits nothing to a human, and resolves `n/a` with its reason in
  `--json` on every run. A tool that does not exist cannot be a gate, and pretending
  otherwise is an empty claim.
- **CTX-19 `orientation-entrypoint-present`** (kind `orient-entrypoint`) — the one context
  rule that is **not** about a plugin, so it belongs to the baseline layer, not the circle.
  **Identity, not existence**: the committed `.baseline/orient.sh` must be byte-identical to
  the one this baseline ships. `baseline trust wire` installs it. Absence is `n/a` (a repo
  that made no claim); present-but-untracked is a finding; drift is named as drift. Version
  skew is handled rather than hoped away: the target is always the version *this* baseline
  ships, and the entrypoint carries its own contract version, bumped only when the script
  changes.

Membership gates all four circle rules: a repo that never adopted the tool can never fail
them, and the `n/a` always carries the command that would change that.

## 7. What the deletions took with them

Rules were not deleted alone — their machinery went too, and `test/red/deletions.mjs`
holds the runner to it: no `src/` module implements an orphaned check kind, no module is
unreachable from `baseline.mjs` or `check.mjs`, and the registry in `src/evaluators.mjs`
is exactly the used set plus one **named** orphan (`doc-code-age`, kept because CTX-16
inherits its git-date arithmetic). `EXPECTED_RULE_COUNT` was deleted from the red harness
in the same pass: a hand-maintained count of a derivable fact is the very thing
`CTX-12-status-is-derived` used to forbid.

## 8. The docs are not an authority — the code is

The last thing v4 does is turn the principle on the repo's own prose.

- **All prose lives in one folder, `docs/`.** The exceptions are functional, not
  editorial, and each names its consumer: `SKILL.md` is the agent manifest the skill
  loader requires at the skill root and `install.sh` copies there; `README.md` is what
  GitHub renders on the repo page, and is now a short pointer into `docs/`;
  `hooks/README.md` and `config-presets/README.md` document the directories they ship
  inside; `LICENSE` is not prose. The v2-era work log moved too, to `docs/tasks/`.
- **`docs/` ships as a directory**, not as a hand-kept list of which pages are worth
  vendoring — that list would be one more fact to drift. It also keeps the vendored layout
  identical to the source layout, which `src/gen.mjs` depends on: it reads
  `docs/REFERENCE.md` and `docs/GLOSSARY.md` relative to its own directory.
- **Every page says so.** Each document under `docs/` opens by naming the code that
  decides its subject and stating that where the two disagree, the page is the bug.
- **`sources_of_truth` in `baseline.config.json` lists only code.** It used to name
  `REFERENCE.md`, `SKILL.md` and `GLOSSARY.md`. Prose cannot be a source of truth in a
  repo whose premise is that written promises are not to be trusted.
- **The derived stays derived.** `docs/REFERENCE.md`'s rule table and check-kind list are
  regenerated by `docs/assets/gen-reference-rules.mjs` (with `--check` as the CI drift
  guard); the diagrams by `docs/assets/gen-evaluate-stack.mjs`; marker-headed views by
  `baseline gen index` and `baseline gen --check`. None of them is hand-edited.
- **No doc states a count.** `test/red/surface.mjs` V32/V33 scan every tracked shipped
  file — the SVGs' alt text included — and fail on any `N rules` / `N check kinds` /
  `N blockers` literal that the rule set cannot derive. Only the changelog, the migration
  notes and the versioned plans under `docs/vN/` are exempt, because a count there is
  history rather than a claim about the current runner.

## 9. Where to look instead of here

| question | authority |
|---|---|
| how many rules, of what kinds, covering what? | `node check.mjs --self-check` |
| what does a rule check, and why? | `rules/*.json`, or `baseline explain <id>` |
| what may never change? | `test/red/` |
| what does this repo trust? | `node baseline.mjs trust setup --repo .` |
| why was a rule deleted? | [`rule-review.md`](rule-review.md) |
