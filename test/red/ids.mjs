#!/usr/bin/env node
// RED — PLAN.md §2 "Rule ids carry three parts": V5, V6, V7.
//
// Pure data assertions over rules.json + rules/*.json. No CLI, no fixture, no clock.
// Today every id is the two-part `CATEGORY-NN`, so V5 and V6 fail on the whole set;
// V7 is the compatibility half and is asserted against the real v2.5.0 tag, not a
// hand-copied list.
import { harness, loadRuleSet, loadRuleSetAt, isDeleted, ID_RE, PREFIX_OF, SLUG_OF, cleanup } from './_lib.mjs'

const { ok, done } = harness('ids')
const { rules } = loadRuleSet()

// ---------- V5: every rule id matches ^[A-Z]+-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$ ----------
{
  const bad = rules.filter(r => !ID_RE.test(r.id)).map(r => r.id)
  ok(bad.length === 0,
    `V5 · every rule id is CATEGORY-NN-semantic-slug (${bad.length}/${rules.length} do not match; first: ${bad.slice(0, 3).join(', ') || '—'})`)
  // the grammar must be enforced, not merely satisfied: a rule added tomorrow with a
  // two-part id has to be rejected by the tool's own integrity gate, not only by this file
  const anyTwoPart = rules.some(r => /^[A-Z]+-\d{2}$/.test(r.id))
  ok(!anyTwoPart, 'V5 · no rule keeps a bare two-part id')
}

// ---------- V6: slugs are unique across the whole rule set ----------
{
  const slugs = rules.map(r => SLUG_OF(r.id)).filter(Boolean)
  const seen = new Map()
  for (const s of slugs) seen.set(s, (seen.get(s) || 0) + 1)
  const dupes = [...seen].filter(([, n]) => n > 1).map(([s, n]) => `${s}×${n}`)
  ok(slugs.length === rules.length,
    `V6 · every rule carries a slug (${slugs.length}/${rules.length} have one)`)
  ok(dupes.length === 0, `V6 · slugs are unique across the rule set (dupes: ${dupes.slice(0, 3).join(', ') || '—'})`)
  // a slug must also be a usable handle: unique after lowercasing is not enough if two
  // rules differ only by their numeric part, since PLAN §7.3 addresses concepts BY slug
  const conceptIds = rules.map(r => r.id.toLowerCase())
  ok(new Set(conceptIds).size === conceptIds.length, 'V6 · lowercased ids (the okf concept handles) are unique too')
}

// ---------- V7: the CATEGORY-NN prefix of every surviving rule is unchanged from v2.5.0 ----------
{
  let v25 = null
  try { v25 = loadRuleSetAt('v2.5.0') } catch (e) { v25 = null }
  ok(!!v25, `V7 · the v2.5.0 tag is readable as the comparison baseline (${v25 ? 'ok' : 'git show v2.5.0 failed'})`)
  if (v25) {
    const oldIds = v25.rules.map(r => r.id)
    const survivors = oldIds.filter(id => !isDeleted(id))
    const nowPrefixes = new Set(rules.map(r => PREFIX_OF(r.id)))

    const missing = survivors.filter(p => !nowPrefixes.has(p))
    ok(missing.length === 0,
      `V7 · every v2.5.0 survivor's CATEGORY-NN prefix still resolves (${missing.length} lost; first: ${missing.slice(0, 5).join(', ') || '—'})`)

    // "resolvable" has to mean resolvable to the SAME rule: a survivor may gain a slug but
    // may not quietly change category underneath a stable number. (New rules are allowed —
    // v2.5.0 is a tag, not a freeze — so an unrecognised prefix is not an error here; V11
    // pins the total instead.)
    const catAt = new Map(v25.rules.map(r => [r.id, r.category]))
    const drifted = rules
      .filter(r => catAt.has(PREFIX_OF(r.id)) && catAt.get(PREFIX_OF(r.id)) !== r.category)
      .map(r => `${r.id}: ${catAt.get(PREFIX_OF(r.id))} -> ${r.category}`)
    ok(drifted.length === 0,
      `V7 · a v2 id resolves to the same rule it always named (${drifted.slice(0, 3).join('; ') || '—'})`)

    // the prefix must be a prefix, not a coincidence: id === prefix + '-' + slug
    const malformed = rules.filter(r => PREFIX_OF(r.id) && r.id !== `${PREFIX_OF(r.id)}-${SLUG_OF(r.id)}`).map(r => r.id)
    ok(malformed.length === 0, `V7 · id decomposes exactly as prefix + '-' + slug (${malformed.slice(0, 3).join(', ') || '—'})`)

    // and a v2 id must stay RESOLVABLE — the plan's stated reason for keeping the prefix
    const byPrefix = new Map()
    for (const r of rules) byPrefix.set(PREFIX_OF(r.id), (byPrefix.get(PREFIX_OF(r.id)) || 0) + 1)
    const ambiguous = [...byPrefix].filter(([, n]) => n > 1).map(([p]) => p)
    ok(ambiguous.length === 0, `V7 · a v2 id resolves to exactly one v3 rule (ambiguous: ${ambiguous.join(', ') || '—'})`)
  }
}

cleanup()
process.exit(done() ? 1 : 0)
