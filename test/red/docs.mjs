#!/usr/bin/env node
// RED — V47: the live reference docs describe the shipped v4 architecture, not a retired one.
//
// e2e finding #2, pinned: REFERENCE.md / CONTRACT.md / GLOSSARY.md still narrate v3 — a
// warn tier, opt-in packs, the descriptor family, the docker/REPRO tool, BUILD-05,
// CTX-11's doc_lag_days, the CLAIM/REC/OPS families — while the shipped rule set is v4:
// 13 rules, no warn tier, no packs, no retired prefixes. The code is the authority, and
// start-here.md already says so correctly ("There is no warn tier"). This invariant makes
// the live docs and the rule set provably agree: for each live doc, assert it advertises
// NONE of the retired machinery, where every list is DERIVED from _lib.mjs (SURVIVING_IDS,
// PACKS, the loaded rule set) — never a typed count or list. RED today on
// REFERENCE/CONTRACT/GLOSSARY (and SECURITY's one BUILD-05); green once they stop
// advertising v3.
//
// Kept OUT of LIVE_DOCS by design — they legitimately name removed things to say what
// happened to them: MIGRATION.md (how to leave the old shapes), CHANGELOG.md (history),
// docs/v2/ docs/v3/ docs/v4/rule-review.md docs/tasks/ (provenance and the work log).
import fs from 'node:fs'
import path from 'node:path'
import { harness, loadRuleSet, ROOT, SURVIVING_IDS, PACKS, PREFIX_OF, cleanup } from './_lib.mjs'

const { ok, done } = harness('docs')
const { rules } = loadRuleSet()

// LIVE_DOCS — the pages whose whole job is to describe NOW. SECURITY.md is included: it is
// a live policy (a reporting channel, not history) and it names BUILD-05 once — it must
// describe the v4 runner, not a retired rule, exactly like the others.
const LIVE_DOCS = ['REFERENCE.md', 'CONTRACT.md', 'GLOSSARY.md', 'SECURITY.md', 'start-here.md']
const read = (rel) => fs.readFileSync(path.join(ROOT, 'docs', rel), 'utf8')

// ---------------- premises, derived (never a typed count) ----------------
// The survivor prefixes are the whitelist a retired-id scan measures against: 13 shipped
// rules → 13 prefixes, each unique (V7), so "retired" = any PREFIX-NN token not among them.
const SURVIVOR_PREFIXES = new Set(SURVIVING_IDS.map(PREFIX_OF))
ok(SURVIVOR_PREFIXES.size === SURVIVING_IDS.length,
  `V47 · the survivor whitelist is 1:1 with the shipped set (${SURVIVOR_PREFIXES.size} prefixes)`)
ok(Object.keys(PACKS).length === 0,
  'V47 · premise: PACKS is empty — packs are gone, so no doc may describe one as live')
ok(!rules.some(r => r.severity === 'warn'),
  'V47 · premise: no shipped rule claims severity "warn" — so no doc may claim a warn tier')

// ---------------- the retired machinery, derived ----------------
// A retired rule reference is any PREFIX-NN token that is not one of the 13 survivor
// prefixes. Two incidental tokens share the shape but are not rule ids, and are excluded
// by name (not by a list of rules): UTF-16 (an encoding CONTRACT mentions), UTF-8.
const ID_TOKEN = /\b[A-Z]+-\d{2}\b/g
const NOT_A_RULE_ID = new Set(['UTF-16', 'UTF-8'])
const retiredIds = (text) => {
  const seen = new Set()
  for (const m of text.matchAll(ID_TOKEN)) {
    const t = m[0]
    if (SURVIVOR_PREFIXES.has(t) || NOT_A_RULE_ID.has(t)) continue
    seen.add(t)
  }
  return [...seen].sort()
}

// The pack mechanism, derived from PACKS === {}: the bare words "pack"/"packs" survive in
// the live docs only as the retired v3 machinery ("package.json" / "packaged" never match
// this boundary), so any hit is drift.
const PACK_WORD = /\bpacks?\b/g
const packCount = (text) => [...text.matchAll(PACK_WORD)].length

// The warn tier. The severity vocabulary is {blocker, none} (premise above); the only
// legitimate "warn" left in the live docs is (a) the negation "there is no warn tier", and
// (b) the records SCRUB gate's own block/warn ladder — a different subsystem, still real.
// Everything else that says "warn" about rules is the retired v3 tier, and the all-caps
// WARN verdict tag is never legitimate. Markdown emphasis is stripped first so "*warn*"
// and "`warn`" read as the word.
const WARN_WORD = /\bwarn(?:s|ing)?\b/i
const WARN_TAG = /\bWARN\b/
const LEGIT_WARN = /(?:no\s+warn(?:s|ing)?\s+tier|heuristics?\s+warn(?:s|ing)?|heuristic\s+findings\s+warn(?:s|ing)?|warns?\s+if\s+it\s+isn'?t)/i
const warnLines = (text) => {
  const scrubbed = text.replace(/[*_`]/g, '')
  const out = []
  for (const line of scrubbed.split('\n')) {
    if (!WARN_WORD.test(line)) continue
    if (WARN_TAG.test(line) || !LEGIT_WARN.test(line)) out.push(line.trim().slice(0, 96))
  }
  return out
}

// Retired config keys. Two derivations. (1) The keys the v4 cut REMOVED are read from
// config.mjs's own statement of them — the sentence beginning "The v4 rule-set cut retired
// ten keys"; every underscore token in it is one of the removed keys. (2) The INERT
// pack-switch knobs that survive in buildDefaults only because nothing reads them any more
// (makes_external_claims, profiles) are named here because the finding's stale markers are
// exactly those switches. The *_stale_days family is matched by shape: v4 has no such twin
// for any ordering rule.
const configSrc = fs.readFileSync(path.join(ROOT, 'src', 'config.mjs'), 'utf8')
const retiredSentence = configSrc.match(/retired ten keys with the rules that read them:([\s\S]*?)\.\s/)
const REMOVED_KEYS = new Set([...(retiredSentence?.[1] || '').matchAll(/\b[a-z][a-z0-9_]*\b/g)].map(m => m[0]).filter(k => k.includes('_')))
const INERT_PACK_KEYS = ['makes_external_claims', 'profiles']
const RETIRED_CONFIG_KEYS = [...REMOVED_KEYS, ...INERT_PACK_KEYS]
const staleKeyRe = new RegExp(`\\b(?:${RETIRED_CONFIG_KEYS.join('|')})\\b`, 'g')
const staleDaysRe = /\b\w*_stale_days\b/g
const retiredKeys = (text) => {
  const seen = new Set()
  for (const re of [staleKeyRe, staleDaysRe]) for (const m of text.matchAll(re)) seen.add(m[0])
  return [...seen].sort()
}

// ---------------- the invariant, per live doc ----------------
for (const rel of LIVE_DOCS) {
  const text = read(rel)

  const ids = retiredIds(text)
  ok(ids.length === 0,
    `V47 · ${rel} names no retired rule prefix (${ids.length}: ${ids.join(', ') || '—'})`)

  const packs = packCount(text)
  ok(packs === 0,
    `V47 · ${rel} describes no pack (${packs} pack/packs reference(s))`)

  const warns = warnLines(text)
  ok(warns.length === 0,
    `V47 · ${rel} claims no warn tier (${warns.length} line(s): ${warns.slice(0, 3).join(' ⏎ ') || '—'})`)

  const keys = retiredKeys(text)
  ok(keys.length === 0,
    `V47 · ${rel} names no retired config key (${keys.length}: ${keys.join(', ') || '—'})`)
}

cleanup()
process.exit(done() ? 1 : 0)
