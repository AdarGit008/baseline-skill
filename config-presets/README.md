# Config presets

Ready-made `baseline.config.json` starting points. Pick the closest, copy it to your
repo root as `baseline.config.json`, then tune the paths/commands to your repo.

```bash
cp config-presets/node-service.json  /path/to/repo/baseline.config.json
```

Each preset only sets the keys that matter for its scenario and relies on sensible
defaults for the rest. The `_preset` / `_<key>` fields are inline notes — the runner
ignores any key starting with `_`. The full key reference lives in `../config.example.json`.

With no config file every pack is off and only the always-on rules run. A pack switches
on **only** from an explicit switch in this file: `project_type: "service"` for the
`service` pack, `makes_external_claims: true` for `claims`, a non-empty `decision_globs`
for `decisions`, and the `packs` list (legacy alias `profiles`; `--profile <pack>` on the
CLI) for any pack — the only switch there is for `descriptor` and `advanced`. Nothing in
the tree switches one on, and neither does the descriptor's `type`.

| Preset | `project_type` | For | Notable |
|---|---|---|---|
| [`node-service`](node-service.json) | `service` | A Node/TS web service or app | `project_type: service`, set explicitly, switches the `service` pack on (OPS-*: health check, structured logs, graceful shutdown, runbook); its `decision_globs` switch `decisions` on |
| [`python-library`](python-library.json) | `library` | An installable Python package | Always-on rules with the `service` pack off; ships `packs: []` — put `"advanced"` in it for SBOM/code-scanning |
| [`internal-tool`](internal-tool.json) | `node` | A CLI/script/utility with no claims | Lean: always-on rules only, every pack off |
| [`product-with-claims`](product-with-claims.json) | `service` | A product/launch that makes competitive or novelty claims | `makes_external_claims: true` switches the `claims` pack on (build-state, blast-radius, dated prior-art pass); `service` and `decisions` are on as well |

## Descriptor presets — `baseline.repo.json` (posture)

The files above are **config** presets (`baseline.config.json` — tuning: paths, commands,
thresholds, pack switches). The `*.repo.json` files below are **descriptor** presets — the
repo's declared *identity and posture* (`baseline.repo.json`, schema
[`../schema/repo.schema.json`](../schema/repo.schema.json)): what the repo is (`type`,
`lifecycle`, `maturity`) and what it declares about how work reaches it (`workflow`,
`anchoring`). A repo may carry **both** — the descriptor declares, the config tunes. A valid
descriptor's `type` supersedes filesystem auto-detection for rule applicability and switches
no pack on.

```bash
cp config-presets/multi-lane-agents.repo.json  /path/to/repo/baseline.repo.json
```

| Preset | `workflow` | For | Notable |
|---|---|---|---|
| [`multi-lane-agents`](multi-lane-agents.repo.json) | `multi-lane` | A repo that declares the multi-agent posture — one dev or a fleet pushing parallel agent branches against one origin | Declares `anchoring: strict`, the forge and default branch, a `lanes` block (branch namespace, lease horizon) and join keys. `orient` reads the `lanes` block for its lane view; the descriptor *states* the posture — no rule enforces a lane workflow |
| [`readiness-only`](readiness-only.repo.json) | `single-lane` | Just the readiness score — the repo declares no agent-workflow posture | The required keys only; `anchoring: off`, no `lanes` block |

Copying a descriptor preset is adoption's first act. The `DESC-*` rules are the `descriptor`
pack — on only when `packs` lists `"descriptor"` (or `--profile descriptor`); with the pack
on and no descriptor in the tree, `DESC-01` warns and names this copy as the fix.

After copying a preset, run a first score:

```bash
node /path/to/skill/check.mjs --repo /path/to/repo
```

Two dials worth knowing:
- **`makes_external_claims`** — `false` skips all CLAIM-* rules (most internal repos); `true` requires per-claim records under `records/claims/` (a legacy `docs/CLAIMS.json` monolith migrates via `baseline gen migrate-claims` — see `../MIGRATION.md`).
- **Opt-in `*_globs`** (`freshness_globs`, `generated_globs`, `grounding_docs`) — empty by default so those rules stay silent until you adopt the convention; switch them on with your real paths.
