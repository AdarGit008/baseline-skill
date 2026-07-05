# Config presets

Ready-made `baseline.config.json` starting points. Pick the closest, copy it to your
repo root as `baseline.config.json`, then tune the paths/commands to your repo.

```bash
cp config-presets/node-service.json  /path/to/repo/baseline.config.json
```

Each preset only sets the keys that matter for its scenario and relies on sensible
defaults for the rest. The `_preset` / `_<key>` fields are inline notes — the runner
ignores any key starting with `_`. The full key reference lives in `../config.example.json`.

| Preset | `project_type` | For | Notable |
|---|---|---|---|
| [`context-management`](context-management.json) | `docs` | Docs/knowledge repos where keeping context true over time is the point | Turns the CONTEXT rules **up** (freshness, grounding, generated-provenance, sources-of-truth, symbol resolution); skips build/test |
| [`node-service`](node-service.json) | `service` | A Node/TS web service or app | Auto-enables the OPS rules (health check, structured logs, graceful shutdown, runbook) |
| [`python-library`](python-library.json) | `library` | An installable Python package | Build/test/quality/repro; no OPS; add `advanced` for SBOM/scanning |
| [`internal-tool`](internal-tool.json) | `node` | A CLI/script/utility with no claims | Lean; CLAIM-* and OPS off; stamp lives in the README |
| [`product-with-claims`](product-with-claims.json) | `service` | A product/launch that makes competitive or novelty claims | Turns CLAIM-* discipline **on** (build-state, blast-radius, dated prior-art pass) |

After copying a preset, run a first score:

```bash
node /path/to/skill/check.mjs --repo /path/to/repo
```

Two dials worth knowing:
- **`makes_external_claims`** — `false` skips all CLAIM-* rules (most internal repos); `true` requires a `docs/CLAIMS.json` register.
- **Opt-in `*_globs`** (`freshness_globs`, `generated_globs`, `grounding_docs`) — empty by default so those rules stay silent until you adopt the convention. The `context-management` preset switches them on with example paths — replace with your real ones.
