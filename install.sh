#!/usr/bin/env bash
# Install the baseline skill into an agent's skills directory.
# Usage:
#   ./install.sh                # Claude Code  -> ~/.claude/skills/baseline
#   ./install.sh --hermes       # Hermes       -> ~/.hermes/skills/software-development/baseline
#   ./install.sh <dest-dir>     # a custom directory
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT="claude"
case "${1:-}" in
  --hermes)      DEST="$HOME/.hermes/skills/software-development/baseline"; AGENT="hermes" ;;
  --claude|"")   DEST="$HOME/.claude/skills/baseline" ;;
  -*)            echo "error: unknown flag '$1' (use --hermes, --claude, or a directory path)." >&2; exit 2 ;;
  *)             DEST="$1" ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found — the baseline runner needs Node >= 18." >&2; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node $NODE_MAJOR found — the baseline runner needs Node >= 18." >&2; exit 1
fi

mkdir -p "$DEST"
for f in SKILL.md CONTRACT.md baseline.mjs check.mjs rules.json config.example.json README.md REFERENCE.md GLOSSARY.md; do
  cp "$SRC/$f" "$DEST/"
done
for d in src rules schema templates config-presets hooks integrations; do
  rm -rf "$DEST/$d"; cp -r "$SRC/$d" "$DEST/$d"
done

if node --check "$DEST/baseline.mjs" \
   && node --check "$DEST/check.mjs" \
   && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$DEST/rules.json" \
   && node "$DEST/baseline.mjs" check --self-check >/dev/null; then
  RULES="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; const { loadRules } = await import(pathToFileURL(process.argv[1])); console.log(loadRules().rules.length)' "$DEST/src/rules.mjs")"
  echo "OK Installed the baseline skill to $DEST ($RULES rules)."
  if [ "$AGENT" = "hermes" ]; then
    echo "   Start a NEW Hermes session (the skill loader is cached per session), then say 'run baseline' / 'score this repo'."
  else
    echo "   Restart Claude Code, then run /baseline (or 'run baseline') in any repo."
  fi
  echo "   Or run it directly:  node \"$DEST/check.mjs\" --repo /path/to/repo"
else
  echo "error: post-install smoke test failed (bad check.mjs or rules.json)." >&2; exit 1
fi
