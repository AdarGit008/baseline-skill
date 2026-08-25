# baseline-orient — Hermes Agent plugin

Opens each [Hermes Agent](https://github.com/NousResearch/hermes-agent) session with `baseline orient` — the baseline skill's five-line survey (`repo:` · `work:` · `graph:` · `knowledge:` · `score:`) — so a session starts from **derived** state instead of a hand-maintained status doc (C16). The Hermes twin of the Claude Code SessionStart hook in [`../../../hooks/`](../../../hooks).

It registers, via the standard `register(ctx)` entry point:
- **`/orient`** — a slash command that prints the survey on demand;
- **`on_session_start`** — a hook that runs the survey at session start.

Both shell out to `baseline.mjs orient`; the plugin holds no provider keys and does no network of its own. Orient's only network act is a `git pull --ff-only` before the survey; it never spawns `gh`, and it exits 0 always — a pull that cannot happen (no origin, unreachable, diverged) becomes a note, not a failure — so the hook can never block a session.

## What the five lines say

| line | source |
| --- | --- |
| `repo:` | name, HEAD, branch, and whether the pull happened |
| `work:` | `tdd.json` presence, tracked/ignored, age — metadata only, never its content |
| `graph:` | `graphify-out/` present or absent, and its age from mtime — the report is never opened |
| `knowledge:` | whether the okf bundle exists |
| `score:` | `check` run in-process with the forge closed: blocker + advisory counts (GOV-01/02 and OPS-07 resolve n/a) |

An absent graph is a suggestion, never a finding; nothing orient reports changes its exit code.

## Install

```bash
cp -r <baseline-skill>/integrations/hermes/baseline-orient  ~/.hermes/plugins/
hermes plugins enable baseline-orient
```

The plugin finds the baseline CLI automatically (an installed `~/.hermes/skills/.../baseline` or `~/.claude/skills/baseline`, or `baseline` on `PATH`); override with `BASELINE_CLI=/abs/path/baseline.mjs`. Needs Node ≥ 18 + git; `gh` is not required — orient never consults the forge.

## Provenance & the one caveat

Authored against the official hermes-agent plugin API — `register(ctx)` with
[`ctx.register_command(name, handler, description, args_hint)`](https://github.com/NousResearch/hermes-agent) and `ctx.register_hook(hook_name, callback)` where `hook_name` ∈ `VALID_HOOKS` (`on_session_start` is a member). It is **not** modelled on any third-party memory plugin: the plan's original `prefetch`/`system_prompt_block` sketch was memory-provider-specific (those are `MemoryProvider` methods, not general hooks), so this plugin uses the correct general surface.

**Verification status:** the `/orient` command surface is spec-confirmed and the plugin is authored to the documented API, but it has **not been runtime-tested in a live Hermes** (none was available at authoring time). The one detail to confirm on a real Hermes install is **how `on_session_start` injects a system-prompt block** — whether returning the survey string is consumed as context, or the hook should mutate a passed session/context object. Enable the plugin, start a session, and adjust `_on_session_start` in `__init__.py` if the injection mechanism differs. The command path (`/orient`) should work as-is.
