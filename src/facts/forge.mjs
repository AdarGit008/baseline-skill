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

export function makeForge(repo, { available = false, nwo = null, posture = null, probeReason = null } = {}) {
  // CF5: a multi-lane-local posture CLOSES the forge — and replay must not reopen it,
  // or fixtures would derive from consultations the posture promises never happen.
  // One home for the closure + its reason string; every surface (claim now, leases/
  // rules at M5b/M5c) inherits the same honest label instead of hand-rolling the gate.
  const CLOSED = posture === 'multi-lane-local'
  const REPLAY = process.env.BASELINE_FORGE_REPLAY || null
  const RECORD = process.env.BASELINE_FORGE_RECORD || null
  const memo = new Map()
  const isAvail = () => CLOSED ? false : (REPLAY ? true : !!available)

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
    source: CLOSED ? 'posture' : REPLAY ? 'replay' : 'forge',
    // the probe's specific cause wins over the generic label when the caller threaded one
    reason: isAvail() ? null : CLOSED ? 'forge not consulted (multi-lane-local posture)' : (probeReason || 'forge unreachable'),
    prsOpen() { return isAvail() ? (q('prs-open', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,isDraft,updatedAt,body', '--limit', '50']) || []) : [] },
    // null-honest variant: a null (the gh query FAILED after the probe said available)
    // must not coalesce to [] and let a rule assert "no open PRs" as fact — the caller
    // SKIPs on null. [] only when the forge is genuinely closed/unreachable up front.
    prsOpenOrNull() { return isAvail() ? q('prs-open', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,isDraft,updatedAt,body', '--limit', '50']) : [] },
    issuesOpen() { return isAvail() ? (q('issues-open', ['issue', 'list', '--state', 'open', '--json', 'number,title,labels,milestone,updatedAt', '--limit', '200']) || []) : [] },
    issue(n) { return isAvail() ? q(`issue-${safeKey(n)}`, ['issue', 'view', String(n), '--json', 'number,state,title']) : null },
    // M5b: every lane tip's committedDate + associated-PR updatedAt in ONE GraphQL refs()
    // query (FS10 as amended — pushedDate is gone from the schema; batching beyond this
    // stays deferred until F2's fleet-scale trigger fires). Returns the RAW GraphQL
    // envelope (that is what record/replay persists); facts/index normalizes downstream.
    // refPrefix must be a '/'-terminated path, so the namespace's directory part goes in
    // the query and the one-star glob is re-applied client-side by the normalizer.
    laneRefs(namespace) {
      if (!isAvail() || !namespace) return null
      const dir = String(namespace).slice(0, String(namespace).lastIndexOf('/', String(namespace).indexOf('*')) + 1)
      const prefix = 'refs/heads/' + dir
      const QUERY = 'query($owner:String!,$name:String!,$prefix:String!){repository(owner:$owner,name:$name){refs(refPrefix:$prefix,first:100){pageInfo{hasNextPage}nodes{name target{... on Commit{oid committedDate message associatedPullRequests(first:20){pageInfo{hasNextPage}nodes{number state isDraft title updatedAt}}}}}}}}'
      const [owner, name] = String(nwo || '/').split('/')
      return q(`lane-refs-${safeKey(prefix)}`, ['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `prefix=${prefix}`])
    },
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
