// The TRUST CIRCLE (v4) — the roster baseline wires into CI, and the committed stamps
// that make an off-repo artifact gateable at all.
//
// The thesis: a user adds a skill/tool to the trust circle, and baseline adds it to their
// CI. So this is not a repo-health scorecard — it is the list of tools this repo has
// chosen to trust, and baseline owns the WIRING for every one of them: the stamps under
// .baseline/trust/ are BASELINE's files, written and maintained here, never the tools'.
// Since v4 that ownership extends past the circle to baseline's OWN wiring in the repo —
// the orientation entrypoint at .baseline/orient.sh, installed by `trust wire` and checked
// for byte-identity by CTX-19 (see "the orientation entrypoint" below).
//
// == Two opt-ins, opposite defaults ==
// The trust circle below is the opt-IN half: default OUT, adopted a tool at a time. The
// BASELINE RULES LAYER (repo.mjs LAYER_KEY) is the opt-OUT half: every non-plugin rule, in
// by default, turned off as one layer. Setup is where a repo decides both, so both live on
// this surface — `trust setup` prints the layer's state on every run and
// `--baseline-rules in|out` is the one thing that writes it.
//
// == The roster is not the circle ==
// PLUGIN_NAMES is what baseline SUPPORTS. The trust circle of a given repo is what that
// repo ADOPTED: the names its baseline.config.json `plugins` object carries as keys
// (repo.mjs resolves that to `member`). Everything else is a SUGGESTION — offered here and
// by the check report, resolved n/a by the PLUG rules, and never able to reach an exit
// code. `trust add` / `trust remove` are the two ways the circle changes over a project's
// life, and both do exactly one thing: edit that key set in baseline.config.json, so
// membership stays a fact anyone can read out of a tracked file.
//
// The roster is DERIVED from the plugin table in repo.mjs (PLUGIN_NAMES), never a second
// hardcoded list — a member added to PLUGIN_DEFAULTS shows up in the bootstrapper surface
// the same run. What CANNOT be derived is each member's integrity tier, which is genuinely
// new information; it lives in SETUP below, keyed by the same names, and a roster member
// with no SETUP row is reported as 'unknown' rather than silently dropped.
//
// == Why stamps exist ==
// CI clones TRACKED FILES ONLY. That is the whole problem:
//   obsidian-tdd  tdd.json is tracked          -> already gateable; git's committer date is
//                                               the fact. NO stamp is written for it.
//   graphify      graphify-out/ is gitignored  -> absent in CI. Needs a stamp.
//   okf-rag       the bundle lives outside     -> absent in CI. Needs a stamp.
//   my-onto       does not exist yet           -> FAIL-SILENT: no stamp, no rule, no severity
//                                               and no verify row. It is named by the
//                                               bootstrapper surface and nowhere else.
//
// == Two integrity tiers, and the difference is visible everywhere ==
// VERIFIABLE (graphify): the stamp copies the per-file MD5s graphify already recorded in
//   graphify-out/manifest.json, and `trust verify` RECOMPUTES those MD5s over the tracked
//   files in the tree. A stamp that no longer matches the tree is a finding, so the claim
//   cannot quietly go stale. It is not unforgeable — a person can hand-write today's
//   hashes — but it can never assert a freshness the tree contradicts, which is the
//   property a CI gate actually needs.
// RECORDED (okf-rag): the bundle is outside the repo and human-curated. baseline records
//   "indexed as of commit X" and says, on every surface that prints it, that it cannot
//   check it. A recorded stamp is A CLAIM SOMEONE MADE, and it is never a gate.
// The mechanism carries the distinction too, not just the wording: `trust stamp` refreshes
// verifiable stamps on its own, but re-records an unverifiable claim ONLY when the member
// is named with --member. Re-asserting something baseline cannot check is a human act.
//
// == Why code files only (the graphify scope) ==
// A manifest row carries two hashes. ast_hash comes from the deterministic AST pass, which
// runs on code files and is a pure function of the bytes. semantic_hash is stamped only
// when an LLM extraction produced output for that file, so it tracks the extraction as
// much as the file — after a graphify upgrade a doc's row can move without the doc moving.
// Gating on that would fire "your graph is stale" at a tool upgrade. So the stamp carries
// code rows only, and records the extension SCOPE it actually covered so verification can
// spot a new file of a covered kind without re-deciding what "code" means.
//
// Determinism: the stamp is repo-relative posix keys sorted code-unit, hashes over raw
// worktree bytes, and .gitattributes pins `* -text` so those bytes are identical on every
// platform. Same repo state -> byte-identical stamp, here and in CI.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { makeOpt, sanitizeTTY } from './util.mjs'
import { PLUGIN_DEFAULTS, indexRepo, repoRelative, baselineLayerOf, LAYER_KEY } from './repo.mjs'
import { loadRules } from './rules.mjs'
import { isBaselineRule } from './engine.mjs'
import { PLUGIN_NAMES, pluginSpec, probePlugin } from './plugins.mjs'
import { resolveConfig } from './config.mjs'

export const TRUST_DIR = '.baseline/trust'
export const STAMP_VERSION = 'trust/1'
export const stampRel = name => path.posix.join(TRUST_DIR, `${String(name)}.json`)

// The integrity tier per roster member, plus what a fresh repo has to do to get one.
// `stamp` is the contract word the surfaces print: none | verifiable | recorded | silent.
const SETUP = Object.freeze({
  'obsidian-tdd': Object.freeze({
    stamp: 'none', artifact: 'tdd.json', lives: 'in the repo, tracked',
    install: 'npm i -g obsidian-tdd',
    setup: 'install obsidian-tdd, run it once so tdd.json lands at the repo root, and commit tdd.json',
    why: "the artifact is tracked, so CI already sees it — git's committer date is the fact, and a stamp would only restate it",
  }),
  graphify: Object.freeze({
    stamp: 'verifiable', artifact: 'graphify-out/', lives: 'in the repo, gitignored',
    install: 'pip install graphifyy',
    setup: 'install graphify, build the graph, keep graphify-out/ gitignored, then run `baseline trust stamp` and commit .baseline/trust/graphify.json',
    why: 'the graph is gitignored, so CI never sees it — the stamp carries the per-file hashes graphify recorded, and baseline recomputes them',
  }),
  'okf-rag': Object.freeze({
    stamp: 'recorded', artifact: '$BASELINE_OKF_BUNDLE', lives: 'outside the repo',
    install: 'npm i -g okf-rag',
    setup: 'install okf-rag, export BASELINE_OKF_BUNDLE=<dir> (or set plugins.okf-rag.path), then run `baseline trust stamp --member okf-rag` and commit the stamp',
    why: 'the bundle is outside the repo and human-curated — baseline can record when it was indexed but can never check it',
  }),
  'my-onto': Object.freeze({
    stamp: 'silent', artifact: null, lives: 'not built yet',
    install: null,
    setup: 'nothing yet — my-onto is declared so the roster is honest about it; it emits nothing until it exists',
    why: 'fail-silent by decision: no stamp, no rule, no severity. A tool that does not exist cannot be a gate, and pretending otherwise is an empty claim',
  }),
})
const UNKNOWN_SETUP = Object.freeze({
  stamp: 'unknown', artifact: null, lives: 'unknown',
  install: null,
  setup: 'no trust-circle wiring is declared for this member yet — add its row to SETUP in src/trust.mjs',
  why: 'a plugin in the table with no declared tier is reported, never silently dropped',
})

/** The trust circle, one entry per roster member, in plugin-table order. Names come from
 *  PLUGIN_NAMES (derived); the tier and the setup prose come from SETUP (declared). */
export function requiredSetup() {
  return PLUGIN_NAMES.map(name => {
    const s = SETUP[name] || UNKNOWN_SETUP
    return {
      name,
      path: PLUGIN_DEFAULTS[name]?.path ?? null,
      ignored: PLUGIN_DEFAULTS[name]?.ignored ?? null,
      env: PLUGIN_DEFAULTS[name]?.env ?? null,
      stamp: s.stamp,
      stamp_file: s.stamp === 'verifiable' || s.stamp === 'recorded' ? stampRel(name) : null,
      artifact: s.artifact,
      lives: s.lives,
      install: s.install,
      setup: s.setup,
      why: s.why,
    }
  })
}

/** The bootstrapper surface: the trust-circle members a fresh repo has to be wired for,
 *  by name, in roster order. `requiredSetup()` is the same answer with the reasons. */
export function describeRequiredSetup() {
  return requiredSetup().map(e => e.name)
}

// ---------------------------------------------------------------- membership (v4)
//
// The config surface, in one place. A member is a KEY of baseline.config.json's `plugins`
// object; that is all it takes, and it is all `add`/`remove` touch. Value shapes:
//   "graphify": {}                              adopted at the shipped defaults
//   "graphify": { "path": ..., "ignored": ... } adopted, with an override
//   "graphify": false                           declined on the record — NOT a member
//   (key absent)                                a suggestion — NOT a member
// Nothing here inspects the tree: adoption is a decision, not a detection, and a decision
// baseline guessed from a directory it found would gate CI on an accident.
export const CONFIG_FILE = 'baseline.config.json'

/** Read the repo's config as a plain object. { present, data, error, abs, rel }. */
export function readRepoConfig(REPO) {
  const abs = path.join(REPO, CONFIG_FILE)
  const out = { present: false, data: {}, error: null, abs, rel: CONFIG_FILE }
  let raw; try { raw = fs.readFileSync(abs, 'utf8') } catch { return out }
  out.present = true
  try {
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object' || Array.isArray(j)) { out.error = 'is not a JSON object'; return out }
    out.data = j
  } catch (e) { out.error = `is not valid JSON (${e.message})` }
  return out
}

/** The trust circle of THIS repo, read straight off the config file (never the tree).
 *  -> { members: [], suggested: [], declined: [], error } in plugin-table order. */
export function circleOf(REPO) {
  const c = readRepoConfig(REPO)
  const decl = c.data && typeof c.data.plugins === 'object' && c.data.plugins && !Array.isArray(c.data.plugins) ? c.data.plugins : {}
  const members = [], suggested = [], declined = []
  for (const name of PLUGIN_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(decl, name)) { suggested.push(name); continue }
    const v = decl[name]
    ;(v === false || v === null ? declined : members).push(name)
  }
  return { members, suggested, declined, error: c.error, present: c.present, rel: c.rel }
}

/** The config baseline RECOMMENDS to a repo that has adopted nothing — every supported
 *  tool that has a rule behind it, at the shipped defaults. Derived from the table and the
 *  tiers, so it can never drift from what the rules actually read. A silent member
 *  (my-onto) is left out: a tool that does not exist yet cannot be recommended. */
export function recommendedPlugins() {
  const out = {}
  for (const e of requiredSetup()) {
    if (e.stamp === 'silent') continue
    // okf-rag's default path is the env var, so the recommendation states only the policy
    out[e.name] = e.path ? { path: e.path, ignored: e.ignored } : { ignored: e.ignored }
  }
  return out
}

/** Serialize the config back with the house shape: 2-space JSON, trailing newline. Key
 *  order is preserved by JSON.parse/stringify, so an existing file keeps its `_comment`
 *  prose and its ordering and shows a one-key diff. */
function writeRepoConfig(REPO, data) {
  fs.writeFileSync(path.join(REPO, CONFIG_FILE), JSON.stringify(data, null, 2) + '\n')
}

/** Add `name` to the circle (idempotent). `overrides` is an optional { path?, ignored? }.
 *  -> { ok, changed, rel, was, reason } */
export function addMember(REPO, name, overrides = null) {
  const c = readRepoConfig(REPO)
  if (c.error) return { ok: false, changed: false, rel: c.rel, reason: `${c.rel} ${c.error} — fix it before editing the trust circle` }
  const data = c.data
  if (!data.plugins || typeof data.plugins !== 'object' || Array.isArray(data.plugins)) data.plugins = {}
  const had = Object.prototype.hasOwnProperty.call(data.plugins, name)
  const was = had ? data.plugins[name] : undefined
  const wasMember = had && was !== false && was !== null
  const body = overrides && typeof overrides === 'object' && Object.keys(overrides).length
    ? { ...(wasMember && was && typeof was === 'object' ? was : {}), ...overrides }
    : (wasMember && was && typeof was === 'object' ? was : {})
  const same = wasMember && JSON.stringify(was) === JSON.stringify(body)
  if (same) return { ok: true, changed: false, rel: c.rel, reason: `${name} is already a member — its rule already gates this build` }
  data.plugins[name] = body
  writeRepoConfig(REPO, data)
  return { ok: true, changed: true, rel: c.rel, reason: `${name} joined the trust circle — its rule now gates${c.present ? '' : ` (${c.rel} created)`}` }
}

/** Remove `name` from the circle: delete the key, so the tool falls back to SUGGESTED. */
export function removeMember(REPO, name) {
  const c = readRepoConfig(REPO)
  if (c.error) return { ok: false, changed: false, rel: c.rel, reason: `${c.rel} ${c.error} — fix it before editing the trust circle` }
  const data = c.data
  const decl = data.plugins && typeof data.plugins === 'object' && !Array.isArray(data.plugins) ? data.plugins : null
  if (!decl || !Object.prototype.hasOwnProperty.call(decl, name)) {
    return { ok: true, changed: false, rel: c.rel, reason: `${name} was not a member — it is suggested, and a suggestion never failed anything` }
  }
  delete decl[name]
  writeRepoConfig(REPO, data)
  return { ok: true, changed: true, rel: c.rel, reason: `${name} left the trust circle — it is a suggestion again, and its rule resolves n/a` }
}

// ---------------------------------------------------------------- the baseline rules layer (v4)
//
// One key, one value, and the same "edit exactly one thing in baseline.config.json" shape
// `add`/`remove` keep for membership. The asymmetry with membership is deliberate and lives
// in repo.mjs: an ABSENT key means IN, so the write is only ever needed to opt OUT, and
// opting back in DELETES the key rather than writing `true` — the config says nothing, and
// nothing is the default. (`--baseline-rules in` on a repo that never opted out is a no-op
// that reports itself as one.)

/** The layer as this repo's config states it: { in, source, rel, error }. */
export function layerOf(REPO) {
  const c = readRepoConfig(REPO)
  const l = baselineLayerOf(c.error ? {} : c.data)
  return { ...l, rel: c.rel, present: c.present, error: c.error }
}

/** The baseline rules the layer governs, by id — derived from the shipped rule set, so the
 *  surface can never name a rule the runner does not have. */
export function layerRuleIds() {
  try { return loadRules().rules.filter(isBaselineRule).map(r => r.id) } catch { return [] }
}

/** Opt the layer in (delete the key) or out (write `false`). -> { ok, changed, rel, reason } */
export function setLayer(REPO, on) {
  const c = readRepoConfig(REPO)
  if (c.error) return { ok: false, changed: false, rel: c.rel, reason: `${c.rel} ${c.error} — fix it before editing the baseline rules layer` }
  const data = c.data
  const had = Object.prototype.hasOwnProperty.call(data, LAYER_KEY)
  const was = baselineLayerOf(data).in
  if (on) {
    if (!had) return { ok: true, changed: false, rel: c.rel, reason: `the baseline rules layer is already IN — no ${LAYER_KEY} key, and an absent key IS the default` }
    delete data[LAYER_KEY]
    writeRepoConfig(REPO, data)
    return { ok: true, changed: true, rel: c.rel, reason: `the baseline rules layer is IN — ${LAYER_KEY} deleted, so the default stands and every baseline rule gates again` }
  }
  if (had && was === false) return { ok: true, changed: false, rel: c.rel, reason: `the baseline rules layer is already OUT — ${LAYER_KEY} is false, and those rules produce no finding` }
  data[LAYER_KEY] = false
  writeRepoConfig(REPO, data)
  return { ok: true, changed: true, rel: c.rel, reason: `the baseline rules layer is OUT — ${LAYER_KEY}:false, so those rules resolve n/a and cannot fail this build${c.present ? '' : ` (${c.rel} created)`}` }
}

// ---------------------------------------------------------------- the orientation entrypoint (v4)
//
// The third thing baseline OWNS in a repo, beside the config key set and the stamps — and
// the only one that is not about a plugin at all. `baseline trust wire` installs it, the
// repo commits it, and CTX-19 checks it. It belongs on this surface because it is wiring,
// and wiring is what `trust` is for.
//
// It is an IDENTITY check, never an existence check. "Some script called orient.sh is
// here" proves nothing: the useful fact is that THIS repo opens the way every other
// baseline-activated repo opens, and only byte-identity says that. So the committed copy
// is compared byte-for-byte against the copy the INSTALLED baseline ships, and a local
// edit — the actual failure mode — is named as drift.
//
// VERSION SKEW, handled rather than hoped away. The comparison target is always the
// version THIS baseline ships, and the finding says so, because a repo wired by an older
// baseline is a different situation from a repo whose copy someone edited. The script
// therefore carries its OWN contract version (the marker line), bumped only when the
// script changes — so an ordinary baseline release does not make every wired repo look
// drifted, and when the script really does change, the finding can say "your copy is
// entrypoint v1, this baseline ships v2" instead of "your copy differs".
//
// ABSENCE IS NOT DRIFT. A repo with no entrypoint at all has made no claim to check, so
// the state is n/a — the same answer this file already gives for a member that is not
// stamped yet, and the same answer the engine gives any rule with no subject in the tree.
// The n/a is not silence: it carries `baseline trust wire` as its reason and rides in
// --json like every other n/a row.
export const ORIENT_REL = '.baseline/orient.sh'
const ORIENT_TEMPLATE = 'templates/orient.sh'
const ORIENT_MARKER = /^#[ \t]*baseline-orient-entrypoint:[ \t]*(\S+)[ \t]*$/m
const orientVersionOf = body => (String(body ?? '').match(ORIENT_MARKER) || [, null])[1]

/** The entrypoint THIS baseline ships, read out of the installed distribution (never a
 *  string literal here — the file is the artifact, and one copy of it is the point).
 *  -> { ok, body, version, rel } */
export function shippedOrient() {
  const rel = ORIENT_TEMPLATE
  let body = null
  try { body = fs.readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8') } catch {}
  return { ok: typeof body === 'string' && !!body, body, version: orientVersionOf(body), rel }
}

/** The repo's committed entrypoint, judged against the shipped one.
 *  -> { state, rel, reason, shipped_version, found_version }
 *  state: 'n/a' (never wired, or nothing to compare against) | 'ok' | 'drift' | 'skew'
 *         | 'untracked' (present, but CI would never see it) */
export function orientEntrypointState(REPO) {
  const shipped = shippedOrient()
  const rel = ORIENT_REL
  const out = { state: 'n/a', rel, reason: null, shipped_version: shipped.version, found_version: null }
  if (!shipped.ok) {
    out.reason = `this baseline ships no ${shipped.rel}, so there is no version to compare against — nothing can be verified here`
    return out
  }
  let found
  try { found = fs.readFileSync(path.join(REPO, rel), 'utf8') }
  catch (e) {
    out.reason = e.code === 'ENOENT'
      ? `no orientation entrypoint at ${rel} — this repo was never wired, so there is no claim to check; \`baseline trust wire\` installs the one this baseline ships (entrypoint v${shipped.version}) and then this rule gates`
      : `${rel} is unreadable (${e.code || e.message}) — nothing can be compared`
    return out
  }
  out.found_version = orientVersionOf(found)
  if (!gitTracked(REPO, rel)) {
    out.state = 'untracked'
    out.reason = `${rel} is present but git does not track it — CI clones tracked files, so no other machine has the entrypoint at all; \`git add ${rel}\``
    return out
  }
  if (found === shipped.body) {
    out.state = 'ok'
    out.reason = `${rel} is byte-identical to the entrypoint this baseline ships (entrypoint v${shipped.version}) — this repo opens the way every baseline-activated repo opens`
    return out
  }
  if (out.found_version && out.found_version !== shipped.version) {
    out.state = 'skew'
    out.reason = `${rel} is entrypoint v${out.found_version}; THIS baseline ships v${shipped.version} — the committed copy was wired by an older baseline, not edited. Rerun \`baseline trust wire\` and commit ${rel}`
    return out
  }
  out.state = 'drift'
  out.reason = `${rel} differs from the entrypoint this baseline ships (both entrypoint v${shipped.version}${out.found_version ? '' : '; the committed copy carries no version marker'}) — the copy in this repo was edited, so it no longer does what every other baseline-activated repo does. \`baseline trust wire\` restores it; commit ${rel}`
  return out
}

/** Install (or restore) the entrypoint. Idempotent and byte-exact: a rerun on an already
 *  correct copy writes nothing, so a wired repo never shows a churn diff. */
export function wireOrientEntrypoint(REPO) {
  const shipped = shippedOrient()
  const rel = ORIENT_REL
  if (!shipped.ok) return { ok: false, changed: false, rel, reason: `this baseline ships no ${shipped.rel} — nothing to install` }
  const abs = path.join(REPO, rel)
  let before = null
  try { before = fs.readFileSync(abs, 'utf8') } catch {}
  if (before === shipped.body) {
    try { fs.chmodSync(abs, 0o755) } catch {}
    return { ok: true, changed: false, rel, version: shipped.version, reason: `already the entrypoint this baseline ships (v${shipped.version}) — byte-identical, nothing written` }
  }
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, shipped.body)
    fs.chmodSync(abs, 0o755)
  } catch (e) { return { ok: false, changed: false, rel, reason: `cannot write ${rel} — ${e.message}` } }
  const was = before === null ? 'installed' : orientVersionOf(before) === shipped.version ? 'restored over an edited copy' : `upgraded from entrypoint v${orientVersionOf(before) ?? '?'}`
  return { ok: true, changed: true, rel, version: shipped.version, reason: `${was}: entrypoint v${shipped.version} — \`git add ${rel}\` and commit it, because CI reads the tracked copy and nothing else` }
}

// ---------------------------------------------------------------- hashing

const HEX32 = /^[0-9a-f]{32}$/
/** MD5 is graphify's change-detection digest, so it is the one baseline must recompute to
 *  compare. A hardened/FIPS runtime refuses it — that is an n/a (nothing can be checked),
 *  never a finding, so the probe is asked once up front. */
export function md5Available() { try { createHash('md5'); return true } catch { return false } }
function md5File(abs) { try { return createHash('md5').update(fs.readFileSync(abs)).digest('hex') } catch { return null } }

// graphify's own code-file set (graphify/detect.py CODE_EXTENSIONS) — the rows whose
// ast_hash is a deterministic function of the bytes. Mirrored, not guessed: a row outside
// it is a semantic row and is out of scope by the reasoning in the header.
const GRAPHIFY_CODE_EXT = new Set(['.py', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.ejs', '.ets', '.go', '.rs', '.java', '.groovy', '.gradle', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.cu', '.cuh', '.metal', '.rb', '.rake', '.swift', '.kt', '.kts', '.cs', '.scala', '.php', '.lua', '.luau', '.toc', '.zig', '.ps1', '.psm1', '.psd1', '.ex', '.exs', '.m', '.mm', '.ml', '.mli', '.jl', '.vue', '.svelte', '.astro', '.dart', '.v', '.sv', '.svh', '.sql', '.r', '.f', '.F', '.f90', '.F90', '.f95', '.F95', '.f03', '.F03', '.f08', '.F08', '.pas', '.pp', '.dpr', '.dpk', '.lpr', '.inc', '.dfm', '.lfm', '.lpk', '.sh', '.bash', '.json', '.tf', '.tfvars', '.hcl', '.dm', '.dme', '.dmi', '.dmm', '.dmf', '.sln', '.slnx', '.csproj', '.fsproj', '.vbproj', '.xaml', '.razor', '.cshtml', '.cls', '.trigger', '.lisp', '.cl', '.lsp', '.asd'])
// Case-sensitive on purpose for the Fortran pair (.f vs .F are different rows upstream);
// everything else is lower-case, so try the raw extension first and the folded one second.
const isCodeExt = ext => GRAPHIFY_CODE_EXT.has(ext) || GRAPHIFY_CODE_EXT.has(ext.toLowerCase())
const extOf = rel => { const b = rel.slice(rel.lastIndexOf('/') + 1); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : '' }

// ---------------------------------------------------------------- git + stamp io

function gitTracked(REPO, rel) {
  try { execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: REPO, stdio: 'ignore' }); return true } catch { return false }
}
function gitHead(REPO) {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null } catch { return null }
}
function gitCommitExists(REPO, sha) {
  try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: REPO, stdio: 'ignore' }); return true } catch { return false }
}

/** One stamp off disk: { rel, present, tracked, data, error }. `error` is set only when a
 *  file IS there and cannot be used — absence is not an error, it is "not stamped yet". */
export function readStamp(REPO, name) {
  const rel = stampRel(name)
  const out = { rel, present: false, tracked: false, data: null, error: null }
  let raw
  try { raw = fs.readFileSync(path.join(REPO, rel), 'utf8') }
  catch (e) { if (e.code !== 'ENOENT') out.error = `unreadable — ${e.message}`; return out }
  out.present = true
  out.tracked = gitTracked(REPO, rel)
  let data
  try { data = JSON.parse(raw) } catch (e) { out.error = `not valid JSON — ${e.message}`; return out }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { out.error = 'not a stamp object'; return out }
  if (data.stamp !== STAMP_VERSION) { out.error = `unknown stamp version '${String(data.stamp)}' (this baseline writes ${STAMP_VERSION})`; return out }
  out.data = data
  return out
}

/** The plugin-authored one-liner off a committed stamp, or null. The ONE thing baseline
 *  says about a plugin's content, and it is quoted, never derived: baseline does not open
 *  the artifact (src/plugins.mjs), so if the tool wrote no summary there is nothing to say.
 *  Trimmed, single-lined and length-capped here because it is repo-authored text headed for
 *  a survey line; sanitizeTTY strips control bytes at the render boundary. */
export function stampSummary(REPO, name) {
  const st = readStamp(REPO, name)
  const v = st.data?.summary
  if (typeof v !== 'string') return null
  const one = v.replace(/\s+/g, ' ').trim()
  return one ? one.slice(0, 120) : null
}

/** Serialize a stamp: fixed key order, `files` sorted code-unit, trailing newline. The
 *  byte-identity of a rerun on unchanged inputs is the contract — a committed stamp must
 *  not churn, or every rebuild would look like a change. */
function serializeStamp(s) {
  const o = { stamp: STAMP_VERSION, member: s.member, integrity: s.integrity, artifact: s.artifact ?? null, evidence: s.evidence ?? null }
  // The plugin's OWN one-line description of what it produced ("412 nodes, 38 clusters").
  // baseline never authors this and never parses the artifact to derive it — the tool that
  // built the artifact writes the line, and baseline only carries it forward on a refresh
  // (v4: the orientation line comes from the stamp, so the plugin boundary stays shut).
  // Absent on every stamp that has none, so the byte-identity contract is unchanged.
  if (typeof s.summary === 'string' && s.summary.trim()) o.summary = s.summary.trim()
  if (s.integrity === 'recorded') { o.recorded_at = s.recorded_at ?? null; o.claim = s.claim }
  if (s.integrity === 'verifiable') {
    o.algo = s.algo
    o.scope = [...s.scope].sort()
    o.files = Object.fromEntries(Object.keys(s.files).sort().map(k => [k, s.files[k]]))
  }
  return JSON.stringify(o, null, 2) + '\n'
}

/** How a stamp NAMES the artifact. A committed file must not carry a machine path: an
 *  in-repo artifact is spelled repo-relative posix, and anything outside keeps its
 *  DECLARED form ($BASELINE_OKF_BUNDLE), so two machines write the same bytes. */
function artifactName(REPO, spec, declared) {
  return repoRelative(REPO, spec?.path) ?? declared ?? null
}

function writeStamp(REPO, name, content) {
  const rel = stampRel(name)
  const abs = path.join(REPO, rel)
  let before = null
  try { before = fs.readFileSync(abs, 'utf8') } catch {}
  if (before === content) return { rel, changed: false }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return { rel, changed: true }
}

// ---------------------------------------------------------------- graphify: read the manifest

/** graphify's manifest, reduced to the CODE rows that name a TRACKED file in this repo.
 *  -> { ok, reason, rows: Map(rel -> md5), scope: Set(ext) }
 *  Unreadable, unparseable, wrong-shaped or scoped-elsewhere all answer ok:false with a
 *  reason — the caller turns that into n/a and writes nothing. Never a finding (D: the
 *  manifest is the plugin's file, and baseline does not judge its format). */
export function readGraphifyManifest(REPO, artifactAbs, tracked) {
  const manifestAbs = path.join(artifactAbs, 'manifest.json')
  const manifestRel = path.posix.join(path.relative(REPO, artifactAbs).split(path.sep).join('/'), 'manifest.json')
  let raw
  try { raw = fs.readFileSync(manifestAbs, 'utf8') }
  catch (e) { return { ok: false, reason: e.code === 'ENOENT' ? `no manifest at ${manifestRel} — build the graph first` : `manifest unreadable (${e.code || e.message})`, rel: manifestRel } }
  let data
  try { data = JSON.parse(raw) } catch { return { ok: false, reason: `${manifestRel} is not valid JSON — unrecognized manifest`, rel: manifestRel } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: `${manifestRel} is not a manifest object — unrecognized`, rel: manifestRel }

  const rows = new Map()
  const scope = new Set()
  for (const [key, entry] of Object.entries(data)) {
    // Keys are posix-relative to graphify's scan root, or absolute for out-of-root
    // sources. Both are normalized against THIS repo; anything landing outside it is
    // simply not ours to stamp.
    const rel = path.isAbsolute(key) || /^[A-Za-z]:[\\/]/.test(key)
      ? path.relative(REPO, key).split(path.sep).join('/')
      : path.posix.normalize(key.split('\\').join('/'))
    if (!rel || rel === '..' || rel.startsWith('../')) continue
    const ext = extOf(rel)
    if (!isCodeExt(ext)) continue
    // Only a tracked file can be verified in CI, so only a tracked file is stamped —
    // a hash for a gitignored file would be a row no clone could ever check.
    if (!tracked.has(rel)) continue
    // ast_hash is the current shape; {mtime, hash} is the legacy one; a bare float row
    // carries no content hash at all and is unverifiable, so it is skipped.
    const h = entry && typeof entry === 'object'
      ? (typeof entry.ast_hash === 'string' ? entry.ast_hash : typeof entry.hash === 'string' ? entry.hash : '')
      : ''
    if (!HEX32.test(h)) continue
    rows.set(rel, h)
    scope.add(ext)
  }
  if (!rows.size) return { ok: false, reason: `${manifestRel} names no tracked code file this baseline can verify — unrecognized scope`, rel: manifestRel }
  return { ok: true, reason: null, rel: manifestRel, rows, scope }
}

// ---------------------------------------------------------------- verification

/** Recheck one verifiable stamp against the tree. Reads ONLY the stamp and the tracked
 *  files it names — never graphify-out/, which is exactly what CI does not have.
 *  -> { state: 'ok'|'stale'|'n/a'|'broken', checked, changed[], missing[], unstamped[] } */
export function verifyVerifiable(REPO, stamp, trackedList) {
  const files = stamp?.files
  if (!files || typeof files !== 'object') return { state: 'broken', reason: 'stamp carries no files map', checked: 0, changed: [], missing: [], unstamped: [] }
  if (stamp.algo !== 'md5') return { state: 'n/a', reason: `stamp digest '${String(stamp.algo)}' is not one this baseline computes`, checked: 0, changed: [], missing: [], unstamped: [] }
  if (!md5Available()) return { state: 'n/a', reason: 'md5 is unavailable in this runtime (FIPS?) — nothing can be recomputed', checked: 0, changed: [], missing: [], unstamped: [] }

  const tracked = new Set(trackedList)
  const changed = [], missing = []
  let checked = 0
  for (const rel of Object.keys(files).sort()) {
    if (!tracked.has(rel)) { missing.push(rel); continue }
    const now = md5File(path.join(REPO, rel))
    if (now === null) { missing.push(rel); continue }
    checked++
    if (now !== files[rel]) changed.push(rel)
  }
  // A tracked file of a kind the stamp DOES cover, with no row, is a file the graph never
  // saw. Scope comes from the stamp itself, so this can never fire on a file type graphify
  // was never asked to read here.
  const scope = new Set(Array.isArray(stamp.scope) ? stamp.scope : [])
  const unstamped = scope.size
    ? trackedList.filter(f => scope.has(extOf(f)) && !(f in files)).sort()
    : []
  const state = (changed.length || missing.length || unstamped.length) ? 'stale' : 'ok'
  return { state, reason: null, checked, changed, missing, unstamped }
}

/** The whole circle, verified. One row per member; my-onto is fail-silent and carries
 *  state 'silent' (present in --json so the surface stays machine-visible, never printed
 *  and never a finding). */
export function verifyTrust(REPO, { cfg } = {}) {
  const repo = indexRepo(REPO)
  const config = cfg || resolveConfig(repo).cfg
  const trackedList = repo.match(['**/*'], { tracked: true }).sort()
  const rows = []
  for (const e of requiredSetup()) {
    const row = { member: e.name, integrity: e.stamp, stamp_file: e.stamp_file, state: 'n/a', reason: null, detail: null }
    if (e.stamp === 'silent') { row.state = 'silent'; row.reason = e.setup; rows.push(row); continue }
    if (e.stamp === 'none') {
      const spec = pluginSpec(config, e.name)
      const p = probePlugin(REPO, e.name, spec)
      row.reason = p.present && p.git === 'tracked'
        ? `no stamp needed — ${spec?.path} is tracked; git's committer date is the fact`
        : `no stamp needed — ${spec?.path ?? e.artifact} is meant to be tracked (${p.present ? `git says ${p.git}` : 'absent'})`
      rows.push(row); continue
    }
    if (e.stamp === 'unknown') { row.reason = e.setup; rows.push(row); continue }

    const s = readStamp(REPO, e.name)
    if (s.error) { row.state = 'broken'; row.reason = `${s.rel} ${s.error}`; rows.push(row); continue }
    if (!s.present) { row.reason = `not stamped yet — run \`baseline trust stamp${e.stamp === 'recorded' ? ` --member ${e.name}` : ''}\``; rows.push(row); continue }
    if (!s.tracked) { row.state = 'broken'; row.reason = `${s.rel} is not tracked — CI never sees it; \`git add ${s.rel}\``; rows.push(row); continue }

    if (e.stamp === 'recorded') {
      // A recorded stamp is never a gate. The ONE thing baseline can check about it is
      // that the commit it names is in this history — and even that is said as context,
      // not as a verdict, because the claim itself remains unchecked.
      const at = typeof s.data.recorded_at === 'string' ? s.data.recorded_at : null
      const known = at ? gitCommitExists(REPO, at) : false
      row.state = 'recorded'
      row.reason = 'RECORDED ONLY — baseline cannot verify this; it is a claim someone made'
      row.detail = { recorded_at: at, commit_known: known, claim: typeof s.data.claim === 'string' ? s.data.claim : null }
      rows.push(row); continue
    }

    const v = verifyVerifiable(REPO, s.data, trackedList)
    row.state = v.state
    row.reason = v.reason
    row.detail = { checked: v.checked, changed: v.changed, missing: v.missing, unstamped: v.unstamped, evidence: s.data.evidence ?? null }
    rows.push(row)
  }
  const findings = rows.filter(r => r.state === 'stale' || r.state === 'broken')
  return { rows, findings }
}

// ---------------------------------------------------------------- stamping

/** Write (or refresh) the stamps. `only` names a single member; without it the pass
 *  refreshes VERIFIABLE stamps and leaves recorded ones alone — re-asserting a claim
 *  baseline cannot check is a deliberate act, so it needs --member. */
export function stampTrust(REPO, { only = null, cfg = null } = {}) {
  const repo = indexRepo(REPO)
  const config = cfg || resolveConfig(repo).cfg
  const tracked = new Set(repo.match(['**/*'], { tracked: true }))
  const acts = []
  for (const e of requiredSetup()) {
    if (only && e.name !== only) continue
    const act = { member: e.name, integrity: e.stamp, rel: e.stamp_file, wrote: false, changed: false, state: 'n/a', reason: null }

    if (e.stamp === 'silent' || e.stamp === 'none' || e.stamp === 'unknown') {
      act.reason = e.stamp === 'none' ? 'no stamp needed — the artifact is tracked' : e.stamp === 'silent' ? 'fail-silent — nothing is written until it exists' : 'no tier declared'
      acts.push(act); continue
    }

    const spec = pluginSpec(config, e.name)
    const probe = probePlugin(REPO, e.name, spec)

    if (e.stamp === 'recorded') {
      if (!only) { act.reason = `recorded-only — refreshed only on request (\`--member ${e.name}\`), because baseline cannot verify what it would be re-asserting`; acts.push(act); continue }
      if (!probe.present) { act.reason = `${e.artifact} is absent — nothing to record (${e.setup})`; acts.push(act); continue }
      const head = gitHead(REPO)
      if (!head) { act.state = 'refused'; act.reason = 'no git HEAD to record the claim against'; acts.push(act); continue }
      const content = serializeStamp({
        member: e.name, integrity: 'recorded', artifact: artifactName(REPO, spec, e.artifact), evidence: null,
        summary: stampSummary(REPO, e.name),
        recorded_at: head,
        claim: `${e.name} was indexed as of commit ${head}; baseline records this and cannot verify it`,
      })
      const w = writeStamp(REPO, e.name, content)
      act.wrote = true; act.changed = w.changed; act.state = 'recorded'
      act.reason = w.changed ? `recorded as of ${head} — an unverifiable claim, committed as one` : 'unchanged'
      acts.push(act); continue
    }

    // verifiable — graphify today
    if (!probe.present || !probe.abs) { act.reason = `${e.artifact} is absent — nothing to stamp (${e.setup})`; acts.push(act); continue }
    if (!md5Available()) { act.reason = 'md5 is unavailable in this runtime — a stamp baseline could not later recompute is worse than none'; acts.push(act); continue }
    const m = readGraphifyManifest(REPO, probe.abs, tracked)
    if (!m.ok) { act.reason = m.reason; acts.push(act); continue } // n/a, never a finding
    const content = serializeStamp({
      member: e.name, integrity: 'verifiable', artifact: artifactName(REPO, spec, e.artifact), evidence: m.rel,
      summary: stampSummary(REPO, e.name),
      algo: 'md5', scope: m.scope, files: Object.fromEntries(m.rows),
    })
    const w = writeStamp(REPO, e.name, content)
    act.wrote = true; act.changed = w.changed; act.state = 'verifiable'
    act.reason = `${m.rows.size} tracked code file(s) hashed from ${m.rel}${w.changed ? '' : ' — unchanged'}`
    acts.push(act)
  }
  return acts
}

// ---------------------------------------------------------------- the CLI

const TRUST_USAGE = `usage: baseline trust setup [--repo DIR] [--baseline-rules in|out] [--json]
         baseline trust add NAME [--repo DIR] [--path P] [--ignored true|false] [--json]
         baseline trust remove NAME [--repo DIR] [--json]
         baseline trust stamp [--repo DIR] [--member NAME] [--json]
         baseline trust verify [--repo DIR] [--json]
         baseline trust wire [--repo DIR] [--json]`

const S = sanitizeTTY
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length))

export function runTrust(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`baseline trust — the trust circle: what this repo trusts, and the stamps that let CI gate it
  ${TRUST_USAGE}
  setup:  the bootstrapper surface — every supported tool, whether THIS repo adopted it, its integrity tier and
          what a fresh repo must do, plus the state of the BASELINE RULES LAYER (the non-plugin rules). With no
          members it prints the recommended baseline.config.json to copy
          --baseline-rules in|out opts the layer in or out: OUT writes ${LAYER_KEY}:false and those rules
          resolve n/a (no finding, out of the exit gate, printed on every run); IN deletes the key, because an
          absent key IS the default and the default is IN
  add:    adopt a tool — writes plugins.<name> into baseline.config.json, and its rule starts gating this build
  remove: drop a member — deletes the key, and the tool goes back to being a suggestion (n/a, never a finding)
  stamp:  write/refresh .baseline/trust/<member>.json (commit them). Verifiable stamps refresh on their own;
          a RECORDED-ONLY stamp is re-asserted only when you name it with --member, because baseline cannot check it
  verify: recheck the committed stamps against the tracked tree — graphify's is RECOMPUTED (exit 1 on a stale
          or broken stamp), okf-rag's is printed as the unverifiable claim it is (never a gate)
  wire:   install ${ORIENT_REL}, the orientation entrypoint (commit it). baseline OWNS this file: CTX-19 checks the
          committed copy is BYTE-IDENTICAL to the one this baseline ships, so every activated repo opens the same
          way. Idempotent — a correct copy is left untouched; an edited one is restored`)
    return 0
  }
  const SUBS = ['setup', 'add', 'remove', 'stamp', 'verify', 'wire']
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  let rest = sub ? argv.slice(1) : argv
  const usage = msg => { console.error(`baseline trust: ${msg}\n  ${TRUST_USAGE}`); return 2 }
  if (!sub) return usage(`a subcommand is required (${SUBS.join(', ')})`)
  if (!SUBS.includes(sub)) return usage(`unknown subcommand '${sub}'`)
  // add/remove take the member NAME positionally — the roster is the closed vocabulary, so
  // a typo is named against it rather than silently writing a key no rule reads.
  const POSITIONAL = sub === 'add' || sub === 'remove'
  let NAME = null
  if (POSITIONAL) {
    if (!rest.length || rest[0].startsWith('-')) return usage(`${sub} needs a member name (${PLUGIN_NAMES.join(', ')})`)
    NAME = rest[0]; rest = rest.slice(1)
    if (!PLUGIN_NAMES.includes(NAME)) return usage(`'${NAME}' is not a supported tool (${PLUGIN_NAMES.join(', ')})`)
  }
  const FLAGS = sub === 'setup' ? new Set(['--repo', '--baseline-rules', '--json'])
    : sub === 'add' ? new Set(['--repo', '--path', '--ignored', '--json'])
    : sub === 'stamp' ? new Set(['--repo', '--member', '--json'])
    : new Set(['--repo', '--json'])
  const VALUELESS = new Set(['--json'])
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('-')) return usage(`unexpected argument '${rest[i]}'`)
    if (!FLAGS.has(rest[i])) return usage(`unknown flag '${rest[i]}'`)
    if (!VALUELESS.has(rest[i])) i++
  }
  const opt = makeOpt(rest)
  for (const f of ['--repo', '--member', '--path', '--ignored', '--baseline-rules']) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const JSON_OUT = !!opt('--json', false)
  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  try { if (!fs.statSync(REPO).isDirectory()) throw new Error('not a directory') }
  catch (e) { console.error(`baseline trust: --repo ${REPO} — ${e.message}`); return 2 }

  if (sub === 'setup') {
    // the layer's two words are a closed vocabulary too: a typo must be named, never
    // silently read as "out" — that direction is the one that stops rules gating.
    const layer = opt('--baseline-rules', null)
    if (layer !== null && !['in', 'out'].includes(String(layer))) return usage(`--baseline-rules takes in or out (got '${layer}')`)
    return runTrustSetup(REPO, JSON_OUT, layer === null ? null : String(layer) === 'in')
  }
  if (sub === 'add' || sub === 'remove') {
    const overrides = {}
    const p = opt('--path', null); if (p !== null) overrides.path = String(p)
    const ig = opt('--ignored', null)
    if (ig !== null) {
      if (!['true', 'false'].includes(String(ig))) return usage(`--ignored takes true or false (got '${ig}')`)
      overrides.ignored = String(ig) === 'true'
    }
    return runTrustMembership(REPO, sub, NAME, overrides, JSON_OUT)
  }
  if (sub === 'stamp') {
    const only = opt('--member', null)
    if (only !== null && !PLUGIN_NAMES.includes(String(only))) return usage(`--member '${only}' is not in the trust circle (${PLUGIN_NAMES.join(', ')})`)
    return runTrustStamp(REPO, only === null ? null : String(only), JSON_OUT)
  }
  if (sub === 'wire') return runTrustWire(REPO, JSON_OUT)
  return runTrustVerify(REPO, JSON_OUT)
}

/** wire — the install side of CTX-19. One file, written only when its bytes would change. */
function runTrustWire(REPO, JSON_OUT) {
  let res
  try { res = wireOrientEntrypoint(REPO) }
  catch (e) { console.error(`baseline trust wire: ${e.message}`); return 2 }
  const state = orientEntrypointState(REPO)
  if (JSON_OUT) {
    console.log(JSON.stringify({ action: 'wire', ...res, entrypoint: state }, null, 2))
    return res.ok ? 0 : 2
  }
  if (!res.ok) { console.error(`baseline trust wire: ${S(res.reason)}`); return 2 }
  console.log(`  ${res.changed ? '+' : '·'} ${S(res.rel)}: ${S(res.reason)}`)
  // the state AFTER the write, so the line a reader sees is the one CTX-19 will read next
  console.log(`\ntrust wire: ${state.state === 'ok' ? 'CTX-19 is satisfied once this is committed' : `CTX-19 still says ${S(state.state)} — ${S(state.reason)}`}`)
  return 0
}

function runTrustSetup(REPO, JSON_OUT, layerWanted = null) {
  const setup = requiredSetup()
  // the layer is DECIDED here, before anything is read back, so the printed state is the
  // state this invocation leaves behind rather than the one it found
  let layerAct = null
  if (layerWanted !== null) {
    try { layerAct = setLayer(REPO, layerWanted) }
    catch (e) { console.error(`baseline trust setup: ${e.message}`); return 2 }
    if (!layerAct.ok && !JSON_OUT) { console.error(`baseline trust setup: ${S(layerAct.reason)}`); return 2 }
  }
  const circle = circleOf(REPO)
  const layer = layerOf(REPO)
  const layerRules = layerRuleIds()
  const isMember = n => circle.members.includes(n)
  if (JSON_OUT) {
    console.log(JSON.stringify({
      roster: describeRequiredSetup(),
      members: circle.members, suggested: circle.suggested, declined: circle.declined,
      config_file: circle.rel, config_error: circle.error,
      recommended: { plugins: recommendedPlugins() },
      setup: setup.map(e => ({ ...e, member: isMember(e.name) })),
      // the other opt-in: the non-plugin rules, in by default, named so a machine reader
      // sees exactly which rules an opted-out layer muted
      baseline: { key: LAYER_KEY, layer: layer.in ? 'in' : 'out', source: layer.source, rules: layerRules, ...(layerAct ? { action: layerAct } : {}) },
      // baseline's own wiring in this repo, beside the two opt-ins: the orientation
      // entrypoint CTX-19 reads (`baseline trust wire` installs it)
      entrypoint: orientEntrypointState(REPO),
    }, null, 2))
    return layerAct && !layerAct.ok ? 2 : 0
  }
  if (layerAct) console.log(`  ${layerAct.changed ? '+' : '·'} ${S(layerAct.reason)}\n`)
  console.log(`trust circle — ${setup.length} supported tool(s), ${circle.members.length} adopted by this repo; baseline owns the wiring for every one`)
  if (circle.error) console.log(`  ! ${S(circle.rel)} ${S(circle.error)} — read as declaring nothing, so every tool is a suggestion`)
  const w = Math.max(...setup.map(e => e.name.length))
  const TIER = { verifiable: 'VERIFIABLE stamp', recorded: 'RECORDED stamp  ', none: 'no stamp needed ', silent: 'fail-silent     ', unknown: 'no tier declared' }
  // MEMBER / suggested is the fact a reader needs first: it is the difference between a
  // rule that gates this build and a row that can never fail it.
  const STANDING = e => e.stamp === 'silent' ? 'fail-silent' : isMember(e.name) ? 'MEMBER   ' : circle.declined.includes(e.name) ? 'declined ' : 'suggested'
  for (const e of setup) {
    console.log(`  ${pad(e.name, w)}  ${STANDING(e)}  ${TIER[e.stamp] || e.stamp}  ${e.artifact ?? '—'} (${e.lives})`)
    console.log(`  ${' '.repeat(w)}    setup: ${e.setup}`)
    console.log(`  ${' '.repeat(w)}    why:   ${e.why}`)
  }
  // The BASELINE RULES LAYER, always printed: it is the half of the rule set a repo gets by
  // standing still, so a reader must be told its state whether or not they asked to change it.
  console.log(`\nbaseline rules layer — ${layer.in ? 'IN' : 'OUT'} (${layer.source === 'config' ? `${S(layer.rel)} ${LAYER_KEY}` : `the default — no ${LAYER_KEY} key, and an absent key means IN`})`)
  console.log(`  ${layerRules.length} rule(s) outside the trust circle: ${layerRules.map(S).join(', ')}`)
  console.log(layer.in
    ? `  they gate this build. opt the layer out with \`baseline trust setup --baseline-rules out\` — they then resolve n/a, exactly as an unadopted plugin does, and the state stays printed on every run`
    : `  they produce NO finding and are excluded from the exit gate — nothing is checking them. \`baseline trust setup --baseline-rules in\` deletes the key and puts them back`)

  // baseline's own wiring in this repo — neither opt-in, and the one thing on this surface
  // that is not about a plugin: the orientation entrypoint CTX-19 reads.
  const ep = orientEntrypointState(REPO)
  console.log(`\norientation entrypoint — ${S(ep.rel)}: ${ep.state === 'ok' ? 'WIRED' : ep.state === 'n/a' ? 'not wired' : ep.state.toUpperCase()}`)
  console.log(`  ${S(ep.reason ?? '')}`)

  if (!circle.members.length) {
    // The suggestion surface: a repo that adopted nothing is OFFERED everything, and told
    // in the same breath that none of it can fail its build today. This is output only.
    console.log(`\nnothing is adopted, so no plugin rule can fail this build — every PLUG row resolves n/a.`)
    console.log(`the recommended circle, copy into ${S(circle.rel)}:\n`)
    for (const line of JSON.stringify({ plugins: recommendedPlugins() }, null, 2).split('\n')) console.log(`  ${line}`)
    console.log(`\n  graphify is the deterministic one: an AST pass over the tree, no LLM in the loop, so the`)
    console.log(`  same commit always produces the same graph — keep graphify-out/ gitignored and let the`)
    console.log(`  committed stamp (\`baseline trust stamp\`) be what CI reads.`)
    console.log(`\nor adopt one at a time: baseline trust add <tool> --repo ${S(REPO)}`)
  }
  return 0
}

/** The warning a fresh adoption earns when the tool has produced nothing yet: its presence
 *  rule now gates, and it will fail until the artifact exists. null when there is nothing to
 *  warn about (artifact present, or a member with no artifact to probe). */
function absentArtifactWarning(REPO, name) {
  const e = requiredSetup().find(x => x.name === name)
  if (!e) return null
  const spec = pluginSpec(resolveConfig(indexRepo(REPO)).cfg, name)
  if (!spec) return null
  if (probePlugin(REPO, name, spec).present) return null
  return `${e.artifact} does not exist yet, so ${name}'s presence rule fails from now on — build it first (${e.setup}), or \`baseline trust remove ${name}\` until you have`
}

/** add / remove — the roster changes over a project's life, and this is the only thing
 *  that changes it: one key in baseline.config.json. */
function runTrustMembership(REPO, sub, name, overrides, JSON_OUT) {
  let res
  try { res = sub === 'add' ? addMember(REPO, name, overrides) : removeMember(REPO, name) }
  catch (e) { console.error(`baseline trust ${sub}: ${e.message}`); return 2 }
  const circle = circleOf(REPO)
  // ORDER MATTERS, and adopting is the step that makes it bite: a member's presence rule
  // gates from this moment on, so adopting a tool whose artifact does not exist yet turns
  // the build red immediately — and not on the freshness rule, on PLUG-0N presence. Build
  // the artifact first, adopt second. Said here because this is where the cost is incurred,
  // and it is a WARNING, never a refusal: adopting ahead of the artifact is a legitimate
  // way to make a build red on purpose.
  const pending = sub === 'add' && res.ok ? absentArtifactWarning(REPO, name) : null
  if (JSON_OUT) {
    console.log(JSON.stringify({ action: sub, member: name, ...res, warning: pending, members: circle.members, suggested: circle.suggested }, null, 2))
    return res.ok ? 0 : 2
  }
  if (!res.ok) { console.error(`baseline trust ${sub}: ${S(res.reason)}`); return 2 }
  console.log(`  ${res.changed ? '+' : '·'} ${S(name)}: ${S(res.reason)}`)
  if (pending) console.log(`  ! ${S(pending)}`)
  console.log(`\ntrust circle: ${circle.members.length ? circle.members.map(S).join(', ') : 'empty'}${circle.suggested.length ? `  ·  suggested: ${circle.suggested.map(S).join(', ')}` : ''}`)
  if (res.changed && sub === 'add') console.log(`commit ${S(res.rel)} — CI reads membership out of the tracked config, nothing else.`)
  return 0
}

function runTrustStamp(REPO, only, JSON_OUT) {
  let acts
  try { acts = stampTrust(REPO, { only }) }
  catch (e) { console.error(`baseline trust stamp: ${e.message}`); return 2 }
  if (JSON_OUT) { console.log(JSON.stringify({ stamped: acts }, null, 2)); return 0 }
  const refused = acts.filter(a => a.state === 'refused')
  for (const a of acts) {
    const mark = a.wrote ? (a.changed ? '+' : '=') : a.state === 'refused' ? '✗' : '·'
    console.log(`  ${mark} ${S(a.member)}${a.rel ? ` → ${S(a.rel)}` : ''}: ${S(a.reason ?? '')}`)
  }
  const wrote = acts.filter(a => a.changed)
  if (wrote.length) console.log(`\ntrust stamp: ${wrote.length} stamp(s) written — commit them, they are what CI reads`)
  else if (!refused.length) console.log(`\ntrust stamp: nothing to write (stamps already match the tree)`)
  return refused.length ? 2 : 0
}

function runTrustVerify(REPO, JSON_OUT) {
  let res
  try { res = verifyTrust(REPO) }
  catch (e) { console.error(`baseline trust verify: ${e.message}`); return 2 }
  if (JSON_OUT) { console.log(JSON.stringify({ trust: res.rows, findings: res.findings.map(f => f.member) }, null, 2)); return res.findings.length ? 1 : 0 }
  // fail-silent members are not printed at all: a tool that does not exist emits nothing
  const shown = res.rows.filter(r => r.state !== 'silent')
  const w = Math.max(...shown.map(r => r.member.length))
  const WORD = { ok: 'VERIFIED', stale: 'STALE   ', recorded: 'RECORDED', broken: 'BROKEN  ', 'n/a': 'n/a     ' }
  console.log(`trust verify — ${shown.length} member(s) of the circle`)
  for (const r of shown) {
    const mark = r.state === 'ok' ? '✓' : r.state === 'stale' || r.state === 'broken' ? '✗' : '·'
    if (r.state === 'ok') {
      console.log(`  ${mark} ${pad(r.member, w)}  ${WORD.ok}  ${r.detail.checked} tracked code file(s) recomputed — every hash matches`)
    } else if (r.state === 'stale') {
      const d = r.detail
      console.log(`  ${mark} ${pad(r.member, w)}  ${WORD.stale}  ${d.checked} recomputed · ${d.changed.length} changed · ${d.missing.length} gone · ${d.unstamped.length} never graphed`)
      for (const f of d.changed.slice(0, 5)) console.log(`  ${' '.repeat(w)}      changed since the graph was built: ${S(f)}`)
      for (const f of d.missing.slice(0, 5)) console.log(`  ${' '.repeat(w)}      stamped but no longer tracked: ${S(f)}`)
      for (const f of d.unstamped.slice(0, 5)) console.log(`  ${' '.repeat(w)}      tracked but not in the graph: ${S(f)}`)
      const extra = d.changed.length + d.missing.length + d.unstamped.length - Math.min(5, d.changed.length) - Math.min(5, d.missing.length) - Math.min(5, d.unstamped.length)
      if (extra > 0) console.log(`  ${' '.repeat(w)}      (+${extra} more)`)
      console.log(`  ${' '.repeat(w)}      rebuild the graph, then \`baseline trust stamp\` and commit the stamp`)
    } else if (r.state === 'recorded') {
      console.log(`  ${mark} ${pad(r.member, w)}  ${WORD.recorded}  ${S(r.reason)}`)
      console.log(`  ${' '.repeat(w)}      recorded at ${S(r.detail.recorded_at ?? 'unknown')}${r.detail.recorded_at ? (r.detail.commit_known ? ' (a commit in this history)' : ' (NOT a commit in this history)') : ''}`)
    } else {
      console.log(`  ${mark} ${pad(r.member, w)}  ${WORD[r.state] || r.state}  ${S(r.reason ?? '')}`)
    }
  }
  if (res.findings.length) {
    console.error(`\ntrust verify: ${res.findings.length} stamp(s) stale or broken — ${res.findings.map(f => S(f.member)).join(', ')}`)
    return 1
  }
  const recorded = shown.filter(r => r.state === 'recorded').length
  console.log(`\ntrust verify: green${recorded ? ` (${recorded} recorded-only claim(s) went UNVERIFIED — baseline cannot check them)` : ''}`)
  return 0
}
