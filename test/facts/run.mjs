#!/usr/bin/env node
// Deterministic facts -> join -> derive over a committed forge REPLAY scenario (no network,
// no clock dependence in the asserted fields). Pins the join/divergence logic: a clean close
// edge, a divergence (a PR closes an already-closed issue), and an unresolvable-join finding
// (a PR closes a non-existent issue). This is also the record/replay contract downstream
// lane/admit tests (M5/M6) will consume.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gatherFacts } from '../../src/facts/index.mjs'
import { join } from '../../src/join.mjs'
import { deriveStatus } from '../../src/derive/status.mjs'
import { loadDescriptor } from '../../src/descriptor.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
process.env.BASELINE_FORGE_REPLAY = path.resolve(HERE, '..', 'forge-fixtures', 'scenario')

// A minimal non-git repo so tree/git facts degrade cleanly; forge comes entirely from replay.
const repo = { REPO: '/nonexistent', HEAD: null, read: () => null, gitIsShallow: () => false }
const cap = { tree: { available: true }, history: { available: false, reason: 'no git (fixture)' }, forge: { available: true, repo: 'test/repo' } }
const facts = gatherFacts(repo, { descriptor: loadDescriptor(repo), capability: cap })
const joined = join(facts)
const status = deriveStatus(facts, joined, cap)

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

ok(status.source === 'replay', 'forge source = replay (deterministic, no network)')
ok(status.prs.length === 4, `4 open PRs from fixtures (got ${status.prs.length})`)
// M5b re-homed the keys: `lanes` is the derived lease view (needs a declared namespace —
// none here, so it is honestly empty), `prs` is the open-PR list that used to sit there.
ok(Array.isArray(status.lanes) && status.lanes.length === 0 && status.lanesMeta === null,
  'no lanes.namespace declared -> lease view empty + lanesMeta null (underived, never guessed)')
ok(status.findings.length === 1 && /#12\b/.test(status.findings[0].detail) && /#999\b/.test(status.findings[0].detail),
  'unresolvable join: PR #12 "closes #999" (non-existent) -> finding, never a guess')
ok(status.divergence.length === 1 && /#11\b/.test(status.divergence[0]) && /#5\b/.test(status.divergence[0]),
  'divergence: PR #11 closes already-closed #5')
const closeEdges = joined.edges.filter(e => e.key === 'closes').map(e => `${e.from}->${e.to}`).sort()
ok(JSON.stringify(closeEdges) === JSON.stringify(['pr#10->issue#2', 'pr#11->issue#5']), `close edges resolve to real issues (got: ${closeEdges.join(', ') || 'none'})`)
ok(status.backlog.length === 1 && status.backlog[0].number === 2, 'backlog = the one open issue')

// ---- M5b: the forge lane-refs path over replay (relative Ref.name shape, verified live) ----
process.env.BASELINE_LOG_NOW = '2026-07-14T12:00:00Z' // pin the lease clock — states below are arithmetic, not luck
const laneDesc = { schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype', workflow: 'multi-lane', anchoring: 'strict', lanes: { namespace: 'lane/*', lease_ttl: '7d' }, join_keys: ['Baseline-Agent', 'Baseline-Issue'] }
const repo2 = { REPO: '/nonexistent', HEAD: null, read: rel => rel === 'baseline.repo.json' ? JSON.stringify(laneDesc) : null, gitIsShallow: () => false }
const facts2 = gatherFacts(repo2, { descriptor: loadDescriptor(repo2), capability: cap })
const status2 = deriveStatus(facts2, join(facts2), cap)

ok(status2.lanesMeta?.namespace === 'lane/*' && status2.lanesMeta?.ttl === '7d', 'descriptor lanes flow into the view meta')
ok(status2.lanes.length === 2, `2 lanes from the ONE refs() replay (got ${status2.lanes.length})`)
const l9 = status2.lanes[0], l7 = status2.lanes[1]
ok(l9?.ref === 'lane/9' && l9.state === 'ABANDONED' && l9.agent === 'bob', `lane/9 derives ABANDONED under bob and sorts FIRST (got ${l9?.ref} ${l9?.state} ${l9?.agent})`)
ok(l7?.ref === 'lane/7' && l7.state === 'LIVE' && l7.agent === 'alice' && l7.agentSource === 'tip-trailer', `lane/7 derives LIVE under alice via the tip trailer (got ${l7?.ref} ${l7?.state})`)
ok(l7?.basis === 'pr-update', `lane/7 freshness = max(committedDate, PR updatedAt) — the newer PR signal wins (got ${l7?.basis})`)
ok(l7?.pr?.number === 40, 'the open associated PR rides the lane line')
ok(l7?.hasLog === false && l7?.next === null, 'the joined PR hands its fetched log facts to the lane line (looked, found none — not a guess)')
ok(l9?.hasLog === null, 'a lane whose PR facts were never fetched says hasLog null — unknown, never asserted')
ok(l9?.issue === 9 && l9?.anchor?.state === 'unknown', 'anchor resolution: an issue the replay cannot see is UNKNOWN, never guessed')

// ---- a truncated forge page must be labeled, never silent (both cut points) ----
const truncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-trunc-'))
const envelope = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'forge-fixtures', 'scenario', 'lane-refs-refs_heads_lane_.json'), 'utf8'))
envelope.data.repository.refs.pageInfo.hasNextPage = true
envelope.data.repository.refs.nodes[0].target.associatedPullRequests.pageInfo = { hasNextPage: true }
fs.writeFileSync(path.join(truncDir, 'lane-refs-refs_heads_lane_.json'), JSON.stringify(envelope) + '\n')
for (const f of ['prs-open.json', 'issues-open.json', 'issue-5.json']) fs.copyFileSync(path.resolve(HERE, '..', 'forge-fixtures', 'scenario', f), path.join(truncDir, f))
process.env.BASELINE_FORGE_REPLAY = truncDir
const facts3 = gatherFacts(repo2, { descriptor: loadDescriptor(repo2), capability: cap })
const status3 = deriveStatus(facts3, join(facts3), cap)
ok(status3.lanesMeta?.truncated === true, 'a truncated refs page rides lanesMeta (orient labels it)')
const t7 = status3.lanes.find(l => l.ref === 'lane/7')
ok(t7?.labels.some(l => /PR page truncated/.test(l)), 'a truncated PR sub-page labels the lane — freshness can only be understated, never silently')
fs.rmSync(truncDir, { recursive: true, force: true })

// ---- one-derivation parity: orient's divergence headline and the DIV rules' classifier
// are the SAME deriveDivergence over the SAME facts — a change to "closed" can't move one
// surface and not the other. Assert the two agree on a mixed world. ----
const { deriveDivergence, isClosed } = await import('../../src/derive/divergence.mjs')
ok(isClosed('closed') === true && isClosed('open') === false && isClosed('unknown') === false && isClosed(undefined) === false,
  'isClosed: the ONE closed-predicate — closed yes, open/unknown/absent no')
const parityFacts = {
  lanes: [{ ref: 'lane/7', anchor: { issue: 7, state: 'closed' } }, { ref: 'lane/9', anchor: { issue: 9, state: 'open' } }],
  prs: [{ number: 40, branch: 'lane/7', closes: [5], next: null }],
  thisLane: { branch: 'lane/7', next: 'wrap #5' },
  issueStates: { 5: { state: 'closed', title: 'done' }, 7: { state: 'closed', title: 'anchor' }, 9: { state: 'open', title: 'live' } },
}
const items = deriveDivergence(parityFacts)
const codes = items.map(i => i.code).sort()
ok(JSON.stringify(codes) === JSON.stringify(['DIV-01', 'DIV-02', 'DIV-03']),
  `orient's headline classifier fires all three codes on a mixed world (got ${codes.join(',') || 'none'})`)
// the check-side DIV evaluators filter this same output by code — so agreement is structural;
// pin that the shared classifier is what both call (no second spelling of "closed")
ok(items.every(i => isClosed(i.state)), 'every divergence item is over a closed issue — the shared predicate, one home')

console.log(fails ? `\n✗ ${fails} facts check(s) failed\n` : '\n✓ facts/join/derive deterministic over replay\n')
process.exit(fails ? 1 : 0)
