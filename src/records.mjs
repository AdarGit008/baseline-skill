// The record kinds — one home for what the Ledger stores (plan §5): which kinds
// exist, where each lives, how each is stored (json | md-frontmatter | md-header),
// and validation against schema/record.<kind>.schema.json via the shared subset
// validator. `baseline log` writes sessions through this; M4b's jdg and M4c's
// claims/REC rules read through it.
import fs from 'node:fs'
import { validateAgainst } from './validate.mjs'
import { statusOf, FRONTMATTER_RE } from './util.mjs'

export const RECORD_KINDS = {
  session:  { schema: 'record.session.schema.json',  home: 'records/sessions/<lane>/<YYYY-MM-DD>-<HHMMSS>-<agent>.md' },
  judgment: { schema: 'record.judgment.schema.json', home: 'records/judgments/JDG-NNNN.json' },
  claim:    { schema: 'record.claim.schema.json',    home: 'records/claims/CLM-NNNN.json' },
  adr:      { schema: 'record.adr.schema.json',      home: 'records/decisions/ADR-NNNN.md' },
}

const cache = {}
export function recordSchema(kind) {
  if (!RECORD_KINDS[kind]) throw new Error(`unknown record kind '${kind}'`)
  return cache[kind] ??= JSON.parse(fs.readFileSync(new URL('../schema/' + RECORD_KINDS[kind].schema, import.meta.url), 'utf8'))
}

// -> [] when valid; error strings otherwise (the descriptor's message style).
export function validateRecord(kind, obj) {
  const errors = []
  validateAgainst(obj, recordSchema(kind), '', errors)
  return errors
}

// Flat frontmatter — '---\nkey: value\n---\n' + body. String values only (dates stay
// strings; the schemas bind shape by pattern). The boundary regex mirrors the one the
// evaluators already use, so a record the checker can read is a record this can read.
export function parseFrontmatter(md) {
  const m = String(md).match(FRONTMATTER_RE)
  if (!m) return { fields: null, body: String(md) }
  const fields = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) fields[kv[1]] = kv[2].trim()
  }
  return { fields, body: String(md).slice(m[0].length) }
}

export function renderFrontmatter(fields) {
  return '---\n' + Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n'
}

// The one spelling of a session record's path (CF1) — the writer (log) and any
// future reader derive it from here, never from a second inline template.
export function sessionRelPath(fields) {
  const stamp = `${fields.started.slice(0, 10)}-${fields.started.slice(11, 19).replace(/:/g, '')}`
  return `records/sessions/${fields.lane}/${stamp}-${fields.agent}.md`
}

// The decision graph's edges, as ONE record declares them (#57). Four verbs, two
// relations: Supersedes/Superseded-by is terminal — the reader is sent elsewhere —
// and Amends/Amended-by is the live one, what a decision does when part of it
// survives. Before #57 the second pair was read by no rule, no kind and no schema
// check; the first was read by two rules with two different greps. CTX-02, CTX-07
// and CTX-13 all resolve what this returns, so the repo has ONE opinion about what
// a decision record declares — the discipline parseAdrHeader already keeps for
// Status.
//
// Three parsing facts, each of which a real corpus got wrong first:
//   * a declaration WRAPS. 'Amends: ADR-0019 (D5 sizing), ADR-0017 (…)' puts its
//     second target on a continuation line, and a first-line grep counted 11 edges
//     in a corpus that had 18. A field therefore ends at the next FIELD, not at the
//     next newline.
//   * parenthesised commentary never declares an edge — '(D5 sizing)' is not ADR-5.
//     Spans come out before numbers go in, never after.
//   * 'none' / 'n/a' / '-' / empty declare nothing, per target and for the whole
//     value: the template ships 'Supersedes: none' and that is not an edge to ADR-0.
//
// Returns integers, not strings: '0003', 'ADR-3' and '3' are one decision, and the
// callers compare against a number parsed out of a filename.
const EDGE_RELATIONS = { 'supersedes': 'supersedes', 'superseded-by': 'superseded_by', 'supersededby': 'superseded_by', 'amends': 'amends', 'amended-by': 'amended_by', 'amendedby': 'amended_by' }
// A header line that opens a field: 'Key: value', tolerating the bolded '**Key**:'
// form. Used twice — to find a declaration, and to know where one ends.
const HEADER_FIELD_RE = /^\s*(?:\*\*|__)?\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*(?:\*\*|__)?\s*:\s*(.*)$/

function edgeTargets(raw) {
  // Commentary first: '(…)' and '[…]' are prose about the edge, never the edge.
  const v = String(raw).replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  const out = []
  for (const part of v.split(/[,;]|\band\b/i)) {
    const s = part.trim()
    if (!s || /^(none|n\/?a|nil|tbd|-{1,2}|—)$/i.test(s)) continue
    const m = s.match(/(?:adr[-_ ]?)?(\d{1,4})/i)
    if (m) out.push(parseInt(m[1], 10))
  }
  return out
}

// The header as declared fields, each read WHOLE — key (normalized: lowercased,
// spaces and underscores to hyphens) to its value with continuation lines folded in.
// One walk, so parseAdrHeader's storage form and adrEdges' relations can never
// disagree about where a declaration ends.
export function adrHeaderFields(md) {
  const lines = String(md).split(/^##\s/m)[0].split(/\r?\n/)
  const fields = {}
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADER_FIELD_RE)
    if (!m) continue
    let value = m[2]
    // Walk the continuation: a line that is not blank, not a heading, and does not
    // open the next field still belongs to this declaration.
    while (i + 1 < lines.length) {
      const nx = lines[i + 1]
      if (!nx.trim() || /^\s*#/.test(nx) || HEADER_FIELD_RE.test(nx)) break
      value += ' ' + nx.trim(); i++
    }
    const key = m[1].trim().toLowerCase().replace(/[\s_]+/g, '-')
    if (!(key in fields)) fields[key] = value.trim()
  }
  return fields
}

export function adrEdges(md) {
  const text = String(md)
  const out = { supersedes: [], superseded_by: [], amends: [], amended_by: [] }
  const add = (rel, n) => { if (!out[rel].includes(n)) out[rel].push(n) }
  for (const [key, value] of Object.entries(adrHeaderFields(text))) {
    const rel = EDGE_RELATIONS[key]
    if (!rel) continue
    for (const n of edgeTargets(value)) add(rel, n)
  }
  // The prose form the golden corpus pins and CTX-07 has always resolved:
  // 'Status: Superseded by ADR-0003', where the relation rides the status line and
  // there is no field at all. Read from the whole document, deliberately — a Nygard
  // '## Status' section puts it below the first '##' heading. De-duplicated above.
  const legacy = text.match(/(?:supersed(?:ed)?|replaced)\s+by[^\n]*?(?:adr[-_ ]?)?(\d{1,4})/i)
  if (legacy) add('superseded_by', parseInt(legacy[1], 10))
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b)
  return out
}

// ADR header fields, statuses lowercased — the md-header storage form
// record.adr.schema.json binds. Status extraction delegates to util's statusOf,
// the SAME reader CTX-02's adr-status check uses (inline 'Status: x', '**Status**',
// and Nygard '## Status' heading forms) — one opinion about an ADR's status.
export function parseAdrHeader(md) {
  // Declarations are read through adrHeaderFields — the SAME walk adrEdges resolves,
  // so a wrapped 'Amends:' is one value here and one edge list there (#57).
  const head = adrHeaderFields(md)
  const fields = {}
  const status = statusOf(String(md)); if (status != null) fields.status = status.toLowerCase()
  if (head['date'] !== undefined) fields.date = head['date']
  if (head['supersedes'] !== undefined) fields.supersedes = head['supersedes']
  if (head['superseded-by'] !== undefined) fields.superseded_by = head['superseded-by']
  if (head['amends'] !== undefined) fields.amends = head['amends']
  if (head['amended-by'] !== undefined) fields.amended_by = head['amended-by']
  return fields
}
