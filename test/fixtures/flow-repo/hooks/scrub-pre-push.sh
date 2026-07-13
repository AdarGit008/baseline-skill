#!/usr/bin/env bash
# fixture: a committed copy of baseline's pre-push scrub scaffold — REC-05's
# tree-visible evidence arm (install per clone: cp hooks/scrub-pre-push.sh .git/hooks/pre-push)
BASELINE_DIR="${BASELINE_DIR:-$HOME/.claude/skills/baseline}"
repo_root="$(git rev-parse --show-toplevel)" || exit 0
while read -r local_ref local_sha remote_ref remote_sha; do
  node "$BASELINE_DIR/baseline.mjs" scrub --repo "$repo_root" --pushed "$local_sha" </dev/null || exit 1
done
exit 0
