# Hooks — orientation as infrastructure

`orient-session-start.sh` runs `baseline orient` at Claude Code **SessionStart**, so every
session opens with a derived-state survey instead of reconstructing state from a status doc
(C16). It's non-fatal: orient degrades every unreachable plane to a note, and the wrapper
swallows any remaining error, so a hook can never block a session.

## Wire it into Claude Code

Add to `~/.claude/settings.json` (merge with any existing `hooks`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/skills/baseline/hooks/orient-session-start.sh" }
        ]
      }
    ]
  }
}
```

The command's stdout is added to the session's starting context. If you installed the skill
elsewhere, set `BASELINE_DIR` in the environment or edit the path in the script.

## Hermes

The Hermes `prefetch` / `system_prompt_block` plugin that runs orient as a session-start
block is a later slice (it needs the Hermes plugin API). Until then, `SKILL.md`'s
**Orientation — the first act** directive is the tool-agnostic fallback (C28).
