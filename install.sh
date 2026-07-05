#!/usr/bin/env bash
# Install the /baseline skill into your Claude Code skills dir.
set -euo pipefail
DEST="${1:-$HOME/.claude/skills/baseline}"
mkdir -p "$DEST"
cp -r "$(dirname "$0")/"{SKILL.md,check.mjs,rules.json,config.example.json,README.md,templates} "$DEST/"
echo "Installed the baseline skill to $DEST"
echo "Restart Claude Code, then run /baseline (or 'run baseline') in any repo."
