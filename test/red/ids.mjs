#!/usr/bin/env node
// RED — PLAN.md §2 "Rule ids carry three parts": V5, V6, V7 — as amended by §11.
//
// Pure data assertions over rules.json + rules/*.json. No CLI, no fixture, no clock.
// Today every id is the two-part `CATEGORY-NN`, so V5 and V6 fail on the whole set;
// V7 is the compatibility half and is asserted against the real v2.5.0 tag, not a
// hand-copied list. §11 (D8, D11) changes V7's census in two ways: six more v2 ids are
// deleted (REC-06 and the five sign-off rules), and the three PLUG-0N ids are the ONLY
// prefixes allowed to be new since the tag.
import * as L from './_lib.mjs'
import { harness, loadRuleSet, loadRuleSetAt, isDeleted, ID_RE, PREFIX_OF, SLUG_OF, SIGNOFF_FIVE, PACK_OF, cleanup } from './_lib.mjs'

const { ok, done } = harness('ids')
const { rules } = loadRuleSet()

// §11 D11 — the six ids deleted in the second round. _lib.mjs's DELETED_IDS is being
// widened to carry them; until it is, the union below keeps this file's census honest.
const D11_DELETED = ['REC-06', ...SIGNOFF_FIVE]
const deleted = (id) => isDeleted(id) || (L.DELETED_IDS || []).includes(id) || D11_DELETED.includes(id)
// §11 D8 — the three plugin rules, the only ids born after v2.5.0.
const PLUG = Array.isArray(L.PLUG_IDS) && L.PLUG_IDS.length ? L.PLUG_IDS : ['PLUG-01', 'PLUG-02', 'PLUG-03']
// The v2.5.0 tag lags the pre-v3 tree by two SURVIVING rules (#63/#64 landed untagged).
// They are not "new in v3": the plan's own §5 pack table names them, and that is asserted
// below so this literal cannot drift away from the plan.
const UNRELEASED_AT_V25 = ['CTX-13', 'CTX-14']

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
    const survivors = oldIds.filter(id => !deleted(id))
    const nowPrefixes = new Set(rules.map(r => PREFIX_OF(r.id)))

    // (i) every v2.5.0 id that §3 + §11 do not delete still resolves
    const missing = survivors.filter(p => !nowPrefixes.has(p))
    ok(missing.length === 0,
      `V7 · every v2.5.0 survivor's CATEGORY-NN prefix still resolves (${missing.length} lost of ${survivors.length}; first: ${missing.slice(0, 5).join(', ') || '—'})`)
    // the census must actually be narrower than the tag: §3 drops 15 and §11 drops 6 more
    const dropped = oldIds.filter(deleted)
    ok(dropped.length === oldIds.length - survivors.length && D11_DELETED.every(id => dropped.includes(id)),
      `V7 · the census treats §11's six (${D11_DELETED.join(' ')}) as deleted, not as survivors (${dropped.length} of ${oldIds.length} v2.5.0 ids dropped)`)

    // "resolvable" has to mean resolvable to the SAME rule: a survivor may gain a slug but
    // may not quietly change category underneath a stable number.
    const catAt = new Map(v25.rules.map(r => [r.id, r.category]))
    const drifted = rules
      .filter(r => catAt.has(PREFIX_OF(r.id)) && catAt.get(PREFIX_OF(r.id)) !== r.category)
      .map(r => `${r.id}: ${catAt.get(PREFIX_OF(r.id))} -> ${r.category}`)
    ok(drifted.length === 0,
      `V7 · a v2 id resolves to the same rule it always named (${drifted.slice(0, 3).join('; ') || '—'})`)

    // (ii) the only prefixes absent from v2.5.0 are the three PLUG-0N ids (§11 D8). A new
    // rule under an old category would be a v2 id that v2 never issued — a resolvability
    // hole — so v3 adds rules ONLY under the new PLUG family.
    ok(UNRELEASED_AT_V25.every(id => PACK_OF.has(id)),
      `V7 · the untagged pre-v3 rules this file allows are ones the plan's §5 table names (${UNRELEASED_AT_V25.join(', ')})`)
    ok(UNRELEASED_AT_V25.every(id => nowPrefixes.has(id)),
      `V7 · and each of them is still in the tree (else the allowance is stale)`)
    const permitted = new Set([...PLUG, ...UNRELEASED_AT_V25])
    // (a deleted prefix still in the tree — FLOW-08/09 today — is V8/V9's finding, not V7's)
    const born = [...nowPrefixes].filter(p => p && !catAt.has(p) && !deleted(p))
    const rogue = born.filter(p => !permitted.has(p))
    ok(rogue.length === 0,
      `V7 · PLUG-01..03 are the only prefixes absent from v2.5.0 (rogue: ${rogue.join(', ') || '—'})`)
    ok(PLUG.every(p => !catAt.has(p)),
      `V7 · and the PLUG prefixes are genuinely new — v2.5.0 never issued them (${PLUG.join(' ')})`)

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
