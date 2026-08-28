# baseline-orient — Pi extension

Opens each [Pi](https://pi.dev/) session with `baseline orient` — the baseline skill's five-line survey (`repo:` · `work:` · `graph:` · `knowledge:` · `score:`) — so a session starts from **derived** state instead of a hand-maintained status doc (C16). The Pi twin of the Claude Code SessionStart hook in [`../../../hooks/`](../../../hooks) and the Hermes plugin in [`../../hermes/baseline-orient/`](../../hermes/baseline-orient).

It registers, through the standard default-export factory `(pi: ExtensionAPI) => void`:
- **`/orient`** — a command that prints the survey on demand;
- **`session_start`** — runs the survey when a session opens, and the first **`before_agent_start`** injects it as context (`session_start` has no injection channel of its own).

Both shell out to `baseline.mjs orient`; the extension holds no provider keys and does no network of its own. Orient's only network act is a `git fetch` before the survey; it never spawns `gh`, never changes a file, branch or history, and exits 0 always — a fetch that cannot happen (no origin, unreachable) becomes a note, not a failure — so the extension can never block a session.

## What the five lines say

| line | source |
| --- | --- |
| `repo:` | name, HEAD, branch, and whether the fetch happened |
| `work:` | `tdd.json` presence, tracked/ignored, age — metadata only, never its content |
| `graph:` | `graphify-out/` present or absent, and its age from the committed stamp |
| `knowledge:` | whether the okf bundle exists |
| `score:` | `check` run in-process with the forge closed: blocker + advisory counts |

An absent graph is a suggestion, never a finding; nothing orient reports changes its exit code.

## Install

```bash
./install.sh --pi                                              # the skill -> ~/.pi/agent/skills/baseline
cp -r <baseline-skill>/integrations/pi/baseline-orient  ~/.pi/agent/extensions/
```

Pi auto-discovers `~/.pi/agent/extensions/*/index.ts` at startup and runs it through jiti — no build step, and the only import here is `import type`, so nothing is installed at runtime. For a project-local install use `.pi/extensions/baseline-orient/` instead; for a one-off, `pi -e ./integrations/pi/baseline-orient/index.ts`.

The extension finds the baseline CLI automatically (an installed `~/.pi/agent/skills/baseline`, `~/.hermes/skills/.../baseline` or `~/.claude/skills/baseline`, or `baseline` on `PATH`); override with `BASELINE_CLI=/abs/path/baseline.mjs`. Needs Node ≥ 18 + git; `gh` is not required — orient never consults the forge.

## The wired entrypoint

A repo wired by `baseline trust wire` carries its own `.baseline/orient.sh`, and CTX-19 gates it on **byte-identity** with the copy the installed baseline ships. This extension prefers that entrypoint — otherwise CI would verify a script no session runs — but only after checking the identity **itself**, here, at the moment of use: the file is committed, so a hostile clone could carry anything under that name, and CTX-19 catches drift when `check` runs, which is not when a session opens one. Identical bytes → run the repo's entrypoint; anything else, including no entrypoint at all → run the installed CLI. `test/red/surface.mjs` (V34) pins that behaviour for all three shipped callers.

## Provenance & the one caveat

Authored against Pi's documented extension API — a default-export factory taking `ExtensionAPI`, `pi.on("session_start" | "before_agent_start", …)`, and `pi.registerCommand(name, { description, handler })` — see [`packages/coding-agent/docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md). It runs the survey through `node:child_process` rather than `pi.exec` so the `BASELINE_DIR` env override and the 30 s timeout are exactly the documented Node contract, matching the Hermes twin.

**Verification status:** authored to the documented API but **not runtime-tested in a live pi** (none was available at authoring time). The detail to confirm on a real install is **how `before_agent_start`'s returned `message` surfaces** — whether the returned `{ message: { customType, content, display } }` is consumed as context as documented, or the survey should instead be pushed with `pi.sendMessage`. Enable the extension, start a session, and adjust the handler in `index.ts` if the injection shape differs. The `/orient` command path should work as-is.
