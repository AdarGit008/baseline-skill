#!/usr/bin/env node
// RED — PLAN.md §8 "orient v2 and the SKILL.md diet" (V29–V32) and §9 "Correct the drift
// this repo exists to catch" (V33).
//
// V30's measure is the plan's own (bytes/4 < 800). V33's comparison values are derived from
// the rule set on every run — the literal in a shipped file is the thing under test, so the
// number it is compared against may never itself be a literal.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  harness, loadRuleSet, ROOT, mkrepo, cli, orientJson, git, writeAll, mktmp,
  shippedPaths, ALWAYS_ON_BLOCKERS, CLEAN_NODE, CLEAN_ENV, GITENV, cleanup,
} from './_lib.mjs'

const { ok, done } = harness('surface')
const { rules } = loadRuleSet()

// ---------- V29: orient emits at most 5 lines on a clean repo and always exits 0 ----------
{
  const LABELS = ['repo:', 'work:', 'graph:', 'knowledge:', 'score:']
  const clean = mkrepo('v29', CLEAN_NODE())
  const sha = git(clean, 'rev-parse', 'HEAD')

  const worlds = [
    ['bare', clean],
    ['with a fresh graph + tdd DB', (() => {
      const d = mkrepo('v29-full', { ...CLEAN_NODE(), 'tdd.json': JSON.stringify({ schema: 'tdd/1', source_commit: 'x', tests: [{ id: 'T-001', state: 'red', covers: ['TEST-03'] }] }, null, 2) + '\n' })
      writeAll(d, { 'graphify-out/GRAPH_REPORT.md': `Built from commit: ${git(d, 'rev-parse', 'HEAD')}\n` })
      return d
    })()],
    ['with a stale graph', (() => {
      const d = mkrepo('v29-stale', CLEAN_NODE())
      writeAll(d, { 'graphify-out/GRAPH_REPORT.md': `Built from commit: ${'0'.repeat(40)}\n` })
      return d
    })()],
  ]
  for (const [label, dir] of worlds) {
    const r = cli(dir, ['orient', '--repo', dir])
    const lines = r.stdout.split('\n').map(s => s.trimEnd()).filter(Boolean)
    ok(r.status === 0, `V29 · orient exits 0 (${label}) — got ${r.status}`)
    ok(lines.length <= LABELS.length, `V29 · at most ${LABELS.length} lines (${label}: ${lines.length})`)
    const labelled = lines.filter(l => LABELS.some(p => l.trimStart().startsWith(p)))
    ok(labelled.length === lines.length, `V29 · every line is one of the five labels (${label}: ${lines.filter(l => !LABELS.some(p => l.trimStart().startsWith(p))).slice(0, 2).join(' / ') || '—'})`)
  }
  // orient blocks on nothing: even a repo whose blockers fail leaves it at exit 0
  const broken = mkrepo('v29-broken', { 'README.md': '# broken\n\n[dead](./nope.md)\n' })
  const rb = cli(broken, ['orient', '--repo', broken])
  ok(rb.status === 0, `V29 · orient blocks on nothing (broken repo exit ${rb.status})`)
  // and the survey it prints is the derived one
  const o = orientJson(clean)
  ok(o.j && typeof o.j.score === 'object' && Number.isInteger(o.j.score?.blockers),
    `V29 · the score line is derived, not narrated (${JSON.stringify(o.j?.score)})`)
  ok((o.j?.repo?.head || '').startsWith(sha.slice(0, 7)) || sha.startsWith(String(o.j?.repo?.head || 'x')),
    `V29 · the repo line carries the real HEAD (${o.j?.repo?.head} vs ${sha.slice(0, 7)})`)
}

// ---------- V30: SKILL.md under 800 tokens, measured as bytes/4 ----------
{
  const BUDGET = 800
  const bytes = fs.statSync(path.join(ROOT, 'SKILL.md')).size
  const tokens = bytes / 4
  ok(tokens < BUDGET, `V30 · SKILL.md is ${Math.round(tokens)} tokens (${bytes} bytes / 4), budget ${BUDGET}`)

  // the diet must not be achieved by moving the prose to another always-loaded file
  const text = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8')
  for (const must of ALWAYS_ON_BLOCKERS) {
    ok(text.includes(must), `V30 · SKILL.md still names blocker ${must}`)
  }
  ok(/get_knowledge/.test(text), 'V30 · SKILL.md points the rest at get_knowledge')
  for (const mode of ['orient', 'score', 'fix']) ok(new RegExp(`\\b${mode}\\b`).test(text), `V30 · SKILL.md keeps the '${mode}' mode`)
}

// ---------- V31: install.sh does not wire the SessionStart hook unless asked ----------
{
  const isSessionWiring = (root) => {
    const hits = []
    const walk = d => {
      if (!fs.existsSync(d)) return
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (/session[-_]?start/i.test(e.name)) { hits.push(path.relative(root, p)); continue }
        if (/\.(ya?ml|json|sh)$/.test(e.name)) {
          let t = ''; try { t = fs.readFileSync(p, 'utf8') } catch { continue }
          if (/on_session_start|SessionStart/.test(t)) hits.push(path.relative(root, p))
        }
      }
    }
    walk(root)
    return hits
  }

  const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
  ok(!/settings\.json/.test(sh), 'V31 · install.sh never edits an agent settings.json')

  const dest = path.join(mktmp('v31-default'), 'skill')
  let r
  try {
    execFileSync('bash', [path.join(ROOT, 'install.sh'), dest], { encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV }, stdio: ['ignore', 'pipe', 'pipe'] })
    r = true
  } catch (e) { r = false }
  ok(r, 'V31 · the default install succeeds')
  const wired = isSessionWiring(dest)
  ok(wired.length === 0, `V31 · the default install ships no SessionStart wiring (${wired.join(', ') || '—'})`)

  const dest2 = path.join(mktmp('v31-optin'), 'skill')
  let optin = null
  try {
    execFileSync('bash', [path.join(ROOT, 'install.sh'), '--with-session-hook', dest2], { encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV }, stdio: ['ignore', 'pipe', 'pipe'] })
    optin = isSessionWiring(dest2)
  } catch { optin = null }
  ok(optin && optin.length > 0, `V31 · and asking for it installs it (--with-session-hook -> ${optin ? optin.join(', ') : 'flag rejected'})`)
}

// ---------- V32 / V33: counts in shipped files ----------
{
  // the scan set: everything git tracks, minus the places where a count is legitimately
  // historical (CHANGELOG/MIGRATION), a plan (docs/v2, docs/v3), or a fixture (test/).
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', env: { ...CLEAN_ENV, ...GITENV } }).split('\n').filter(Boolean)
  const EXCLUDE = /^(test\/|docs\/v2\/|docs\/v3\/|tasks\/|records\/|CHANGELOG\.md$|MIGRATION\.md$)/
  const scan = tracked.filter(f => !EXCLUDE.test(f) && fs.existsSync(path.join(ROOT, f)))
  ok(scan.length > 0, `V32/V33 · the scan set is non-empty (${scan.length} tracked files)`)

  // derived truths — never a literal
  const RULE_COUNT = rules.length
  const KIND_COUNT = (() => {
    const s = new Set()
    const walk = c => { if (!c || typeof c !== 'object') return; if (c.kind) s.add(c.kind); for (const x of c.checks || []) walk(x); if (c.when) walk(c.when); if (c.then) walk(c.then) }
    for (const r of rules) walk(r.check)
    return s.size
  })()
  const TOP_KIND_COUNT = new Set(rules.map(r => r.check?.kind).filter(Boolean)).size
  const REGISTERED_KINDS = await (async () => { try { const m = await import(path.join(ROOT, 'src', 'evaluators.mjs')); return m.CHECK_KINDS.size } catch { return null } })()
  const BLOCKER_COUNT = rules.filter(r => r.severity === 'blocker' && !r.pack).length
  // A doc may legitimately quote a SUB-count (per pack, per category, per severity), so a
  // "N rules" literal is compared against the set of numbers the rule set can actually
  // produce. A literal outside that set is drift by construction.
  const tally = (keyOf) => { const m = new Map(); for (const r of rules) { const k = keyOf(r); m.set(k, (m.get(k) || 0) + 1) } return [...m.values()] }
  const DERIVABLE_RULE_COUNTS = new Set([RULE_COUNT, BLOCKER_COUNT,
    ...tally(r => r.severity), ...tally(r => r.pack || 'core'), ...tally(r => r.category)])

  const PATTERNS = [
    [/(\d+)\s+rules\b/gi, 'rule count', (n) => DERIVABLE_RULE_COUNTS.has(n), () => RULE_COUNT],
    [/(\d+)\s+check kinds\b/gi, 'check-kind count', (n) => n === KIND_COUNT, () => KIND_COUNT],
    [/(\d+)\s+(?:always-on\s+)?blockers\b/gi, 'blocker count', (n) => n === BLOCKER_COUNT, () => BLOCKER_COUNT],
  ]
  // A self-SCORE ("0 blockers / 100%") is a run's result, not a claim about the rule set —
  // and only the blocker pattern is ever ambiguous that way, so the exemption is scoped
  // there. Nothing exempts a "N rules" or "N check kinds" literal (§9's own two cases).
  const isScoreLine = (line) => /%|\bscores?\b|✓|✗/.test(line)

  const found = []
  for (const rel of scan) {
    let text = ''
    try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { continue }
    for (const line of text.split('\n')) {
      for (const [re, what, agrees, want] of PATTERNS) {
        if (what === 'blocker count' && isScoreLine(line)) continue
        re.lastIndex = 0
        for (const m of line.matchAll(re)) found.push({ rel, what, got: Number(m[1]), agrees: agrees(Number(m[1])), want: want(), line: line.trim().slice(0, 100) })
      }
    }
  }

  // V32 — every DOC still shipped states no count that is not derived: zero literals.
  const inDocs = found.filter(f => f.rel.endsWith('.md'))
  ok(inDocs.length === 0,
    `V32 · no shipped doc states a hand-written count (${inDocs.length}: ${inDocs.slice(0, 3).map(f => `${f.rel} "${f.got} ${f.what}"`).join(' | ') || '—'})`)

  // and the counts they used to state must now come from the tool
  const skill = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8')
  ok(/--self-check|check --self-check/.test(skill),
    'V32 · SKILL.md points at --self-check for the counts instead of quoting them')

  // V33 — nowhere shipped may a count literal disagree with the rule set.
  const wrong = found.filter(f => !f.agrees)
  ok(wrong.length === 0,
    `V33 · every count literal agrees with the rule set (${wrong.length} wrong: ${wrong.slice(0, 4).map(f => `${f.rel}: "${f.got} ${f.what}", derived ${f.want}`).join(' | ') || '—'})`)

  // the three §9 names by file, asserted directly so a regression is legible
  for (const [rel, what] of [['baseline.config.json', 'rule count'], ['docs/start-here.md', 'rule count'], ['README.md', 'check-kind count']]) {
    const bad = found.filter(f => f.rel === rel && f.what === what && !f.agrees)
    ok(bad.length === 0, `V33 · ${rel} states no wrong ${what} (${bad.map(f => `${f.got} vs ${f.want}`).join(', ') || '—'})`)
  }

  // "the check-kind count" must have exactly ONE value before any doc may state it.
  // Today it has three: the registry (CHECK_KINDS), the kinds rules use as their own
  // check, and the kinds rules use anywhere (json-field appears only inside an any-of).
  // PLAN §9 asserts the truth is 44 and README says 45 — both are readings of the same
  // ambiguity, which is the actual defect under V33.
  ok(REGISTERED_KINDS !== null && REGISTERED_KINDS === KIND_COUNT && KIND_COUNT === TOP_KIND_COUNT,
    `V33 · the check-kind count is unambiguous: registry ${REGISTERED_KINDS} = used-anywhere ${KIND_COUNT} = used-as-a-rule's-own-check ${TOP_KIND_COUNT}`)

  // the alt-text of the shipped diagram is prose too — it drifted once already (§9)
  const svgs = tracked.filter(f => /docs\/assets\/.*\.svg$/.test(f))
  const altDrift = []
  for (const rel of svgs) {
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    for (const [re, what, agrees, want] of PATTERNS) { re.lastIndex = 0; for (const m of t.matchAll(re)) if (!agrees(Number(m[1]))) altDrift.push(`${rel}: ${m[1]} ${what} (derived ${want()})`) }
  }
  ok(altDrift.length === 0, `V33 · the shipped diagrams carry no stale count (${altDrift.slice(0, 3).join(' | ') || '—'})`)
}

cleanup()
process.exit(done() ? 1 : 0)
