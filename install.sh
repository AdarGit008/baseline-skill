#!/usr/bin/env bash
# Install the /baseline skill into a Claude Code skills directory.
# Usage: ./install.sh [dest-dir]   (default: ~/.claude/skills/baseline)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$HOME/.claude/skills/baseline}"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found — the baseline runner needs Node >= 18." >&2; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node $NODE_MAJOR found — the baseline runner needs Node >= 18." >&2; exit 1
fi

mkdir -p "$DEST"
for f in SKILL.md check.mjs rules.json config.example.json README.md REFERENCE.md GLOSSARY.md; do
  cp "$SRC/$f" "$DEST/"
done
rm -rf "$DEST/templates"; cp -r "$SRC/templates" "$DEST/templates"

if node --check "$DEST/check.mjs" \
   && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$DEST/rules.json"; then
  RULES="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).rules.length)' "$DEST/rules.json")"
  echo "OK Installed the baseline skill to $DEST ($RULES rules)."
  echo "   Restart Claude Code, then run /baseline (or 'run baseline') in any repo."
  echo "   Or run it directly:  node \"$DEST/check.mjs\" --repo /path/to/repo"
else
  echo "error: post-install smoke test failed (bad check.mjs or rules.json)." >&2; exit 1
fi
