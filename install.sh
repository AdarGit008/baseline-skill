#!/usr/bin/env bash
# Install the baseline skill into an agent's skills directory.
# Usage:
#   ./install.sh                              # Claude Code  -> ~/.claude/skills/baseline
#   ./install.sh --hermes                     # Hermes       -> ~/.hermes/skills/software-development/baseline
#   ./install.sh --pi                         # Pi           -> ~/.pi/agent/skills/baseline
#   ./install.sh <dest-dir>                   # a custom directory
#   ./install.sh --with-session-hook [<dest>] # also ship the SessionStart orient hook (opt-in)
#
# The default install ships NO session-start wiring: hooks/orient-session-start.sh and the
# Hermes and Pi twins under integrations/ are copied only with --with-session-hook, and even then
# nothing is wired — wiring is a by-hand edit of the agent's own config (hooks/README.md).
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="claude"
DEST=""
WITH_SESSION_HOOK=0
for arg in "$@"; do
  case "$arg" in
    --with-session-hook) WITH_SESSION_HOOK=1 ;;
    --hermes)            DEST="$HOME/.hermes/skills/software-development/baseline"; AGENT="hermes" ;;
    --pi)                DEST="$HOME/.pi/agent/skills/baseline"; AGENT="pi" ;;
    --claude)            DEST="$HOME/.claude/skills/baseline" ;;
    -*)                  echo "error: unknown flag '$arg' (use --hermes, --pi, --claude, --with-session-hook, or a directory path)." >&2; exit 2 ;;
    *)                   DEST="$arg" ;;
  esac
done
[ -n "$DEST" ] || DEST="$HOME/.claude/skills/baseline"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found — the baseline runner needs Node >= 18." >&2; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node $NODE_MAJOR found — the baseline runner needs Node >= 18." >&2; exit 1
fi

mkdir -p "$DEST"
for f in SKILL.md baseline.mjs check.mjs rules.json config.example.json README.md; do
  cp "$SRC/$f" "$DEST/"
done
# docs/ ships as a DIRECTORY, not as a hand-kept list of which pages are worth vendoring.
# Two reasons: src/gen.mjs reads docs/REFERENCE.md and docs/GLOSSARY.md relative to its own
# directory, so the vendored layout has to match the source layout or the read comes back
# empty; and every relative link in the vendored README then resolves exactly as it does
# here. A list of "the docs that ship" would be one more hand-maintained fact to drift.
for d in src rules schema templates config-presets docs; do
  rm -rf "$DEST/$d"; cp -r "$SRC/$d" "$DEST/$d"
done
# hooks/: the pre-push scrub hook and its README always ship; the session-start hook is opt-in
rm -rf "$DEST/hooks" "$DEST/integrations"
mkdir -p "$DEST/hooks"
cp "$SRC/hooks/README.md" "$SRC/hooks/scrub-pre-push.sh" "$DEST/hooks/"
if [ "$WITH_SESSION_HOOK" = 1 ]; then
  cp "$SRC/hooks/orient-session-start.sh" "$DEST/hooks/"
  cp -r "$SRC/integrations" "$DEST/integrations"
fi

if node --check "$DEST/baseline.mjs" \
   && node --check "$DEST/check.mjs" \
   && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$DEST/rules.json" \
   && node "$DEST/baseline.mjs" check --self-check >/dev/null; then
  RULES="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; const { loadRules } = await import(pathToFileURL(process.argv[1])); console.log(loadRules().rules.length)' "$DEST/src/rules.mjs")"
  echo "OK Installed the baseline skill to $DEST ($RULES rules)."
  if [ "$AGENT" = "hermes" ]; then
    echo "   Start a NEW Hermes session (the skill loader is cached per session), then say 'run baseline' / 'score this repo'."
  elif [ "$AGENT" = "pi" ]; then
    echo "   Restart pi (skills are scanned at startup), then run /skill:baseline (or say 'run baseline')."
  else
    echo "   Restart Claude Code, then run /baseline (or 'run baseline') in any repo."
  fi
  echo "   Or run it directly:  node \"$DEST/check.mjs\" --repo /path/to/repo"
  if [ "$WITH_SESSION_HOOK" = 1 ]; then
    echo "   Session-start hook shipped to $DEST/hooks/orient-session-start.sh — wire it by hand, see $DEST/hooks/README.md"
  fi
else
  echo "error: post-install smoke test failed (bad check.mjs or rules.json)." >&2; exit 1
fi
