---
draft: true
target: AdarGit008/baseline-skill
labels: [enhancement]
title: "REC-01 scores an append identically to a rewrite, so a repair and a falsification read the same"
tracker: "#52"
rank: 3
follows: "#47 (the sanctioned-edit route — this is the residual)"
---

## What this is not

**#47 landed the sanctioned route** and it works: a mutation covered by an unexpired
sign-off / deviation / risk-acceptance whose subject glob-matches the path is reported
as sanctioned and excluded from the count. This issue is not a re-filing of that. It
is the half #47 deliberately did not touch — **what the finding says about a mutation
before anyone judges it.**

## Symptom

REC-01 reports a count and three example lines:

```
WARN      REC-01    Committed records are append-only
          ↳ 23 mutation(s): cb3a4f1 edited records/claims/CLM-0001.json;
            8f35281 edited records/corpora/reach-2026-08-02/README.md;
            67c92db edited records/claims/CLM-0004.json (+20)
```

Every one of those three is **additive**. `cb3a4f1` appended four lines folding in
measurements from a predecessor repo. `8f35281` extended a corpus README as two new
claims registered. `67c92db` replaced a citation that pointed at a moving branch with
vendored evidence carrying a sha256 — an edit that made the record *more* forensically
sound, which is REC-01's entire purpose.

Nothing in the finding separates those from an edit that deletes an inconvenient
paragraph or restates a measured figure. The author sees one number.

## Cause

`records-append-only` (`src/evaluators.mjs`) builds its mutation list from git's
name-status alone:

```js
const mdr = gitNameStatus('MDR', scope, { fullHistory: true })
…
for (const e of mdr) mutations.push({
  path: e.to || e.path,
  text: `${e.sha.slice(0, 7)} ${e.status === 'M' ? 'edited' : e.status === 'D' ? 'deleted' : 'renamed'} ${e.to || e.path}`
})
```

`M` is the whole story for a modification. The diff is never read, so a commit that
only adds lines and one that rewrites existing lines are the same event to the rule.

## Why this costs more than a coarse message

**The class is not rare — one design guarantees it.** mcgyvr captures every worker
reply it scores and pins the parser's verdicts into
`records/corpora/worker-replies/golden.json`. That file is a record, and it must be
re-pinned after every measurement run. So REC-01's count **grows by one per sweep, by
construction**, and its own record says so: *"#171 frames the warn as
permanent-but-fixed; it is permanent and monotonically growing."* The rule's number
is now a measurement of how much work the repo has done.

**A count that only rises is a count nobody reads.** #47's argument applies one level
in: a warn that cannot be cleared by behaving well stops being read, and the author
who stops reading it is the one who would have caught the *unsanctioned* mutation the
rule exists for. The sanctioned route makes the number clearable; it does not make it
informative, because the reader still cannot tell which of the 23 is the one to look at.

**The distinction is cheap and the rule already has the bytes.** `gitBlobAt` is
already called for the merge-hidden layer, and the introduction blob is already held
in `addBlobs`. Deciding whether a modification is a strict superset of what was there
is a diff the evaluator is one call away from.

## Suggested fix

Classify a modification before reporting it, and count the classes separately:

- **appended** — the HEAD blob contains the introduction blob's lines as a prefix (or,
  more permissively, no line present at introduction was removed or changed).
- **rewritten** — anything else: a line the record used to carry is gone or different.
- **deleted / renamed / vanished** — unchanged from today.

Then the finding reads *"18 appended · 5 rewritten"* rather than *"23 mutations"*, and
a reader knows which five to open. Whether an append should still count as a finding
is a real question and this issue does not answer it — the conservative reading is
that it should (a record's meaning can change by addition alone, and the ledger's
`records/` scope includes documents where an appended paragraph is a claim), so the
default should be to report both classes and let the tombstone route dispose of the
appended ones wholesale.

The second half is documentation rather than code: REC-01's `fix` now names the
tombstone command but not the fact that a **glob subject** covers a whole class of
future mutations. A repo whose corpus file is re-pinned per run wants one standing
`deviation` on `records/corpora/**`, not one per sweep, and nothing says so.

## Reproducing

```bash
d=$(mktemp -d) && cd "$d" && git init -q -b main . && git config user.email a@b.c && git config user.name t
mkdir -p records/claims
printf '{"id":"CLM-0001","statement":"x"}\n' > records/claims/CLM-0001.json
printf 'line one\n' > records/notes.md
git add -A && git commit -qm "records land"

printf 'line one\nline two appended\n' > records/notes.md          # pure append
printf '{"id":"CLM-0001","statement":"REWRITTEN"}\n' > records/claims/CLM-0001.json  # rewrite
git commit -qam "one append, one rewrite"

node /path/to/baseline-skill/check.mjs --repo . --no-exec | grep -A2 REC-01
# -> 2 mutation(s): <sha> edited records/claims/CLM-0001.json; <sha> edited records/notes.md
#    the two are indistinguishable in the finding; only one of them lost information
```

## Found

Reading `AdarGit008/mcgyvr` for #52. Six records raise it, over six weeks:

- `lane/163` (2026-08-05) states it as the open question — *"all three are additive or
  citation-fixing … Worth deciding whether REC-01 should distinguish 'appended to'
  from 'restated', because right now a correction and a rewrite score the same and the
  warn cannot be cleared by good behaviour."*
- `lane/212` (2026-08-08) finds the monotonic growth and its mechanism.
- `lane/216` (2026-08-08) records a *deliberate* mutation citing `67c92db` as its
  precedent — the repair case, used as an argument.
- `lane/25`, `lane/144`, `lane/113` carry it as a standing pre-existing warn that each
  lane has to explain away in its own record.
