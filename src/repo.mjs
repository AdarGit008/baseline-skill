// Repo index + read + git helpers — the at-rest-tree and git-history seam.
// Everything the evaluators know about the target repo flows through here.
import fs from 'node:fs'
import path from 'node:path'
import { execSync, execFileSync } from 'node:child_process'
import { asArr, globMatcher, parseDate } from './util.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage', '.next', '__pycache__', 'vendor', '.venv', 'venv'])

// ---------------------------------------------------------------- the plugin boundary (v3 §11 D7/D9)
// The three plugin artifacts are the one part of the tree baseline may LOCATE but never
// OPEN: the index leaves them out of FILES and TRACKED, so no `**` glob (SEC-01, REC-02,
// CTX-05) ever reads tdd.json or a page under graphify-out/. The table lives on the tree
// seam because the walk needs it before any config is resolved, and config resolution
// needs the walk (project_type is detected from FILES) — config.mjs re-exports it.
//   path     repo-relative unless absolute; okf-rag's default is the env var, or null
//   ignored  the gitignore EXPECTATION the PLUG rule compares git's answer against
// baseline.config.json `plugins` (keyed by plugin name) overrides per key; a config path
// beats the env var. Every resolved entry records where each value came from (`source`),
// so the WARN log can say "default" or "config" honestly.
//
// v4 MEMBERSHIP. The table declares every SUPPORTED tool, which is not the same as every
// ADOPTED one, and the difference is the whole enabler property: a repo that never chose
// graphify must not be failed for not having it. So each resolved entry also carries
// `member`, and membership is a FACT ABOUT THE CONFIG TEXT, never a guess about the values:
//   member  === the plugin's NAME is a KEY of baseline.config.json's `plugins` object
//   suggest === the key is absent — the entry here is the shipped default, untouched
// Key presence, not value comparison, is what makes it a fact. `{"graphify": {}}` and
// `{"graphify": {"path": "graphify-out", "ignored": true}}` are both adoptions even though
// the second one re-types the defaults, and neither can be confused with a repo that
// wrote nothing — which the old `source: 'default' | 'config'` alone could not tell apart
// (a member at default values resolves every FIELD from the defaults).
// A key whose value is `false` or `null` is an explicit DECLINE: recorded, not a member.
// The env var is deliberately NOT a membership signal. It sets a member's path when there
// is one, but CI clones tracked files and not a shell, so an env-created member would gate
// differently on two machines. Adoption is a committed fact or it is not one.
export const PLUGIN_DEFAULTS = Object.freeze({
  'obsidian-tdd': Object.freeze({ path: 'tdd.json', ignored: false }),
  graphify: Object.freeze({ path: 'graphify-out', ignored: true }),
  'okf-rag': Object.freeze({ path: null, ignored: true, env: 'BASELINE_OKF_BUNDLE' }),
  // v4: the fourth trust-circle member, declared with NO path so it probes as absent and
  // stays FAIL-SILENT — my-onto emits nothing until it exists (no rule, no severity, no
  // verify row). It is here so the roster the bootstrapper derives (PLUGIN_NAMES ->
  // trust.mjs) is honest about it; `ignored` is the okf-rag default and is never consulted
  // while the path is null.
  'my-onto': Object.freeze({ path: null, ignored: true }),
})
export function resolvePlugins(overrides = {}, env = process.env) {
  const decl = overrides && typeof overrides === 'object' ? overrides : {}
  const out = {}
  for (const [name, d] of Object.entries(PLUGIN_DEFAULTS)) {
    // the membership fact: is the NAME a key here? Read before any value is looked at, so
    // a member at default values is still a member and a suggestion can never look like one.
    const declared = Object.prototype.hasOwnProperty.call(decl, name)
    const raw = declared ? decl[name] : undefined
    const member = declared && raw !== false && raw !== null
    const o = raw && typeof raw === 'object' ? raw : {}
    let p = d.path, pathSource = 'default'
    if (d.env && typeof env?.[d.env] === 'string' && env[d.env].trim()) { p = env[d.env].trim(); pathSource = 'env' }
    if (typeof o.path === 'string' && o.path.trim()) { p = o.path.trim(); pathSource = 'config' }
    const explicitIgnored = typeof o.ignored === 'boolean'
    out[name] = {
      path: p,
      ignored: explicitIgnored ? o.ignored : d.ignored,
      member,
      source: {
        path: pathSource,
        ignored: explicitIgnored ? 'config' : 'default',
        // 'config' means the key was typed (adopted or declined); 'default' means untouched
        member: declared ? 'config' : 'default',
      },
      ...(d.env ? { env: d.env } : {}),
    }
  }
  return out
}
/** The adopted names, in table order — the trust circle this repo actually declared. */
export const membersOf = PLUGINS => Object.keys(PLUGINS || {}).filter(n => PLUGINS[n]?.member)
/** The supported-but-unadopted names: what baseline SUGGESTS and never gates. */
export const suggestedOf = PLUGINS => Object.keys(PLUGINS || {}).filter(n => !PLUGINS[n]?.member)

// ---------------------------------------------------------------- the BASELINE RULES LAYER (v4)
//
// The rule set has exactly two kinds of rule, and they are opted into from OPPOSITE ends:
//   PLUGIN rules   (PLUG-01..03) belong to a trust-circle member. Opt-IN, default OUT: a
//                  tool this repo never adopted resolves n/a and can never fail a build.
//   BASELINE rules (everything else — the tree reads every repo can answer) are a LAYER.
//                  Opt-OUT, default IN: they gate unless this repo says otherwise.
// The asymmetry is the product: adopting a tool is a choice a repo makes, whereas the
// baseline is what "baseline" means — you get it by standing still.
//
// One key, `baseline_rules`, and its reading follows the membership discipline: the fact is
// read off the CONFIG TEXT, never guessed from the tree. The difference from membership is
// which way the ABSENCE points. Membership is key PRESENCE (absent = not adopted, because a
// repo that typed nothing chose nothing). The layer's absence is the DEFAULT, and the
// default is IN, so an absent key gates — which is also the only safe direction: a config
// that never heard of this key, a typo'd key name, a value that is not the literal `false`
// all leave the layer IN. Opting out takes the exact bytes `"baseline_rules": false`, and
// the layer's state is printed on every surface either way. There is no spelling of this
// key that silently hides a failing rule.
export const LAYER_KEY = 'baseline_rules'
/** The layer as a resolved fact: { in, source: 'default'|'config' }. Reads either the raw
 *  config value (a boolean someone typed) or the already-resolved object config.mjs writes
 *  back, so a cfg built by hand and one that came through resolveConfig answer the same —
 *  the same both-shapes contract pluginSpec() keeps for membership. */
export function baselineLayerOf(cfg) {
  const v = cfg && typeof cfg === 'object' ? cfg[LAYER_KEY] : undefined
  if (v && typeof v === 'object' && typeof v.in === 'boolean') return v
  if (v === undefined) return { in: true, source: 'default' }
  return { in: !(v === false || v === null), source: 'config' }
}
/** A plugin path as the index spells it — posix, repo-relative — or null when it is
 *  absolute-outside the repo (the okf bundle usually is) or the repo root itself. */
export function repoRelative(REPO, p) {
  if (typeof p !== 'string' || !p) return null
  const rel = path.relative(path.resolve(REPO), path.resolve(REPO, p))
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}
/** The configured artifact paths that sit INSIDE the repo — what the index excludes. */
export function pluginPathsInRepo(REPO, PLUGINS) {
  return Object.values(PLUGINS || {}).map(e => repoRelative(REPO, e?.path)).filter(Boolean)
}
// The in-repo config's `plugins` key, read light (no config resolution yet) so the walk
// can exclude a configured path; resolveConfig re-resolves with --config and calls
// repo.excludePaths() for anything it adds. `.baseline/` is baseline's own scratch (cache, log,
// proposed) and never evidence.
function inRepoPluginOverrides(REPO) {
  try { const j = JSON.parse(fs.readFileSync(path.join(REPO, 'baseline.config.json'), 'utf8')); return j && typeof j.plugins === 'object' ? j.plugins : {} } catch { return {} }
}
const BASELINE_DIR = '.baseline'

function walk(dir, base = dir, out = [], skip = () => false) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (skip(rel)) continue
    if (e.isDirectory()) walk(full, base, out, skip)
    else out.push(rel)
  }
  return out
}

// The light handle for commands that don't need the tree walk (log/jdg): just
// enough of indexRepo's surface for loadDescriptor + capabilityProbe. One home —
// the third hand-rolled copy of this shim was the review's cue to name it.
export function liteRepo(REPO) {
  let HEAD = null
  try { HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
  return {
    REPO,
    HEAD,
    read: rel => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { return null } },
    gitIsShallow: () => { try { return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true' } catch { return false } },
  }
}

export function indexRepo(REPO, { plugins = null } = {}) {
  // v3 §11 D7: the plugin artifacts and .baseline/ are outside the index — from the walk
  // AND from the tracked pool, so a committed tdd.json is no more evidence than an
  // ignored one. Path-anchored (root-level), unlike the by-name SKIP_DIRS.
  const PLUGINS = plugins || resolvePlugins(inRepoPluginOverrides(REPO))
  const EXCLUDED = new Set([BASELINE_DIR, ...pluginPathsInRepo(REPO, PLUGINS)])
  const excluded = rel => { for (const x of EXCLUDED) if (rel === x || rel.startsWith(x + '/')) return true; return false }
  const FILES = walk(REPO, REPO, [], excluded)

  // git-tracked set (for tracked_only checks); null when not a git repo.
  // -z: NUL-separated, unquoted — core.quotePath C-quotes non-ASCII names, and a
  // quoted string never matches the fs-walked FILES spelling (a café.md record
  // would silently fall out of every tracked_only scan, including REC-02's).
  let TRACKED = null
  try { TRACKED = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(f => f && !excluded(f))) } catch {}
  let HEAD = null
  try { HEAD = execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}

  // Widen the exclusion after the fact — resolveConfig calls this with the plugin paths
  // a --config file (invisible to the walk) may have added. Idempotent; in place, so the
  // FILES/TRACKED references evaluators already hold see the narrower index.
  function excludePaths(rels) {
    const fresh = asArr(rels).filter(r => typeof r === 'string' && r && !EXCLUDED.has(r))
    if (!fresh.length) return
    for (const r of fresh) EXCLUDED.add(r)
    const kept = FILES.filter(f => !excluded(f)); FILES.splice(0, FILES.length, ...kept)
    if (TRACKED) for (const f of [...TRACKED]) if (excluded(f)) TRACKED.delete(f)
  }

  // match globs against the repo, with optional tracked-only, allow (exclude) and exclude_globs
  function match(globs, { tracked = false, exclude = [], excludeGlobs = [] } = {}) {
    const pool = (tracked && TRACKED) ? [...TRACKED] : FILES
    const res = asArr(globs).map(globMatcher)
    const exRes = [...asArr(exclude), ...asArr(excludeGlobs)].map(globMatcher)
    return pool.filter(f => res.some(r => r.test(f)) && !exRes.some(r => r.test(f)))
  }
  const read = rel => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { return null } }
  // read for content scanning: skip large / binary files
  function readText(rel) {
    try {
      const full = path.join(REPO, rel)
      const st = fs.statSync(full)
      if (st.size > 512 * 1024) return null
      const buf = fs.readFileSync(full)
      if (buf.includes(0)) return null // binary
      return buf.toString('utf8')
    } catch { return null }
  }
  // raw read for security scans: DO NOT skip large/binary — a committed secret can hide in either
  function readRaw(rel) {
    try { const full = path.join(REPO, rel); if (fs.statSync(full).size > 8 * 1024 * 1024) return null; return fs.readFileSync(full, 'latin1') } catch { return null }
  }

  // filenames/sha are passed as literal argv (execFileSync, no shell) — never interpolate attacker-controlled paths into a shell string
  function gitCommitISO(rel) { try { const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); return parseDate(iso) } catch { return null } }
  function gitAgeDays(rel) { const d = gitCommitISO(rel); return d ? (Date.now() - d.getTime()) / 86400000 : null }
  function gitObjExists(ref) { try { execFileSync('git', ['cat-file', '-e', ref], { cwd: REPO, stdio: 'ignore' }); return true } catch { return false } }
  function gitIsAncestor(sha, of = 'HEAD') { try { execFileSync('git', ['merge-base', '--is-ancestor', sha, of], { cwd: REPO, stdio: 'ignore' }); return 0 } catch (e) { return e.status ?? 1 } }
  function gitIsShallow() { try { return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true' } catch { return false } }

  // History events for a path scope: git log --name-status filtered to the given
  // change types (e.g. 'MDR', 'A'), oldest first. -> [{sha, status, path, to}]
  // (to only on renames). Returns null when history is unreadable (not a repo).
  // quotePath=false keeps non-ASCII names literal so they match FILES/TRACKED
  // spelling; names containing a literal newline/quote stay C-quoted (pathological
  // — accepted residual, the -z log format can't be mixed with --format records).
  // fullHistory disables history simplification: an add that only ever lived on a
  // merged-in side branch is invisible to the default first-parent-simplified walk.
  function gitNameStatus(diffFilter, rel, { fullHistory = false } = {}) {
    let out
    try { out = execFileSync('git', ['-c', 'core.quotePath=false', 'log', '--reverse', ...(fullHistory ? ['--full-history'] : []), '--format=@%H', '--name-status', `--diff-filter=${diffFilter}`, '--', rel], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8') } catch { return null }
    const events = []; let sha = null
    for (const line of out.split('\n')) {
      if (line.startsWith('@')) { sha = line.slice(1); continue }
      const m = line.match(/^([AMDR])\d*\t([^\t]+)(?:\t(.+))?$/)
      if (m && sha) events.push({ sha, status: m[1], path: m[2], to: m[3] })
    }
    return events
  }
  // Files changed on this branch since it diverged (merge-base semantics), optionally
  // restricted to a path scope, to added-only, or to deleted-only (what the lane REMOVED
  // since it branched — how #49 tells a renamed decision record apart from a second one).
  // -> [paths] or null when the range doesn't resolve (missing base ref, not a repo).
  // -z: unquoted, NUL-separated.
  // noRenames (M6a): rename detection collapses D+A into R and --name-only then prints
  // only the post-image name — `git mv baseline.repo.json away.json` would read as
  // "descriptor untouched" to DESC-03. Admit's range reads disable detection so a
  // renamed-away gated file is honestly a delete + an add.
  function gitDiffNames(range, rel, { addedOnly = false, deletedOnly = false, noRenames = false } = {}) {
    const args = ['diff', ...(noRenames ? ['--no-renames'] : []), '--name-only', '-z', ...(addedOnly ? ['--diff-filter=A'] : deletedOnly ? ['--diff-filter=D'] : []), range, '--', ...(rel ? [rel] : ['.'])]
    try { return execFileSync('git', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean) } catch { return null }
  }
  // Paths ADDED in a range, in COMMIT order (oldest first) rather than lexicographic —
  // "the newest record" is a question a filename sort answers wrongly (#54). Dedup keeps
  // the last occurrence, so an add/delete/re-add reads as the re-add. -> [paths] or null
  // when the range doesn't resolve, which callers surface as "not provable", never as [].
  function gitAddedOrdered(range, rel) {
    const args = ['log', '--reverse', '--diff-filter=A', '--name-only', '--format=', '-z', range, '--', ...(rel ? [rel] : ['.'])]
    let out
    try { out = execFileSync('git', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8') } catch { return null }
    const seen = []
    for (const f of out.split('\0').filter(Boolean)) {
      const at = seen.indexOf(f); if (at !== -1) seen.splice(at, 1)
      seen.push(f)
    }
    return seen
  }
  // Blob id of a path at a ref -> sha string or null. Used by the append-only proof
  // to compare a record's current content against its content at introduction.
  function gitBlobAt(ref, rel) {
    try { return execFileSync('git', ['rev-parse', `${ref}:${rel}`], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null }
  }
  // Blob CONTENT at a ref, decoded utf8 (the one decoding every scan() call site
  // uses — a finding id must hash the same bytes-as-text on every surface). null on
  // any failure; callers surface that as "unscanned", never fold it into "clean".
  function gitCatFile(ref, rel) {
    try { return execFileSync('git', ['cat-file', 'blob', `${ref}:${rel}`], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).toString('utf8') } catch { return null }
  }

  // Every tracked path at a ref -> string[] or null on any failure. The tree AS OF a
  // commit, which is what "what does the default branch already carry" means when the
  // worktree is a lane's (#49). null is uninspectable, never an empty tree.
  function gitLsTree(ref) {
    try { return execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\n').filter(Boolean) } catch { return null }
  }

  return { REPO, FILES, TRACKED, HEAD, PLUGINS, excludePaths, match, read, readText, readRaw, gitCommitISO, gitAgeDays, gitObjExists, gitIsAncestor, gitIsShallow, gitNameStatus, gitDiffNames, gitAddedOrdered, gitBlobAt, gitCatFile, gitLsTree }
}
