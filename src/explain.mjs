// `baseline explain` — the okf-rag read seam (PLAN §7.3, §11 D7): explanations only.
//
//   explain <rule-id> [--json]     what a rule checks and why. The degrade path is the
//                                  default path (V26): the rule's own title/rationale from
//                                  rules/, exit 0, nothing spawned. When BASELINE_OKF_BUNDLE
//                                  names a directory, the concept at
//                                  <bundle>/baseline/rules/<id lowercase>.md is READ and its
//                                  body displayed — display is not a verdict (V3), and this
//                                  is the one verb allowed to open the bundle (V28, V41).
//   explain --audit [--json]       every loaded rule id resolves to a concept FILE in the
//                                  bundle. Resolved by filename only — the audit lists the
//                                  bundle, it never opens a concept (V27). Exit 1 on a hole.
//
// Nothing here writes: not to the bundle, not to the repo (V4, V34). There is no
// --propose (D3/D13); the one-shot migration is `gen okf-concepts` (src/gen.mjs).
// No helper is ever spawned — an `okf` on PATH, working or failing, is irrelevant
// (V26): the seam is a directory of markdown files, addressed by path.
import fs from 'node:fs'
import path from 'node:path'
import { loadRules } from './rules.mjs'
import { FRONTMATTER_RE, sanitizeTTY } from './util.mjs'

/** The concept id a rule id resolves to — the bundle's layout, one opinion (V27). */
export const conceptOf = (id) => `baseline/rules/${String(id).toLowerCase()}`
/** The two-part base of a rule id (`SEC-01` of `SEC-01-no-committed-secrets`, or of `SEC-01`). */
export const baseOf = (id) => (String(id).match(/^[A-Z]+-\d{2}/) || [String(id)])[0]

/** Resolve a query to a loaded rule: the full id (case-insensitive), then the base
 *  prefix, so `SEC-01` finds `SEC-01-<slug>` before and after the slugs land (PLAN §2).
 *  A concept id (`baseline/rules/sec-01…`, with or without `.md`) is accepted too. */
export function resolveRule(rules, query) {
  let q = String(query || '').trim()
  if (q.toLowerCase().startsWith('baseline/rules/')) q = q.slice('baseline/rules/'.length)
  q = q.replace(/\.md$/i, '').toLowerCase()
  if (!q) return null
  return rules.find(r => String(r.id).toLowerCase() === q)
    || rules.find(r => baseOf(r.id).toLowerCase() === q)
    || null
}

/** Where the bundle is, and whether it is reachable. Metadata only (a stat). */
export function bundleState(env = process.env) {
  const raw = env.BASELINE_OKF_BUNDLE
  if (!raw) return { state: 'unset', dir: null }
  const dir = path.resolve(raw)
  try { if (fs.statSync(dir).isDirectory()) return { state: 'present', dir } } catch {}
  return { state: 'unreachable', dir }
}

const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }

/** Read one concept from the bundle (the ONE content read this module makes). */
export function readConcept(dir, id) {
  const rel = conceptOf(id) + '.md'
  let raw
  try { raw = fs.readFileSync(path.join(dir, rel), 'utf8') }
  catch (e) { return { knowledge: e.code === 'ENOENT' ? 'missing' : 'unreadable', file: rel, body: null, frontmatter: null } }
  const m = raw.match(FRONTMATTER_RE)
  const frontmatter = {}
  if (m) for (const line of m[1].split(/\r?\n/)) { const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (kv) frontmatter[kv[1]] = kv[2] }
  const body = (m ? raw.slice(m[0].length) : raw).replace(/^\s*\n/, '').replace(/\s+$/, '')
  return { knowledge: 'bundle', file: rel, body, frontmatter: m ? frontmatter : null }
}

/** V27: the rule set → concept map, and which concept files the bundle lacks. Filenames
 *  only: a stat per rule, never a read — the bundle may be full of unparsable concepts
 *  and the audit must still pass. `dir` null (no bundle) leaves every concept missing. */
export function auditBundle(rules, dir) {
  const map = {}, missing = []
  for (const r of rules) {
    const c = conceptOf(r.id)
    map[r.id] = c
    if (!dir || !isFile(path.join(dir, c + '.md'))) missing.push(c)
  }
  return { map, missing }
}

const USAGE = `usage: baseline explain <rule-id> [--json]
       baseline explain --audit [--json]`
const one = (s) => sanitizeTTY(String(s ?? '')).replace(/\s+/g, ' ').trim()

export function runExplain(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`baseline explain — what a rule checks and why (explanations only; never a verdict)\n  ${USAGE}\n  <rule-id>: the full id or its base prefix (SEC-01). Prints the title and rationale from the rule set; with BASELINE_OKF_BUNDLE=<dir> it also displays the concept at <dir>/baseline/rules/<id>.md. Without a bundle it still answers, and exits 0.\n  --audit: check that every rule id resolves to a concept file in the bundle, by filename (exit 1 = at least one missing; nothing is opened).\n  --json: machine output; \`knowledge\` says whether the bundle was read.`)
    return 0
  }
  const usage = (msg) => { console.error(`baseline explain: ${msg}\n  ${USAGE}`); return 2 }
  const FLAGS = new Set(['--json', '--audit'])
  const positional = []
  for (const a of argv) {
    if (a.startsWith('-')) { if (!FLAGS.has(a)) return usage(`unknown flag '${a}'`) }
    else positional.push(a)
  }
  const JSON_OUT = argv.includes('--json')
  const AUDIT = argv.includes('--audit')
  let ruleSet
  try { ruleSet = loadRules() } catch (e) { console.error(`baseline explain: ${e.message}`); return 2 }
  const { rules } = ruleSet
  const bundle = bundleState()

  if (AUDIT) {
    if (positional.length) return usage(`--audit takes no rule id (got '${positional[0]}')`)
    const { map, missing } = auditBundle(rules, bundle.state === 'present' ? bundle.dir : null)
    if (JSON_OUT) {
      // compact on purpose: the payload is ids and concept paths, nothing a shell or a
      // grep has to guess at — and never a concept body (none was opened)
      console.log(JSON.stringify({ bundle: bundle.state, missing, map }))
    } else if (bundle.state !== 'present') {
      console.error(`baseline explain --audit: no bundle to audit — BASELINE_OKF_BUNDLE is ${bundle.state === 'unset' ? 'not set' : `'${one(bundle.dir)}', which is not a directory`}; every concept counts as missing (${missing.length})`)
    } else {
      const found = rules.length - missing.length
      console.log(`explain --audit: ${found}/${rules.length} concept${rules.length === 1 ? '' : 's'} resolve by filename in ${one(bundle.dir)}`)
      for (const c of missing) console.log(`  ✗ ${c}.md missing`)
    }
    return missing.length ? 1 : 0
  }

  if (!positional.length) return usage('a rule id is required')
  if (positional.length > 1) return usage(`one rule id at a time (got '${positional.join("' '")}')`)
  const rule = resolveRule(rules, positional[0])
  if (!rule) { console.error(`baseline explain: no rule '${one(positional[0])}' in the rule set (ids look like ${one(rules[0]?.id || 'SEC-01')}; the base prefix alone is accepted)`); return 2 }

  // the read seam — reached only when a bundle is configured AND reachable (V26: the
  // degrade path is the default path; V3: the result enriches, it cannot vote)
  const concept = bundle.state === 'present' ? readConcept(bundle.dir, rule.id) : { knowledge: bundle.state === 'unset' ? 'not-consulted' : 'unreachable', file: conceptOf(rule.id) + '.md', body: null, frontmatter: null }

  if (JSON_OUT) {
    const out = {
      id: rule.id, title: rule.title, concept: conceptOf(rule.id),
      severity: rule.severity, category: rule.category,
      lesson: rule.lesson ?? null, rationale: rule.rationale ?? null, fix: rule.fix ?? null, source: rule.source ?? null,
      bundle: bundle.state, knowledge: concept.knowledge,
    }
    if (concept.body !== null) { out.body = concept.body; if (concept.frontmatter) out.frontmatter = concept.frontmatter }
    console.log(JSON.stringify(out, null, 2))
    return 0
  }

  console.log(`${rule.id} · ${one(rule.title)}`)
  if (concept.body !== null) {
    console.log('')
    for (const line of concept.body.split('\n')) console.log(sanitizeTTY(line))
    console.log('')
    console.log(`knowledge: bundle · ${concept.file}`)
    return 0
  }
  // terse by law (V26): title, the rationale the rule already carries, and where the
  // longer story would come from — three lines, never more
  if (rule.rationale) console.log(one(rule.rationale))
  const why = concept.knowledge === 'not-consulted' ? 'no bundle configured (set BASELINE_OKF_BUNDLE=<dir>)'
    : concept.knowledge === 'unreachable' ? `BASELINE_OKF_BUNDLE is not a directory (${one(bundle.dir)})`
    : concept.knowledge === 'missing' ? `${concept.file} is not in the bundle (\`baseline gen okf-concepts\` stages a draft)`
    : `${concept.file} could not be read`
  console.log(`knowledge: ${concept.knowledge} — ${why}`)
  return 0
}
