#!/usr/bin/env node
// project-baseline checker — zero-dependency. Scores a repo against rules.json.
// Usage: node check.mjs [--repo <dir>] [--config <file>] [--no-exec] [--json] [--profile <name>]
// Exit code 1 if any blocker fails. See README.md.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def }
const optAll = (name) => args.reduce((a, v, i) => (args[i] === name && args[i + 1] && !args[i + 1].startsWith('--') ? [...a, args[i + 1]] : a), [])
const REPO = path.resolve(opt('--repo', process.cwd()))
const NO_EXEC = !!opt('--no-exec', false)
const JSON_OUT = !!opt('--json', false)
const RULES = JSON.parse(fs.readFileSync(new URL('./rules.json', import.meta.url), 'utf8'))

const color = (c, s) => (process.stdout.isTTY && !JSON_OUT) ? `\x1b[${c}m${s}\x1b[0m` : s
const TAG = { PASS: color(32, 'PASS'), FAIL: color(31, 'FAIL'), WARN: color(33, 'WARN'), SKIP: color(90, 'SKIP'), 'SIGN-OFF': color(35, 'SIGN-OFF') }

// ---------- repo file index ----------
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
const FILES = walk(REPO)

// git-tracked set (for tracked_only checks); null when not a git repo
let TRACKED = null
try { TRACKED = new Set(execSync('git ls-files', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean)) } catch {}
let HEAD = null
try { HEAD = execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}

function globToRe(g) {
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*') { if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++ } else re += '[^/]*' }
    else if (c === '?') re += '.'
    else if ('/.+^${}()|[]\\'.includes(c)) re += '\\' + c
    else re += c
  }
  return new RegExp('^' + re + '$')
}
const asArr = v => v == null ? [] : Array.isArray(v) ? v : [v]
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

// ---------- config ----------
function detectType() {
  if (FILES.includes('package.json')) return FILES.some(f => f.startsWith('services/') || f.startsWith('apps/') || f.startsWith('cmd/')) ? 'service' : 'node'
  if (FILES.includes('pyproject.toml') || FILES.some(f => /requirements.*\.txt$/.test(f))) return 'python'
  if (FILES.includes('go.mod')) return 'service'
  return 'docs'
}
const firstExisting = (cands) => cands.find(c => FILES.includes(c)) || cands[0]
const DEFAULTS = {
  project_type: detectType(),
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
  freshness_globs: [],   // opt-in: docs that must carry last_review_date
  generated_globs: [],   // opt-in: generated files that must carry a DO NOT EDIT marker
  grounding_docs: [],    // opt-in: required grounding docs (exist + non-empty)
  profiles: [],          // extra profiles beyond core (service auto-enables for services)
}
let cfg = { ...DEFAULTS }
const EXPLICIT = new Set()
const applyCfg = obj => { for (const kk of Object.keys(obj)) if (!kk.startsWith('_')) EXPLICIT.add(kk); cfg = { ...cfg, ...obj } }
const inRepoCfg = read('baseline.config.json'); if (inRepoCfg) try { applyCfg(JSON.parse(inRepoCfg)) } catch {}
const cliCfg = opt('--config', null); if (cliCfg && typeof cliCfg === 'string') try { applyCfg(JSON.parse(fs.readFileSync(path.resolve(cliCfg), 'utf8'))) } catch (e) { console.error('bad --config:', e.message) }
for (const p of optAll('--profile')) cfg.profiles = [...(cfg.profiles || []), p]
// Claims are OPT-IN: whether a repo makes external claims isn't robot-detectable at rest.
// Active only if a claims register is present, OR makes_external_claims was explicitly set true.
const claimsRegisterExists = (FILES.includes(cfg.claims_file) || match(cfg.claims_file).length > 0)
const CLAIMS_ACTIVE = EXPLICIT.has('makes_external_claims') ? (cfg.makes_external_claims !== false) : claimsRegisterExists

// active profiles: core always; service auto-on for services; others opt-in
const ACTIVE = new Set(['core'])
if (cfg.project_type === 'service') ACTIVE.add('service')
for (const p of (cfg.profiles || [])) ACTIVE.add(p)

let SIGNOFF = {}; const so = read(cfg.signoff_file); if (so) try { SIGNOFF = JSON.parse(so) } catch {}

const DAY = 86400000
const parseDate = s => { const d = new Date(s); return isNaN(d) ? null : d }
const daysAgo = d => (Date.now() - d.getTime()) / DAY
function gitAgeDays(rel) { try { const iso = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); const d = parseDate(iso); return d ? daysAgo(d) : null } catch { return null } }
function gitCommitISO(rel) { try { const iso = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); return parseDate(iso) } catch { return null } }

function getPath(obj, dotted) { return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) }
function reOf(pattern, flags) { try { return new RegExp(pattern, flags || 'im') } catch { return null } }
// ADR helpers: recognize inline 'Status: X' AND the Nygard '## Status\n\nX' heading form; skip non-ADR docs
function isAdrFile(f) { const base = (f.split('/').pop() || '').toLowerCase(); if (/^(readme|index)\b/.test(base) || /template/.test(base)) return false; return /^(adr[-_ ]?)?\d/.test(base) }
function statusOf(t) {
  const inline = t.match(/^\s*(?:\*\*|#{1,6}\s*)?status(?:\*\*)?\s*[:=]\s*([^\n|]+)/im)
  if (inline) return inline[1].trim()
  const head = t.match(/^#{1,6}\s*status\s*$/im)
  if (head) { const rest = t.slice(head.index + head[0].length).split('\n').map(s => s.trim()).filter(Boolean); if (rest.length) return rest[0] }
  return null
}
function nonEmpty(v) { return v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) }

// ---------- check evaluators ----------  return {ok:true|false|null, detail, soft?, signoff?}
function globsOf(c) { return c.globs_from_config ? cfg[c.globs_from_config] : (c.file_from_config ? cfg[c.file_from_config] : c.globs) }

function evalCheck(c, rule) {
  const k = c.kind

  if (k === 'any-of') {
    const subs = (c.checks || []).map(sc => evalCheck(sc, rule))
    if (subs.some(s => s.ok === true)) return { ok: true, detail: (subs.find(s => s.ok === true).detail) }
    if (subs.some(s => s.ok === false)) return { ok: false, detail: subs.filter(s => s.ok === false).map(s => s.detail).slice(0, 2).join(' | ') || 'no alternative satisfied' }
    return { ok: null, detail: 'n/a (no applicable target)' }
  }

  if (k === 'implies') {
    const w = evalCheck(c.when, rule)
    if (w.ok !== true) return { ok: null, detail: 'n/a (' + (c.when_label || 'precondition') + ' not present)' }
    const th = evalCheck(c.then, rule)
    return { ok: th.ok === false ? false : (th.ok === true ? true : false), detail: th.ok === true ? th.detail : (c.then_fail_detail || th.detail) }
  }

  if (k === 'workflow-permissions') {
    const files = match(globsOf(c)); if (!files.length) return { ok: null, detail: 'no workflow files' }
    const bad = []
    for (const f of files) {
      const t = readText(f); if (t == null) continue
      const lines = t.split('\n')
      let hasTop = false, writeAll = false, topWrite = false
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^permissions:\s*(.*)$/) // zero-indent => top-level
        if (!m) continue
        hasTop = true
        const inline = m[1].trim()
        if (/write-all/.test(inline)) { writeAll = true; break }
        if (inline.startsWith('{')) { if (/:\s*write/.test(inline)) topWrite = true; break }
        for (let j = i + 1; j < lines.length; j++) { if (/^\S/.test(lines[j])) break; if (/^\s+[\w-]+:\s*write\b/.test(lines[j])) topWrite = true }
        break
      }
      if (!hasTop) bad.push(`${f.split('/').pop()}: no top-level permissions (broad token)`)
      else if (writeAll) bad.push(`${f.split('/').pop()}: permissions: write-all`)
      else if (topWrite) bad.push(`${f.split('/').pop()}: top-level write scope`)
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} workflow(s) least-privilege` }
  }

  if (k === 'doc-code-age') {
    const files = match(globsOf(c)); if (!files.length) return { ok: null, detail: 'no docs to scan' }
    const lag = cfg[c.lag_days_from_config] || 30
    const bad = []; let checked = 0
    for (const f of files) {
      const t = read(f) || ''
      const fm = t.match(/^---\n([\s\S]*?)\n---/); if (!fm) continue
      const inline = fm[1].match(/sources:\s*\[([^\]]*)\]/)
      const block = fm[1].match(/sources:\s*\n((?:\s*-\s*[^\n]+\n?)+)/)
      let srcGlobs = []
      if (inline) srcGlobs = inline[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
      else if (block) srcGlobs = block[1].split('\n').map(s => s.replace(/^\s*-\s*/, '').trim().replace(/['"]/g, '')).filter(Boolean)
      if (!srcGlobs.length) continue
      checked++
      const docAge = gitCommitISO(f); if (!docAge) continue
      let newest = null
      for (const sf of match(srcGlobs)) { const d = gitCommitISO(sf); if (d && (!newest || d > newest)) newest = d }
      if (newest && (newest.getTime() - docAge.getTime()) / DAY > lag) bad.push(`${f.split('/').pop()}: code newer by ${Math.round((newest.getTime() - docAge.getTime()) / DAY)}d (>${lag})`)
    }
    if (!checked) return { ok: null, detail: 'no docs declare a frontmatter sources: list (opt-in)' }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${checked} anchored doc(s) not lagging` }
  }

  if (k === 'any-file') {
    const files = match(globsOf(c), { tracked: !!c.tracked_only, exclude: c.allow, excludeGlobs: c.exclude_globs })
    if (c.mode === 'absent') return { ok: files.length === 0, detail: files.length ? 'found: ' + files.slice(0, 3).join(', ') + (files.length > 3 ? ` (+${files.length - 3})` : '') : 'none present (good)' }
    return { ok: files.length > 0, detail: files.length ? files.slice(0, 2).join(', ') + (files.length > 2 ? ` (+${files.length - 2})` : '') : 'none of: ' + asArr(globsOf(c)).slice(0, 5).join(', ') }
  }

  if (k === 'grep') {
    const files = match(globsOf(c), { tracked: !!c.tracked_only, excludeGlobs: c.exclude_globs })
    if (!files.length) return { ok: null, detail: 'no files to scan' }
    const re = reOf(c.pattern, c.flags); if (!re) return { ok: null, detail: 'bad regex in rule' }
    const rd = c.raw_scan ? readRaw : readText
    if (c.mode === 'all') {
      const miss = files.filter(f => { const t = readText(f); return !(t && re.test(t)) })
      return { ok: miss.length === 0, detail: miss.length ? `${miss.length} file(s) missing marker: ${miss.slice(0, 2).join(', ')}` : `all ${files.length} file(s) marked` }
    }
    const hit = files.filter(f => { const t = rd(f); return t && re.test(t) })
    const present = hit.length > 0
    if (c.mode === 'absent') return { ok: !present, detail: present ? `matched in ${hit.length} file(s): ${hit.slice(0, 2).join(', ')}` : 'pattern not found (good)' }
    return { ok: present, detail: present ? `matched in ${hit.length} file(s)` : 'pattern not found' }
  }

  if (k === 'file-contains') {
    const files = match(globsOf(c))
    if (!files.length) return c.null_if_absent ? { ok: null, detail: 'no matching file (skipped)' } : { ok: false, detail: 'file absent: ' + asArr(globsOf(c)).slice(0, 3).join(', ') }
    const re = reOf(c.pattern, c.flags); if (!re) return { ok: null, detail: 'bad regex in rule' }
    const good = files.filter(f => { const t = readText(f); return t && (!c.min_len || t.length >= c.min_len) && re.test(t) })
    if (good.length) return { ok: true, detail: `${good[0]} ok` }
    const short = files.filter(f => { const t = readText(f); return t && c.min_len && t.length < c.min_len })
    return { ok: false, detail: short.length ? `${short[0]} too short (<${c.min_len} chars)` : `${files[0]} present but missing required content` }
  }

  if (k === 'json-field') {
    const files = match(globsOf(c))
    if (!files.length) return { ok: null, detail: 'no ' + asArr(globsOf(c)).slice(0, 2).join('/') + ' present' }
    for (const f of files) {
      const t = read(f); if (!t) continue
      let data; try { data = JSON.parse(t) } catch { return { ok: false, detail: `${f} is not valid JSON` } }
      const v = getPath(data, c.path)
      if (c.assert === 'true') { if (v === true) return { ok: true, detail: `${f}: ${c.path}=true` } }
      else if (c.assert === 'nonempty') { if (nonEmpty(v)) return { ok: true, detail: `${f}: ${c.path} set` } }
      else if (c.assert === 'present') { if (v !== undefined && v !== null) return { ok: true, detail: `${f}: ${c.path} present` } }
      else if (c.equals !== undefined) { if (v === c.equals) return { ok: true, detail: `${f}: ${c.path}=${v}` } }
    }
    return { ok: false, detail: `${c.path} not satisfied in ${files.slice(0, 2).join(', ')}` }
  }

  if (k === 'command') {
    const cmd = cfg[c.run_from_config]
    if (!cmd) return { ok: false, soft: true, detail: `no ${c.run_from_config} configured — the crown check can't run; set it in baseline.config.json` }
    if (NO_EXEC) return { ok: null, detail: '--no-exec (would run: ' + cmd + (c.repeat ? ` x${c.repeat}` : '') + ')' }
    const times = c.repeat || 1
    try { for (let i = 0; i < times; i++) execSync(cmd, { cwd: REPO, timeout: cfg.command_timeout_ms, stdio: 'pipe' }); return { ok: true, detail: (times > 1 ? `exit 0 x${times}: ` : 'exit 0: ') + cmd } }
    catch (e) {
      const stderr = (e.stderr ? String(e.stderr) : '').trim(); const tail = stderr ? stderr.split('\n').slice(-2).join(' / ').slice(0, 120) : String(e.message).split('\n')[0].slice(0, 100)
      return { ok: false, detail: (e.killed ? 'timed out: ' : 'failed: ') + cmd + ' — ' + tail }
    }
  }

  if (k === 'status-stamp') {
    const f = cfg[c.file_from_config]; const t = f && read(f); if (!t) return { ok: false, detail: `status file missing: ${f}` }
    const m = t.match(new RegExp(c.stamp_key + '\\s*[:=]\\s*([^\\n]+)', 'i'))
    if (!m) return { ok: false, detail: `no '${c.stamp_key}:' stamp in ${f}` }
    const val = m[1].trim(); const sha = (val.match(/\b[0-9a-f]{7,40}\b/) || [])[0]
    if (c.match_head) {
      if (!sha) return { ok: false, detail: `stamp has no commit SHA (got '${val.slice(0, 30)}') — can't verify freshness` }
      if (HEAD && !HEAD.startsWith(sha.slice(0, 7)) && !sha.startsWith(HEAD)) return { ok: false, detail: `stale: stamp ${sha} != HEAD ${HEAD} — reconcile`, soft: true }
    }
    return { ok: true, detail: `stamped: ${val.slice(0, 40)}` }
  }

  if (k === 'adr-status') {
    const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
    const allowed = /(proposed|accepted|superseded|deprecated|rejected|amended|draft|active)/i
    const bad = []
    for (const f of files) {
      const t = read(f) || ''
      const st = statusOf(t)
      if (!st || !allowed.test(st)) { bad.push(`${f.split('/').pop()}: no/invalid Status`); continue }
      if (/superseded|deprecated|replaced/i.test(st) && !/supersed(ed)?\s*by|replaced\s*by|→\s*adr|see\s+adr/i.test(t)) bad.push(`${f.split('/').pop()}: superseded w/o forward link`)
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} decision doc(s) ok` }
  }

  if (k === 'adr-forward-link') {
    const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
    const bad = []
    for (const f of files) {
      const t = read(f) || ''
      const sm = t.match(/supersed(?:ed)?\s*by[^\n]*?(?:adr[- ]?)?(\d{1,4})/i)
      if (!sm) continue
      const n = sm[1]
      const padded = new Set([n, n.padStart(2, '0'), n.padStart(3, '0'), n.padStart(4, '0')])
      const found = files.some(g => { const base = g.split('/').pop(); const nums = base.match(/\d{1,4}/); return nums && (padded.has(nums[0]) || padded.has(String(parseInt(nums[0], 10)))) && g !== f })
      if (!found) bad.push(`${f.split('/').pop()} → ADR ${n} (no such file)`)
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `forward-links resolve` }
  }

  if (k === 'config-nonempty') { const v = cfg[c.path]; const ne = nonEmpty(v); return { ok: ne, detail: ne ? 'declared' : `config.${c.path} empty` } }

  if (k === 'required-files') {
    const list = asArr(cfg[c.list_from_config])
    if (!list.length) return { ok: null, detail: `config.${c.list_from_config} empty (opt-in)` }
    const bad = []
    for (const p of list) { const t = read(p); if (t == null) bad.push(`${p} missing`); else if (t.trim().length === 0) bad.push(`${p} empty`) }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${list.length} grounding doc(s) present` }
  }

  if (k === 'doc-freshness') {
    const files = match(globsOf(c))
    if (!asArr(cfg[c.globs_from_config]).length) return { ok: null, detail: `config.${c.globs_from_config} empty (opt-in)` }
    if (!files.length) return { ok: null, detail: 'no docs matched' }
    const win = cfg[c.within_days_from_config] || 180
    const bad = []
    for (const f of files) {
      const t = read(f) || ''
      const fm = t.match(/^---\n([\s\S]*?)\n---/)
      const body = fm ? fm[1] : t.slice(0, 400)
      const m = body.match(new RegExp(c.field + '\\s*[:=]\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})', 'i'))
      if (!m) { bad.push(`${f.split('/').pop()}: no ${c.field}`); continue }
      const d = parseDate(m[1]); if (!d) { bad.push(`${f.split('/').pop()}: bad date`); continue }
      if (daysAgo(d) > win) bad.push(`${f.split('/').pop()}: ${Math.round(daysAgo(d))}d old (>${win})`)
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} doc(s) fresh` }
  }

  if (k === 'md-links') {
    const files = match(globsOf(c))
    if (!files.length) return { ok: null, detail: 'no docs to scan' }
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g
    const broken = []
    for (const f of files) {
      const t = readText(f); if (!t) continue
      const dir = path.dirname(f)
      let m
      while ((m = linkRe.exec(t))) {
        let target = m[1].trim().split(/\s+/)[0] // drop optional "title"
        if (!target || /^(https?:|mailto:|tel:|#|data:|<)/i.test(target)) continue
        if (target.includes('{{') || target.includes('${')) continue
        target = target.replace(/[#?].*$/, '')
        if (!target) continue
        // root-absolute links (/docs/x.md) resolve against the repo root, GitHub-style
        const rel = target.startsWith('/')
          ? path.normalize(target.replace(/^\/+/, '')).split(path.sep).join('/')
          : path.normalize(path.join(dir, target)).split(path.sep).join('/')
        const onDisk = fs.existsSync(path.join(REPO, rel)) || FILES.includes(rel)
        if (!onDisk) broken.push(`${f}→${target}`)
      }
    }
    return { ok: broken.length === 0, detail: broken.length ? `${broken.length} broken: ` + broken.slice(0, 3).join(', ') : `${files.length} doc(s), links resolve` }
  }

  if (k === 'path-integrity') {
    const files = match(globsOf(c))
    if (!files.length) return { ok: null, detail: 'no docs to scan' }
    const tokRe = /`([^`]+)`/g
    const missing = []
    let checked = 0
    for (const f of files) {
      const t = readText(f); if (!t) continue
      let m
      while ((m = tokRe.exec(t))) {
        const tok = m[1].trim()
        if (!/^[\w./-]+$/.test(tok) || !tok.includes('/') || !/\.[a-z0-9]{1,5}$/i.test(tok)) continue
        checked++
        const rel = tok.replace(/^\.\//, '')
        if (!(fs.existsSync(path.join(REPO, rel)) || FILES.some(x => x.endsWith('/' + rel) || x === rel))) missing.push(`${f}: ${tok}`)
      }
    }
    if (!checked) return { ok: null, detail: 'no path-like symbols found' }
    return { ok: missing.length === 0, detail: missing.length ? `${missing.length} missing: ` + missing.slice(0, 3).join(', ') : `${checked} path ref(s) resolve` }
  }

  if (k === 'version-consistency') {
    // Compare only true single-value PINS across homes. Ranges (engines/requires-python) and CI test-matrices are NOT pins.
    const pins = { node: [], python: [], go: [] }
    const keyOf = (lang, major, minor) => lang === 'node' ? major : `${major}.${minor ?? '0'}`
    const addPin = (lang, val, where) => {
      if (val == null) return
      const s = String(val).trim()
      if (/[<>=^~|*x]|\s-\s|\|\|/i.test(s)) return // a range/constraint, not a pin
      const m = s.match(/(\d+)(?:\.(\d+))?/); if (!m) return
      pins[lang].push({ key: keyOf(lang, m[1], m[2]), raw: s.slice(0, 12), src: where })
    }
    const rd = f => (FILES.includes(f) ? read(f) : null)
    if (rd('.nvmrc')) addPin('node', rd('.nvmrc'), '.nvmrc')
    if (rd('.node-version')) addPin('node', rd('.node-version'), '.node-version')
    if (rd('.python-version')) addPin('python', rd('.python-version'), '.python-version')
    const gm = rd('go.mod'); if (gm) { const m = gm.match(/^go\s+([0-9.]+)/m); if (m) addPin('go', m[1], 'go.mod') }
    const tv = rd('.tool-versions'); if (tv) for (const line of tv.split('\n')) { const m = line.match(/^\s*(nodejs|node|python|golang|go)\s+([0-9][0-9.]*)/i); if (m) { const l = /node/i.test(m[1]) ? 'node' : /python/i.test(m[1]) ? 'python' : 'go'; addPin(l, m[2], '.tool-versions') } }
    for (const df of match(["**/Dockerfile", "**/Dockerfile.*", "**/*.Dockerfile"])) {
      const t = readText(df) || ''
      let m; const fre = /^FROM\s+(?:--\S+\s+)*(node|python|golang):([0-9]+(?:\.[0-9]+)?)/gmi
      while ((m = fre.exec(t))) { const l = /node/i.test(m[1]) ? 'node' : /python/i.test(m[1]) ? 'python' : 'go'; addPin(l, m[2], df.split('/').pop()) }
    }
    const problems = []; let compared = 0
    for (const lang of Object.keys(pins)) {
      const ds = pins[lang]; if (ds.length < 2) continue
      compared++
      if (new Set(ds.map(d => d.key)).size > 1) problems.push(`${lang}: ${ds.map(d => `${d.src}=${d.raw}`).join(', ')}`)
    }
    if (!compared) return { ok: null, detail: 'runtime pinned in <2 homes (nothing to cross-check)' }
    return { ok: problems.length === 0, detail: problems.length ? 'DRIFT ' + problems.slice(0, 2).join(' ; ') : `pins consistent across ${compared} language(s)` }
  }

  if (k === 'dockerfile-digest') {
    const files = match(globsOf(c))
    if (!files.length) return { ok: null, detail: 'no Dockerfile' }
    const bad = []
    for (const f of files) {
      const t = readText(f); if (!t) continue
      const stages = new Set()
      for (const line of t.split('\n')) {
        const fm = line.match(/^\s*FROM\s+(.*)$/i)
        if (!fm) continue
        const toks = fm[1].trim().split(/\s+/).filter(x => !x.startsWith('--')) // drop build flags like --platform=...
        const img = toks[0]; if (!img) continue
        const asIdx = toks.findIndex(x => x.toLowerCase() === 'as')
        const alias = asIdx >= 0 ? toks[asIdx + 1] : undefined
        if (alias) stages.add(alias.toLowerCase())
        if (stages.has(img.toLowerCase())) { if (alias) stages.add(alias.toLowerCase()); continue } // reference to a prior build stage
        if (/@sha256:[0-9a-f]{64}/i.test(img)) { if (alias) stages.add(alias.toLowerCase()); continue }
        bad.push(`${f.split('/').pop()}: FROM ${img}`)
        if (alias) stages.add(alias.toLowerCase())
      }
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} Dockerfile(s) digest-pinned` }
  }

  if (k === 'claims-field' || k === 'claims-citations') {
    const f = cfg.claims_file; const raw = f && read(f); if (!raw) return { ok: false, detail: `claims register missing: ${f}` }
    let data; try { data = JSON.parse(raw) } catch (e) { return { ok: false, detail: 'claims register not valid JSON' } }
    if (!Array.isArray(data.claims)) return { ok: false, detail: 'claims register: "claims" must be an array' }
    let claims = data.claims.filter(cl => cl && typeof cl === 'object')
    if (!claims.length) return { ok: false, detail: 'claims register is empty' }
    if (c.applies_to_types) claims = claims.filter(cl => c.applies_to_types.includes(String(cl.type || '').toLowerCase()))
    if (!claims.length) return { ok: null, detail: 'no claims of type ' + c.applies_to_types.join('/') }
    const bad = []
    for (const cl of claims) {
      const id = cl.id || (typeof cl.statement === 'string' ? cl.statement.slice(0, 24) : '?')
      if (k === 'claims-citations') {
        const cits = Array.isArray(cl.citations) ? cl.citations : (cl.citations == null ? [] : null)
        if (cits === null) { bad.push(`${id}: "citations" must be an array`); continue }
        for (const cit of cits) { if (!cit || typeof cit !== 'object' || !cit.url || !cit.supports_because) bad.push(`${id}: citation missing url/supports_because`) }
        continue
      }
      const v = cl[c.field]
      if (v == null || v === '') { bad.push(`${id}: no ${c.field}`); continue }
      if (c.enum && !c.enum.includes(String(v))) bad.push(`${id}: ${c.field}='${v}' not in {${c.enum.join('|')}}`)
      if (c.is_date) { const d = parseDate(v); if (!d) bad.push(`${id}: ${c.field} not a date`); else if (c.within_days_from_config && daysAgo(d) > cfg[c.within_days_from_config]) bad.push(`${id}: prior-art stale (${Math.round(daysAgo(d))}d > ${cfg[c.within_days_from_config]}d)`) }
      for (const rf of (c.also_require || [])) if (!cl[rf]) bad.push(`${id}: missing ${rf}`)
      if (c.require_if && String(v) === c.require_if.when_value && !cl[c.require_if.then_field]) bad.push(`${id}: ${c.field}=${v} needs ${c.require_if.then_field}`)
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') : `${claims.length} claim(s) ok` }
  }

  if (k === 'signoff') { const e = SIGNOFF[rule.id]; if (e && e.date) return { ok: true, detail: `signed ${e.by || '?'} ${e.date}` }; return { ok: false, detail: 'no sign-off recorded', signoff: true } }

  return { ok: null, detail: 'unknown check kind: ' + k }
}

// ---------- run ----------
const results = []
for (const r of RULES.rules) {
  if (r.applies_to && !r.applies_to.includes(cfg.project_type)) { results.push({ r, tag: 'SKIP', detail: `n/a for ${cfg.project_type}` }); continue }
  if (r.profile && !ACTIVE.has(r.profile)) { results.push({ r, tag: 'SKIP', detail: `profile '${r.profile}' off` }); continue }
  if (r.requires === 'makes_external_claims') { if (!CLAIMS_ACTIVE) { results.push({ r, tag: 'SKIP', detail: 'claims opt-in (no register; set makes_external_claims:true to enable)' }); continue } }
  else if (r.requires && cfg[r.requires] === false) { results.push({ r, tag: 'SKIP', detail: `opted out (${r.requires}:false)` }); continue }
  let res; try { res = evalCheck(r.check, r) } catch (e) { res = { ok: null, detail: 'check errored: ' + String(e.message).slice(0, 60) } }
  let tag
  if (res.ok === null) tag = 'SKIP'
  else if (res.ok === true) tag = 'PASS'
  else if (res.signoff || r.check.kind === 'signoff') tag = 'SIGN-OFF'
  else if (res.soft) tag = 'WARN'
  else tag = r.severity === 'blocker' ? 'FAIL' : 'WARN'
  results.push({ r, tag, detail: res.detail })
}

// ---------- report ----------
const cats = { build: 'Build & execution', quality: 'Code quality', test: 'Tests & invariants', security: 'Security & supply-chain', repro: 'Reproducibility', ops: 'Operability (service)', governance: 'Change governance', community: 'Community & onboarding', context: 'Context management', claims: 'Claims discipline' }

if (JSON_OUT) {
  const out = { repo: REPO, project_type: cfg.project_type, profiles: [...ACTIVE], head: HEAD, results: results.map(x => ({ id: x.r.id, category: x.r.category, severity: x.r.severity, profile: x.r.profile || 'core', tag: x.tag, detail: x.detail })) }
  const blockers = results.filter(x => x.tag === 'FAIL' && x.r.severity === 'blocker').length
  out.summary = { blockers, pass: results.filter(x => x.tag === 'PASS').length, warn: results.filter(x => x.tag === 'WARN').length, signoff: results.filter(x => x.tag === 'SIGN-OFF').length, skip: results.filter(x => x.tag === 'SKIP').length, total: results.length }
  console.log(JSON.stringify(out, null, 2)); process.exit(blockers ? 1 : 0)
}

console.log(`\n  project-baseline v${RULES.version}  ·  ${path.basename(REPO)}  ·  type=${cfg.project_type}  ·  profiles=[${[...ACTIVE].join(',')}]  ·  HEAD=${HEAD || 'n/a'}\n`)
for (const cat of Object.keys(cats)) {
  const rows = results.filter(x => x.r.category === cat); if (!rows.length) continue
  console.log('  ' + color(1, cats[cat]))
  for (const x of rows) console.log(`    ${TAG[x.tag].padEnd(x.tag.length + (process.stdout.isTTY ? 9 : 0))}  ${x.r.id.padEnd(9)} ${x.r.title}\n            ${color(90, '↳ ' + x.detail)}`)
  console.log('')
}
const n = t => results.filter(x => x.tag === t).length
const blockers = results.filter(x => x.tag === 'FAIL' && x.r.severity === 'blocker').length
const scored = results.filter(x => x.tag !== 'SKIP').length
console.log('  ' + color(1, 'Summary') + `  ${color(32, n('PASS') + ' pass')} · ${color(31, n('FAIL') + ' fail')} · ${color(33, n('WARN') + ' warn')} · ${color(35, n('SIGN-OFF') + ' sign-off')} · ${color(90, n('SKIP') + ' n/a')}`)
console.log(`  Readiness: ${Math.round(100 * n('PASS') / Math.max(1, scored))}%  (${n('PASS')}/${scored} applicable)`)
console.log(blockers ? color(31, `\n  ✗ ${blockers} blocker(s) — not build-ready.\n`) : color(32, `\n  ✓ no blockers.\n`))
process.exit(blockers ? 1 : 0)
