# Ship — Issue #57

Ready. Rank 4 of the #52 backlog, and the last of the four. It went in wider than filed:
the issue is that amendment edges are unchecked, and reading them properly turned up a
blocker-severity false positive on the repo's own ADR template.

## Ship criteria

- [x] `Amends:` / `Amended-by:` are read — by a parser, a rule, and a schema field
- [x] Every declared edge resolves against the tree, whatever the verb
- [x] A wrapped declaration is read whole; parenthesised commentary declares nothing
- [x] A one-way amendment is reported, naming both records
- [x] A dangling amendment is reported once, by CTX-07 only
- [x] A corpus with history adopts through the existing judgment route, with expiry
- [x] `Superseded-by: ADR-NNNN` — the shipped template's spelling — is a forward link
- [x] Nothing that passed before now fails: the phrase fallback survives
- [x] One reader for relations, statuses and header fields
- [x] Every re-pinned row accounted for; no other verdict moves
- [x] Full suite green; self-check green; no blockers

## The gap this closes, in the words of the repo that had it

> None of these was found by a check. Every one was found by a person or an agent
> re-reading.

18 amendment edges, 15 of them one-way, on a 36-ADR corpus — against 4 supersede-shaped
edges, which were the only ones any rule looked at.

## Next

The #52 backlog is empty. **#49** — two lanes can author the same decision-record
number, and nothing reports it — is the remaining open issue, and it shares this one's
substrate: a header parser that reads the whole declaration. It was filed as adjacent
and separable, and it still is.
