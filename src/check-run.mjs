// The scorer — the one pipeline `check` and `orient` share (v3 §8, §11 D12).
//
//   indexRepo → resolveConfig → makeLaneWorld (forge closed) → makeEvalCheck → runRules
//
// check.mjs used to hold this inline; orient v2 needs the same run in-process (its
// `score:` line is the derived blocker/advisory count, never a narration), and two copies
// of a pipeline drift. So it lives here once, with the CLI concerns left to the callers:
// check.mjs parses flags and renders (src/report.mjs); orient renders five lines. Nothing
// here prints — the one stderr message this pipeline can emit ('bad --config') is
// resolveConfig's own, so check.mjs's output stays byte-identical to its inline days.
//
// D12: the forge is CLOSED for every caller by default. The engine resolves every
// forge-sourced rule (GOV-01/02, OPS-07) n/a with the closure reason before its evaluator
// runs, and the same closure rides into the lane world so no path — replay or not — spawns
// gh/curl/wget from a check or orient run. admit and reconcile keep the live probe and do
// not come through here.
import path from 'node:path'
import { loadRules } from './rules.mjs'
import { indexRepo } from './repo.mjs'
import { resolveLane } from './probe.mjs'
import { resolveConfig } from './config.mjs'
import { makeEvalCheck } from './evaluators.mjs'
import { makeLaneWorld } from './facts/index.mjs'
import { runRules } from './engine.mjs'
import { summarize, evaluated, isBlocking } from './report.mjs'

/** The closure reason every check/orient run carries (V19/V42): the spelling the red
 *  tests match, stated once. */
export const FORGE_CLOSED = 'forge not consulted'

/** Evaluated rows that are findings but not blocking: a WARN anywhere, or a FAIL/DIVERGED on
 *  a non-blocker rule. The complement of `blockers` inside the non-PASS rows — what orient's
 *  `score:` line calls advisory. Derived from the rows, never a literal. */
export const advisoryOf = results => evaluated(results).filter(x => x.tag !== 'PASS' && !isBlocking(x)).length

/**
 * Score `repoDir` against the rule set. Returns
 *   { results, summary, HEAD, cfgRes, repo, lane, RULES }
 * where `results` are the engine's rows (evaluated { r, tag, detail } and n/a
 * { r, state, reason } — src/engine.mjs), `summary` is report.mjs's summarize() plus an
 * `advisory` count, `cfgRes` is resolveConfig's whole answer (cfg, ACTIVE, ACTIVE_PACKS,
 * TOOLS_PRESENT, WANT_UNKNOWN, JUDGMENTS, DESCRIPTOR, DEFAULTS), `repo` the index, and
 * `lane` the resolved lane identity ({ lane, basis, event }) the reports print.
 *
 * Options:
 *   noExec        skip `command`-kind checks that would spawn the repo's own scripts
 *                 (check's --no-exec; orient always). Default true — the safe direction.
 *   forgeClosed   the D12 closure reason; null would reopen the forge, which no caller does.
 *   profileArgs   the --profile packs to activate on top of the config.
 *   cliConfigPath a --config file layered over baseline.config.json.
 *   context       the engine's context gate ('check' — the surface check and orient share).
 *   rules         a pre-loaded rule set (check.mjs already has one); loaded here otherwise.
 */
export function scoreRepo(repoDir, {
  noExec = true,
  forgeClosed = FORGE_CLOSED,
  profileArgs = [],
  cliConfigPath = null,
  context = 'check',
  rules = null,
} = {}) {
  const RULES = rules || loadRules()
  const repo = indexRepo(path.resolve(repoDir))
  const cfgRes = resolveConfig(repo, { cliConfigPath, profileArgs })
  const { cfg, ACTIVE_PACKS, TOOLS_PRESENT, JUDGMENTS, DESCRIPTOR } = cfgRes

  // Lane identity for the branch-scoped rules: lane = branch name (the FS2 seam log/orient
  // already use), falling back to the CI event where the checkout is detached and the
  // event names a branch (#55). Still nothing — a bisect, a hand-detached local tree — is
  // honestly null and the branch gate stands down. The default branch is the descriptor's
  // declared one only; undeclared stays null rather than guessing 'main'.
  const lane = resolveLane(repo)
  const BRANCH = lane.lane
  const DEFAULT_BRANCH = (DESCRIPTOR.valid && DESCRIPTOR.data.ground_truth_boundary?.default_branch) || null

  const LANEWORLD = makeLaneWorld(repo, DESCRIPTOR, { forgeClosed })
  const evalCheck = makeEvalCheck({ repo, cfg, NO_EXEC: noExec, JUDGMENTS, DESCRIPTOR, BRANCH, DEFAULT_BRANCH, LANEWORLD })
  const results = runRules({ rules: RULES.rules, cfg, ACTIVE_PACKS, TOOLS_PRESENT, forgeClosed, evalCheck, DESCRIPTOR, context })
  const summary = { ...summarize(results), advisory: advisoryOf(results) }
  return { results, summary, HEAD: repo.HEAD, cfgRes, repo, lane, RULES }
}
