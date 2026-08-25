// Config resolution: DEFAULTS -> auto-detected project_type -> baseline.config.json
// -> --config file -> --profile flags, then the baseline.repo.json descriptor's declared
// type overrides all of them (C39: the repo's claim about itself is root intent, not a
// guess). Also derives the active PACKS (v3 §5 / §11 D13) and the detected TOOLS (§6).
//
// v3 §5 (V15/V16): with no config file every pack is off. A pack activates only from an
// EXPLICIT switch — the DEFAULTS never activate one, the descriptor's type never does
// (D13), and nothing in the tree (a claims register, a services/ dir) is an opt-in.
import fs from 'node:fs'
import path from 'node:path'
import { loadDescriptor } from './descriptor.mjs'
import { loadJudgments } from './jdg.mjs'
import { asArr } from './util.mjs'
import { TOOLS } from './selfcheck.mjs'

export function detectType(repo) {
  const { FILES } = repo
  if (FILES.includes('package.json')) return FILES.some(f => f.startsWith('services/') || f.startsWith('apps/') || f.startsWith('cmd/')) ? 'service' : 'node'
  if (FILES.includes('pyproject.toml') || FILES.some(f => /requirements.*\.txt$/.test(f))) return 'python'
  if (FILES.includes('go.mod')) return 'service'
  return 'docs'
}

// v3 §6 (V17/V19/V20): the tool detector is a pure function of the tree. A tool is "present"
// when its artifact is in the tree; a rule declaring `tool` is in scope when the tool is
// present OR config `want` names it. The markers are the same globs the tool's rules read.
export const TOOL_MARKERS = Object.freeze({
  docker: ['**/Dockerfile', '**/Dockerfile.*', '**/*.Dockerfile'],
})
export function detectTools(repo) {
  const present = new Set()
  for (const t of TOOLS) if (TOOL_MARKERS[t] && repo.match(TOOL_MARKERS[t]).length > 0) present.add(t)
  return present
}

export function buildDefaults(repo) {
  return {
    project_type: detectType(repo),
    makes_external_claims: false, // v3 §5: the claims pack is opt-in by an EXPLICIT true (V15/V16)
    bootstrap_command: null,
    command_timeout_ms: 600000,
    claims_file: 'docs/CLAIMS.json',
    // the globs the decisions-pack rules READ once the pack is on; the default never activates it
    decision_globs: ['docs/decisions/*.md', 'docs/adr/*.md', 'adr/*.md', 'docs/decisions/**/*.md', 'records/decisions/*.md'], // records/decisions/ is CONTRACT.md's V2 decision home — CTX-14's id cross-check must see it
    doc_globs: ['**/*.md'],
    sources_of_truth: {},
    prior_art_recheck_days: 90,
    doc_freshness_days: 180,
    doc_lag_days: 30,      // CTX-11: max days a doc may lag the code it anchors
    freshness_globs: [],   // opt-in: docs that must carry last_review_date
    generated_globs: [],   // opt-in: generated files that must carry a DO NOT EDIT marker
    grounding_docs: [],    // opt-in: required grounding docs (exist + non-empty)
    profiles: [],          // packs to activate (v3 §5); `packs` is the alias, --profile <pack> the CLI form
    packs: [],
    want: [],              // tools declared present-by-intent (v3 §6 V20): overrides the tool gate and the type gate
  }
}

export function resolveConfig(repo, { cliConfigPath = null, profileArgs = [], descriptorRef = null } = {}) {
  const DEFAULTS = buildDefaults(repo)
  let cfg = { ...DEFAULTS }
  const EXPLICIT = new Set()
  const applyCfg = obj => { for (const kk of Object.keys(obj)) if (!kk.startsWith('_')) EXPLICIT.add(kk); cfg = { ...cfg, ...obj } }
  const inRepoCfg = repo.read('baseline.config.json'); if (inRepoCfg) try { applyCfg(JSON.parse(inRepoCfg)) } catch {}
  if (cliConfigPath && typeof cliConfigPath === 'string') try { applyCfg(JSON.parse(fs.readFileSync(path.resolve(cliConfigPath), 'utf8'))) } catch (e) { console.error('bad --config:', e.message) }
  for (const p of profileArgs) cfg.profiles = [...asArr(cfg.profiles), p]

  // v3 §5 / §11 D13 — the pack switches, read BEFORE the descriptor overlays project_type:
  // the service pack keys on an explicitly CONFIGURED project_type, never on the detected
  // one and never on the descriptor's declared type (D13).
  const ACTIVE_PACKS = new Set()
  if (EXPLICIT.has('makes_external_claims') && cfg.makes_external_claims === true) ACTIVE_PACKS.add('claims')
  if (EXPLICIT.has('decision_globs') && asArr(cfg.decision_globs).filter(Boolean).length > 0) ACTIVE_PACKS.add('decisions')
  if (EXPLICIT.has('project_type') && cfg.project_type === 'service') ACTIVE_PACKS.add('service')
  for (const p of [...asArr(cfg.profiles), ...asArr(cfg.packs)]) if (typeof p === 'string' && p.trim()) ACTIVE_PACKS.add(p.trim())

  // The descriptor's declared type is the root identity fact (C39): a valid baseline.repo.json
  // supersedes both the filesystem auto-detection and any config project_type, so a repo whose
  // package.json is only for tooling isn't misclassified as node. Absent or invalid descriptor
  // -> auto-detect/config still governs (the ref seam lets M6 read it from the target branch).
  const DESCRIPTOR = loadDescriptor(repo, { ref: descriptorRef })
  if (DESCRIPTOR.valid && DESCRIPTOR.data.type) cfg.project_type = DESCRIPTOR.data.type

  // v3 §6: detected tools (a function of the tree) and the `want` declarations. An entry
  // naming no known tool is reported by name (V20), never silently ignored.
  const TOOLS_PRESENT = detectTools(repo)
  const wantAll = asArr(cfg.want).map(String)
  const WANT = new Set(wantAll.filter(t => TOOLS.includes(t)))
  const WANT_UNKNOWN = wantAll.filter(t => !TOOLS.includes(t))
  cfg.want = [...WANT]

  // Kept for the callers that still read the claims gate by name (admit/reconcile thread
  // them into runRules): the claims pack IS the gate now, and there is no second reason.
  const CLAIMS_ACTIVE = ACTIVE_PACKS.has('claims')
  const CLAIMS_REASON = null
  // ACTIVE is the pre-v3 name for the same set (report/admit/reconcile still read it)
  const ACTIVE = ACTIVE_PACKS

  // The unified ledger (M4b, sole path since M7b): ONE loader (jdg.mjs) — schema-
  // valid records only, so a malformed record can never read as a live sanction
  // while `jdg check` calls the same file INVALID. JUDGMENTS is the full schema-
  // valid list for the rules that read sanctions by subject (the corpus/manifest
  // deviation reads, DESC-03's added-judgment match at admit). The sign-off
  // selection (JDGS) left with the manual rules it satisfied (v3 D11).
  const JUDGMENTS = loadJudgments(repo.REPO).records

  return { cfg, DEFAULTS, EXPLICIT, ACTIVE_PACKS, ACTIVE, CLAIMS_ACTIVE, CLAIMS_REASON, TOOLS_PRESENT, WANT, WANT_UNKNOWN, JUDGMENTS, DESCRIPTOR }
}
