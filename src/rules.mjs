// Rules loader — manifest + per-category modules (plan §7). rules.json holds the
// runner's identity (name/version/project_types/profiles) and the ordered module
// list; each rules/<cat>.json holds that category's rules. The split is what lets
// M5+ land new rule families (flow/merge/rec/div) as additive files instead of
// monolith edits. Paths resolve against this module's own URL — co-located with
// rules.json + rules/, never copied apart (same contract as check.mjs itself).
import fs from 'node:fs'

export function loadRules() {
  const read = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'))
  const manifest = read('../rules.json')
  const rules = []
  for (const m of manifest.modules || []) {
    const mod = read('../' + m)
    if (!Array.isArray(mod.rules)) throw new Error(`rules module ${m}: no "rules" array`)
    rules.push(...mod.rules)
  }
  return { ...manifest, rules }
}
