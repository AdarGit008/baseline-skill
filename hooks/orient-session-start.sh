#!/usr/bin/env bash
# Claude Code SessionStart hook — opens every session with `baseline orient`, so
# orientation is infrastructure, not remembered discipline (C16). The survey's five lines
# (repo · work · graph · knowledge · score) are injected into the session's starting context.
#
# WHICH orient runs, and why it matters. A repo wired by `baseline trust wire` carries its
# own entrypoint at .baseline/orient.sh, and CTX-19 gates it on BYTE-IDENTITY with the copy
# the installed baseline ships. This hook prefers that entrypoint — otherwise CI would be
# verifying a script no session ever runs, and the rule would guard nothing.
#
# But it runs it only after checking the identity ITSELF, here, at the moment of use. The
# file is committed, so a hostile clone could carry anything under that name; CTX-19 catches
# drift when `check` runs, which is not when a session opens one. So: identical bytes -> run
# the repo's entrypoint (the path CI verified is now the path sessions take); anything else,
# including no entrypoint at all -> run the installed CLI directly. Both do the same thing
# when the repo is honest, and the fallback is never worse than what this hook did before.
#
# Non-fatal by construction: orient always exits 0 (a fetch that cannot happen, a missing
# plugin artifact, a failing blocker — each is a fact on its line, never a refusal), and
# this wrapper swallows any remaining error so a hook can never block a session. Opt-in:
# install.sh --with-session-hook wires it — see hooks/README.md.
BASELINE_DIR="${BASELINE_DIR:-$HOME/.claude/skills/baseline}"
REPO="${CLAUDE_PROJECT_DIR:-$PWD}"

WIRED="$REPO/.baseline/orient.sh"
SHIPPED="$BASELINE_DIR/templates/orient.sh"

if [ -f "$WIRED" ] && [ -f "$SHIPPED" ] && cmp -s "$WIRED" "$SHIPPED"; then
  BASELINE_DIR="$BASELINE_DIR" sh "$WIRED" 2>/dev/null || true
else
  node "$BASELINE_DIR/baseline.mjs" orient --repo "$REPO" 2>/dev/null || true
fi
