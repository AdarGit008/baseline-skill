---
draft: true
target: AdarGit008/baseline-skill
labels: [bug]
title: "FLOW-03 reads the last record by filename, so a same-day pre-registration outranks the session record that governs"
tracker: "#52"
rank: 1
---

## Symptom

A lane whose newest session record ends with a filled-in `next:` fails a blocker:

```
FAIL      FLOW-03   The lane's session record has a filled-in next:
          ↳ records/sessions/lane/231/2026-08-13-positive-control-prereg.md has an
            empty next: — record the one next step (baseline log ... --next "...")
```

The named file is a **pre-registration**, not a session record. It correctly carries
no `next:` — it is a design fixed before dispatch, not a day's work. The session
record beside it, written afterwards, carries one.

DIV-02 goes `SKIP` in the same run: *"no committed next: on this lane"*. It is reading
the same selection, so the wrong pick does not merely misreport FLOW-03 — it turns
divergence detection off.

## Cause

`committedLog` (`src/evaluators.mjs:61-71`) selects the lane's newest record by
sorting the added paths and taking the last:

```js
const added = gitDiffNames(`${base}...HEAD`, `records/sessions/${branch}/`, { addedOnly: true })
if (added === null) return { unprovable: `diff ${base}...HEAD failed` }
const md = added.filter(f => f.endsWith('.md')).sort()
if (!md.length) return null
const rel = md.at(-1)
```

The sort is lexicographic over the whole path. Record filenames lead with a date, so
across days the sort agrees with time — and **within one day the slug decides**. On
the lane above:

```
2026-08-13-checks-1-and-2-under-the-gate-adar.md   <- the session record, has next:
2026-08-13-positive-control-prereg.md              <- picked, has no next:
```

`c` sorts before `p`. Three rules read this one selection — FLOW-03
(`lane-next-filled`), FLOW-05 (`lane-record-pushed`) and DIV-02 (`div-next-closed`) —
so all three are decided by whichever filename happens to sort last.

## Why this costs more than a misreport

**The fix cannot be an edit.** REC-01 makes committed records append-only, so moving
the `next:` into the file the rule picked means mutating a landed record — and in the
worst case that record is a pre-registration, whose whole value is that it was not
edited after its results were known. Every lane that hits this pays a *new session
record* whose only content is "the rule read the wrong file". Three mcgyvr lanes have
now paid it.

**DIV-02's silence is the expensive half.** Selecting a `next:`-less record makes
DIV-02 report `no committed next: on this lane (FLOW-02/03's territory)` — which reads
as "nothing to check" and is indistinguishable from a lane that genuinely has no plan
recorded. A stale plan pointing at closed work goes unreported for as long as the
selection stays wrong.

**Nothing about the record shape is wrong.** The lane wrote a pre-registration and a
session record on one day, in that order, exactly as the workflow asks. There is no
author behaviour that clears the finding except renaming a file to sort correctly,
which is a convention nothing states and nothing checks.

## Suggested fix

The rule wants *the record that governs*, and the tree already states it three ways —
the choice between them is a real fork:

1. **Frontmatter ordinal.** `baseline log` writes `record: session/N`; the highest N
   is the newest session record and a pre-registration is not one. Reads what the
   writer already wrote, and distinguishes record *kinds* rather than only ordering
   them — which is the actual defect here.
2. **Commit order.** The last of the added paths in `git log` order rather than in
   sort order. No convention required, and it is right for hand-written records that
   carry no frontmatter; it costs one more git read and is wrong when several records
   land in one commit.
3. **A naming convention**, documented and unchecked. Cheapest, and it is the option
   that leaves the next lane to rediscover it.

(1) with (2) as the fallback for a record carrying no ordinal looks like the shape,
but this issue does not pick it.

Whatever is chosen, the SKIP path deserves the same care: DIV-02 reporting *"no
committed next:"* when the lane has one is the finding that misleads hardest, and it
should be able to say it read record X of N rather than implying there was nothing to
read.

## Reproducing

```bash
d=$(mktemp -d) && cd "$d" && git init -q -b main . && git config user.email a@b.c && git config user.name t
cat > baseline.repo.json <<'EOF'
{"schema_version":1,"type":"docs","lifecycle":"production","maturity":"released",
 "workflow":"multi-lane","anchoring":"off",
 "ground_truth_boundary":{"default_branch":"main"},"lanes":{"namespace":"lane/*"}}
EOF
git add -A && git commit -qm base && git checkout -qb lane/231
mkdir -p records/sessions/lane/231
printf -- '---\nrecord: session/3\nlane: 231\n---\n\n# Session\n\n## Did\n\nwork\n\n## Left open\nnext: build check 3\n' \
  > records/sessions/lane/231/2026-08-13-checks-1-and-2-under-the-gate-adar.md
printf -- '---\nrecord: prereg\nlane: 231\n---\n\n# Pre-registration\n\nDeclared before dispatch.\n' \
  > records/sessions/lane/231/2026-08-13-positive-control-prereg.md
git add -A && git commit -qm records
node /path/to/baseline-skill/check.mjs --repo . --no-exec | grep -E 'FLOW-0[35]|DIV-02'
# -> FLOW-03 FAIL  …positive-control-prereg.md has an empty next:   (it is not a session record)
# -> DIV-02  SKIP  no committed next: on this lane                  (there is one)
```

Rename the prereg to sort first (`2026-08-13-a-prereg.md`) and both go green with no
change to any record's content — which is the whole finding.

## Found

Reading `AdarGit008/mcgyvr` for #52. Three instances: `lane/231` session/4
(2026-08-13, CI blocker, cost one session record), `lane/113` session/4 (2026-08-13)
and `lane/266` session/5 (2026-08-15). Latent on `lane/225`, which survived only
because `…f1-tranches…` happens to sort after `…f1-responsiveness-prereg…`.

`lane/231`'s own record states the fork this issue inherits: *"either a naming
convention that keeps a pre-registration sorting before its lane's session records,
or FLOW-03 selecting by frontmatter `record: session/N` (or commit order) instead of
by filename. The second is the correct one and is the more expensive."*

Related: #50 is the other half of FLOW-03's selection problem — that one is about
where `next:` sits *inside* the chosen file, this one is about which file is chosen.
Both were hit by the same lanes within two days.
