# Security policy

> **A policy, not a description of the runner.** The scope below is what we commit to;
> what the code actually does is in `check.mjs` and `src/`, and a mismatch is a report worth filing.

The `/baseline` runner is a zero-dependency Node script that runs **locally** and
**read-only** over a repository — it installs nothing. `check` makes no network call and
never spawns `gh` (the forge is closed under `check` and `orient`); the plugin artifacts it
reports on (`tdd.json`, `graphify-out/`, the okf bundle) are read as metadata only — never
opened. Its attack surface is small, but we still take reports seriously.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** via GitHub security advisories:
<https://github.com/AdarGit008/baseline-skill/security/advisories/new>

Do **not** open a public issue for a security report. We aim to acknowledge within a
few days and will coordinate a fix and disclosure with you.

## Scope

In scope: the runner (`check.mjs`, `baseline.mjs`, `src/`) and the installer (`install.sh`)
— e.g. a crafted repo or config that causes command execution, path traversal outside the
target repo, a read of a plugin artifact's content during `check` or `orient`, a write
anywhere but `.baseline/` under the target repo, or a crash that isn't degraded to an `n/a`
row. Out of scope: findings that require the user to run the tool against a repository
they already fully trust with `--no-exec` omitted (running an untrusted repo's bootstrap
command is the documented risk BUILD-05 covers).
