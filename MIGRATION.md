# MIGRATION — a v2.5 repo onto the v3 contract

v3 deletes the lane workflow, the sign-off rules and the auto-armed packs, renames
every rule id, and changes the shape of `--json` and `orient`. Nothing here needs a
migrate command: each change is one config key, one deleted file, or one consumer
reading a different field. Run the score first — the findings name most of it —
then walk the table.

```bash
node /path/to/baseline-skill/check.mjs --repo .
```

| # | What changed | What you see | What to do |
|---|---|---|---|
| 1 | Rule ids are `PREFIX-NN-slug` | findings read `SEC-01-no-committed-secrets` | nothing — the v2 prefix still resolves |
| 2 | Packs switch on from config only | pack rules gone from the run | write the switch down in `baseline.config.json` |
| 3 | `tool` / `want` scope the run | a tool rule is `n/a` in `--json` | add `want` if you mean to have the tool |
| 4 | Three `PLUG` WARNs, a `plugins` key | `PLUG-01/02/03` WARN, a `.baseline/log/` path | install the plugin, or set its path and gitignore expectation |
| 5 | 21 rules and the `lane` verb deleted | `baseline lane` → `unknown command`; `gen lock` gone | remove the calls; delete the lock; retire sign-off records |
| 6 | `--json`: no `SKIP`, no `SIGN-OFF` | rows with `state`/`reason`; a smaller `summary` | read `state`, count `summary.total` |
| 7 | `orient` is five lines and pulls first | `repo:` `work:` `graph:` `knowledge:` `score:` | parse the labels or `--json`; `--strict` is a no-op |

## 1. Rule ids — three parts, the prefix unchanged

Every id is now `PREFIX-NN-semantic-slug` (`SEC-01-no-committed-secrets`,
`BUILD-05-task-1-passes-clean`, `CTX-12-status-is-derived`). The `PREFIX-NN`
half is byte-identical to 2.5.0, so a v2 id keeps working wherever it is matched
as a prefix: `baseline explain SEC-01` finds the rule, a CI grep on `SEC-01`
still hits the row, and the okf concept is `baseline/rules/sec-01-<slug>`. Only an
*exact* match on the two-part id breaks — search your CI scripts and dashboards
for `=== 'SEC-01'`-shaped comparisons and make them prefix matches. The scrub
allow-list is unaffected (it keys on finding hashes, not ids), and a judgment whose
`subject` is a rule id is read for no verdict any more — the `sign-off` kind clears
nothing (§5). The full table is `REFERENCE.md`.

## 2. Packs — write the switch down

v2 armed packs from the tree: `docs/CLAIMS.json` present → claims,
`project_type` detected or declared in the descriptor as `service` → service,
`baseline.repo.json` present → descriptor. **v3 arms a pack from
`baseline.config.json` alone; with no config file every pack is off.** If a
pack's rules vanished from your run, you were relying on an auto-arm. Add the
switch you mean:

```jsonc
{
  "makes_external_claims": true,        // claims pack (CLAIM-*)
  "decision_globs": ["docs/decisions/*.md"], // decisions pack (CTX-02/07/13/14)
  "project_type": "service",            // service pack (OPS-*) — detectType and the descriptor's type no longer count
  "profiles": ["descriptor", "advanced"] // any pack by name; alias "packs"; CLI: --profile <pack>
}
```

Delete `profile` / `requires` if you carry a vendored or forked rule file:
`--self-check` rejects them. Activating one pack never activates another, and a
pack blocker (CLAIM-00…03, CTX-02, CTX-14, DESC-02, DESC-03) can only fail CI while
its pack is on.

## 3. `tool` and `want` — scope by what the repo uses

A rule that reads a tool's artifact (today: REPRO-04 reads a `Dockerfile`,
`"tool": "docker"`) runs when the tool is detected in the tree or config `want`
names it. Without either it is an `n/a` row in `--json` (reason
`docker not detected in the tree (declare want:["docker"] to evaluate anyway)`)
and invisible to humans. If you want the rule *before* the artifact exists —
"this repo will ship a container" — declare it; `want` also overrides the
`applies_to` type gate, so a docs repo gets a real WARN, not `n/a`:

```json
{ "want": ["docker"] }
```

An unknown `want` name is printed on stderr and ignored.

## 4. Plugins — three WARNs and one config key

`PLUG-01-tdd-pi`, `PLUG-02-graphify` and `PLUG-03-okf-rag` are always on. Each is
one WARN — never a FAIL, never an exit-code change — when its artifact is absent
(the finding names the install command; baseline never runs it) or when git's
answer about the artifact differs from what config expects. Every WARN writes
`.baseline/log/<PREFIX-NN>.log` (the paths inspected, the config values and their
source, the git answer); the file is overwritten each run and removed on PASS.
Add `.baseline/log/` to `.gitignore` beside `.baseline/cache/`.

To clear a WARN, install the plugin — or, if the artifact already lives elsewhere
or you keep it tracked on purpose, say so:

```json
{
  "plugins": {
    "tdd-pi":   { "path": "tdd.json",      "ignored": false },
    "graphify": { "path": "graphify-out",  "ignored": true },
    "okf-rag":  { "path": "vendor/okf",    "ignored": true }
  }
}
```

`ignored: false` means *tracked*; the okf bundle defaults to `$BASELINE_OKF_BUNDLE`
and its gitignore question is skipped when that path is outside the repo. The
configured paths leave the file index, so SEC-01 / REC-02 over `**` never read
`tdd.json` and a gitignored graph never reaches CTX-05. baseline reads nothing
else about a plugin: existence, file-or-directory, mtime, gitignore state.

## 5. The deleted rules — what to remove on your side

- **Lanes.** `FLOW-01…09`, `DIV-01/02/03`, `MERGE-02` are gone and `baseline lane`
  is an unknown command (exit 2). Remove every `baseline lane …` call from your
  agent prompts and CI. Session records written by `baseline log` are untouched
  and still scrubbed (REC-02).
- **The lock.** `REC-06` and `baseline gen lock` are gone: delete
  `tools/baseline.lock.json` and the CI step that regenerated it. Re-vendoring the
  toolkit is a plain copy again.
- **Records history.** `REC-01` (append-only) and `REC-04` (one home) are gone;
  the `deviation` judgments you kept to sanction record edits can be deleted.
- **Sign-offs.** `TEST-03`, `TEST-04`, `TEST-06`, `CLAIM-05`, `CTX-04` are gone
  and the `signoff` check kind with them. A `sign-off` judgment now clears
  nothing — leave the records as history or delete them; nothing reads them for a
  verdict. `TEST-05`'s sign-off branch is gone too: it is a plain WARN or `n/a`.
- **REC-02 / REC-05 scan everything you commit**, not `records/`. A
  secret-shaped fixture anywhere in the tree is now their finding; allow it as a
  dated judgment (`baseline scrub <file> --allow <id> --allow-reason "..."`) —
  the finding id is a content hash, the secret is never stored.

The `log`, `jdg`, `scrub`, `admit` and `reconcile` verbs still ship in 3.0.0 and
still run; their removal with the `records/` tree is the next PR (`CHANGELOG.md`,
*Known follow-up*). Do not build new automation on them.

## 6. CI consumers of `--json`

- A `results[]` row is one of two shapes: **evaluated** — `{ id, category,
  severity, pack, tag, detail }` with `tag` ∈ `PASS` / `WARN` / `FAIL` /
  `DIVERGED` (a `PLUG` WARN also carries `log`) — or **not applicable** —
  `{ id, category, severity, pack, state: "n/a", reason }` with no `tag`. There
  is no `SKIP` and no `SIGN-OFF` tag. A rule whose gate missed (wrong type,
  inactive pack) is **absent** from `results` altogether.
- `summary` is `{ blockers, pass, warn, fail, diverged, total }` and **`total`
  counts evaluated rows only**; the `skip` and `signoff` keys are gone. A
  dashboard that computed a percentage from `total` will see the denominator drop.
- `packs` lists the active packs (`profiles` mirrors it); `provenance.knowledge`
  is `"not-consulted"` — `check` never reads the knowledge bundle.
- `GOV-01`, `GOV-02`, `OPS-07` are `n/a` with reason `forge not consulted` under
  `check` — `gh` is never spawned there. If you gated on those three rows, move
  the check to `admit` or `reconcile`, which keep the live probe.
- Exit code: 1 only on an always-on blocker or an active-pack blocker; `orient`
  always exits 0.

## 7. `orient` consumers

`orient` prints exactly five labelled lines — `repo:`, `work:`, `graph:`,
`knowledge:`, `score:` — and nothing else on stdout. Its first act is
`git pull --ff-only` (its only network act; a failed pull is a note on the `repo:`
line, no stash, no other write, still exit 0); `gh` is never spawned; `--strict`
is retired (accepted, a one-line stderr note, no effect). `--json` is `{ repo, work, graph, knowledge, score,
notes, suggestions }` — `score` is the same object `check` computes. A hook that
parsed the v2 survey (forge state, lane list, divergence) has nothing left to
parse: `orient` reads plugin metadata and the score, nothing more. The
SessionStart hook no longer ships by default — `./install.sh --with-session-hook`
copies it, and wiring it stays by hand.

## 8. Score clean

```bash
node /path/to/baseline-skill/check.mjs --repo .
```

Expect the three `PLUG` rows green or knowingly WARN, no pack you did not switch
on, and `summary.total` equal to the rows you can see. Commit the config change
through your normal gate.

---

The V1 → V2 material below is kept as history. Its steps 1, 2 and 4 still apply
to a repo arriving from V1; step 3 (re-minting sign-offs) no longer buys anything —
the sign-off rules are gone — and step 5's `baseline lane claim` is the verb this
release removed.

# MIGRATION — a V1-shaped repo onto the V2 contract

V1 stored its state in four artifacts the V2 contract retired. Each one has a
**detector** — run the score and the findings themselves walk you through this
migration — and every step below is an **existing command**. There is no
`fix`/migrate command, deliberately: the whole path is four small, reviewable
acts, and a doc you can audit beats a mutation you have to trust.

```bash
node /path/to/baseline-skill/check.mjs --repo .
```

| # | V1 artifact | Detector | Exit |
|---|---|---|---|
| 1 | No `baseline.repo.json` descriptor | **DESC-01** (warn + the copy recipe) | copy a posture preset |
| 2 | Hand-maintained status stamp in a doc | **CTX-12** (blocker: the line-anchored stored-status signature) | delete the stamp line |
| 3 | `.project-baseline/signoff.json` ledger | the **manual rules** read "no sign-off recorded" (the legacy read is retired) | re-mint via `baseline jdg new` |
| 4 | `docs/CLAIMS.json` monolith | **CLAIM-07** (the migration tripwire) + the CLAIM rules point here | `baseline gen migrate-claims` |

## 1. Declare the repo — the descriptor

Copy the closest posture preset to the repo root and set the identity fields:

```bash
cp /path/to/baseline-skill/config-presets/multi-lane-agents.repo.json  baseline.repo.json
# readiness-only.repo.json for the V1-equivalent single-lane posture
```

Set `type`, `lifecycle`, `maturity`, `workflow`, `anchoring` (schema:
`schema/repo.schema.json`; keys starting with `_` are ignored notes — and if
you are coming from an early-V2 descriptor rather than bare V1, drop the
retired `owner` key while here: the schema no longer knows it). The
descriptor is the **change-controlled** file — after adoption, edits to it need a
same-PR judgment (DESC-03). Tuning stays in `baseline.config.json`, which is free
to edit; the two files are separate **by contract, finally** (see CONTRACT.md).

While there: V1 config keys `status_file` and `signoff_file` are inert now —
delete them from `baseline.config.json` if present.

## 2. Delete the status stamp — state is derived

Find the stamp CTX-12 flags (a doc line beginning with the marker
`last-verified:` — V1's hand-maintained freshness receipt) and **delete the
line** (or the whole status doc, if that was its only job). The finding counts
every match and names the first files — including, on a repo that vendors an
old copy of this toolkit,
the retired `templates/start-here.md` inside the vendored tree: delete that
line too (or re-vendor to current, which drops the retired scaffold). Its job
moved to derivation:

```bash
node /path/to/baseline-skill/baseline.mjs orient --repo .
```

Orient computes what the stamp hand-promised: tree + history + forge, fresh at
read time, collision-free under concurrent lanes.

## 3. Re-mint surviving sign-offs — the judgment ledger

For each entry in the legacy `signoff.json` that still holds, record a dated,
expiring judgment (subject = the rule id), then delete the legacy file:

```bash
node /path/to/baseline-skill/baseline.mjs jdg new --kind sign-off --subject CTX-04 \
  --reason "why this judgment stands (carry the original date in the text)" \
  --review-by 2027-01-19 --by your-handle
git rm .project-baseline/signoff.json
```

A sign-off that nobody can re-justify today should not survive the move — that
is the point of re-minting rather than converting mechanically.

## 4. Explode the claims monolith (only if you have one)

```bash
node /path/to/baseline-skill/baseline.mjs gen migrate-claims --repo .
# review the generated records/claims/CLM-*.json, commit them, then:
git rm docs/CLAIMS.json
```

The checker reads **records only**; CLAIM-07 keeps flagging the monolith until
it is gone. `gen migrate-claims` is idempotent by slug — safe to re-run.

## 5. Score clean

```bash
node /path/to/baseline-skill/check.mjs --repo .
```

Expect the four detectors green. Commit everything on a branch and merge through
your normal gate — on a multi-lane repo that is `baseline lane claim` →
work → `baseline log` → push → admit.

---

**Worked example.** `baseline-demo` carries the tag **`pre-v2`** on its last
pre-descriptor commit — the repo exactly as V1 left it (stamped status doc,
legacy sign-off ledger). A fresh clone of that tag, migrated with this document
alone, scores clean V2; the transcript rides the M7b PR. To replay it:

```bash
git clone --branch pre-v2 https://github.com/AdarGit008/baseline-demo demo-migration
cd demo-migration && node /path/to/baseline-skill/check.mjs --repo .
# then steps 1–4 as the findings direct
```
