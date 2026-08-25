#!/usr/bin/env node
// project-baseline checker — zero-dependency. Scores a repo against rules.json.
// Usage: node check.mjs [--repo <dir>] [--config <file>] [--no-exec] [--json] [--profile <pack>]
// Exit code 1 if any blocker fails. See README.md.
//
// This file is the thin CLI; the runner lives in src/ (index -> config ->
// evaluators -> engine -> report). check.mjs, rules.json, and src/ are
// co-located — invoke by absolute path, never copy this file away from them.
import path from 'node:path'
import { makeOpt, makeOptAll } from './src/util.mjs'
import { loadRules } from './src/rules.mjs'
import { indexRepo } from './src/repo.mjs'
import { resolveLane } from './src/probe.mjs'
import { resolveConfig } from './src/config.mjs'
import { CHECK_KINDS, makeEvalCheck } from './src/evaluators.mjs'
import { makeLaneWorld } from './src/facts/index.mjs'
import { runRules } from './src/engine.mjs'
import { makeColor, reportJson, reportHuman } from './src/report.mjs'
import { runSelfCheck, TOOLS } from './src/selfcheck.mjs'

const args = process.argv.slice(2)
const opt = makeOpt(args)
const optAll = makeOptAll(args)
// a value flag followed by another flag (or nothing) must not String(true) into a path
for (const f of ['--repo', '--config']) if (opt(f, null) === true) { console.error(`check: ${f} needs a value`); process.exit(2) }
const REPO = path.resolve(opt('--repo', process.cwd()))
const NO_EXEC = !!opt('--no-exec', false)
const JSON_OUT = !!opt('--json', false)
const SELF_CHECK = !!opt('--self-check', false)
const RULES = loadRules()
// The closed universe of project types. Every rule's applies_to must be "all" or a subset of this.
const TYPES = RULES.project_types || ['node', 'python', 'service', 'library', 'docs']

const color = makeColor(JSON_OUT)
const repo = indexRepo(REPO)
const { cfg, DEFAULTS, ACTIVE_PACKS, ACTIVE, TOOLS_PRESENT, WANT_UNKNOWN, JUDGMENTS, DESCRIPTOR } = resolveConfig(repo, {
  cliConfigPath: opt('--config', null),
  profileArgs: optAll('--profile'),
})

if (SELF_CHECK) process.exit(runSelfCheck({ RULES, TYPES, CHECK_KINDS, DEFAULTS, color }))

// v3 §6 (V20): a `want` entry naming no known tool is said BY NAME, on stderr (so --json
// stays parseable), never silently ignored — the closed vocabulary is selfcheck's TOOLS.
for (const t of WANT_UNKNOWN) console.error(`check: unrecognised "want" entry '${t}' — known tools: ${TOOLS.join(', ')}`)

// Lane identity for the branch-scoped rules: lane = branch name (the FS2 seam
// log/orient already use), falling back to the CI event where the checkout is detached
// and the event names a branch (#55: on a pull_request `actions/checkout` leaves
// refs/pull/N/merge detached, and reading the checkout alone made every lane rule n/a on
// the one event a branch-protection ruleset requires). Still nothing — a bisect, a
// hand-detached local tree — is honestly null and the branch gate stands down. The default
// branch is the descriptor's declared one only; undeclared stays null and the gate stands
// down rather than guessing 'main'.
const LANE = resolveLane(repo)
const BRANCH = LANE.lane
const DEFAULT_BRANCH = (DESCRIPTOR.valid && DESCRIPTOR.data.ground_truth_boundary?.default_branch) || null

// v3 §11 D12 (V19/V42): the forge is CLOSED under check. The engine resolves every
// forge-sourced rule (GOV-01/02, OPS-07) n/a with this reason before its evaluator runs,
// and the same closure rides into the lane world so no path — replay or not — spawns
// gh/curl/wget from a check run. admit and reconcile keep the live probe.
const FORGE_CLOSED = 'forge not consulted'
const LANEWORLD = makeLaneWorld(repo, DESCRIPTOR, { forgeClosed: FORGE_CLOSED })

const evalCheck = makeEvalCheck({ repo, cfg, NO_EXEC, JUDGMENTS, DESCRIPTOR, BRANCH, DEFAULT_BRANCH, LANEWORLD })
const results = runRules({ rules: RULES.rules, cfg, ACTIVE_PACKS, TOOLS_PRESENT, forgeClosed: FORGE_CLOSED, evalCheck, DESCRIPTOR, context: 'check' })

process.exit(JSON_OUT
  ? reportJson({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD, lane: LANE })
  : reportHuman({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD, version: RULES.version, color, lane: LANE }))
