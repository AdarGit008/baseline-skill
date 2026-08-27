# Hooks — the pre-push scrub, and an opt-in session-start orient

Two scripts live here. One ships with every install; the other is opt-in.

## `scrub-pre-push.sh` — ships by default

A git **pre-push** hook: it scans the `records/` content in every outgoing range with the
same scan API `baseline log` uses — deterministic secret shapes block the push, heuristics
warn. It covers hand-written records, which never met `log`'s write-time gate; for a public
repo, push is the deadline. Install per clone:

```sh
cp hooks/scrub-pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

Failure modes are honest: a missing baseline runtime fails OPEN with a loud warning
(REC-02 in CI still sees what landed) — and so does a scrub **error**: exit >= 2 or a
crash is an environment problem, not a finding, so the hook prints a loud warning and
lets the push through; only exit 1 (real findings) blocks. A blocked push prints each
finding id, and a true false-positive is cleared with a dated judgment:
`baseline scrub --allow <finding-id> --allow-reason "..."` — commit the allowlist and
push again. `git push --no-verify` skips this hook; repos using `core.hooksPath`
(husky et al.) must install into that directory; server-side push protection is the
layer that cannot be skipped. REC-05 PASSes on at-rest evidence of a push-time gate:
gitleaks-class config, or this hook committed into the repo's `hooks/`. `.baseline/log/` (the
per-run logs a plugin WARN leaves, v3 §11 D10) is gitignored beside `.baseline/cache/` and never
reaches a pushed range.

## `orient-session-start.sh` — opt-in (`--with-session-hook`)

Runs `baseline orient` at Claude Code **SessionStart**, so a session opens with the
five-line derived survey (repo · work · graph · knowledge · score) instead of a status
doc. It is non-fatal: orient exits 0 whatever it finds, and the wrapper swallows any
remaining error, so a hook can never block a session.

It also never surprises you with a moved branch. baseline's git boundary is that it
changes no file, no branch and no history: orient `git fetch`es, reports how far behind
origin you are as a warning, and leaves the pull to you.

**The default install does not ship it.** `install.sh` copies this script (and the
Hermes twin under `integrations/hermes/baseline-orient/`) only when asked:

```sh
./install.sh --with-session-hook                 # Claude Code default location
./install.sh --with-session-hook /custom/path    # any skills dir
./install.sh --hermes --with-session-hook        # Hermes, plus the plugin twin
```

Even then nothing is wired for you — `install.sh` never edits an agent's own config.
To wire it into Claude Code, add to `~/.claude/settings.json` by hand (merge with any
existing `hooks`):

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

The command's stdout is added to the session's starting context. If you installed the
skill elsewhere, set `BASELINE_DIR` in the environment or edit the path in the script.

### Hermes

The Hermes twin, [`../integrations/hermes/baseline-orient/`](../integrations/hermes/baseline-orient),
is a plugin whose `on_session_start` hook + `/orient` command run the same `baseline orient`.
It ships under the same `--with-session-hook` flag. Without either hook, `SKILL.md`'s
**orient** mode is the tool-agnostic fallback: the agent runs the survey itself.
