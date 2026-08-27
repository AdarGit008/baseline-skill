#!/usr/bin/env sh
# baseline-orient-entrypoint: 1
#
# THE ORIENTATION ENTRYPOINT — baseline owns this file.
#
# It is installed by `baseline trust wire`, committed to the repo, and checked by CTX-19:
# the committed copy must be BYTE-IDENTICAL to the one the installed baseline ships, so a
# reader can know that every baseline-activated repo opens the same way. That is the whole
# point — mere existence proves nothing, identity does. Editing it locally is the failure
# mode CTX-19 names by hand; to change it, take a newer baseline and rerun `baseline trust
# wire`. The marker line above is this script's own contract version, bumped only when this
# file changes, so an ordinary baseline release never makes a wired repo look drifted.
#
# What it does: prints the five-line derived survey (repo · work · graph · knowledge ·
# score) for the repo it lives in. It cannot fail — orient exits 0 whatever it finds, and
# this wrapper swallows anything left, so an entrypoint can never block a session, a hook
# or a script that sources it.
set -e
REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BASELINE_DIR="${BASELINE_DIR:-$HOME/.claude/skills/baseline}"
node "$BASELINE_DIR/baseline.mjs" orient --repo "$REPO" 2>/dev/null || true
