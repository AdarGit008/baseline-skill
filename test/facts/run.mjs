#!/usr/bin/env node
// Deterministic facts -> derive over a committed forge REPLAY scenario (no network, no clock
// dependence in the asserted fields). v3 retired the join layer and derive/status with
// orient v2 (only orient consumed them), so this pins what survives: gatherFacts over
// replay (PR/issue/lane facts, forge-authoritative closers, truncation labels) and the ONE
// divergence classifier both orient's headline and the DIV rules used to share.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gatherFacts } from '../../src/facts/index.mjs'
import { loadDescriptor } from '../../src/descriptor.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
process.env.BASELINE_FORGE_REPLAY = path.resolve(HERE, '..', 'forge-fixtures', 'scenario')

// A minimal non-git repo so tree/git facts degrade cleanly; forge comes entirely from replay.
const repo = { REPO: '/nonexistent', HEAD: null, read: () => null, gitIsShallow: () => false }
const cap = { tree: { available: true }, history: { available: false, reason: 'no git (fixture)' }, forge: { available: true, repo: 'test/repo' } }
const facts = gatherFacts(repo, { descriptor: loadDescriptor(repo), capability: cap })

let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

ok(facts.source === 'replay', 'forge source = replay (deterministic, no network)')
ok(facts.prs.length === 4, `4 open PRs from fixtures (got ${facts.prs.length})`)
ok(Array.isArray(facts.lanes) && facts.lanes.length === 0 && facts.lanesMeta === null,
  'no lanes.namespace declared -> lane facts empty + lanesMeta null (underived, never guessed)')
ok(facts.issues.length === 1 && facts.issues[0].number === 2, 'backlog facts = the one open issue')
ok(facts.issueStates[5]?.state === 'closed', 'a PR-referenced closed issue is resolved to its state (#5 closed)')
ok(facts.issueStates[999]?.state === 'unknown', 'a PR-referenced non-existent issue is UNKNOWN, never a guess (#999)')

// ---- M5b: the forge lane-refs path over replay (relative Ref.name shape, verified live) ----
process.env.BASELINE_LOG_NOW = '2026-07-14T12:00:00Z' // pin the lease clock — states below are arithmetic, not luck
const laneDesc = { schema_version: 1, type: 'node', lifecycle: 'experimental', maturity: 'prototype', workflow: 'multi-lane', anchoring: 'strict', lanes: { namespace: 'lane/*', lease_ttl: '7d' }, join_keys: ['Baseline-Agent', 'Baseline-Issue'] }
const repo2 = { REPO: '/nonexistent', HEAD: null, read: rel => rel === 'baseline.repo.json' ? JSON.stringify(laneDesc) : null, gitIsShallow: () => false }
const facts2 = gatherFacts(repo2, { descriptor: loadDescriptor(repo2), capability: cap })

ok(facts2.lanesMeta?.namespace === 'lane/*' && facts2.lanesMeta?.ttl === '7d', 'descriptor lanes flow into lanesMeta')
ok(facts2.lanes.length === 2, `2 lanes from the ONE refs() replay (got ${facts2.lanes.length})`)
const l7 = facts2.lanes.find(l => l.ref === 'lane/7'), l9 = facts2.lanes.find(l => l.ref === 'lane/9')
ok(l7?.agent === 'alice' && l7?.agentSource === 'tip-trailer', `lane/7 carries alice via the tip trailer (got ${l7?.agent} ${l7?.agentSource})`)
ok(l7?.pr?.number === 40, 'the open associated PR rides the lane fact')
ok(l9?.agent === 'bob' && l9?.pr === null, `lane/9 carries bob and no open PR (got ${l9?.agent} ${l9?.pr})`)

// ---- a truncated forge page must be labeled, never silent (both cut points) ----
const truncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-trunc-'))
const envelope = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'forge-fixtures', 'scenario', 'lane-refs-refs_heads_lane_.json'), 'utf8'))
envelope.data.repository.refs.pageInfo.hasNextPage = true
envelope.data.repository.refs.nodes[0].target.associatedPullRequests.pageInfo = { hasNextPage: true }
fs.writeFileSync(path.join(truncDir, 'lane-refs-refs_heads_lane_.json'), JSON.stringify(envelope) + '\n')
for (const f of ['prs-open.json', 'issues-open.json', 'issue-5.json']) fs.copyFileSync(path.resolve(HERE, '..', 'forge-fixtures', 'scenario', f), path.join(truncDir, f))
process.env.BASELINE_FORGE_REPLAY = truncDir
const facts3 = gatherFacts(repo2, { descriptor: loadDescriptor(repo2), capability: cap })
ok(facts3.lanesMeta?.truncated === true, 'a truncated refs page rides lanesMeta')
ok(facts3.lanes.some(l => l.prPageTruncated === true), 'a truncated PR sub-page is labeled on the lane fact — freshness can only be understated, never silently')
fs.rmSync(truncDir, { recursive: true, force: true })

// ---- forge-authoritative closers: a SIDEBAR-linked close (no keyword in the body) is a
// PR fact — the blind spot #46 fixes. -------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-sidebar-'))
  for (const [f, v] of Object.entries({
    'issues-open.json': [{ number: 9, title: 'live', labels: [], milestone: null, updatedAt: '2026-07-10T00:00:00Z' }],
    'issue-5.json': { number: 5, state: 'CLOSED', title: 'done' },
    'prs-open.json': [{ number: 50, title: 'sidebar closer', headRefName: 'lane/a', isDraft: false, updatedAt: '2026-07-10T00:00:00Z', body: 'Work toward #5.' }],
    'pr-closers-50.json': { data: { repository: { pullRequest: { number: 50, closingIssuesReferences: { nodes: [{ number: 5 }] } } } } },
  })) fs.writeFileSync(path.join(dir, f), JSON.stringify(v) + '\n')
  process.env.BASELINE_FORGE_REPLAY = dir
  const repo3 = { REPO: '/nonexistent', HEAD: null, read: () => null, gitIsShallow: () => false }
  const facts4 = gatherFacts(repo3, { descriptor: loadDescriptor(repo3), capability: cap })
  const pr50 = facts4.prs.find(p => p.number === 50)
  ok(pr50?.closes.includes(5) && facts4.issueStates[5]?.state === 'closed',
    `forge closers: PR #50 closes already-closed #5 via a sidebar link (body has no keyword) — a fact, not a body parse (got closes=${JSON.stringify(pr50?.closes)} #5=${facts4.issueStates[5]?.state})`)
  fs.rmSync(dir, { recursive: true, force: true })
  process.env.BASELINE_FORGE_REPLAY = path.resolve(HERE, '..', 'forge-fixtures', 'scenario')
}

// ---- one-derivation parity: the divergence classifier is ONE deriveDivergence over the
// facts — a change to "closed" can't move one surface and not another. ----
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
  `the divergence classifier fires all three codes on a mixed world (got ${codes.join(',') || 'none'})`)
ok(items.every(i => isClosed(i.state)), 'every divergence item is over a closed issue — the shared predicate, one home')

console.log(fails ? `\n✗ ${fails} facts check(s) failed\n` : '\n✓ facts/derive deterministic over replay\n')
process.exit(fails ? 1 : 0)
