// gatherFacts — resolve all three planes into ONE plain snapshot. This is where the I/O
// happens (git + the forge queries, incl. resolving the state of every issue a next: or a
// PR "closes #N" references); join and derive are then PURE functions of the snapshot, so
// they replay deterministically from committed forge fixtures.
import { treeFacts } from './tree.mjs'
import { gitFacts, SESSION_BASES, extractNext } from './git.mjs'
import { makeForge } from './forge.mjs'

// Any #N in a string; and the GitHub closing-keyword references ("closes #N", "fixes #N", …).
export const refs = (s) => s ? [...String(s).matchAll(/#(\d+)/g)].map(m => +m[1]) : []
export const closes = (s) => s ? [...String(s).matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map(m => +m[1]) : []

export function gatherFacts(repo, { descriptor, capability }) {
  const tree = treeFacts(repo, descriptor)
  const git = gitFacts(repo)
  const forge = makeForge(repo, { available: capability.forge.available, nwo: capability.forge.repo })

  const issues = forge.issuesOpen()
  const openNums = new Set(issues.map(i => i.number))
  const prs = forge.prsOpen().map(pr => {
    const log = SESSION_BASES.reduce((acc, base) => acc || forge.branchLog(base, pr.headRefName), null)
    return { number: pr.number, title: pr.title, branch: pr.headRefName, draft: !!pr.isDraft, updatedAt: pr.updatedAt, next: log?.raw ? extractNext(log.raw) : null, hasLog: !!log, closes: closes(pr.body) }
  })

  // Resolve the state of every referenced issue we can't already see as open (for divergence
  // + join integrity). One forge call per distinct number; memoized, and replayed in tests.
  const referenced = new Set()
  for (const n of refs(git.thisLaneLog?.next)) if (!openNums.has(n)) referenced.add(n)
  for (const pr of prs) { for (const n of refs(pr.next)) if (!openNums.has(n)) referenced.add(n); for (const n of pr.closes) if (!openNums.has(n)) referenced.add(n) }
  const issueStates = {}
  for (const n of referenced) { const it = forge.issue(n); issueStates[n] = it ? { state: String(it.state || '').toLowerCase(), title: it.title } : { state: 'unknown', title: null } }
  for (const i of issues) issueStates[i.number] = { state: 'open', title: i.title }

  return { source: forge.source, forgeAvailable: forge.available, forgeReason: forge.reason, tree, git, prs, issues, openIssueNumbers: [...openNums], issueStates }
}
