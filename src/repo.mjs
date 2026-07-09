// Repo index + read + git helpers — the at-rest-tree and git-history seam.
// Everything the evaluators know about the target repo flows through here.
import fs from 'node:fs'
import path from 'node:path'
import { execSync, execFileSync } from 'node:child_process'
import { asArr, globToRe, parseDate } from './util.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage', '.next', '__pycache__', 'vendor', '.venv', 'venv'])

function walk(dir, base = dir, out = []) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (e.isDirectory()) walk(full, base, out)
    else out.push(rel)
  }
  return out
}

export function indexRepo(REPO) {
  const FILES = walk(REPO)

  // git-tracked set (for tracked_only checks); null when not a git repo
  let TRACKED = null
  try { TRACKED = new Set(execSync('git ls-files', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean)) } catch {}
  let HEAD = null
  try { HEAD = execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}

  // match globs against the repo, with optional tracked-only, allow (exclude) and exclude_globs
  function match(globs, { tracked = false, exclude = [], excludeGlobs = [] } = {}) {
    const pool = (tracked && TRACKED) ? [...TRACKED] : FILES
    const res = asArr(globs).map(globToRe)
    const exRes = [...asArr(exclude), ...asArr(excludeGlobs)].map(globToRe)
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
  function gitIsAncestor(sha) { try { execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: REPO, stdio: 'ignore' }); return 0 } catch (e) { return e.status ?? 1 } }
  function gitLag(sha) { try { return parseInt(execFileSync('git', ['rev-list', '--count', `${sha}..HEAD`], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 10) } catch { return null } }
  function gitIsShallow() { try { return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true' } catch { return false } }

  return { REPO, FILES, TRACKED, HEAD, match, read, readText, readRaw, gitCommitISO, gitAgeDays, gitObjExists, gitIsAncestor, gitLag, gitIsShallow }
}
