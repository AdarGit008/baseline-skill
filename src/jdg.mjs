// The judgment ledger surface (M4b) — records/judgments/JDG-NNNN.json, one owned
// file per judgment (C17). Two commands over one pure core:
//
//   baseline jdg new    author a judgment (schema-valid, scrub-gated, numbered)
//   baseline jdg check  evaluate every judgment's machine contract against facts
//
// The machine contract (C08): expected_state is the world the judgment assumed
// (drift = re-look), tripwire is the condition that VOIDS it (fired = act),
// review_by is the expiry (every judgment lapses — ledgers must not fossilize).
// evaluateJudgment is pure; M6's reconcile sweep runs the same function on cron
// and files issues. An unresolvable fact path is a FINDING, never a guess (C36).
// Verdict lattice, worst wins: tripped > expired > unresolvable > drifted > ok.
// Exit (check): 0 healthy · 1 any tripped/expired/invalid record. (new): 0
// written · 1 scrub-blocked · 2 usage. BASELINE_LOG_NOW is the clock override
// shared by all record tooling.
import fs from 'node:fs'
import path from 'node:path'
import { makeOpt, makeOptText, makeOptAll, getPath } from './util.mjs'
import { run, capabilityProbe, currentLane } from './probe.mjs'
import { loadDescriptor } from './descriptor.mjs'
import { validateRecord } from './records.mjs'
import { scan, loadAllowlist, addAllowlistEntries } from './scrub.mjs'

export const JUDGMENTS_DIR = 'records/judgments'
const KINDS = ['sign-off', 'deviation', 'risk-acceptance', 'break-glass']
const ORDER = { ok: 0, drifted: 1, unresolvable: 2, expired: 3, tripped: 4 }

const deepEq = (a, b) => a === b || (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))

// -> { records, findings } — findings are ledger-integrity problems (unparseable
// file, schema-invalid record, id/filename mismatch), each { file, error }.
export function loadJudgments(REPO) {
  const dir = path.join(REPO, JUDGMENTS_DIR)
  let names = []
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() } catch { return { records: [], findings: [] } }
  const records = [], findings = []
  for (const f of names) {
    let data
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }
    catch { findings.push({ file: `${JUDGMENTS_DIR}/${f}`, error: 'not valid JSON' }); continue }
    const errors = validateRecord('judgment', data)
    if (errors.length) { findings.push({ file: `${JUDGMENTS_DIR}/${f}`, error: errors.slice(0, 3).join('; ') }); continue }
    if (data.id !== f.replace(/\.json$/, '')) { findings.push({ file: `${JUDGMENTS_DIR}/${f}`, error: `id '${data.id}' does not match filename` }); continue }
    records.push(data)
  }
  return { records, findings }
}

// One condition — { fact, op, value } -> { fired: true|false|null, note } where
// null means the fact path did not resolve (surfaced, never guessed).
export function evalCondition(cond, facts) {
  const got = getPath(facts, cond.fact)
  if (cond.op === 'exists') return { fired: got !== undefined, note: `${cond.fact} ${got !== undefined ? 'exists' : 'is absent'}` }
  if (cond.op === 'absent') return { fired: got === undefined, note: `${cond.fact} ${got === undefined ? 'is absent' : 'exists'}` }
  if (got === undefined) return { fired: null, note: `${cond.fact}: unresolvable fact path` }
  if (cond.op === 'eq') return { fired: deepEq(got, cond.value), note: `${cond.fact} = ${JSON.stringify(got)}` }
  if (cond.op === 'ne') return { fired: !deepEq(got, cond.value), note: `${cond.fact} = ${JSON.stringify(got)} (expected ${JSON.stringify(cond.value)})` }
  if (cond.op === 'gt' || cond.op === 'lt') {
    const comparable = (typeof got === 'number' && typeof cond.value === 'number') || (typeof got === 'string' && typeof cond.value === 'string')
    if (!comparable) return { fired: null, note: `${cond.fact}: ${cond.op} needs two numbers or two strings (got ${typeof got} vs ${typeof cond.value})` }
    return { fired: cond.op === 'gt' ? got > cond.value : got < cond.value, note: `${cond.fact} = ${JSON.stringify(got)}` }
  }
  return { fired: null, note: `unknown op '${cond.op}'` }
}

// Pure: one judgment against one facts view -> { id, kind, subject, verdict, notes }.
export function evaluateJudgment(j, facts, today) {
  let verdict = 'ok'
  const notes = []
  const bump = (v, note) => { notes.push(note); if (ORDER[v] > ORDER[verdict]) verdict = v }
  if (j.review_by < today) bump('expired', `review_by ${j.review_by} has passed — re-judge or retire`)
  for (const [k, want] of Object.entries(j.expected_state || {})) {
    const got = getPath(facts, k)
    if (got === undefined) bump('unresolvable', `expected_state ${k}: unresolvable fact path`)
    else if (!deepEq(got, want)) bump('drifted', `expected_state ${k}: assumed ${JSON.stringify(want)}, now ${JSON.stringify(got)}`)
  }
  if (j.tripwire) {
    const { fired, note } = evalCondition(j.tripwire, facts)
    if (fired === null) bump('unresolvable', `tripwire: ${note}`)
    else if (fired) bump('tripped', `tripwire fired: ${note} — the accepted world changed`)
  } else if (j.kind !== 'sign-off') {
    notes.push('no tripwire — nothing can void this automatically (add one)')
  }
  if (j.kind === 'break-glass' && !j.gate) notes.push('break-glass without gate scope (admit|reconcile)')
  return { id: j.id, kind: j.kind, subject: j.subject, verdict, notes }
}

// The facts view judgments reference (documented in CONTRACT.md): descriptor.* ·
// planes.{tree,history,forge}.* · git.{branch,head,shallow} · today. An optional
// overlay (--facts FILE) deep-merges last — fixtures and M6's richer sweeps.
export function gatherJdgFacts(REPO, { overlay = null, today } = {}) {
  const repoLite = {
    REPO,
    HEAD: run('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD']),
    read: rel => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { return null } },
    gitIsShallow: () => run('git', ['-C', REPO, 'rev-parse', '--is-shallow-repository']) === 'true',
  }
  const d = loadDescriptor(repoLite)
  const cap = capabilityProbe(repoLite)
  const facts = {
    today,
    descriptor: { present: d.present, valid: d.valid, ...(d.valid ? d.data : {}) },
    planes: cap,
    git: { branch: currentLane(repoLite), head: repoLite.HEAD, shallow: cap.history.available ? cap.history.shallow : false },
  }
  const merge = (into, from) => { for (const k of Object.keys(from)) { if (from[k] && typeof from[k] === 'object' && !Array.isArray(from[k]) && into[k] && typeof into[k] === 'object') merge(into[k], from[k]); else into[k] = from[k] } }
  if (overlay) merge(facts, overlay)
  return facts
}

export function runJdg(argv) {
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : null
  const rest = sub ? argv.slice(1) : argv
  const opt = makeOpt(rest), optText = makeOptText(rest), optAll = makeOptAll(rest)
  const REPO = path.resolve(String(opt('--repo', process.cwd())))
  const JSON_OUT = !!opt('--json', false)
  const usage = msg => { console.error(`baseline jdg: ${msg}\n  usage: baseline jdg new --kind K --subject S --reason "..." --review-by YYYY-MM-DD [--by W] [--expect path=json ...] [--tripwire "fact op [value]"] [--gate admit|reconcile]\n         baseline jdg check [--repo DIR] [--json] [--facts FILE]`); return 2 }
  const now = process.env.BASELINE_LOG_NOW ? new Date(process.env.BASELINE_LOG_NOW) : new Date()
  if (isNaN(now)) return usage('BASELINE_LOG_NOW is not a parseable instant')
  const today = now.toISOString().slice(0, 10)

  if (sub === 'check') {
    let overlay = null
    const factsFile = opt('--facts', null)
    if (typeof factsFile === 'string') {
      try { overlay = JSON.parse(fs.readFileSync(path.resolve(factsFile), 'utf8')) } catch (e) { return usage(`cannot read --facts file: ${e.message}`) }
    }
    const { records, findings } = loadJudgments(REPO)
    const facts = gatherJdgFacts(REPO, { overlay, today })
    const results = records.map(j => evaluateJudgment(j, facts, today))
    const bad = results.filter(r => r.verdict === 'tripped' || r.verdict === 'expired')
    const exit = (bad.length || findings.length) ? 1 : 0
    if (JSON_OUT) { console.log(JSON.stringify({ repo: REPO, results, findings, exit }, null, 2)); return exit }
    const ICON = { ok: '✓', drifted: '≈', unresolvable: '?', expired: '⏰', tripped: '✗' }
    console.log(`\n# Judgments — ${path.basename(REPO)} · ${records.length} record(s)${findings.length ? ` · ${findings.length} INVALID` : ''}\n`)
    if (!records.length && !findings.length) { console.log(`_no judgments recorded (${JUDGMENTS_DIR}/ empty or absent)_\n`); return 0 }
    for (const r of results) {
      console.log(`  ${ICON[r.verdict]} ${r.id}  ${r.kind.padEnd(15)} ${String(r.subject).slice(0, 40).padEnd(40)} ${r.verdict.toUpperCase()}`)
      for (const n of r.notes) console.log(`      ↳ ${n}`)
    }
    for (const f of findings) console.log(`  ! ${f.file}  INVALID — ${f.error}`)
    console.log(exit ? `\n✗ ledger unhealthy: ${bad.length} voided/expired, ${findings.length} invalid.\n` : `\n✓ ledger healthy.\n`)
    return exit
  }

  if (sub === 'new') {
    const kind = opt('--kind', null)
    if (!KINDS.includes(kind)) return usage(`--kind must be one of ${KINDS.join('|')}`)
    const subject = optText('--subject', null)
    const reason = optText('--reason', null)
    const review_by = opt('--review-by', null)
    if (typeof subject !== 'string' || !subject.trim()) return usage('--subject is required (a rule id, a file, or a scope)')
    if (typeof reason !== 'string' || !reason.trim()) return usage('--reason is required — a judgment without a why is a rubber stamp')
    if (typeof review_by !== 'string') return usage('--review-by YYYY-MM-DD is required — every judgment expires (pick a real re-look date)')
    const gate = opt('--gate', null)
    if (kind === 'break-glass' && (gate !== 'admit' && gate !== 'reconcile')) return usage('break-glass requires --gate admit|reconcile (which fail-closed gate it relieves)')
    const by = String(opt('--by', null) || run('git', ['-C', REPO, 'config', 'user.name']) || '').trim()
    if (!by) return usage('--by is required (git user.name unset)')

    const expected_state = {}
    for (const kv of optAll('--expect')) {
      const i = kv.indexOf('='); if (i < 1) return usage(`--expect wants path=value (got '${kv}')`)
      const k = kv.slice(0, i), raw = kv.slice(i + 1)
      try { expected_state[k] = JSON.parse(raw) } catch { expected_state[k] = raw }
    }
    let tripwire
    const tw = optText('--tripwire', null)
    if (typeof tw === 'string') {
      const parts = tw.trim().split(/\s+/)
      const [fact, op] = parts
      if (!fact || !op) return usage(`--tripwire wants "fact op [value]" (got '${tw}')`)
      if (op === 'exists' || op === 'absent') { if (parts.length > 2) return usage(`tripwire op '${op}' takes no value`); tripwire = { fact, op } }
      else {
        const raw = parts.slice(2).join(' ')
        if (!raw) return usage(`tripwire op '${op}' needs a value`)
        let value; try { value = JSON.parse(raw) } catch { value = raw }
        tripwire = { fact, op, value }
      }
    } else if (kind !== 'sign-off') {
      console.error(`  note: no --tripwire — nothing can void this ${kind} automatically until its review_by`)
    }

    let names = []
    try { names = fs.readdirSync(path.join(REPO, JUDGMENTS_DIR)) } catch {}
    const max = names.reduce((m, f) => { const x = f.match(/^JDG-(\d{4})\.json$/); return x ? Math.max(m, parseInt(x[1], 10)) : m }, 0)
    const id = `JDG-${String(max + 1).padStart(4, '0')}`

    const record = { record: 'judgment/1', id, kind, date: typeof opt('--date', null) === 'string' ? opt('--date', null) : today, by, subject: subject.trim(), reason: reason.trim(), review_by }
    if (Object.keys(expected_state).length) record.expected_state = expected_state
    if (tripwire) record.tripwire = tripwire
    if (kind === 'break-glass') record.gate = gate
    const errors = validateRecord('judgment', record)
    if (errors.length) return usage(`record invalid: ${errors.join('; ')}`)

    const content = JSON.stringify(record, null, 2) + '\n'
    const allowIds = optAll('--allow')
    const allowReason = optText('--allow-reason', null)
    if (allowIds.length && (typeof allowReason !== 'string' || !allowReason.trim())) return usage('--allow requires --allow-reason "why this is not a secret"')
    let allowlist
    try {
      if (allowIds.length) addAllowlistEntries(REPO, allowIds, allowReason.trim(), today)
      allowlist = loadAllowlist(REPO).entries
    } catch (e) { return usage(e.message) }
    const { blocked, warned } = scan(content, { allowlist })
    if (blocked.length) {
      if (JSON_OUT) { console.log(JSON.stringify({ written: null, blocked, warned }, null, 2)); return 1 }
      console.error(`✗ scrub blocked the judgment — nothing written.`)
      for (const f of blocked) console.error(`    ${f.name}  (${f.masked})   id ${f.id}`)
      console.error(`  a judgment's reason should never carry a live secret; rotate it, or if this is a false positive rerun with:  --allow ${blocked.map(f => f.id).join(' --allow ')} --allow-reason "..."`)
      return 1
    }
    const rel = `${JUDGMENTS_DIR}/${id}.json`
    const abs = path.join(REPO, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    try { fs.writeFileSync(abs, content, { flag: 'wx' }) }
    catch (e) { return usage(e.code === 'EEXIST' ? `${rel} already exists (parallel write?) — rerun to take the next number` : e.message) }
    if (JSON_OUT) { console.log(JSON.stringify({ written: rel, warned }, null, 2)); return 0 }
    console.log(`✓ recorded ${rel}  (${kind} · ${record.subject} · review by ${review_by})`)
    for (const f of warned) console.log(`  ⚠ heuristic finding (written anyway): ${f.name} (${f.masked}) — silence: --allow ${f.id} --allow-reason "..."`)
    return 0
  }

  return usage(`unknown subcommand '${sub ?? ''}' (try: new, check)`)
}
