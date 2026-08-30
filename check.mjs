#!/usr/bin/env node
// project-baseline checker — zero-dependency. Scores a repo against rules.json.
// Usage: node check.mjs [--repo <dir>] [--config <file>] [--json]
// Exit code 1 if any blocker fails. See README.md.
//
// This file is the thin CLI; the scorer lives in src/check-run.mjs (index -> config ->
// evaluators -> engine) and the renderers in src/report.mjs. orient runs the same scorer
// in-process for its `score:` line (v3 §8), so the pipeline has one home. check.mjs,
// rules.json, and src/ are co-located — invoke by absolute path, never copy this file
// away from them.
import path from 'node:path'
import { makeOpt, makeOptAll } from './src/util.mjs'
import { loadRules } from './src/rules.mjs'
import { CHECK_KINDS } from './src/evaluators.mjs'
import { makeColor, reportJson, reportHuman } from './src/report.mjs'
import { runSelfCheck, TOOLS } from './src/selfcheck.mjs'
import { scoreRepo, FORGE_CLOSED } from './src/check-run.mjs'

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
// the self-check reads the rule set alone — it scores nothing, so it indexes nothing
if (SELF_CHECK) process.exit(runSelfCheck({ RULES, TYPES, CHECK_KINDS, color }))

// v3 §11 D12 (V19/V42): the forge is CLOSED under check — scoreRepo resolves every
// forge-sourced rule (GOV-01/02, OPS-07) n/a with this reason before its evaluator runs,
// and the same closure rides into the lane world so no path — replay or not — spawns
// gh/curl/wget from a check run. admit and reconcile keep the live probe.
const { results, cfgRes, repo, lane } = scoreRepo(REPO, {
  noExec: NO_EXEC,
  forgeClosed: FORGE_CLOSED,
  profileArgs: optAll('--profile'),
  cliConfigPath: opt('--config', null),
  rules: RULES,
})
const { cfg, ACTIVE, WANT_UNKNOWN } = cfgRes

// v3 §6 (V20): a `want` entry naming no known tool is said BY NAME, on stderr (so --json
// stays parseable), never silently ignored — the closed vocabulary is selfcheck's TOOLS.
for (const t of WANT_UNKNOWN) console.error(`check: unrecognised "want" entry '${t}' — known tools: ${TOOLS.join(', ')}`)

process.exit(JSON_OUT
  ? reportJson({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD, lane })
  : reportHuman({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD, version: RULES.version, color, lane }))
