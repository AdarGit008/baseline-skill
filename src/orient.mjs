// `baseline orient` — the derived-state survey a session runs first (C16). It gathers facts
// from tree + history + forge (src/facts/*), joins them over declared keys (src/join.mjs),
// derives the status view (src/derive/status.mjs), then renders it. An agent helper, never a
// gate: every unreachable plane degrades to a labelled note and orient still prints what it
// derived (FS9 — never hard-refuses; only --strict turns forge-unreachability into exit 1).
// Generalizes the ADR-0009 prototype tools/orient.mjs.
import path from 'node:path'
import { indexRepo } from './repo.mjs'
import { loadDescriptor } from './descriptor.mjs'
import { capabilityProbe } from './probe.mjs'
import { gatherFacts } from './facts/index.mjs'
import { join } from './join.mjs'
import { deriveStatus } from './derive/status.mjs'

const ageOf = (iso) => {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 3600000) return 'just now'
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

export async function runOrient(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d }
  const REPO = path.resolve(opt('--repo', process.cwd()))
  const JSON_OUT = !!opt('--json', false)
  const STRICT = !!opt('--strict', false)

  const repo = indexRepo(REPO)
  const descriptor = loadDescriptor(repo)
  const cap = capabilityProbe(repo)
  const facts = gatherFacts(repo, { descriptor, capability: cap })
  const status = deriveStatus(facts, join(facts), cap)
  const exit = (STRICT && !cap.forge.available) ? 1 : 0

  if (JSON_OUT) { console.log(JSON.stringify({ repo: REPO, ...status, exit }, null, 2)); return exit }

  // ---- human survey (renders the derived status) ----
  const P = []
  const capLine = c => c.available
    ? `✓${c.branch ? ` (${c.branch})` : c.repo ? ` (${c.repo})` : ''}${c.shallow ? ' [shallow]' : ''}`
    : `✗ (${c.reason})`
  const branch = status.thisLane.branch
  P.push(`\n# Orientation — ${path.basename(REPO)}${branch ? `  ·  ${branch}` : ''}\n`)
  P.push(`Planes: TREE ${capLine(cap.tree)} · HISTORY ${capLine(cap.history)} · FORGE ${capLine(cap.forge)}`)
  const d = status.descriptor
  P.push(d.present
    ? `Descriptor: ${d.valid ? `${d.type} · ${d.workflow}` : `present but INVALID (${d.errors[0] || 'schema error'})`}`
    : `Descriptor: undeclared — advisory orientation only (run \`baseline init\` to declare)`)

  if (status.findings.length) {
    P.push(`\n## ⚠ Unresolved joins (integrity)`)
    for (const f of status.findings) P.push(`- ${f.detail}`)
  }
  if (status.divergence.length) {
    P.push(`\n## ⚠ Divergence (resolve first)`)
    for (const x of status.divergence) P.push(`- ${x}`)
  }

  P.push(`\n## Live lanes (open PRs)`)
  if (!status.forgeAvailable) P.push(`_forge unreachable (${status.forgeReason || cap.forge.reason}) — by hand: \`gh pr list\`_`)
  else if (!status.lanes.length) P.push(`_none_`)
  else for (const l of status.lanes) {
    P.push(`- #${l.number}${l.draft ? ' [draft]' : ''} ${l.title}  \`${l.branch}\`  (${ageOf(l.updatedAt)})${l.closes?.length ? `  → closes #${l.closes.join(', #')}` : ''}`)
    P.push(l.next ? `    ↳ next: ${l.next}` : l.hasLog ? `    ↳ (session log has no filled-in next:)` : `    ↳ (no session log on branch)`)
  }

  P.push(`\n## Backlog (open issues)`)
  if (!status.forgeAvailable) P.push(`_forge unreachable — by hand: \`gh issue list\`_`)
  else if (!status.backlog.length) P.push(`_none_`)
  else {
    const byMs = new Map()
    for (const it of status.backlog) { const k = it.milestone ?? '(no milestone)'; (byMs.get(k) || byMs.set(k, []).get(k)).push(it) }
    for (const [ms, list] of [...byMs.entries()].sort()) {
      P.push(`\n### ${ms}`)
      for (const it of list.sort((a, b) => a.number - b.number)) P.push(`- #${it.number} ${it.title}${it.labels.length ? `  _[${it.labels.join(', ')}]_` : ''}`)
    }
  }

  P.push(`\n## This lane (${branch || 'no git'})`)
  if (!branch) P.push(`_${cap.history.reason || 'no branch'}_`)
  else P.push(status.thisLane.next ? `    ↳ next: ${status.thisLane.next}  (${status.thisLane.rel})` : status.thisLane.rel ? `    ↳ (${status.thisLane.rel} has no filled-in next:)` : `    ↳ (no session log yet on this branch)`)
  P.push('')

  console.log(P.join('\n'))
  return exit
}
