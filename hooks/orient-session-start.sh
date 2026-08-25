#!/usr/bin/env bash
# Claude Code SessionStart hook — opens every session with `baseline orient`, so
# orientation is infrastructure, not remembered discipline (C16). The survey's five lines
# (repo · work · graph · knowledge · score) are injected into the session's starting context.
#
# Non-fatal by construction: orient always exits 0 (a pull that cannot happen, a missing
# plugin artifact, a failing blocker — each is a fact on its line, never a refusal), and
# this wrapper swallows any remaining error so a hook can never block a session. Opt-in:
# install.sh --with-session-hook wires it — see hooks/README.md.
BASELINE_DIR="${BASELINE_DIR:-$HOME/.claude/skills/baseline}"
node "$BASELINE_DIR/baseline.mjs" orient --repo "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || true
