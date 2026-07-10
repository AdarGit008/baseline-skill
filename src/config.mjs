// Config resolution: DEFAULTS -> auto-detected project_type -> baseline.config.json
// -> --config file -> --profile flags, then the baseline.repo.json descriptor's declared
// type overrides all of them (C39: the repo's claim about itself is root intent, not a
// guess). Also derives the claims opt-in and active profiles.
import fs from 'node:fs'
import path from 'node:path'
import { loadDescriptor } from './descriptor.mjs'

export function detectType(repo) {
  const { FILES } = repo
  if (FILES.includes('package.json')) return FILES.some(f => f.startsWith('services/') || f.startsWith('apps/') || f.startsWith('cmd/')) ? 'service' : 'node'
  if (FILES.includes('pyproject.toml') || FILES.some(f => /requirements.*\.txt$/.test(f))) return 'python'
  if (FILES.includes('go.mod')) return 'service'
  return 'docs'
}

export function buildDefaults(repo) {
  const firstExisting = (cands) => cands.find(c => repo.FILES.includes(c)) || cands[0]
  return {
    project_type: detectType(repo),
    makes_external_claims: true,
    bootstrap_command: null,
    command_timeout_ms: 600000,
    status_file: firstExisting(['docs/start-here.md', 'docs/start_here.md', 'start-here.md', 'start_here.md', 'README.md']),
    claims_file: 'docs/CLAIMS.json',
    decision_globs: ['docs/decisions/*.md', 'docs/adr/*.md', 'adr/*.md', 'docs/decisions/**/*.md'],
    doc_globs: ['**/*.md'],
    sources_of_truth: {},
    signoff_file: '.project-baseline/signoff.json',
    prior_art_recheck_days: 90,
    doc_freshness_days: 180,
    doc_lag_days: 30,      // CTX-11: max days a doc may lag the code it anchors
    stamp_max_lag_commits: 3, // CTX-01: a status stamp naming an ancestor within N commits of HEAD is still "fresh"
    freshness_globs: [],   // opt-in: docs that must carry last_review_date
    generated_globs: [],   // opt-in: generated files that must carry a DO NOT EDIT marker
    grounding_docs: [],    // opt-in: required grounding docs (exist + non-empty)
    profiles: [],          // extra profiles beyond core (service auto-enables for services)
  }
}

export function resolveConfig(repo, { cliConfigPath = null, profileArgs = [], descriptorRef = null } = {}) {
  const DEFAULTS = buildDefaults(repo)
  let cfg = { ...DEFAULTS }
  const EXPLICIT = new Set()
  const applyCfg = obj => { for (const kk of Object.keys(obj)) if (!kk.startsWith('_')) EXPLICIT.add(kk); cfg = { ...cfg, ...obj } }
  const inRepoCfg = repo.read('baseline.config.json'); if (inRepoCfg) try { applyCfg(JSON.parse(inRepoCfg)) } catch {}
  if (cliConfigPath && typeof cliConfigPath === 'string') try { applyCfg(JSON.parse(fs.readFileSync(path.resolve(cliConfigPath), 'utf8'))) } catch (e) { console.error('bad --config:', e.message) }
  for (const p of profileArgs) cfg.profiles = [...(cfg.profiles || []), p]

  // The descriptor's declared type is the root identity fact (C39): a valid baseline.repo.json
  // supersedes both the filesystem auto-detection and any config project_type, so a repo whose
  // package.json is only for tooling isn't misclassified as node. Absent or invalid descriptor
  // -> auto-detect/config still governs (the ref seam lets M6 read it from the target branch).
  const DESCRIPTOR = loadDescriptor(repo, { ref: descriptorRef })
  if (DESCRIPTOR.valid && DESCRIPTOR.data.type) cfg.project_type = DESCRIPTOR.data.type

  // Claims are OPT-IN: whether a repo makes external claims isn't robot-detectable at rest.
  // Active only if a claims register is present, OR makes_external_claims was explicitly set true.
  const claimsRegisterExists = (repo.FILES.includes(cfg.claims_file) || repo.match(cfg.claims_file).length > 0)
  const CLAIMS_ACTIVE = EXPLICIT.has('makes_external_claims') ? (cfg.makes_external_claims !== false) : claimsRegisterExists

  // active profiles: core always; service auto-on for services; others opt-in
  const ACTIVE = new Set(['core'])
  if (cfg.project_type === 'service') ACTIVE.add('service')
  for (const p of (cfg.profiles || [])) ACTIVE.add(p)

  let SIGNOFF = {}; const so = repo.read(cfg.signoff_file); if (so) try { SIGNOFF = JSON.parse(so) } catch {}

  return { cfg, DEFAULTS, EXPLICIT, CLAIMS_ACTIVE, ACTIVE, SIGNOFF, DESCRIPTOR }
}
