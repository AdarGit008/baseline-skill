# Tasks — Issue #55

- [x] Task 1: decide the fork, in the issue, before code
  - Acceptance: #55 carries the chosen resolution order and why option (2) was declined.
  - Verify: comment on #55, posted before the first commit on this branch ✓
  - Files: none in-tree

- [x] Task 2: `resolveLane(repo, env)`
  - Acceptance: checkout wins; else `GITHUB_HEAD_REF`; else `GITHUB_REF_NAME` under
    `GITHUB_REF_TYPE=branch`; else null. Returns the basis with the name.
  - Verify: 9 flow assertions, all failing on the pre-fix resolver ✓
  - Files: `src/probe.mjs`

- [x] Task 3: both merge-time surfaces call it
  - Acceptance: `check.mjs` BRANCH and `admit.mjs` BRANCH derive from one function;
    no inline `process.env.GITHUB_HEAD_REF` survives outside `probe.mjs`.
  - Verify: `grep -rn GITHUB_HEAD_REF src/ *.mjs` → probe.mjs + reconcile's comment ✓
  - Files: `check.mjs`, `src/admit.mjs`

- [x] Task 4: the refusal is documented against the helper
  - Acceptance: `reconcile.mjs`'s comment names `resolveLane` and why it declines it;
    `probe.mjs` names `reconcile` as the deliberate dissenter.
  - Verify: both comments name the other site ✓
  - Files: `src/probe.mjs`, `src/reconcile.mjs`

- [x] Task 5: the run says which basis it resolved on
  - Acceptance: human report prints a lane line when basis ≠ checkout, naming the
    variable, the event, and that the tree is the merge result; `--json` carries
    `lane: { name, basis, event }`.
  - Verify: repro prints the lane line; golden shows zero detail changes ✓
  - Files: `check.mjs`, `src/report.mjs`

- [x] Task 6: regression cases
  - Acceptance: detached+`GITHUB_HEAD_REF` evaluates the family; both events agree on
    one commit; checkout beats env; `N/merge` and a tag push are not lanes; bare
    detached still SKIPs.
  - Verify: 13 new assertions pass; 9 of them fail under `git stash` control (the
    other 4 are over-reach guards — they SKIP correctly either way) ✓
  - Files: `test/flow/run.mjs`

- [x] Task 7: re-pin the golden corpus — NOT NEEDED
  - Acceptance: no rule's verdict changes.
  - Verify: `node test/golden/run.mjs --verify` → 18 fixtures identical to pins, no
    re-pin at all. The lane line prints only where the basis is not the checkout, and
    no fixture resolves from the environment ✓
  - Files: none

- [ ] Task 8 (next): #56 — REC-01 scores an append identically to a rewrite

- [x] Task 9: document the resolution order and its limit (`REFERENCE.md`)
