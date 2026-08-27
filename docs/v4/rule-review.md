# v4 rule review — the decision log

> **A historical record, not a specification.** This is the working log of the session that
> cut the v4 rule set: every one of the 76 rules that existed before the cut, reviewed one
> at a time, with the verdict and the reason it got. It is the only record of *why* 68 rules
> were deleted.
>
> Read it for provenance. Do not read it for what baseline checks today — the numbers,
> tallies and "FINAL RULE SET" lines below are snapshots of a decision in progress, and
> several of them were overturned further down the same page. What the rule set is *now*
> comes from `node check.mjs --self-check`; what each surviving rule does comes from
> `rules/*.json`; what may never change comes from `test/red/`. Nothing on this page binds
> the code, and an entry here that contradicts the code is history, not a bug.
>
> Kept verbatim from the session, in the order the decisions were made — including the
> reversals, because the reversals are the record.

---

## The review, as it happened
Options per rule: (a) keep  (b) scratch  (c) other

| # | rule | verdict | note |
|---|------|---------|------|
| 1 | BUILD-01-dependency-manifest-present | scratch | |
| 2 | BUILD-02-lockfile-committed | scratch | |
| 3 | BUILD-03-ci-workflow-present | KEEP | blocker as-is |
| 4 | BUILD-04-env-template-present | KEEP | warn as-is |
| 5 | BUILD-05-task-1-passes-clean | scratch | the only exec-based rule |
| 6 | BUILD-06-baseline-gate-in-ci | scratch | |
| 7 | BUILD-07-single-bootstrap-entrypoint | scratch | |
| 8 | BUILD-08-task-commands-declared | scratch | |
| 9 | BUILD-09-bootstrap-is-idempotent | scratch | last exec rule |
| 10 | BUILD-10-ci-runs-tests | scratch | build category done: 2 keep / 8 scratch |
| 11 | CLAIM-00-claims-register-exists | scratch | gateway for CLAIM-01..07 |
| 12 | CLAIM-01-claims-tagged-build-state | scratch | batch: "scratch all CLAIM" |
| 13 | CLAIM-02-claims-graded-blast-radius | scratch | batch |
| 14 | CLAIM-03-novelty-claims-dated-prior-art | scratch | batch |
| 15 | CLAIM-04-citations-resolve-support | scratch | batch |
| 16 | CLAIM-06-specs-carry-acceptance-criteria | scratch | batch |
| 17 | CLAIM-07-claims-in-per-claim-records | scratch | batch — claims pack now empty |
| 18 | COMM-01-license-present | scratch | |
| 19 | COMM-02-readme-newcomer-sections | scratch | |
| 20 | COMM-03-changelog-has-unreleased | scratch | batch: "scratch all COMM" — community category now empty |
| 21-32 | all CTX (12 rules) | PARKED | category STAYS; new context system = graphify(AST,no LLM) + OKF(HITL fact store, highest authority) + RAG(semantic search) + RED/GREEN tests + my-onto(later, fails silent). 5 new CTX rules delegated: graphify-update? / tdd-update? / okf-rag-update? / my-onto-update? / orientation-script-exists?. Two agents running: new-rule design + existing-12 audit. |
| 33 | DESC-01-repo-descriptor-present | scratch | |
| 34 | DESC-02-descriptor-schema-valid | scratch | |
| 35 | DESC-03-descriptor-change-carries-judgment | scratch | descriptor pack now empty |
| 36 | GOV-01-merge-protection-active | KEEP | warn, forge-sourced |
| 37 | GOV-02-up-to-date-merges-enforced | scratch | |
| 38 | GOV-03-codeowners-names-owner | KEEP | warn; gov category = GOV-01 + GOV-03 |
| 39 | OPS-01-structured-logging-wired | scratch | |
| 40 | OPS-02-health-endpoint-exists | scratch | |
| 41 | OPS-03-graceful-shutdown-on-sigterm | scratch | |
| 42 | OPS-04-outbound-calls-guarded | scratch | |
| 43 | OPS-05-runbook-exists | scratch | |
| 44 | OPS-06-service-declares-owner-lifecycle | scratch | |
| 45 | OPS-07-reconcile-cron-alive | scratch | ops category now empty |
| 46 | PLUG-01-tdd-pi | KEEP | warn, always-on; coexists with new CTX-16 |
| 47 | PLUG-02-graphify | KEEP | warn, always-on; D7 amendment for manifest read still open |
| 48 | PLUG-03-okf-rag | KEEP | warn, always-on; all 3 PLUG rules kept |
| 49 | QUAL-01-linter-configured | scratch | |
| 50 | QUAL-02-formatter-configured | scratch | |
| 51 | QUAL-03-strict-type-checking | scratch | |
| 52 | QUAL-04-linter-enforced | scratch | quality category now empty |
| 53 | REC-02-committed-tree-scrub-clean | scratch | |
| 54 | REC-05-push-time-gate-committed | scratch | records category now empty |
| 55 | REPRO-01-ci-installs-frozen | scratch | |
| 56 | REPRO-02-runtime-version-pinned | scratch | |
| 57 | REPRO-03-runtime-pin-consistent | scratch | |
| 58 | REPRO-04-docker-base-pinned-by-digest | OTHER | moves to new DOCKER category; repro category now empty. Docker cat = 1 active liveness rule + rest FROZEN (my-onto mechanism). Agent designing. |
| 59 | SEC-01-no-committed-secrets | KEEP | blocker, as-is |
| 60 | SEC-02-env-files-ignored | KEEP | blocker, as-is |
| 61 | SEC-03-ci-actions-pinned-sha | KEEP | warn, as-is |
| 62 | SEC-04-no-dangerous-ci-patterns | scratch | |
| 63 | SEC-05-dependency-updates-automated | KEEP | warn, as-is; overlaps SEC-13 branch |
| 64 | SEC-06-security-policy-reporting-channel | scratch | |
| 65 | SEC-07-no-committed-binaries | scratch | |
| 66 | SEC-08-sbom-committed | scratch | |
| 67 | SEC-09-code-scanning-configured | scratch | |
| 68 | SEC-10-release-provenance-present | scratch | |
| 69 | SEC-11-least-privilege-ci-token | scratch | |
| 70 | SEC-12-secret-scanning-gate | KEEP | warn, as-is |
| 71 | SEC-13-dependency-vulnerability-scan | scratch | SEC-05 keeps its scanning branch |
| 72 | SEC-14-pre-commit-hooks-pinned | scratch | security done: 5 keep (SEC-01,02,03,05,12) / 9 scratch |
| 73 | TEST-01-automated-tests-exist | scratch | |
| 74 | TEST-02-failure-paths-tested | scratch | |
| 75 | TEST-05-mutation-testing-gated | scratch | |
| 76 | TEST-07-coverage-floor-enforced | scratch | test category now empty — REVIEW COMPLETE |

## Final tally (76 reviewed)
- KEEP 12: BUILD-03, BUILD-04, GOV-01, GOV-03, PLUG-01, PLUG-02, PLUG-03, SEC-01, SEC-02, SEC-03, SEC-05, SEC-12
- SCRATCH 51
- OTHER 1: REPRO-04 -> DOCKER category
- PARKED 12: all CTX (audit recommends 6 keep / 1 rewrite / 5 scratch — awaiting ratification)

## Categories eliminated entirely (8)
claims, community, descriptor, ops, quality, records, repro, test

## New rules designed (not yet ratified)
- CTX-15..19 (graphify / tdd / okf-rag / my-onto / orientation)
- DOCKER: 5 rules (1 active liveness + frozen set, incl. REPRO-04 moved, id kept)

## CTX verdicts RATIFIED by user
KEEP 6: CTX-02, CTX-05, CTX-07, CTX-11, CTX-13, CTX-14
REWRITE 1: CTX-12 (broaden beyond `last-verified:` in **/*.md; keep blocker) — spec still needed
SCRATCH 5: CTX-03, CTX-06, CTX-08, CTX-09, CTX-10
Retire with CTX-06: freshness_globs, doc_freshness_days config keys
Final ruleset: 12 keeps + 7 CTX + 5 new CTX + 5 docker = 29 rules
| CTX-02 | 2nd pass | scratch | overrides audit KEEP |
| CTX-05 | 2nd pass | scratch | overrides audit KEEP |
| CTX-07 | 2nd pass | scratch | overrides audit KEEP |
| CTX-11 | 2nd pass | scratch | evaluator doc-code-age still needed by CTX-15..18 |
| CTX-13 | 2nd pass | scratch | overrides audit KEEP |
| CTX-14 | 2nd pass | scratch | ADR family fully gone; decisions pack empty |

## CTX 2nd pass: all 6 audit-KEEPs overridden -> scratch
Surviving CTX = CTX-12 (rewrite) + new CTX-15..19
FINAL: 12 keeps + CTX-12 + 5 new CTX + 5 docker = 23 rules
| CTX-12 | 2nd pass | scratch | ALL 12 original CTX rules now scratched; context category = new rules only |

## FINAL: 22 rules = 12 keeps + CTX-15..19 (new) + 5 docker (new)

## NEW RULES pass
| CTX-15 | new | KEEP as BLOCKER | forces manifest-hash design (blocker=>deterministic law); inverts CONTRACT.md:26 |

## PRODUCT THESIS (user, verbatim)
"user adds a skill/tool to trust circle. baseline skill adds it to your CI."
=> opt-in moves from the RULE level to the TRUST-CIRCLE level.
   Add a tool to the circle -> its rules become blockers in your CI.
   Repos that added nothing stay unenforced (enabler preserved).
| ALL trust-circle rules | decision | BLOCKER | CTX-15..19, PLUG-01..03, docker |
BLOCKER=>DETERMINISTIC forces repo-state evidence. CI clones only TRACKED files:
  tdd.json          tracked   -> CI can gate ✓
  graphify-out/     gitignored-> absent in CI ✗
  okf bundle        outside repo -> absent in CI ✗
  docker daemon     per-machine  -> absent in CI ✗
=> trust-circle members need a COMMITTED STAMP for CI gating to be possible.

## EXECUTION MODEL (user decision)
CI runs one script over REPO FILES -> exit 0/1. That IS the blocker mechanism.
ALL rules AND-gated to exit 0. Any rule fails -> exit 1.
On exit 1: keep the per-rule output. (No warn tier.)
Consequences: severity field collapses (all blocker); packs die; every rule must be
deterministic; inputs must be repo files (a stamp qualifies, a daemon/outside path does not).
| SEC-03, SEC-05, SEC-12 | 2nd pass | scratch | heuristic; incompatible with AND-gated exit 0 |
| GOV-01 | decision | MOVE TO ORIENT | conflicts with orient D12 'never spawns gh'; GOV-01 already resolves n/a there. Needs D12 amendment or drop. |
| GOV-01 | decision | SCRATCH | forge seam deleted entirely; baseline = repo files only, network only via git pull |

## FINAL RULE SET: 18
KEEP 8: BUILD-03, BUILD-04, GOV-03, PLUG-01, PLUG-02, PLUG-03, SEC-01, SEC-02
NEW 10: CTX-15..19 (trust-circle freshness), DOCKER x5
All deterministic. All sources:["tree"]. All AND-gated to exit 0; n/a excluded.
| CTX-16 | new | KEEP (c) | blocker, deterministic, NO day threshold — pure ordering: tdd.json commit must not predate newest commit under tdd_sources. Retires tdd_stale_days. |
| CTX-17 | new | KEEP (c) | committed stamp; blocker, deterministic |

## DECISION: baseline owns the wiring for ALL trust-circle items
baseline writes/maintains the committed stamps — not the tools. This IS the
bootstrapper surface PR #104's second test demands (describeRequiredSetup()).
Stamp integrity tiers:
  tdd-pi   artifact itself is tracked -> no stamp needed, git date is the fact
  graphify VERIFIABLE — baseline recomputes MD5 of tracked code files vs manifest
  okf-rag  RECORDED ONLY — bundle is outside the repo and human-curated
  docker   RECORDED ONLY — daemon state is per-machine
  my-onto  frozen/silent until built
| CTX-18 | new | FROZEN | no severity while permanently n/a — 'blocker' is an empty claim until my-onto exists |
| CTX-19 | new | KEEP (c) | IDENTITY check, not existence: baseline installs the entrypoint and byte-compares the committed copy against the shipped version. Deterministic -> blocker. Version skew: compare against the version this baseline ships. |

## CTX new rules — all 5 decided
CTX-15 blocker/deterministic — graphify manifest MD5 hashes, code files only, n/a on unknown format
CTX-16 blocker/deterministic — pure ordering, no day threshold
CTX-17 blocker/deterministic — committed stamp (baseline-owned wiring)
CTX-18 frozen — no severity while n/a
CTX-19 blocker/deterministic — byte-identity vs shipped orientation script
| DOCKER-01 | new | scratch | liveness not answerable from repo files; container-liveness kind dropped |
| REPRO-04 | new pass | scratch | dockerfile-digest kind orphaned; docker cat now all-frozen |
| DOCKER-02 | new | scratch | |
| DOCKER-03 | new | scratch | |
| DOCKER-04 | new | scratch | docker category eliminated entirely |

## FINAL RULE SET: 13 (12 active + 1 frozen), 5 categories
build     BUILD-03, BUILD-04
governance GOV-03
plugins   PLUG-01 (tdd-pi), PLUG-02 (graphify), PLUG-03 (okf-rag)   [presence]
security  SEC-01, SEC-02
context   CTX-15 graphify-fresh, CTX-16 tdd-fresh, CTX-17 okf-fresh, CTX-19 orient-identity
          CTX-18 my-onto (FROZEN, no severity)
All active rules: deterministic, sources:["tree"], AND-gated to exit 0, n/a excluded.
From 76 rules / 13 categories -> 13 rules / 5 categories. 24 evaluator kinds -> 4 + new.
