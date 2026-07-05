# Security policy

The `/baseline` runner is a single zero-dependency Node script that runs **locally**
and **read-only** over a repository — it installs nothing and makes no network calls.
Its attack surface is small, but we still take reports seriously.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** via GitHub security advisories:
<https://github.com/AdarGit008/baseline-skill/security/advisories/new>

Do **not** open a public issue for a security report. We aim to acknowledge within a
few days and will coordinate a fix and disclosure with you.

## Scope

In scope: the runner (`check.mjs`) and the installer (`install.sh`) — e.g. a crafted
repo or config that causes command execution, path traversal outside the target repo,
or a crash that isn't degraded to a `SKIP`. Out of scope: findings that require the
user to run the tool against a repository they already fully trust with `--no-exec`
omitted (running an untrusted repo's bootstrap command is the documented risk BUILD-05
covers).
