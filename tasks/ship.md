# Ship — Issue #54

Ready. The rank-1 finding from the #52 backlog is fixed at its single source: one
selector, three consumers (FLOW-03, FLOW-05, DIV-02).

## Ship criteria

- [x] The lane's newest record is selected by something other than filename sort
- [x] A later-written record that sorts earlier is still read (regression case)
- [x] DIV-02 can no longer be silently blinded by the wrong pick
- [x] Every finding names the record it read and the basis it chose on
- [x] No verdict changes in the golden corpus — details only
- [x] Full suite green; self-check green; no blockers

## Next

Task 7: #55 — every lane rule is inert on the `pull_request` event. Rank 2 of the
#52 backlog, and the one whose blast radius is the merge gate itself.
