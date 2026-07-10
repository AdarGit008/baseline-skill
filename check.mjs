#!/usr/bin/env node
// project-baseline checker — zero-dependency. Scores a repo against rules.json.
// Usage: node check.mjs [--repo <dir>] [--config <file>] [--no-exec] [--json] [--profile <name>]
// Exit code 1 if any blocker fails. See README.md.
//
// This file is the thin CLI; the runner lives in src/ (index -> config ->
// evaluators -> engine -> report). check.mjs, rules.json, and src/ are
// co-located — invoke by absolute path, never copy this file away from them.
import fs from 'node:fs'
import path from 'node:path'
import { indexRepo } from './src/repo.mjs'
import { resolveConfig } from './src/config.mjs'
import { CHECK_KINDS, makeEvalCheck } from './src/evaluators.mjs'
import { runRules } from './src/engine.mjs'
import { makeColor, reportJson, reportHuman } from './src/report.mjs'
import { runSelfCheck } from './src/selfcheck.mjs'

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def }
const optAll = (name) => args.reduce((a, v, i) => (args[i] === name && args[i + 1] && !args[i + 1].startsWith('--') ? [...a, args[i + 1]] : a), [])
const REPO = path.resolve(opt('--repo', process.cwd()))
const NO_EXEC = !!opt('--no-exec', false)
const JSON_OUT = !!opt('--json', false)
const SELF_CHECK = !!opt('--self-check', false)
const RULES = JSON.parse(fs.readFileSync(new URL('./rules.json', import.meta.url), 'utf8'))
// The closed universe of project types. Every rule's applies_to must be "all" or a subset of this.
const TYPES = RULES.project_types || ['node', 'python', 'service', 'library', 'docs']

const color = makeColor(JSON_OUT)
const repo = indexRepo(REPO)
const { cfg, DEFAULTS, CLAIMS_ACTIVE, ACTIVE, SIGNOFF, DESCRIPTOR } = resolveConfig(repo, {
  cliConfigPath: opt('--config', null),
  profileArgs: optAll('--profile'),
})

if (SELF_CHECK) process.exit(runSelfCheck({ RULES, TYPES, CHECK_KINDS, DEFAULTS, color }))

const evalCheck = makeEvalCheck({ repo, cfg, NO_EXEC, SIGNOFF, DESCRIPTOR })
const results = runRules({ rules: RULES.rules, cfg, ACTIVE, CLAIMS_ACTIVE, evalCheck })

process.exit(JSON_OUT
  ? reportJson({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD })
  : reportHuman({ results, REPO, cfg, ACTIVE, HEAD: repo.HEAD, version: RULES.version, color }))
