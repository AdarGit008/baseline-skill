// The plugin boundary (v3 §11 D6–D10, red tests plugins.mjs V38–V41 and seams V1/V2/V25).
//
// baseline knows three plugins by their ARTIFACT — tdd-pi's tdd.json, graphify's
// graphify-out/, okf-rag's bundle at $BASELINE_OKF_BUNDLE — and asks each one exactly the
// questions a metadata probe can answer (D7): is the path there, is it a file or a
// directory, how old is it, and does git track or ignore it. It never opens the artifact:
// no readFileSync/openSync/createReadStream, no `git show`/`cat-file -p`/`grep` on it.
// Garbage bytes, an unreadable chmod-000 report and a well-formed artifact are the same
// answer here, because the content is the plugin's business and not this runner's.
//
// The git question is three-valued — tracked | ignored | untracked (present, neither
// tracked nor ignored) — and is asked ONLY of a path inside the repo: a bundle that lives
// elsewhere answers 'outside' and the gitignore expectation is not applied to it (D9).
//
// The plugin TABLE (names, default paths, gitignore expectations, the config merge) has one
// home, repo.mjs — the walk needs it before any config exists, and config.mjs re-exports
// it. This file is the probe, the verdict helpers, and the .baseline/log/ writer a PLUG
// WARN leaves behind (D10): one log per rule PREFIX, overwritten each run, removed when
// the rule passes.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PLUGIN_DEFAULTS, resolvePlugins } from './repo.mjs'

/** The plugin names — the keys of baseline.config.json `plugins` and the `plugin` value of
 *  a plugin-presence check. Derived from the table, never a second list. */
export const PLUGIN_NAMES = Object.freeze(Object.keys(PLUGIN_DEFAULTS))

/** One resolved entry { path, ignored, source: { path, ignored }, env? } for `name`, from a
 *  cfg whose `plugins` is already resolved (config.mjs) or still the raw config object. */
export function pluginSpec(cfg, name) {
  const raw = cfg && typeof cfg === 'object' ? cfg.plugins : null
  const e = raw && typeof raw === 'object' ? raw[name] : null
  if (e && typeof e === 'object' && e.source && typeof e.source === 'object') return e
  return resolvePlugins(raw && typeof raw === 'object' ? raw : {})[name] || null
}

// ---------------------------------------------------------------- the probe (D7/D9)

/** exit status of a git metadata query, or null when git could not be run at all */
function gitStatus(repo, args) {
  try { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); return 0 } catch (e) { return typeof e?.status === 'number' ? e.status : null }
}

/** tracked | ignored | untracked | null (git gave no usable answer — not a repo, no git) */
function gitStateOf(repo, rel) {
  const t = gitStatus(repo, ['ls-files', '--error-unmatch', '--', rel])
  if (t === 0) return 'tracked'
  if (t !== 1) return null
  const i = gitStatus(repo, ['check-ignore', '-q', '--', rel])
  if (i === 0) return 'ignored'
  if (i === 1) return 'untracked'
  return null
}

/** Metadata only: { present, kind: 'file'|'dir'|null, mtime: ISO|null,
 *  git: 'tracked'|'ignored'|'untracked'|'outside'|null, abs, inside }.
 *  `spec` is one resolved plugin entry ({ path, ignored }); a null path is absent. */
export function probePlugin(repo, name, spec) {
  const p = spec && typeof spec.path === 'string' && spec.path.trim() ? spec.path.trim() : null
  if (!p) return { present: false, kind: null, mtime: null, git: null, abs: null, inside: null }
  const abs = path.resolve(repo, p)
  const rel = path.relative(path.resolve(repo), abs)
  const inside = !(rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
  const gone = { present: false, kind: null, mtime: null, git: null, abs, inside }
  if (!fs.existsSync(abs)) return gone
  let st; try { st = fs.statSync(abs) } catch { return gone }
  const kind = st.isDirectory() ? 'dir' : 'file'
  const mtime = st.mtime.toISOString()
  const git = inside ? gitStateOf(repo, rel || '.') : 'outside'
  return { present: true, kind, mtime, git, abs, inside }
}

/** Does the git answer satisfy the config's expectation? 'outside' always does (D9). */
export const gitMatches = (git, ignored) => git === 'outside' || (ignored ? git === 'ignored' : git === 'tracked')
export const expectationWord = ignored => (ignored ? 'ignored' : 'tracked')

// ---------------------------------------------------------------- the log (D10)

export const LOG_DIR = '.baseline/log'
/** the rule's log, by its PREFIX (PLUG-02.log, not the three-part id), repo-relative posix */
export const logPrefixOf = id => (String(id).match(/^[A-Z]+-\d{2}/) || [String(id)])[0]
export const pluginLogRel = id => path.posix.join(LOG_DIR, `${logPrefixOf(id)}.log`)

/** Overwrite <repo>/.baseline/log/<PREFIX>.log with `lines`. Returns the repo-relative path,
 *  or null when the log could not be written (a read-only tree is not a second finding). */
export function writePluginLog(repo, id, lines) {
  const rel = pluginLogRel(id)
  try {
    fs.mkdirSync(path.join(repo, LOG_DIR), { recursive: true })
    fs.writeFileSync(path.join(repo, rel), lines.join('\n') + '\n')
    return rel
  } catch { return null }
}

/** A PASS leaves no log: remove the one an earlier WARN may have left. */
export function removePluginLog(repo, id) {
  try { fs.rmSync(path.join(repo, pluginLogRel(id)), { force: true }) } catch {}
}
