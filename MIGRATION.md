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
