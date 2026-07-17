// baseline reconcile — post-merge revalidation of the default branch (M6b; C37,
// FS6/F6 as amended by the M6 ruling, PLAN §8). MERGE-03's dissolution: the cron
// against main IS post-merge revalidation — this command, not a rule.
//
// "Read-only" means: no writes to the repo or main, ever. The write surface is the
// ISSUE TRACKER, through the forge mutation channel (live=write · replay=assert-plan
// · --dry-run prints the plan), with a complete dedup lifecycle per finding key
// `baseline:<id>:<subject>` carried in an HTML marker (issues also carry the
// `baseline` label — the operator's filter/mute affordance and the scan's bound):
//   absent           → file the issue (labeled)
//   changed          → comment the new state + re-stamp the marker fingerprint
//   cleared          → close, naming the sha (POSITIVE re-evaluation only — a SKIP
//                      is never a clear; closing on unavailability is fail-open)
//   recurred (bot-closed)   → REOPEN the same issue (history stays on one thread)
//   recurred (human-closed) → engine rows: the close was a judgment — at most one
//                      comment when the content changes, never a reopen; the
//                      deterministic-integrity classes (judgment sweep, landed
//                      secrets, merged-while-red) reopen over ANY close.
// Cap: at most 10 creations+reopens per run; overflow lands in ONE rollup issue
// (which notes that remaining keys self-drain over subsequent runs). Comments and
// closes are uncapped (they reduce noise, not add it). Under a truncated issue
// scan, creates are suppressed (rollup only) — a duplicate filing is worse than a
// deferred one.
//
// Finding sources:
//   1. the engine at context 'reconcile' (lane rules excluded structurally)
//   2. the JDG sweep at the tip: tripped/expired file; invalid ledger entries file;
//      drifted/unresolvable ride the report only (review_by is the backstop)
//   3. the landed-record re-scan: scrub over records/** blobs AT the tip,
//      allowlist read at the tip — deterministic-tier findings only
//   4. merged-while-red over the recent merged-PR window (a squash merge's red
//      admit lives on the PR HEAD sha, never on the tip): admit-named check runs
//      with conclusion 'failure' at a merged head → the morning-after issue
//      demanding the retroactive JDG. subject = the SHORT (7) merge sha — the one
//      spelling; cleared by the EXISTENCE of a schema-valid judgment at the tip
//      whose subject names that sha (expiry policing belongs to the sweep, or a
//      lapsed relief would zombie-reopen forever); never auto-closed by time.
//
// The verdict binds to the sha it names: mutations REQUIRE the evaluated tree to
// BE the named sha (clean checkout at the fetched tip). Behind-but-ancestor or
// dirty degrades to a labeled REPORT-ONLY run (findings printed, nothing filed,
// recipe included); a HEAD off the target line is exit 2.
//
// Exit: 0 delivered (clean · filed · report-only · --dry-run) · 1 delivery failed
// (lifecycle impossible or a write failed — including a CLEAN run that could not
// read the tracker: a dead cron must not be green forever; relieved to 0, labeled,
// by an unexpired break-glass gate:reconcile at the tip — live outages only, never
// a replay mismatch) · 2 usage/environment (posture-closed forge included:
// multi-lane-local promises no forge, and reconcile IS forge writes).
import path from 'node:path'
import crypto from 'node:crypto'
import { makeOpt, makeOptAll, nowUTC, sanitizeTTY, normalizeVolatile } from './util.mjs'
import { loadRules } from './rules.mjs'
import { indexRepo } from './repo.mjs'
import { run, probeForge } from './probe.mjs'
import { resolveConfig } from './config.mjs'
import { makeEvalCheck } from './evaluators.mjs'
import { makeForge } from './facts/forge.mjs'
import { makeLaneWorld } from './facts/index.mjs'
import { runRules } from './engine.mjs'
import { makeColor } from './report.mjs'
import { loadJudgmentsAt, selectBreakGlass, evaluateJudgment, gatherJdgFacts } from './jdg.mjs'
import { scan, ALLOWLIST_FILE } from './scrub.mjs'

const USAGE = `usage: baseline reconcile [--repo DIR] [--json] [--dry-run] [--target REF]`
const CAP = 10 // ruled: per-run cap on creations+reopens; overflow → one rollup
const LABEL = 'baseline' // the filter/mute affordance + the dedup scan's bound
const MERGED_WINDOW = 20 // newest merged PRs swept for red admits (labeled in output)

// ---- the dedup key + marker (pure) ----
// key = baseline:<id>:<subject>, subject URI-encoded so spaces (judgment subjects)
// and marker-breaking bytes ('-->') can't escape the HTML comment. A bot close
// stamps `bot-closed` into the marker: reopen-on-recurrence is bot-state; a HUMAN
// close (no stamp) is judgment.
export const findingKey = (id, subject) => `baseline:${id}:${encodeURIComponent(String(subject))}`
export const MARKER_RE = /<!--\s*(baseline:[^\s:]+:\S+)\s+fp:([0-9a-f]{6,64})(\s+bot-closed)?\s*-->/
export const marker = (key, fp, { botClosed = false } = {}) => `<!-- ${key} fp:${fp}${botClosed ? ' bot-closed' : ''} -->`

// Fingerprint of a finding's CONTENT over the ONE volatility spec (util.mjs) —
// shas/ages/dates collapse, so an aging-but-unchanged finding never re-comments.
export const fingerprint = (detail) => crypto.createHash('sha256').update(normalizeVolatile(detail)).digest('hex').slice(0, 12)

// ---- the lifecycle derivation (pure) ----
// present: [{ key, id, subject, title, detail, fp, reopenAlways }] — problems NOW
//   (reopenAlways: deterministic-integrity classes that reopen over a human close)
// cleared: Set<key> — keys POSITIVELY re-evaluated ok this run (never mere absence)
// issues:  [{ number, state, key, fp, botClosed }] — managed set from the forge
// -> ordered actions [{ action: file|update|reopen|nudge|close, key, finding?, issue? }],
// deterministic (present sorted by key; closes after, sorted; rollup last).
// file+reopen consume the cap; update/nudge/close are free. noCreate (truncated
// scan) suppresses file actions into the overflow set.
export function deriveLifecycle({ present, cleared, issues, branch, sha, noCreate = false }) {
  const byKey = new Map()
  for (const i of issues) if (i.key && !byKey.has(i.key)) byKey.set(i.key, i)
  const actions = []
  let burned = 0
  const overflow = []
  const transition = (f, { capped = true } = {}) => {
    const have = byKey.get(f.key)
    if (!have) {
      if (capped && (noCreate || burned >= CAP)) { overflow.push(f); return }
      if (capped) burned++
      actions.push({ action: 'file', key: f.key, finding: f })
    } else if (have.state === 'open') {
      if (have.fp !== f.fp) actions.push({ action: 'update', key: f.key, finding: f, issue: have.number })
    } else if (have.botClosed || f.reopenAlways) {
      if (capped && burned >= CAP) { overflow.push(f); return }
      if (capped) burned++
      actions.push({ action: 'reopen', key: f.key, finding: f, issue: have.number })
    } else if (have.fp !== f.fp) {
      // human-closed engine row recurring with NEW content: one comment, no reopen —
      // the close was a judgment; re-stamping fp makes the nudge once-per-content
      actions.push({ action: 'nudge', key: f.key, finding: f, issue: have.number })
    }
  }
  for (const f of [...present].sort((a, b) => a.key < b.key ? -1 : 1)) transition(f)
  for (const key of [...cleared].sort()) {
    const have = byKey.get(key)
    if (have?.state === 'open') actions.push({ action: 'close', key, issue: have.number })
  }
  if (overflow.length) {
    const keys = overflow.map(f => f.key)
    transition({
      key: findingKey('rollup', branch), id: 'rollup', subject: branch, reopenAlways: true,
      title: `reconcile overflow: ${overflow.length} finding(s) beyond this run's filings`,
      detail: `${noCreate ? `the issue scan was truncated (500 ${LABEL}-labeled issues) — new filings are suppressed until it shrinks` : `the per-run cap (${CAP} filings) was reached`} at ${sha.slice(0, 7)}; not yet filed individually (remaining keys file over subsequent runs):\n${keys.map(k => `- ${k}`).join('\n')}`,
      fp: fingerprint(keys.join('\n')),
    }, { capped: false })
  }
  return actions
}

// ---- issue body/comment builders (pure — unit-tested where the channel can't be) ----
export function issueBody(f, { branch, sha, botClosed = false }) {
  return `${marker(f.key, f.fp, { botClosed })}\n**${f.title}**\n\n${f.detail}\n\n—\nfiled by \`baseline reconcile\` on \`${branch}\` at ${sha.slice(0, 7)}; lifecycle-managed (updated · closed when cleared · reopened on recurrence) — keep the marker line intact. mute: close it yourself (a human close is final for advisory findings) or filter the \`${LABEL}\` label.`
}
export const issueTitle = f => `[baseline] ${f.id}: ${String(f.title).slice(0, 120)}`
export const updateComment = (f, sha) => `at ${sha.slice(0, 7)}: ${f.detail}`
export const nudgeComment = (f, sha) => `recurred with new content at ${sha.slice(0, 7)} (staying closed — the close was a judgment): ${f.detail}`
export const closeComment = (key, sha) => `cleared at ${sha.slice(0, 7)} — the finding re-evaluated ok. (reopens automatically if it recurs)`

// Parse the managed set out of the labeled all-state listing.
export function parseManaged(issues) {
  const out = []
  for (const i of issues || []) {
    const m = String(i.body || '').match(MARKER_RE)
    if (m) out.push({ number: i.number, state: String(i.state || '').toLowerCase(), key: m[1], fp: m[2], botClosed: !!m[3], title: i.title, body: String(i.body) })
  }
  return out
}

export function runReconcile(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(`baseline reconcile — post-merge revalidation of the default branch; findings file as lifecycle-managed, ${LABEL}-labeled issues\n  ${USAGE}\n  exit: 0 delivered (incl. report-only and --dry-run) · 1 delivery failed (tracker unreachable/write failed) · 2 usage/environment`)
    return 0
  }
  const opt = makeOpt(argv), optAll = makeOptAll(argv)
  const usage = msg => { console.error(`baseline reconcile: ${msg}\n  ${USAGE}`); return 2 }
  for (const f of ['--repo', '--target', '--config']) if (opt(f, null) === true) return usage(`${f} needs a value`)
  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const JSON_OUT = !!opt('--json', false)
  const DRY = !!opt('--dry-run', false)
  const color = makeColor(JSON_OUT)
  const now = nowUTC()
  if (!now) return usage('BASELINE_LOG_NOW is not a parseable instant')
  const today = now.toISOString().slice(0, 10)

  const repo = indexRepo(REPO)
  if (!repo.HEAD) return usage('not a git repository (no HEAD) — reconcile revalidates a branch tip')
  const g = (...a) => run('git', ['-C', REPO, ...a])

  // ---- target resolution: admit's ladder verbatim (fetched main is the point) ----
  const explicit = opt('--target', null)
  let targetRef = typeof explicit === 'string' ? explicit : null
  let fetchNote = null
  if (!targetRef) {
    if (g('remote', 'get-url', 'origin') === null) return usage('no origin remote and no --target — reconcile revalidates the fetched default branch')
    if (run('git', ['-C', REPO, 'fetch', '--quiet', 'origin'], { timeout: 60000 }) === null) fetchNote = 'fetch failed — target read from the last-fetched local ref'
    const sym = g('symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD')
    let branch = sym ? sym.replace(/^refs\/remotes\/origin\//, '') : null
    if (!branch) {
      const ls = run('git', ['-C', REPO, 'ls-remote', '--symref', 'origin', 'HEAD'], { timeout: 30000 })
      branch = ls?.match(/^ref: refs\/heads\/(\S+)\tHEAD/m)?.[1] || null
    }
    if (branch) targetRef = `origin/${branch}`
  }
  const resolveTip = ref => ref && repo.gitObjExists(`${ref}^{commit}`) ? g('rev-parse', `${ref}^{commit}`) : null
  let targetTip = resolveTip(targetRef)
  if (!targetTip && !explicit) return usage('no target resolves (origin/HEAD unknown and nothing fetched) — pass --target <ref>, or fetch the default branch first')
  if (!targetTip) return usage(`--target '${targetRef}' does not resolve to a commit here — fetch it first`)

  // ---- the governing descriptor, read AT the tip (FS1 discipline shared with admit) ----
  let cfgRes = resolveConfig(repo, { cliConfigPath: opt('--config', null), profileArgs: optAll('--profile'), descriptorRef: targetTip })
  let DESCRIPTOR = cfgRes.DESCRIPTOR
  const declared = DESCRIPTOR.valid ? DESCRIPTOR.data.ground_truth_boundary?.default_branch : null
  if (!explicit && declared && targetRef !== `origin/${declared}`) {
    const t = resolveTip(`origin/${declared}`)
    if (!t) return usage(`the target descriptor declares default_branch '${sanitizeTTY(declared)}' but origin/${sanitizeTTY(declared)} does not resolve here — fetch it, or pass --target`)
    targetRef = `origin/${declared}`; targetTip = t
    cfgRes = resolveConfig(repo, { cliConfigPath: opt('--config', null), profileArgs: optAll('--profile'), descriptorRef: targetTip })
    DESCRIPTOR = cfgRes.DESCRIPTOR
  }
  const { cfg, ACTIVE, CLAIMS_ACTIVE, CLAIMS_REASON, SIGNOFF, JDGS } = cfgRes
  const BRANCH_NAME = targetRef.replace(/^origin\//, '')

  // ---- posture gate: reconcile IS forge writes — a posture that closes the forge
  // makes the command unrepresentable, up front (never a JDG-relievable "outage") ----
  const posture = DESCRIPTOR.valid ? DESCRIPTOR.data.workflow : null
  if (posture === 'multi-lane-local') return usage(`workflow=multi-lane-local closes the forge, and reconcile's write surface IS the forge — the posture makes this command unrepresentable (check/orient carry the same posture label)`)

  // ---- the binding law: mutations require evaluated tree == the named sha, clean ----
  const HEADSHA = g('rev-parse', 'HEAD')
  const dirty = (g('status', '--porcelain') || '') !== ''
  let reportOnly = null
  if (HEADSHA !== targetTip) {
    const rel = repo.gitIsAncestor(HEADSHA, targetTip) // 0: HEAD is behind the tip (on the line)
    if (rel !== 0) return usage(`HEAD ${String(HEADSHA).slice(0, 7)} is not on ${targetRef}'s line (tip ${targetTip.slice(0, 7)}) — reconcile revalidates the default branch; switch to it first (CI: actions/checkout of ${BRANCH_NAME}, fetch-depth: 0)`)
    reportOnly = `HEAD ${String(HEADSHA).slice(0, 7)} is behind ${targetRef} @ ${targetTip.slice(0, 7)} — findings bind to HEAD and NOTHING is filed; catch up: git switch ${BRANCH_NAME} && git pull --ff-only`
  } else if (dirty) {
    reportOnly = `worktree has uncommitted changes — the evaluated tree is not the committed tip, so findings are report-only and NOTHING is filed; stash or commit, then rerun`
  }
  const BOUND_SHA = reportOnly ? HEADSHA : targetTip

  // ---- the forge (probe → makeForge; mutations dry under --dry-run) ----
  const pf = process.env.BASELINE_FORGE_REPLAY ? null : probeForge(repo)
  const forge = makeForge(repo, { available: !!pf?.available, nwo: pf?.repo || null, posture, probeReason: pf?.reason || null, mutations: DRY ? 'dry' : 'live' })
  const nwo = pf?.repo || null

  // ---- 1. the engine at context 'reconcile' (BRANCH is the default branch — never
  // GITHUB_HEAD_REF: a miswired pull_request job must not evaluate a PR branch
  // while claiming to revalidate main) ----
  const LANEWORLD = makeLaneWorld(repo, DESCRIPTOR)
  const evalCheck = makeEvalCheck({ repo, cfg, NO_EXEC: true, SIGNOFF, JDGS, DESCRIPTOR, BRANCH: BRANCH_NAME, DEFAULT_BRANCH: declared || BRANCH_NAME, LANEWORLD })
  const RULES = loadRules()
  const results = runRules({ rules: RULES.rules, cfg, ACTIVE, CLAIMS_ACTIVE, CLAIMS_REASON, evalCheck, DESCRIPTOR, BRANCH: BRANCH_NAME, DEFAULT_BRANCH: declared || BRANCH_NAME, context: 'reconcile' })

  const present = [], clearedKeys = new Set()
  for (const x of results) {
    const key = findingKey(x.r.id, BRANCH_NAME)
    if (x.tag === 'WARN' || x.tag === 'FAIL' || x.tag === 'DIVERGED') {
      present.push({ key, id: x.r.id, subject: BRANCH_NAME, title: x.r.title, detail: x.detail, fp: fingerprint(x.detail), reopenAlways: false })
    } else if (x.tag === 'PASS' || x.tag === 'SIGN-OFF') {
      clearedKeys.add(key) // positive re-evaluation — a SKIP never lands here
    }
  }

  // ---- 2. the JDG sweep at the tip (facts coherent with the tip: the descriptor
  // the run resolved AT the tip overlays; the forge plane mirrors THIS run's forge —
  // never a second live probe that replay can't see) ----
  const ledger = loadJudgmentsAt(REPO, targetTip)
  const jdgFacts = gatherJdgFacts(REPO, {
    today, probeForge: false,
    overlay: {
      descriptor: { ...(DESCRIPTOR.valid ? DESCRIPTOR.data : {}), present: DESCRIPTOR.present, valid: DESCRIPTOR.valid },
      planes: { forge: { available: forge.available, ...(forge.available ? {} : { reason: forge.reason }) } },
    },
  })
  const sweep = ledger.records.map(j => evaluateJudgment(j, jdgFacts))
  for (const r of sweep) {
    const key = findingKey(r.id, r.subject)
    if (r.verdict === 'tripped' || r.verdict === 'expired') {
      const texts = r.findings.filter(f => f.code === r.verdict).map(f => f.text).join('; ') || r.verdict
      present.push({ key, id: r.id, subject: r.subject, title: `judgment ${r.verdict}: ${r.id} (${r.kind})`, detail: `${texts} — re-judge or retire it (subject: ${r.subject})`, fp: fingerprint(texts), reopenAlways: true })
    } else if (r.verdict === 'ok' || r.verdict === 'drifted' || r.verdict === 'unresolvable') {
      clearedKeys.add(key) // evaluated, not in a filing state — drift rides the report
    }
  }
  for (const f of ledger.findings) {
    present.push({ key: findingKey('ledger', f.file), id: 'ledger', subject: f.file, title: `invalid judgment record on ${BRANCH_NAME}`, detail: `${f.file}: ${f.error} — the ledger must stay machine-readable; fix or remove the record`, fp: fingerprint(f.error), reopenAlways: true })
  }

  // ---- 3. the landed-record re-scan at the tip (allowlist AT the tip too — the
  // scan and its suppressions must describe one sha; corrupt allowlist = a finding,
  // never a crash and never silently "no allowlist") ----
  const recList = (run('git', ['-C', REPO, 'ls-tree', '-r', '--name-only', targetTip, 'records/'], { maxBuffer: 64 * 1024 * 1024 }) || '').split('\n').filter(Boolean)
  let allowlist = []
  const allowRaw = repo.gitCatFile(targetTip, ALLOWLIST_FILE)
  if (allowRaw !== null) {
    try {
      const parsed = JSON.parse(allowRaw)
      allowlist = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : []
    } catch {
      present.push({ key: findingKey('ledger', ALLOWLIST_FILE), id: 'ledger', subject: ALLOWLIST_FILE, title: `scrub allowlist unreadable on ${BRANCH_NAME}`, detail: `${ALLOWLIST_FILE} at ${targetTip.slice(0, 7)} is not valid JSON — the re-scan ran WITHOUT suppressions; fix the file`, fp: fingerprint('allowlist-unparseable'), reopenAlways: true })
    }
  }
  let unscanned = 0
  for (const rel of recList) {
    const raw = repo.gitCatFile(targetTip, rel)
    if (raw === null) { unscanned++; continue }
    const { blocked } = scan(raw, { allowlist })
    for (const b of blocked) {
      present.push({ key: findingKey('scrub', b.id), id: 'scrub', subject: b.id, title: `secret shape landed on ${BRANCH_NAME}: ${b.name}`, detail: `${rel}: ${b.name} (${b.masked}) — rotate the credential, then rewrite or allow (id ${b.id}); a landed secret is live until rotated. (one id can cover multiple files — this names the first)`, fp: fingerprint(`${rel}:${b.id}`), reopenAlways: true })
    }
  }

  // ---- 4. merged-while-red over the merged-PR window ----
  const mergedRaw = forge.prsMerged(BRANCH_NAME)
  const merged = Array.isArray(mergedRaw) ? mergedRaw : null
  const isRedAdmit = runs => (runs || []).filter(r => /admit/i.test(String(r.name)) && String(r.status) === 'completed' && String(r.conclusion) === 'failure')
  for (const pr of merged || []) {
    const mergeSha = pr.mergeCommit?.oid || null
    const headSha = pr.headRefOid || null
    if (!mergeSha || !headSha) continue
    const short = mergeSha.slice(0, 7)
    const key = findingKey('merged-while-red', short)
    const runsRaw = forge.checkRuns(headSha)
    if (!Array.isArray(runsRaw?.check_runs)) continue // unreadable ≠ green and ≠ red — no state
    const red = isRedAdmit(runsRaw.check_runs)
    if (!red.length) continue // green admit (or none named) — nothing filed, nothing cleared
    // the demand is answered by the EXISTENCE of a schema-valid judgment at the tip
    // naming the SHORT merge sha (the one spelling); its currency is the sweep's job
    const covered = ledger.records.some(j => String(j.subject).includes(short))
    if (covered) { clearedKeys.add(key); continue }
    present.push({
      key, id: 'merged-while-red', subject: short, reopenAlways: true,
      title: `merged while red: PR #${pr.number} landed with ${red.map(r => r.name).sort().join(', ')} failing`,
      detail: `PR #${pr.number} ("${pr.title}") merged as ${short} while its admit check (${red.map(r => r.name).sort().join(', ')}) had conclusion 'failure' at head ${String(headSha).slice(0, 7)} — the layer-0 bypass happened; record the retroactive judgment naming the merge sha: baseline jdg new --kind break-glass --gate admit --subject "${short}" --reason "why it merged red" --review-by <date>`,
      fp: fingerprint(`${pr.number}:${red.map(r => r.name).sort().join(',')}`),
    })
  }
  const mwrWindow = merged ? `newest ${Math.min(merged.length, MERGED_WINDOW)} merged PR(s)` : null

  // ---- the lifecycle over the managed set (skipped wholesale in report-only) ----
  let managed = null, truncated = false, actions = null
  if (!reportOnly) {
    const listing = forge.issuesLabeled(LABEL)
    managed = listing === null ? null : parseManaged(listing)
    truncated = Array.isArray(listing) && listing.length >= 500
    actions = managed === null ? null : deriveLifecycle({ present, cleared: clearedKeys, issues: managed, branch: BRANCH_NAME, sha: targetTip, noCreate: truncated })
  }

  // ---- deliver (live) · assert (replay rides mutate()) · print (dry) ----
  const delivered = [], failed = []
  if (actions !== null && actions.length) {
    // the label is the filings' filter affordance — ensure it exists before the first
    // create needs it. Idempotent by tolerance: a live 422 already-exists rides as
    // ok:false and is deliberately NOT a delivery failure (only a replay mismatch is).
    if (actions.some(a => a.action === 'file')) {
      const labels = forge.mutate({ action: 'ensure-label', key: LABEL }, ['api', '-X', 'POST', `repos/${nwo}/labels`, '-f', `name=${LABEL}`, '-f', 'color=6a737d', '-f', 'description=filed by baseline reconcile'])
      if (!labels.ok && labels.replayMismatch) failed.push({ action: 'ensure-label', key: LABEL, reason: labels.reason, replayMismatch: true })
      // a live already-exists failure is expected steady-state — not a delivery failure
    }
    for (const a of actions) {
      const f = a.finding
      let res
      if (a.action === 'file') res = forge.mutate({ action: 'file', key: a.key, title: issueTitle(f) }, ['api', '-X', 'POST', `repos/${nwo}/issues`, '-f', `title=${issueTitle(f)}`, '-f', `body=${issueBody(f, { branch: BRANCH_NAME, sha: targetTip })}`, '-f', `labels[]=${LABEL}`])
      else if (a.action === 'update') {
        res = forge.mutate({ action: 'comment', key: a.key, issue: a.issue }, ['api', '-X', 'POST', `repos/${nwo}/issues/${a.issue}/comments`, '-f', `body=${updateComment(f, targetTip)}`])
        if (res.ok) res = forge.mutate({ action: 'refp', key: a.key, issue: a.issue }, ['api', '-X', 'PATCH', `repos/${nwo}/issues/${a.issue}`, '-f', `body=${issueBody(f, { branch: BRANCH_NAME, sha: targetTip })}`])
      } else if (a.action === 'nudge') {
        res = forge.mutate({ action: 'nudge', key: a.key, issue: a.issue }, ['api', '-X', 'POST', `repos/${nwo}/issues/${a.issue}/comments`, '-f', `body=${nudgeComment(f, targetTip)}`])
        if (res.ok) res = forge.mutate({ action: 'refp', key: a.key, issue: a.issue }, ['api', '-X', 'PATCH', `repos/${nwo}/issues/${a.issue}`, '-f', `body=${issueBody(f, { branch: BRANCH_NAME, sha: targetTip })}`])
      } else if (a.action === 'reopen') {
        res = forge.mutate({ action: 'reopen', key: a.key, issue: a.issue }, ['api', '-X', 'PATCH', `repos/${nwo}/issues/${a.issue}`, '-f', 'state=open', '-f', `body=${issueBody(f, { branch: BRANCH_NAME, sha: targetTip })}`])
        if (res.ok) res = forge.mutate({ action: 'comment', key: a.key, issue: a.issue }, ['api', '-X', 'POST', `repos/${nwo}/issues/${a.issue}/comments`, '-f', `body=${updateComment(f, targetTip)}`])
      } else if (a.action === 'close') {
        const have = managed.find(i => i.number === a.issue)
        res = forge.mutate({ action: 'comment', key: a.key, issue: a.issue }, ['api', '-X', 'POST', `repos/${nwo}/issues/${a.issue}/comments`, '-f', `body=${closeComment(a.key, targetTip)}`])
        // one PATCH closes AND stamps bot-closed into the marker — the stamp is what
        // lets recurrence reopen bot state while honoring a human close as judgment
        if (res.ok) res = forge.mutate({ action: 'close', key: a.key, issue: a.issue }, ['api', '-X', 'PATCH', `repos/${nwo}/issues/${a.issue}`, '-f', 'state=closed', '-f', `body=${rebodyClosed(a.key, have, targetTip)}`])
      }
      ;(res.ok ? delivered : failed).push({ ...a, reason: res.ok ? undefined : res.reason, replayMismatch: res.replayMismatch })
    }
  }

  // ---- verdict: delivery, not findings, decides the exit ----
  let deliveryFailure = null
  if (!reportOnly && !DRY) {
    if (managed === null) deliveryFailure = `the ${LABEL}-labeled issue listing is unreadable (${forge.reason || 'forge unreachable'}) — the lifecycle cannot run (a dead cron must not stay green)`
    else if (failed.length) deliveryFailure = `${failed.length} lifecycle write(s) failed — first: ${failed[0].reason}`
  }
  let relief = null
  if (deliveryFailure && !failed.some(x => x.replayMismatch)) {
    const bg = selectBreakGlass(ledger.records, 'reconcile', today)
    if (bg) relief = { id: bg.id, review_by: bg.review_by }
  }
  const exit = (deliveryFailure && !relief) ? 1 : 0

  const n = t => results.filter(x => x.tag === t).length
  const summary = {
    mode: DRY ? 'dry-run' : reportOnly ? 'report-only' : 'full',
    findings: present.length, actions: actions ? actions.length : null, delivered: delivered.length, failed: failed.length,
    pass: n('PASS'), warn: n('WARN'), fail: n('FAIL'), diverged: n('DIVERGED'), signoff: n('SIGN-OFF'), skip: n('SKIP'), rules: results.length,
    jdg: { records: ledger.records.length, filed: sweep.filter(r => r.verdict === 'tripped' || r.verdict === 'expired').length, invalid: ledger.findings.length },
    rescan: { files: recList.length, unscanned, findings: present.filter(f => f.id === 'scrub').length },
    mergedWindow: mwrWindow,
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      command: 'reconcile', repo: REPO, target: { ref: targetRef, sha: targetTip, source: explicit ? 'local-ref (explicit --target)' : fetchNote ? 'local-ref (fetch failed)' : 'fetched' },
      bound: BOUND_SHA, reportOnly, dirty, truncated,
      findings: present.map(f => ({ key: f.key, id: f.id, subject: f.subject, title: f.title, detail: f.detail, fp: f.fp })),
      actions: actions?.map(a => ({ action: a.action, key: a.key, issue: a.issue ?? null })) ?? null,
      mutations: forge.mutationLog().map(m => ({ seq: m.seq, mode: m.mode, ok: m.ok, plan: m.plan })),
      deliveryFailure, relief, summary, version: RULES.version, exit,
    }, null, 2))
    return exit
  }

  const S = sanitizeTTY
  console.log(`\n  baseline reconcile v${RULES.version}  ·  ${path.basename(REPO)}  ·  ${S(targetRef)} @ ${targetTip.slice(0, 7)}${DRY ? '  ·  DRY RUN' : ''}${reportOnly ? '  ·  REPORT-ONLY' : ''}\n`)
  if (fetchNote) console.log(`  ⚠ ${fetchNote}`)
  if (reportOnly) console.log(color(33, `  ⚠ ${S(reportOnly)}`))
  if (truncated) console.log(`  ⚠ issue scan truncated at 500 — new filings suppressed this run (rollup carries them)`)
  if (mwrWindow) console.log(`  merged-while-red window: ${mwrWindow}`)
  if (!present.length) console.log(color(32, `  ✓ nothing to reconcile — ${summary.pass} pass · ${summary.skip} n/a · ledger ${summary.jdg.records} record(s) healthy`))
  for (const f of present) console.log(`  ${color(33, '●')} ${S(f.key)}\n      ${S(f.title)}\n      ${color(90, '↳ ' + S(f.detail))}`)
  if (!reportOnly) {
    if (actions === null) console.log(color(31, `\n  ✗ lifecycle not run: issue listing unreadable (${S(forge.reason || 'forge unreachable')})`))
    else if (actions.length) {
      console.log(`\n  ${DRY ? 'plan (not executed)' : 'lifecycle'}:`)
      for (const a of actions) console.log(`    ${a.action.padEnd(6)} ${S(a.key)}${a.issue ? `  (#${a.issue})` : ''}`)
    } else if (present.length) console.log(`\n  lifecycle: all ${present.length} finding(s) already filed and unchanged`)
  }
  if (deliveryFailure) console.log(relief
    ? color(33, `\n  ⚠ delivery failed but relieved by ${relief.id} (gate: reconcile, review by ${relief.review_by}) — ${S(deliveryFailure)}`)
    : color(31, `\n  ✗ ${S(deliveryFailure)}`))
  console.log(exit === 0
    ? color(32, `\n  ✓ reconciled — ${present.length} finding(s) · ${delivered.length} write(s)${DRY ? ' planned' : reportOnly ? ' (report-only: none attempted)' : ''}\n`)
    : color(31, `\n  ✗ delivery failed — exit 1 (relief: an unexpired break-glass JDG with gate: reconcile on ${S(BRANCH_NAME)})\n`))
  return exit
}

// Close re-body: the marker LINE gains the bot-closed stamp; every other body byte
// — including human edits — is preserved verbatim. Fallback (no stored body, which
// a managed issue cannot normally lack) rebuilds minimal. Exported for tests.
export function rebodyClosed(key, have, sha) {
  const stamped = marker(key, have?.fp || '000000000000', { botClosed: true })
  if (have?.body && MARKER_RE.test(have.body)) return have.body.replace(MARKER_RE, stamped)
  return `${stamped}\n(closed by \`baseline reconcile\` at ${sha.slice(0, 7)} — cleared; reopens automatically if the finding recurs)`
}
