// Forge facts (typed, provenance-carrying), fetched via `gh` and memoized per run. Three modes:
//   live    — call gh, write-through the advisory cache
//   record  — BASELINE_FORGE_RECORD=<dir>: also persist each response as a committed fixture
//   replay  — BASELINE_FORGE_REPLAY=<dir>: read fixtures, no network, fully deterministic
// so downstream lane/admit tests (and this slice's own) replay a fixed forge without a network.
// Never throws: an absent/failed query -> null (list queries coalesce to []), and callers degrade.
// GraphQL batching is deferred until fleet-scale rate pressure is real (M5) — for a single run
// these gh queries return identical facts.
import fs from 'node:fs'
import path from 'node:path'
import { gh, ghJson } from '../probe.mjs'
import { cacheWrite } from '../cache.mjs'

export function makeForge(repo, { available = false, nwo = null } = {}) {
  const REPLAY = process.env.BASELINE_FORGE_REPLAY || null
  const RECORD = process.env.BASELINE_FORGE_RECORD || null
  const memo = new Map()
  const isAvail = () => REPLAY ? true : !!available

  const readFixture = (key) => { try { return JSON.parse(fs.readFileSync(path.join(REPLAY, key + '.json'), 'utf8')) } catch { return undefined } }
  const writeFixture = (key, val) => { try { fs.mkdirSync(RECORD, { recursive: true }); fs.writeFileSync(path.join(RECORD, key + '.json'), JSON.stringify(val, null, 2) + '\n') } catch {} }

  // Memoized fetch by stable key. Replay short-circuits gh (and the cache) entirely.
  function q(key, ghArgs, { raw = false } = {}) {
    if (memo.has(key)) return memo.get(key)
    let val
    if (REPLAY) {
      const f = readFixture(key)
      val = f === undefined ? null : (raw && f && typeof f === 'object' ? (f.raw ?? null) : f)
    } else if (!isAvail()) {
      val = null
    } else {
      val = raw ? gh(ghArgs, { cwd: repo.REPO }) : ghJson(ghArgs, { cwd: repo.REPO })
      if (val != null) { if (RECORD) writeFixture(key, raw ? { raw: val } : val); cacheWrite(repo, key, val) }
    }
    memo.set(key, val)
    return val
  }

  const safeKey = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_')

  return {
    available: isAvail(),
    source: REPLAY ? 'replay' : 'forge',
    reason: isAvail() ? null : 'forge unreachable',
    prsOpen() { return isAvail() ? (q('prs-open', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,isDraft,updatedAt,body', '--limit', '50']) || []) : [] },
    issuesOpen() { return isAvail() ? (q('issues-open', ['issue', 'list', '--state', 'open', '--json', 'number,title,labels,milestone,updatedAt', '--limit', '200']) || []) : [] },
    issue(n) { return isAvail() ? q(`issue-${safeKey(n)}`, ['issue', 'view', String(n), '--json', 'number,state,title']) : null },
    // Newest session log on a branch, read from origin at that ref via the contents API.
    branchLog(base, branch) {
      if (!isAvail()) return null
      const listing = q(`contents-${safeKey(base)}-${safeKey(branch)}`, ['api', `repos/${nwo}/contents/${base}/${branch}?ref=${branch}`])
      if (!Array.isArray(listing)) return null
      const files = listing.filter(e => e.type === 'file' && String(e.name).endsWith('.md')).map(e => e.name).sort()
      if (!files.length) return null
      const raw = q(`rawlog-${safeKey(branch)}-${safeKey(files.at(-1))}`, ['api', `repos/${nwo}/contents/${base}/${branch}/${files.at(-1)}?ref=${branch}`, '-H', 'Accept: application/vnd.github.raw'], { raw: true })
      return { file: files.at(-1), raw: raw || null }
    },
  }
}
