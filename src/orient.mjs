// `baseline orient` — the derived-state survey a session runs first (C16). It computes,
// from tree + history + forge, the three inputs a session-start protocol needs — plus any
// divergence, surfaced first. It is an agent helper, never a gate: every plane that is
// unreachable degrades to a labelled note and orient still prints what it could derive
// (FS9 — it never hard-refuses; only --strict turns forge-unreachability into exit 1).
// Generalizes the ADR-0009 prototype tools/orient.mjs, made descriptor-aware.
import path from 'node:path'
import fs from 'node:fs'
import { indexRepo } from './repo.mjs'
import { loadDescriptor } from './descriptor.mjs'
import { capabilityProbe, gh, ghJson } from './probe.mjs'

// Session records live under the V2 path first, then the legacy prototype path. A lane's
// branch name is its record namespace (lane claim = branch, C10/C31).
const SESSION_BASES = ['records/sessions', 'docs/session-log']

const ageOf = (iso) => {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 3600000) return 'just now'
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

// The `## Left open` -> `next:` line of a session log (mirrors the session-log guard).
function extractNext(md) {
  const lines = md.split('\n')
  const start = lines.findIndex(l => /^##\s+Left open\b/i.test(l))
  if (start === -1) return null
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    const m = lines[i].match(/^\s*next:\s*(.*)$/i)
    if (m) return m[1].trim() || null
  }
  return null
}

// Newest session log for a branch in the local worktree -> { rel, next } or null.
function localLaneLog(repo, branch) {
  for (const base of SESSION_BASES) {
    const dir = path.join(repo.REPO, base, branch)
    let files
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() } catch { continue }
    if (!files.length) continue
    const file = files.at(-1)
    return { rel: `${base}/${branch}/${file}`, next: extractNext(fs.readFileSync(path.join(dir, file), 'utf8')) }
  }
  return null
}

// A PR branch's newest session log, read from origin at that ref via the contents API.
function forgeLaneLog(repo, nwo, branch) {
  for (const base of SESSION_BASES) {
    const listing = ghJson(['api', `repos/${nwo}/contents/${base}/${branch}?ref=${branch}`], { cwd: repo.REPO })
    if (!Array.isArray(listing)) continue
    const files = listing.filter(e => e.type === 'file' && e.name.endsWith('.md')).map(e => e.name).sort()
    if (!files.length) continue
    const raw = gh(['api', `repos/${nwo}/contents/${base}/${branch}/${files.at(-1)}?ref=${branch}`, '-H', 'Accept: application/vnd.github.raw'], { cwd: repo.REPO })
    return { file: files.at(-1), next: raw ? extractNext(raw) : null }
  }
  return null
}

export async function runOrient(argv) {
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d }
  const REPO = path.resolve(opt('--repo', process.cwd()))
  const JSON_OUT = !!opt('--json', false)
  const STRICT = !!opt('--strict', false)

  const repo = indexRepo(REPO)
  const descriptor = loadDescriptor(repo)
  const cap = capabilityProbe(repo)
  const nwo = cap.forge.available ? cap.forge.repo : null
  const branch = cap.history.branch

  const lanes = []
  let backlog = []
  const divergence = []

  if (nwo) {
    const prs = ghJson(['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,isDraft,updatedAt', '--limit', '50'], { cwd: REPO }) || []
    for (const pr of prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const log = forgeLaneLog(repo, nwo, pr.headRefName)
      lanes.push({ number: pr.number, title: pr.title, branch: pr.headRefName, draft: pr.isDraft, age: ageOf(pr.updatedAt), next: log?.next || null, hasLog: !!log })
    }
    backlog = ghJson(['issue', 'list', '--state', 'open', '--json', 'number,title,labels,milestone', '--limit', '200'], { cwd: REPO }) || []
  }

  const thisLane = { branch, ...(branch && branch !== '(detached)' ? (localLaneLog(repo, branch) || {}) : {}) }

  // Divergence, surfaced first (a light, forge-only preview — full DIV rules are M5): a
  // `next:` that names an issue which is no longer open is a cross-tier conflict (DIV-02).
  if (nwo) {
    const open = new Set(backlog.map(i => i.number))
    const seen = new Set()
    const scan = (where, nextStr) => {
      if (!nextStr) return
      for (const m of nextStr.matchAll(/#(\d+)/g)) {
        const n = parseInt(m[1], 10)
        if (open.has(n) || seen.has(n)) continue
        seen.add(n)
        const st = ghJson(['issue', 'view', String(n), '--json', 'state,title'], { cwd: REPO })
        if (st?.state && st.state.toLowerCase() !== 'open') divergence.push(`${where}: next: points at #${n} (${st.state.toLowerCase()}) — "${st.title}"`)
      }
    }
    scan(`this lane (${branch})`, thisLane.next)
    for (const l of lanes) scan(`#${l.number} ${l.branch}`, l.next)
  }

  const exit = (STRICT && !cap.forge.available) ? 1 : 0

  if (JSON_OUT) {
    console.log(JSON.stringify({
      repo: REPO,
      descriptor: { present: descriptor.present, valid: descriptor.valid, type: descriptor.data?.type ?? null, workflow: descriptor.data?.workflow ?? null },
      capability: cap, divergence, lanes,
      backlog: backlog.map(i => ({ number: i.number, title: i.title, milestone: i.milestone?.title ?? null, labels: i.labels.map(l => l.name) })),
      this_lane: thisLane, exit,
    }, null, 2))
    return exit
  }

  // ---- human survey ----
  const P = []
  const capLine = c => c.available
    ? `✓${c.branch ? ` (${c.branch})` : c.repo ? ` (${c.repo})` : ''}${c.shallow ? ' [shallow]' : ''}`
    : `✗ (${c.reason})`
  P.push(`\n# Orientation — ${path.basename(REPO)}${branch ? `  ·  ${branch}` : ''}\n`)
  P.push(`Planes: TREE ${capLine(cap.tree)} · HISTORY ${capLine(cap.history)} · FORGE ${capLine(cap.forge)}`)
  P.push(descriptor.present
    ? `Descriptor: ${descriptor.valid ? `${descriptor.data.type} · ${descriptor.data.workflow}` : `present but INVALID (${descriptor.errors[0] || 'schema error'})`}`
    : `Descriptor: undeclared — advisory orientation only (run \`baseline init\` to declare)`)

  if (divergence.length) {
    P.push(`\n## ⚠ Divergence (resolve first)`)
    for (const d of divergence) P.push(`- ${d}`)
  }

  P.push(`\n## Live lanes (open PRs)`)
  if (!nwo) P.push(`_forge unreachable (${cap.forge.reason}) — by hand: \`gh pr list\`_`)
  else if (!lanes.length) P.push(`_none_`)
  else for (const l of lanes) {
    P.push(`- #${l.number}${l.draft ? ' [draft]' : ''} ${l.title}  \`${l.branch}\`  (${l.age})`)
    P.push(l.next ? `    ↳ next: ${l.next}` : l.hasLog ? `    ↳ (session log has no filled-in next:)` : `    ↳ (no session log on branch)`)
  }

  P.push(`\n## Backlog (open issues)`)
  if (!nwo) P.push(`_forge unreachable — by hand: \`gh issue list\`_`)
  else if (!backlog.length) P.push(`_none_`)
  else {
    const byMs = new Map()
    for (const it of backlog) { const k = it.milestone?.title ?? '(no milestone)'; (byMs.get(k) || byMs.set(k, []).get(k)).push(it) }
    for (const [ms, list] of [...byMs.entries()].sort()) {
      P.push(`\n### ${ms}`)
      for (const it of list.sort((a, b) => a.number - b.number)) {
        const labels = it.labels.map(l => l.name).join(', ')
        P.push(`- #${it.number} ${it.title}${labels ? `  _[${labels}]_` : ''}`)
      }
    }
  }

  P.push(`\n## This lane (${branch || 'no git'})`)
  if (!branch) P.push(`_${cap.history.reason || 'no branch'}_`)
  else P.push(thisLane.next ? `    ↳ next: ${thisLane.next}  (${thisLane.rel})` : thisLane.rel ? `    ↳ (${thisLane.rel} has no filled-in next:)` : `    ↳ (no session log yet on this branch)`)
  P.push('')

  console.log(P.join('\n'))
  return exit
}
