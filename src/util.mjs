// Pure helpers shared across the runner — no I/O, no process state.
export const DAY = 86400000

// Argv helpers — ONE parser for every subcommand (check / orient / log / jdg).
// opt refuses to eat a following '--flag' as a value; optText consumes the next
// token unconditionally (prose legitimately starts with '--'); optAll collects a
// repeatable flag's values with opt's guard.
export const makeOpt = args => (name, def) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def }
export const makeOptText = args => (name, def) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] !== undefined ? args[i + 1] : true) : def }
export const makeOptAll = args => name => args.reduce((a, v, i) => (args[i] === name && args[i + 1] && !args[i + 1].startsWith('--') ? [...a, args[i + 1]] : a), [])

// One opinion about the frontmatter boundary (CRLF-tolerant) — the writer
// (records.mjs) and every reader (doc-code-age, doc-freshness) share it.
export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

// One clock for all record tooling (log / jdg / the signoff bridge): the
// BASELINE_LOG_NOW override parsed + ISO-normalized, null when unparseable —
// callers decide whether that's a usage error (CLIs) or a wall-clock fallback.
export function nowUTC() {
  const d = process.env.BASELINE_LOG_NOW ? new Date(process.env.BASELINE_LOG_NOW) : new Date()
  return isNaN(d) ? null : d
}

// Order-insensitive structural equality (objects by key set, arrays by position) —
// two spellings of the same JSON value must never read as a changed world.
export function deepEq(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]))
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => k in b && deepEq(a[k], b[k]))
}
export const asArr = v => v == null ? [] : Array.isArray(v) ? v : [v]
export const parseDate = s => { const d = new Date(s); return isNaN(d) ? null : d }
export const daysAgo = d => (Date.now() - d.getTime()) / DAY
export function getPath(obj, dotted) { return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) }
export function reOf(pattern, flags) { try { return new RegExp(pattern, flags || 'im') } catch { return null } }
export function nonEmpty(v) { return v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) }

export function globToRe(g) {
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

export function stripLineComment(line) { // strip a #/// comment only when it's OUTSIDE quotes (so "#fff" or echo "a # b" survive)
  let inS = false, inD = false
  for (let i = 0; i < line.length; i++) { const ch = line[i]
    if (ch === "'" && !inD) inS = !inS
    else if (ch === '"' && !inS) inD = !inD
    else if (!inS && !inD) {
      if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
      if (ch === '/' && line[i + 1] === '/' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
    } }
  // Unterminated quote (an apostrophe in prose — Adar's, don't) must not swallow a real trailing comment: re-scan quote-blind.
  if (inS || inD) { for (let i = 0; i < line.length; i++) { const ch = line[i]
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
    if (ch === '/' && line[i + 1] === '/' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i) } }
  return line
}

// ADR helpers: recognize inline 'Status: X' AND the Nygard '## Status\n\nX' heading form; skip non-ADR docs
export function isAdrFile(f) { const base = (f.split('/').pop() || '').toLowerCase(); if (/^(readme|index)\b/.test(base) || /template/.test(base)) return false; return /^(adr[-_ ]?)?\d/.test(base) }
export function statusOf(t) {
  const inline = t.match(/^\s*(?:\*\*|#{1,6}\s*)?status(?:\*\*)?\s*[:=]\s*([^\n|]+)/im)
  if (inline) return inline[1].trim()
  const head = t.match(/^#{1,6}\s*status\s*$/im)
  if (head) { const rest = t.slice(head.index + head[0].length).split('\n').map(s => s.trim()).filter(Boolean); if (rest.length) return rest[0] }
  return null
}
