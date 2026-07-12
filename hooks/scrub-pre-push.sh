#!/usr/bin/env bash
# baseline pre-push scrub (M4c, CF6/FS4) — for a public repo, push is the deadline:
# scan the records/ content actually being pushed with the SAME scan API `baseline log`
# uses (one opinion about what a secret looks like). Deterministic secret shapes block
# the push (exit 1); heuristics warn and never block. This is one layer of defense in
# depth (REC-05 prefers delegating to GitHub push protection / gitleaks where present).
#
# Install (per clone):  cp hooks/scrub-pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
# The runtime lookup mirrors hooks/orient-session-start.sh; override with BASELINE_DIR.
#
# Honest failure mode: a missing runtime FAILS OPEN with a loud warning — a moved
# skill install must not brick every push; REC-02 in CI is the backstop that still
# sees what landed. (Documented residual risk, C34.)
BASELINE_DIR="${BASELINE_DIR:-$HOME/.claude/skills/baseline}"

if ! command -v node >/dev/null 2>&1 || [ ! -f "$BASELINE_DIR/baseline.mjs" ]; then
  echo "scrub-pre-push: baseline runtime not found (BASELINE_DIR=$BASELINE_DIR) — records NOT scanned this push" >&2
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel)" || exit 0
status=0
# stdin: "<local ref> <local sha> <remote ref> <remote sha>" per ref being pushed
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$local_sha" in *[!0]*) ;; *) continue ;; esac   # all-zero local sha = ref deletion, nothing pushed
  case "$remote_sha" in
    *[!0]*) node "$BASELINE_DIR/baseline.mjs" scrub --repo "$repo_root" --pushed "$local_sha" --since "$remote_sha" || status=1 ;;
    *)      node "$BASELINE_DIR/baseline.mjs" scrub --repo "$repo_root" --pushed "$local_sha" || status=1 ;;
  esac
done
exit $status
