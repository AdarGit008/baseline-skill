# Ship — Issue #52

The backlog is filed. #52's ship criterion — every reproduced finding either filed with
an issue number in the tracker's table, or explicitly declined with the reason recorded
there — is met.

## What was filed

| Rank | Issue | Finding | Label |
|------|-------|---------|-------|
| 1 | #54 | FLOW-03/05 + DIV-02 pick the lane's newest record by filename sort | bug |
| 2 | #55 | Every lane rule is inert on the `pull_request` event | bug |
| 3 | #56 | REC-01 scores an append identically to a rewrite | enhancement |
| 4 | #57 | ADR amendment edges are read by no rule | enhancement |

Each was posted from its draft under `tasks/issues/F1…F4-*.md` unchanged, in rank order.

## Corroboration posted

- **#49** — the ADR-0027 near-miss (2026-08-16) and the ADR-0035 double-landing
  (2026-08-17, PRs #298/#303), from `tasks/issues/comment-49.md`.
- **#50** — two further instances of its mechanism (`lane/113` s4, `lane/266` s5),
  from `tasks/issues/comment-50.md`.

Both drafts named their sibling finding as "drafted as its own issue under #52"; that
sentence was rewritten to the real number (#55 on #49, #54 on #50) so the cross-links
resolve. No other change to any draft.

## The tracker

#52's findings table carries an issue number in every filed row, the child-issue
deliverable is checked, and the "drafted, unposted" wording is gone. The five recorded
candidates and the stated limits of the read stay where they are — they are the read's
output, not a backlog.

## Next

Task 11: take F1 (#54). Its fork — frontmatter `record:` ordinal vs. commit order vs. a
naming convention — is decided in the issue before code is written.
