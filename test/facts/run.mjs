#!/usr/bin/env node
// Deterministic facts -> join -> derive over a committed forge REPLAY scenario (no network,
// no clock dependence in the asserted fields). Pins the join/divergence logic: a clean close
// edge, a divergence (a PR closes an already-closed issue), and an unresolvable-join finding
// (a PR closes a non-existent issue). This is also the record/replay contract downstream
// lane/admit tests (M5/M6) will consume.
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
ok(status.lanes.length === 3, `3 lanes from fixtures (got ${status.lanes.length})`)
ok(status.findings.length === 1 && /#12\b/.test(status.findings[0].detail) && /#999\b/.test(status.findings[0].detail),
  'unresolvable join: PR #12 "closes #999" (non-existent) -> finding, never a guess')
ok(status.divergence.length === 1 && /#11\b/.test(status.divergence[0]) && /#5\b/.test(status.divergence[0]),
  'divergence: PR #11 closes already-closed #5')
const closeEdges = joined.edges.filter(e => e.key === 'closes').map(e => `${e.from}->${e.to}`).sort()
ok(JSON.stringify(closeEdges) === JSON.stringify(['pr#10->issue#2', 'pr#11->issue#5']), `close edges resolve to real issues (got: ${closeEdges.join(', ') || 'none'})`)
ok(status.backlog.length === 1 && status.backlog[0].number === 2, 'backlog = the one open issue')

console.log(fails ? `\n✗ ${fails} facts check(s) failed\n` : '\n✓ facts/join/derive deterministic over replay\n')
process.exit(fails ? 1 : 0)
