// The declarative check kinds (CHECK_KINDS is the registry; --self-check derives the
// count). makeEvalCheck(ctx) closes over the repo index, resolved config, and run flags;
// evalCheck(c, rule) -> {ok:true|false|null, detail, soft?}.
// ok:null means "not evaluable here" and resolves to an n/a row (v3 D4) — one broken rule can't take down the run.
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { DAY, asArr, parseDate, daysAgo, reOf, nonEmpty, stripLineComment, isAdrFile, statusOf, FRONTMATTER_RE, nowUTC, globMatcher } from './util.mjs'
import { DESCRIPTOR_FILE, DESCRIPTOR_SCHEMA } from './descriptor.mjs'
import { classifyPostureDiff } from './derive/posture.mjs'
import { scan, loadAllowlist } from './scrub.mjs'
import { loadClaims, CLAIM_RECORD_GLOB } from './claims.mjs'
import { adrEdges } from './records.mjs'
import { pluginSpec, probePlugin, gitMatches, expectationWord, pluginLogRel, writePluginLog, removePluginLog } from './plugins.mjs'

// The judgment kinds that can SANCTION a finding: a one-way amendment (CTX-13) or a
// twice-claimed decision number (CTX-14) covered by a judgment naming the record's
// path, and DESC-03's descriptor-change approval. break-glass is deliberately absent —
// it is outage relief with its own gate semantics, never record or descriptor approval
// (the DESC-03 reasoning, applied to every valve). One home, or the consumers drift.
const SANCTION_KINDS = ['sign-off', 'deviation', 'risk-acceptance']

// The decision graph's four declared edges, in the order a finding should read them,
// with the verb each one prints (#57). Supersedes/Superseded-by is the terminal
// relation; Amends/Amended-by is the live one.
const ADR_EDGE_VERBS = [['supersedes', 'supersedes'], ['superseded_by', 'is superseded by'], ['amends', 'amends'], ['amended_by', 'is amended by']]
// A decision file's own number, from its filename — the identity CTX-07 has always
// resolved against ('0003-new.md' -> 3, so '0003', 'ADR-3' and '3' are one decision).
// Two files sharing a number is CTX-14's finding (#49); the edge rules keep resolving
// against the first, because an edge to a twice-claimed number has no better answer
// than the collision itself — reported once, where it is the subject.
function adrFileNumber(f) { const m = (f.split('/').pop() || '').match(/\d{1,4}/); return m ? parseInt(m[0], 10) : null }

// Every check kind evalCheck() knows how to run. --self-check flags any rule referencing one not in here.
export const CHECK_KINDS = new Set(['any-of', 'implies', 'workflow-permissions', 'doc-code-age', 'any-file', 'grep', 'file-contains', 'command', 'adr-status', 'adr-forward-link', 'adr-backlink', 'adr-number-unique', 'config-nonempty', 'required-files', 'doc-freshness', 'md-links', 'path-integrity', 'version-consistency', 'dockerfile-digest', 'claims-field', 'claims-citations', 'descriptor', 'descriptor-valid', 'records-scrub', 'descriptor-change', 'forge-protection', 'workflow-state', 'plugin-presence'])

export function makeEvalCheck({ repo, cfg, NO_EXEC, JUDGMENTS = null, DESCRIPTOR, DEFAULT_BRANCH = null, LANEWORLD = null, ADMITWORLD = null }) {
  const { REPO, FILES, match, read, readText, readRaw, gitCommitISO, gitCatFile } = repo
  const TODAY = (nowUTC() ?? new Date()).toISOString().slice(0, 10)
  function globsOf(c) { return c.globs_from_config ? cfg[c.globs_from_config] : (c.file_from_config ? cfg[c.file_from_config] : c.globs) }

  function evalCheck(c, rule) {
    const k = c.kind

    if (k === 'any-of') {
      const subs = (c.checks || []).map(sc => evalCheck(sc, rule))
      if (subs.some(s => s.ok === true)) return { ok: true, detail: (subs.find(s => s.ok === true).detail) }
      if (subs.some(s => s.ok === false)) return { ok: false, detail: subs.filter(s => s.ok === false).map(s => s.detail).slice(0, 2).join(' | ') || 'no alternative satisfied' }
      return { ok: null, detail: 'n/a (no applicable target)' }
    }

    if (k === 'implies') {
      const w = evalCheck(c.when, rule)
      if (w.ok !== true) return { ok: null, detail: 'n/a (' + (c.when_label || 'precondition') + ' not present)' }
      const th = evalCheck(c.then, rule)
      if (th.ok === true) return { ok: true, detail: th.detail }
      if (th.ok === false) return { ok: false, detail: c.then_fail_detail || th.detail }
      return { ok: null, detail: th.detail } // can't evaluate the requirement (e.g. no CI files) -> skip, don't warn
    }

    if (k === 'workflow-permissions') {
      const files = match(globsOf(c)); if (!files.length) return { ok: null, detail: 'no workflow files' }
      const bad = []
      const blockOf = (lines, i, indent) => { // collect the inline value or the following more-indented lines
        const inline = stripLineComment(lines[i]).replace(/^\s*permissions:\s*/, '').trim() // a trailing comment must NOT read as the value
        if (inline) return inline
        let b = ''
        for (let j = i + 1; j < lines.length; j++) { const ind = lines[j].match(/^(\s*)/)[1].length; if (lines[j].trim() && ind <= indent) break; b += stripLineComment(lines[j]) + '\n' }
        return b
      }
      const hasWriteAll = s => /write-all/.test(s)
      // quote-insensitive; ignore OIDC/provenance scopes (id-token, attestations) — they grant no repo-write power (the canonical trusted-publishing pattern)
      const grantsWrite = s => /:\s*['"]?write\b/.test(s.replace(/(id-token|attestations)\s*:\s*['"]?write\b['"]?/g, ''))
      for (const f of files) {
        const t = readText(f); if (t == null) continue
        const lines = t.split('\n')
        let topFound = false, jobPermFound = false
        for (let i = 0; i < lines.length; i++) {
          const top = lines[i].match(/^permissions:/)
          const job = lines[i].match(/^(\s+)permissions:/)
          if (top) {
            topFound = true
            const block = blockOf(lines, i, 0)
            if (hasWriteAll(block)) bad.push(`${f.split('/').pop()}: top-level permissions: write-all`)
            else if (grantsWrite(block)) bad.push(`${f.split('/').pop()}: top-level grants a write scope (top-level should be read)`)
          } else if (job) {
            jobPermFound = true
            const block = blockOf(lines, i, job[1].length)
            if (hasWriteAll(block)) bad.push(`${f.split('/').pop()}: a job grants permissions: write-all`) // scoped job write is fine; write-all is not
          }
        }
        if (!topFound && !jobPermFound) bad.push(`${f.split('/').pop()}: no permissions block anywhere (broad default token)`)
      }
      const uniq = [...new Set(bad)]
      return { ok: uniq.length === 0, detail: uniq.length ? uniq.slice(0, 3).join('; ') : `${files.length} workflow(s) least-privilege` }
    }

    if (k === 'doc-code-age') {
      const files = match(globsOf(c)); if (!files.length) return { ok: null, detail: 'no docs to scan' }
      const lag = cfg[c.lag_days_from_config] || 30
      const bad = []; let checked = 0
      for (const f of files) {
        const t = read(f) || ''
        const fm = t.match(FRONTMATTER_RE); if (!fm) continue
        const inline = fm[1].match(/(?:^|\n)\s*sources:\s*\[([^\]]*)\]/) // anchored so data_sources:/test_sources: don't collide
        const block = fm[1].match(/(?:^|\n)\s*sources:\s*\r?\n((?:\s*-\s*[^\n]+\r?\n?)+)/)
        const norm = s => s.replace(/\s+#.*$/, '').trim().replace(/['"]/g, '').replace(/^\.\//, '') // strip trailing comment + quotes + leading ./
        let srcGlobs = []
        if (inline) srcGlobs = inline[1].split(',').map(norm).filter(Boolean)
        else if (block) srcGlobs = block[1].split('\n').map(s => norm(s.replace(/^\s*-\s*/, ''))).filter(Boolean)
        if (!srcGlobs.length) continue
        const docAge = gitCommitISO(f); if (!docAge) continue // count only docs whose own git date resolved
        const srcFiles = match(srcGlobs)
        if (!srcFiles.length) { bad.push(`${f.split('/').pop()}: sources anchor resolves to no files (dangling — can't verify freshness)`); checked++; continue }
        checked++
        let newest = null, dated = 0
        for (const sf of srcFiles) { const d = gitCommitISO(sf); if (d) { dated++; if (!newest || d > newest) newest = d } }
        if (!dated) { bad.push(`${f.split('/').pop()}: anchored source(s) not committed — can't verify freshness`); continue } // untracked code can't read as "fresh"
        if (newest && (newest.getTime() - docAge.getTime()) / DAY > lag) bad.push(`${f.split('/').pop()}: code newer by ${Math.round((newest.getTime() - docAge.getTime()) / DAY)}d (>${lag})`)
      }
      if (!checked) return { ok: null, detail: 'no docs declare a frontmatter sources: list (opt-in)' }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${checked} anchored doc(s) not lagging` }
    }

    if (k === 'any-file') {
      const files = match(globsOf(c), { tracked: !!c.tracked_only, exclude: c.allow, excludeGlobs: c.exclude_globs })
      if (c.mode === 'absent') return { ok: files.length === 0, detail: files.length ? 'found: ' + files.slice(0, 3).join(', ') + (files.length > 3 ? ` (+${files.length - 3})` : '') : 'none present (good)' }
      return { ok: files.length > 0, detail: files.length ? files.slice(0, 2).join(', ') + (files.length > 2 ? ` (+${files.length - 2})` : '') : 'none of: ' + asArr(globsOf(c)).slice(0, 5).join(', ') }
    }

    if (k === 'grep') {
      const files = match(globsOf(c), { tracked: !!c.tracked_only, excludeGlobs: c.exclude_globs })
      if (!files.length) return { ok: null, detail: 'no files to scan' }
      const re = reOf(c.pattern, c.flags); if (!re) return { ok: null, detail: 'bad regex in rule' }
      const rd = c.raw_scan ? readRaw : readText
      // strip_comments: drop # and // line-comments (quote-aware) before matching, so a narrative mention can't satisfy a "tool is invoked" grep
      const prep = c.strip_comments ? (t => t.split('\n').map(stripLineComment).join('\n')) : (t => t)
      if (c.mode === 'all') {
        const miss = files.filter(f => { const t = readText(f); return !(t && re.test(prep(t))) })
        return { ok: miss.length === 0, detail: miss.length ? `${miss.length} file(s) missing marker: ${miss.slice(0, 2).join(', ')}` : `all ${files.length} file(s) marked` }
      }
      const hit = files.filter(f => { const t = rd(f); return t && re.test(prep(t)) })
      const present = hit.length > 0
      if (c.mode === 'absent') return { ok: !present, detail: present ? `matched in ${hit.length} file(s): ${hit.slice(0, 2).join(', ')}` : 'pattern not found (good)' }
      return { ok: present, detail: present ? `matched in ${hit.length} file(s)` : 'pattern not found' }
    }

    if (k === 'file-contains') {
      const files = match(globsOf(c))
      if (!files.length) return c.null_if_absent ? { ok: null, detail: 'no matching file (skipped)' } : { ok: false, detail: 'file absent: ' + asArr(globsOf(c)).slice(0, 3).join(', ') }
      const re = reOf(c.pattern, c.flags); if (!re) return { ok: null, detail: 'bad regex in rule' }
      const good = files.filter(f => { const t = readText(f); return t && (!c.min_len || t.length >= c.min_len) && re.test(t) })
      if (good.length) return { ok: true, detail: `${good[0]} ok` }
      const short = files.filter(f => { const t = readText(f); return t && c.min_len && t.length < c.min_len })
      return { ok: false, detail: short.length ? `${short[0]} too short (<${c.min_len} chars)` : `${files[0]} present but missing required content` }
    }

    if (k === 'command') {
      const cmd = cfg[c.run_from_config]
      if (!cmd) return { ok: false, soft: true, detail: `no ${c.run_from_config} configured — the crown check can't run; set it in baseline.config.json` }
      if (NO_EXEC) return { ok: null, detail: '--no-exec (would run: ' + cmd + (c.repeat ? ` x${c.repeat}` : '') + ')' }
      const times = c.repeat || 1
      try { for (let i = 0; i < times; i++) execSync(cmd, { cwd: REPO, timeout: cfg.command_timeout_ms, stdio: 'pipe' }); return { ok: true, detail: (times > 1 ? `exit 0 x${times}: ` : 'exit 0: ') + cmd } }
      catch (e) {
        const stderr = (e.stderr ? String(e.stderr) : '').trim(); const tail = stderr ? stderr.split('\n').slice(-2).join(' / ').slice(0, 120) : String(e.message).split('\n')[0].slice(0, 100)
        return { ok: false, detail: (e.killed ? 'timed out: ' : 'failed: ') + cmd + ' — ' + tail }
      }
    }

    if (k === 'adr-status') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const allowed = /(proposed|accepted|superseded|deprecated|rejected|amended|draft|active)/i
      const bad = []
      for (const f of files) {
        const t = read(f) || ''
        const st = statusOf(t)
        if (!st || !allowed.test(st)) { bad.push(`${f.split('/').pop()}: no/invalid Status`); continue }
        // #57: the presence test used to be a phrase grep, and `\s*` does not match a
        // hyphen — so `Superseded-by: ADR-0003`, THE FORM templates/adr.md ships and
        // tells authors to fill in, read as no forward link at all. A record that
        // followed this repo's own template was reported as misdirecting a reader.
        // The declared edge is now the primary answer (adrEdges — the same reader
        // CTX-07 and CTX-13 resolve); the old phrase stays as a fallback so a prose
        // link with no resolvable number keeps passing exactly as it did.
        if (/superseded|deprecated|replaced/i.test(st) && !adrEdges(t).superseded_by.length && !/supersed(ed)?\s*by|replaced\s*by|→\s*adr|see\s+adr/i.test(t)) bad.push(`${f.split('/').pop()}: superseded w/o forward link`)
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} decision doc(s) ok` }
    }

    // #57: the decision graph has four declared edges and this resolved ONE of them —
    // and only in its spaced prose spelling. `Amends:`/`Amended-by:` were read by no
    // rule at all, which is the wrong half to skip: supersession is terminal (the
    // reader is sent elsewhere and the dead end is loud), amendment is what a decision
    // does when part of it survives, so the amended record stays the one a citation
    // arrives at. A declaration naming a record that does not exist is a finding
    // whatever the verb — the same sentence this rule always had, over the whole graph.
    if (k === 'adr-forward-link') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const bad = []; let edges = 0
      for (const f of files) {
        const e = adrEdges(read(f) || '')
        for (const [rel, verb] of ADR_EDGE_VERBS) {
          for (const n of e[rel]) {
            edges++
            // Resolve against every OTHER decision file: a record that names its own
            // number is not evidence that the number exists (the pre-#57 rule's
            // `g !== f`, kept verbatim).
            if (!files.some(g => g !== f && adrFileNumber(g) === n)) bad.push(`${f.split('/').pop()} ${verb} ADR ${String(n).padStart(4, '0')} (no such file)`)
          }
        }
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') : `${edges} declared edge(s) resolve` }
    }

    // CTX-13 (#57): an amendment declared at ONE end only. The record that WAS amended
    // is the one a reader arrives at from a citation, and it is the one that does not
    // know it has been corrected — a live decision graph's most common broken edge,
    // and one no check saw before. Deliberately narrow: only edges whose target
    // EXISTS are compared (a dangling `Amends:` is CTX-07's finding, and reporting it
    // twice would make one defect read as two), only the amendment pair is required
    // both ways (CTX-02 already governs what a superseded record owes), and nothing
    // is said about ordering — a record may amend one authored the same day.
    // Adoption: a corpus with history will light up, so this is a warn AND the
    // existing judgment route sanctions a named record — an unexpired sign-off /
    // deviation / risk-acceptance whose glob `subject` matches the DECLARING record's
    // path (SANCTION_KINDS, the route #47 opened). Deleting the judgment is how a
    // repair is proved; `review_by` is the expiry a frozen allowlist never has.
    if (k === 'adr-backlink') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const byNum = new Map()
      for (const f of files) { const n = adrFileNumber(f); if (n != null && !byNum.has(n)) byNum.set(n, { file: f, edges: adrEdges(read(f) || '') }) }
      const oneWay = []; let paired = 0
      for (const f of files) {
        const self = adrFileNumber(f); if (self == null) continue
        const e = byNum.get(self)?.file === f ? byNum.get(self).edges : adrEdges(read(f) || '')
        const base = f.split('/').pop()
        for (const n of e.amends) {
          const t = byNum.get(n); if (!t || t.file === f) continue
          if (t.edges.amended_by.includes(self)) { paired++; continue }
          oneWay.push({ path: f, text: `${base} amends ADR ${String(n).padStart(4, '0')}; ${t.file.split('/').pop()} carries no Amended-by` })
        }
        for (const n of e.amended_by) {
          const t = byNum.get(n); if (!t || t.file === f) continue
          if (t.edges.amends.includes(self)) continue
          oneWay.push({ path: f, text: `${base} says ADR ${String(n).padStart(4, '0')} amends it; ${t.file.split('/').pop()} carries no Amends` })
        }
      }
      const sanctionsOf = p => (JUDGMENTS || []).filter(j => SANCTION_KINDS.includes(j.kind) && j.review_by >= TODAY && globMatcher(j.subject).test(p)).map(j => j.id)
      const sanctioned = [], unexplained = []
      for (const o of oneWay) { const ids = sanctionsOf(o.path); if (ids.length) sanctioned.push({ text: o.text, by: ids.join(', ') }); else unexplained.push(o) }
      if (!oneWay.length) return { ok: true, detail: paired ? `${paired} amendment edge(s) declared at both ends` : 'no amendment edges declared' }
      if (!unexplained.length) return { ok: true, detail: `${sanctioned.length} one-way amendment(s) sanctioned by judgment: ` + sanctioned.map(s => `${s.text} [${s.by}]`).join('; ') }
      return { ok: false, detail: `${unexplained.length} one-way amendment(s): ` + unexplained.slice(0, 3).map(o => o.text).join('; ') + (unexplained.length > 3 ? ` (+${unexplained.length - 3})` : '') + (sanctioned.length ? ` — ${sanctioned.length} sanctioned (${sanctioned.map(s => s.by).join(', ')})` : '') }
    }

    // CTX-14 (#49): the decision-record NUMBER is a scarce name, and nothing owned it.
    // Two lanes each authored an 0027 under different filenames; both trees were clean,
    // both merges were conflict-free, and `main` ended with two ADR-0027s that no check
    // had an opinion about. This is the floor: it cannot see the other lane, but it
    // guarantees the collision does not SURVIVE — whichever side
    // merges second turns the default branch red instead of shipping a silent duplicate.
    //
    // Numbers, not paths: `0027-a.md` and `0027-b.md` are one decision's identity claimed
    // twice, which is exactly how CTX-07/CTX-13 resolve an edge — a citation to ADR-0027
    // arrives at whichever file sorted first.
    //
    // Adoption: renumbering a record BREAKS the citations that point at it, so a corpus
    // that already carries a duplicate may rationally keep it. The existing judgment route
    // sanctions it — an unexpired sign-off / deviation / risk-acceptance whose glob
    // `subject` matches EITHER colliding file (naming one end names the collision), with
    // deleting the judgment the proof of repair. Same route as CTX-13.
    if (k === 'adr-number-unique') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const byNum = new Map()
      for (const f of files) { const n = adrFileNumber(f); if (n == null) continue; if (!byNum.has(n)) byNum.set(n, []); byNum.get(n).push(f) }
      if (!byNum.size) return { ok: null, detail: `${files.length} decision doc(s), none carrying a number in the filename` }
      const pad = n => String(n).padStart(4, '0')
      const dupes = [...byNum.entries()].filter(([, fs]) => fs.length > 1).sort((a, b) => a[0] - b[0])
        .map(([n, fs]) => ({ n, files: fs, text: `${pad(n)} claimed by ${fs.map(f => f.split('/').pop()).join(', ')}` }))
      // A gap is not an error — it is worth seeing (a retracted draft, or a number
      // reserved on a lane that never landed). It rides the detail, never the verdict.
      const nums = [...byNum.keys()].sort((a, b) => a - b)
      const gaps = []
      for (let i = nums[0]; i < nums.at(-1); i++) if (!byNum.has(i)) gaps.push(pad(i))
      const gapNote = gaps.length ? ` · gap(s) in the sequence (not an error): ${gaps.slice(0, 5).join(', ')}${gaps.length > 5 ? ` (+${gaps.length - 5})` : ''}` : ''
      if (!dupes.length) return { ok: true, detail: `${nums.length} decision number(s) unique across ${files.length} record(s)${gapNote}` }
      const sanctionsOf = paths => [...new Set(paths.flatMap(p => (JUDGMENTS || []).filter(j => SANCTION_KINDS.includes(j.kind) && j.review_by >= TODAY && globMatcher(j.subject).test(p)).map(j => j.id)))]
      const sanctioned = [], unexplained = []
      for (const d of dupes) { const ids = sanctionsOf(d.files); if (ids.length) sanctioned.push({ text: d.text, by: ids.join(', ') }); else unexplained.push(d) }
      if (!unexplained.length) return { ok: true, detail: `${sanctioned.length} duplicate number(s) sanctioned by judgment: ` + sanctioned.map(s => `${s.text} [${s.by}]`).join('; ') + gapNote }
      return { ok: false, detail: `${unexplained.length} decision number(s) claimed twice: ` + unexplained.slice(0, 3).map(d => d.text).join('; ') + (unexplained.length > 3 ? ` (+${unexplained.length - 3})` : '') + (sanctioned.length ? ` — ${sanctioned.length} sanctioned (${sanctioned.map(s => s.by).join(', ')})` : '') }
    }

    if (k === 'config-nonempty') { const v = cfg[c.path]; const ne = nonEmpty(v); return { ok: ne, detail: ne ? 'declared' : `config.${c.path} empty` } }

    if (k === 'required-files') {
      const list = asArr(cfg[c.list_from_config])
      if (!list.length) return { ok: null, detail: `config.${c.list_from_config} empty (opt-in)` }
      const bad = []
      for (const p of list) { const t = read(p); if (t == null) bad.push(`${p} missing`); else if (t.trim().length === 0) bad.push(`${p} empty`) }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${list.length} grounding doc(s) present` }
    }

    if (k === 'doc-freshness') {
      const files = match(globsOf(c))
      if (!asArr(cfg[c.globs_from_config]).length) return { ok: null, detail: `config.${c.globs_from_config} empty (opt-in)` }
      if (!files.length) return { ok: null, detail: 'no docs matched' }
      const win = cfg[c.within_days_from_config] || 180
      const bad = []
      for (const f of files) {
        const t = read(f) || ''
        const fm = t.match(FRONTMATTER_RE) // was LF-only here: a CRLF-saved doc was invisible to doc-freshness
        const body = fm ? fm[1] : t.slice(0, 400)
        const m = body.match(new RegExp(c.field + '\\s*[:=]\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})', 'i'))
        if (!m) { bad.push(`${f.split('/').pop()}: no ${c.field}`); continue }
        const d = parseDate(m[1]); if (!d) { bad.push(`${f.split('/').pop()}: bad date`); continue }
        if (daysAgo(d) > win) bad.push(`${f.split('/').pop()}: ${Math.round(daysAgo(d))}d old (>${win})`)
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} doc(s) fresh` }
    }

    if (k === 'md-links') {
      const files = match(globsOf(c), { tracked: !!c.tracked_only })
      if (!files.length) return { ok: null, detail: 'no docs to scan' }
      const linkRe = /\[[^\]]*\]\(([^)]+)\)/g
      const broken = []
      for (const f of files) {
        const t = readText(f); if (!t) continue
        const dir = path.dirname(f)
        let m
        while ((m = linkRe.exec(t))) {
          let target = m[1].trim().split(/\s+/)[0] // drop optional "title"
          if (!target || /^(https?:|mailto:|tel:|#|data:|<)/i.test(target)) continue
          if (target.includes('{{') || target.includes('${')) continue
          target = target.replace(/[#?].*$/, '')
          if (!target) continue
          // root-absolute links (/docs/x.md) resolve against the repo root, GitHub-style
          const rel = target.startsWith('/')
            ? path.normalize(target.replace(/^\/+/, '')).split(path.sep).join('/')
            : path.normalize(path.join(dir, target)).split(path.sep).join('/')
          const onDisk = fs.existsSync(path.join(REPO, rel)) || FILES.includes(rel)
          if (!onDisk) broken.push(`${f}→${target}`)
        }
      }
      return { ok: broken.length === 0, detail: broken.length ? `${broken.length} broken: ` + broken.slice(0, 3).join(', ') : `${files.length} doc(s), links resolve` }
    }

    if (k === 'path-integrity') {
      const files = match(globsOf(c))
      if (!files.length) return { ok: null, detail: 'no docs to scan' }
      const tokRe = /`([^`]+)`/g
      const missing = []
      let checked = 0
      for (const f of files) {
        const t = readText(f); if (!t) continue
        let m
        while ((m = tokRe.exec(t))) {
          const tok = m[1].trim()
          if (!/^[\w./-]+$/.test(tok) || !tok.includes('/') || !/\.[a-z0-9]{1,5}$/i.test(tok)) continue
          checked++
          const rel = tok.replace(/^\.\//, '')
          if (!(fs.existsSync(path.join(REPO, rel)) || FILES.some(x => x.endsWith('/' + rel) || x === rel))) missing.push(`${f}: ${tok}`)
        }
      }
      if (!checked) return { ok: null, detail: 'no path-like symbols found' }
      return { ok: missing.length === 0, detail: missing.length ? `${missing.length} missing: ` + missing.slice(0, 3).join(', ') : `${checked} path ref(s) resolve` }
    }

    if (k === 'version-consistency') {
      // Compare only true single-value PINS across homes. Ranges (engines/requires-python) and CI test-matrices are NOT pins.
      const pins = { node: [], python: [], go: [] }
      const keyOf = (lang, major, minor) => lang === 'node' ? major : `${major}.${minor ?? '0'}`
      const addPin = (lang, val, where) => {
        if (val == null) return
        const s = String(val).trim()
        if (/[<>=^~|*x]|\s-\s|\|\|/i.test(s)) return // a range/constraint, not a pin
        const m = s.match(/(\d+)(?:\.(\d+))?/); if (!m) return
        pins[lang].push({ key: keyOf(lang, m[1], m[2]), raw: s.slice(0, 12), src: where })
      }
      const rd = f => (FILES.includes(f) ? read(f) : null)
      if (rd('.nvmrc')) addPin('node', rd('.nvmrc'), '.nvmrc')
      if (rd('.node-version')) addPin('node', rd('.node-version'), '.node-version')
      if (rd('.python-version')) addPin('python', rd('.python-version'), '.python-version')
      const gm = rd('go.mod'); if (gm) { const m = gm.match(/^go\s+([0-9.]+)/m); if (m) addPin('go', m[1], 'go.mod') }
      const tv = rd('.tool-versions'); if (tv) for (const line of tv.split('\n')) { const m = line.match(/^\s*(nodejs|node|python|golang|go)\s+([0-9][0-9.]*)/i); if (m) { const l = /node/i.test(m[1]) ? 'node' : /python/i.test(m[1]) ? 'python' : 'go'; addPin(l, m[2], '.tool-versions') } }
      for (const df of match(["**/Dockerfile", "**/Dockerfile.*", "**/*.Dockerfile"])) {
        const t = readText(df) || ''
        let m; const fre = /^FROM\s+(?:--\S+\s+)*(node|python|golang):([0-9]+(?:\.[0-9]+)?)/gmi
        while ((m = fre.exec(t))) { const l = /node/i.test(m[1]) ? 'node' : /python/i.test(m[1]) ? 'python' : 'go'; addPin(l, m[2], df.split('/').pop()) }
      }
      const problems = []; let compared = 0
      for (const lang of Object.keys(pins)) {
        const ds = pins[lang]; if (ds.length < 2) continue
        compared++
        if (new Set(ds.map(d => d.key)).size > 1) problems.push(`${lang}: ${ds.map(d => `${d.src}=${d.raw}`).join(', ')}`)
      }
      if (!compared) return { ok: null, detail: 'runtime pinned in <2 homes (nothing to cross-check)' }
      return { ok: problems.length === 0, detail: problems.length ? 'DRIFT ' + problems.slice(0, 2).join(' ; ') : `pins consistent across ${compared} language(s)` }
    }

    if (k === 'dockerfile-digest') {
      const files = match(globsOf(c))
      // v3 §6 (V20): intent counts as presence, not as a pass — a tool the config `want`s
      // and the tree lacks is a FINDING; with no such declaration the rule has no subject
      if (!files.length) return (rule?.tool && asArr(cfg.want).includes(rule.tool))
        ? { ok: false, detail: `no Dockerfile in the tree, yet config want declares ${rule.tool} — add one (or drop the want entry)` }
        : { ok: null, detail: 'no Dockerfile' }
      const bad = []
      for (const f of files) {
        const t = readText(f); if (!t) continue
        const stages = new Set()
        for (const line of t.split('\n')) {
          const fm = line.match(/^\s*FROM\s+(.*)$/i)
          if (!fm) continue
          const toks = fm[1].trim().split(/\s+/).filter(x => !x.startsWith('--')) // drop build flags like --platform=...
          const img = toks[0]; if (!img) continue
          const asIdx = toks.findIndex(x => x.toLowerCase() === 'as')
          const alias = asIdx >= 0 ? toks[asIdx + 1] : undefined
          if (alias) stages.add(alias.toLowerCase())
          if (stages.has(img.toLowerCase())) { if (alias) stages.add(alias.toLowerCase()); continue } // reference to a prior build stage
          if (/@sha256:[0-9a-f]{64}/i.test(img)) { if (alias) stages.add(alias.toLowerCase()); continue }
          bad.push(`${f.split('/').pop()}: FROM ${img}`)
          if (alias) stages.add(alias.toLowerCase())
        }
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} Dockerfile(s) digest-pinned` }
    }

    if (k === 'claims-field' || k === 'claims-citations') {
      // records-only since M7b: exploded records/claims/CLM-*.json is the one home
      // the checker reads; a lingering legacy monolith is CLAIM-07's business.
      const loaded = loadClaims(repo, cfg)
      if (loaded.errors.length) return { ok: false, detail: loaded.errors.slice(0, 2).join('; ') + (loaded.errors.length > 2 ? ` (+${loaded.errors.length - 2})` : '') }
      let claims = loaded.claims
      if (!claims.length) return { ok: false, detail: loaded.legacyPresent ? `no claim records — legacy ${cfg.claims_file} is no longer read; run \`baseline gen migrate-claims\` (MIGRATION.md)` : `no claims found (${CLAIM_RECORD_GLOB})` }
      if (c.applies_to_types) claims = claims.filter(cl => c.applies_to_types.includes(String(cl.type || '').toLowerCase()))
      if (!claims.length) return { ok: null, detail: 'no claims of type ' + c.applies_to_types.join('/') }
      const bad = []
      for (const cl of claims) {
        const id = cl.slug || cl.id || (typeof cl.statement === 'string' ? cl.statement.slice(0, 24) : '?')
        if (k === 'claims-citations') {
          const cits = Array.isArray(cl.citations) ? cl.citations : (cl.citations == null ? [] : null)
          if (cits === null) { bad.push(`${id}: "citations" must be an array`); continue }
          for (const cit of cits) { if (!cit || typeof cit !== 'object' || !cit.url || !cit.supports_because) bad.push(`${id}: citation missing url/supports_because`) }
          continue
        }
        const v = cl[c.field]
        if (v == null || v === '') { bad.push(`${id}: no ${c.field}`); continue }
        if (c.enum && !c.enum.includes(String(v))) bad.push(`${id}: ${c.field}='${v}' not in {${c.enum.join('|')}}`)
        if (c.is_date) { const d = parseDate(v); if (!d) bad.push(`${id}: ${c.field} not a date`); else if (c.within_days_from_config && daysAgo(d) > cfg[c.within_days_from_config]) bad.push(`${id}: prior-art stale (${Math.round(daysAgo(d))}d > ${cfg[c.within_days_from_config]}d)`) }
        for (const rf of (c.also_require || [])) if (!cl[rf]) bad.push(`${id}: missing ${rf}`)
        if (c.require_if && String(v) === c.require_if.when_value && !cl[c.require_if.then_field]) bad.push(`${id}: ${c.field}=${v} needs ${c.require_if.then_field}`)
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') : `${claims.length} claim(s) ok` }
    }

    if (k === 'records-scrub') {
      // REC-02 (C34): re-scan LANDED files (the whole tracked tree, per the rule's
      // globs) with the one scan API the write gate uses — blob content at HEAD, not
      // the worktree ("what landed" must give the same verdict on a dirty tree and
      // in CI, or M7's promotion to blocker breaks reproducibility). Deterministic
      // signatures fail the rule (warn now; M7's promotion is a pure severity flip);
      // heuristic findings are soft — they stay WARN even at blocker. A blob we
      // cannot read is surfaced as unscanned, never folded into the clean count.
      const files = match(c.globs || ['**'], { tracked: true })
      if (!files.length) return { ok: null, detail: 'no tracked files to scan' }
      let allowlist = []
      try { allowlist = loadAllowlist(REPO).entries } catch (e) { return { ok: false, soft: true, detail: String(e.message).slice(0, 120) } }
      const det = [], heu = [], unscanned = []; let allowed = 0, scanned = 0
      for (const f of files) {
        const t = gitCatFile('HEAD', f)
        if (t == null) { unscanned.push(f); continue }
        scanned++
        const res = scan(t, { allowlist })
        allowed += res.allowed.length
        for (const x of res.blocked) det.push(`${f}:${x.line} ${x.name} (${x.masked}) [${x.id}]`)
        for (const x of res.warned) heu.push(`${f}:${x.line} ${x.name} (${x.masked}) [${x.id}]`)
      }
      const unscannedNote = unscanned.length ? ` — ${unscanned.length} file(s) UNSCANNED at HEAD (${unscanned.slice(0, 2).join(', ')}${unscanned.length > 2 ? ', …' : ''})` : ''
      if (det.length) return { ok: false, detail: `deterministic secret shape(s): ` + det.slice(0, 3).join('; ') + (det.length > 3 ? ` (+${det.length - 3})` : '') + unscannedNote }
      if (heu.length) return { ok: false, soft: true, detail: `heuristic finding(s): ` + heu.slice(0, 3).join('; ') + (heu.length > 3 ? ` (+${heu.length - 3})` : '') + unscannedNote }
      if (unscanned.length) return { ok: false, soft: true, detail: `${scanned} scanned clean, but ${unscannedNote.slice(3)}` }
      return { ok: true, detail: `${scanned} file(s) scrub-clean at HEAD` + (allowed ? ` (${allowed} allowlisted)` : '') }
    }

    if (k === 'descriptor') {
      // DESC-01 (narrowed at M7c): PRESENCE only — validity is DESC-02's blocker
      // (the presence/content divide). One condition, one finding.
      const d = DESCRIPTOR
      if (!d || !d.present) return { ok: false, soft: true, detail: `no ${DESCRIPTOR_FILE} — the repo doesn't declare itself (type/lifecycle/maturity/workflow); copy a config-presets/*.repo.json posture preset` }
      if (!d.valid) return { ok: true, detail: `${DESCRIPTOR_FILE} present (schema validity is DESC-02's finding)` }
      const x = d.data
      return { ok: true, detail: `type=${x.type} · ${x.lifecycle}/${x.maturity} · workflow=${x.workflow} · anchoring=${x.anchoring}` }
    }

    if (k === 'descriptor-valid') {
      // DESC-02 (M7c, the M7b panel's filing): present-but-invalid at BLOCKER. Ten
      // workflow-gated blockers hang off this file — invalidity flips the posture
      // off (every gated rule SKIPs 'workflow contract off'), so the collapse must
      // be the loudest row in the run, not a warn beside a wall of skips. Absence
      // is DESC-01's (no overlap).
      const d = DESCRIPTOR
      if (!d || !d.present) return { ok: null, detail: `no ${DESCRIPTOR_FILE} — absence is DESC-01's finding` }
      if (!d.valid) return { ok: false, detail: `${DESCRIPTOR_FILE} invalid: ${d.errors.slice(0, 2).join('; ')}${d.errors.length > 2 ? ` (+${d.errors.length - 2} more)` : ''} — the posture is OFF while this file is broken (every workflow-gated blocker skips); fix the errors or re-copy a preset (retired owner key? MIGRATION.md)` }
      return { ok: true, detail: `${DESCRIPTOR_FILE} schema-valid (schema_version ${d.data.schema_version})` }
    }

    // ---- The forge kinds (GOV-01/02, OPS-07) read through LANEWORLD — the SAME
    // gathering orient and admit use; one answer, three surfaces — and every
    // unreachable plane degrades to ok:null with the reason: exit-stable offline,
    // with multi-lane-local runs carrying makeForge's posture label, never fake
    // unreachability. ----

    // ---- M6b: GOV-01/02 live asserts on the READABLE surface (the ruled ladder:
    // rules-for-branch is a plain read; the branch `protected` flag is plain; the
    // classic /protection endpoint needs admin and is consulted only under the
    // explicit BASELINE_GOV_ADMIN=1 opt-in). run() nulls every failure identically,
    // so 403-vs-down derives honestly: rules null while the branch's metadata
    // answers = unreadable WITH THIS TOKEN (SKIP, never source-loss); both null =
    // the forge plane degraded (the probe/posture reason rides the SKIP). The
    // `protected` flag reflects CLASSIC protection only — with the rules endpoint
    // unreadable, protected:false can NEVER assert "no protection" (a ruleset may
    // exist unseen), so that leg SKIPs rather than guessing. Deterministic: every
    // PASS/FAIL is a live boolean read of enforcement, not a grep of intent. ----

    if (k === 'forge-protection') {
      // subject guard BEFORE the world: LANEWORLD() forces the forge probe (3 gh
      // spawns), pure waste when the SKIP is already decided by an undeclared branch
      if (!DEFAULT_BRANCH) return { ok: null, detail: 'default branch undeclared (set ground_truth_boundary.default_branch) — protection has no subject' }
      const w = LANEWORLD ? LANEWORLD() : null
      if (!w) return { ok: null, detail: 'no lane world assembled — forge asserts n/a in this runner' }
      if (!w.forge.available) return { ok: null, detail: `protection unreadable (${w.forge.reason})` }
      const rules = w.forge.branchRules(DEFAULT_BRANCH)
      const meta = w.forge.branchMeta(DEFAULT_BRANCH)
      if (!Array.isArray(rules)) {
        // rules endpoint gave nothing — distinguish token-scoped denial from a dead plane
        if (meta) {
          if (c.gov === 'protection' && meta.protected === true) return { ok: true, detail: `classic branch protection active on ${DEFAULT_BRANCH} (rules endpoint unreadable with this token)` }
          return { ok: null, detail: `protection unreadable with this token (rules endpoint denied; ${DEFAULT_BRANCH} metadata readable${meta.protected === false ? ', protected flag false — but the flag cannot see rulesets, so absence is not provable' : ''})` }
        }
        return { ok: null, detail: w.forge.source === 'replay' ? 'protection unreadable (no branch-rules replay fixture)' : `protection facts unreadable (${w.forge.reason || 'forge queries failed'})` }
      }
      // Merge-PROTECTIVE rule types only: rulesets aggregate across layers (org+repo)
      // and carry non-merge rules too — a signatures-only or deletion-only ruleset
      // protects nothing GOV-01's title names, and a first-of-type .find would miss a
      // later layer's parameters, so every bit is checked with .some over ALL rules.
      const PROTECTIVE = new Set(['pull_request', 'required_status_checks', 'non_fast_forward', 'merge_queue'])
      const protective = [...new Set(rules.map(r => r.type))].filter(t => PROTECTIVE.has(t)).sort()
      if (c.gov === 'protection') {
        // GOV-01: is MERGE protection actually active on the default branch?
        if (protective.length) return { ok: true, detail: `active merge-protective rules on ${DEFAULT_BRANCH}: ${protective.join(', ')}` }
        const other = [...new Set(rules.map(r => r.type))].sort()
        const rulesNote = other.length ? `rules active (${other.join(', ')}) but none protects merges` : 'rules: none'
        if (meta?.protected === true) return { ok: true, detail: `classic branch protection active on ${DEFAULT_BRANCH} (${rulesNote})` }
        if (meta && meta.protected === false) return { ok: false, detail: `no active merge protection on ${DEFAULT_BRANCH} (${rulesNote}; protected flag false) — anyone can force-push or merge red; create a ruleset requiring the baseline checks` }
        return { ok: null, detail: `rules readable (${rulesNote}) but ${DEFAULT_BRANCH} metadata is not — classic protection state unknowable with this token` }
      }
      // GOV-02: strict up-to-date + conversation resolution — .some across EVERY rule
      // (layered rulesets enforce the union), classic ladder when rulesets lack the bits
      const strict = rules.some(r => r.type === 'required_status_checks' && r.parameters?.strict_required_status_checks_policy === true)
      const conv = rules.some(r => r.type === 'pull_request' && r.parameters?.required_review_thread_resolution === true)
      if (strict && conv) return { ok: true, detail: `ruleset on ${DEFAULT_BRANCH} enforces strict up-to-date checks and conversation resolution` }
      const missing = [!strict && 'strict up-to-date status checks (strict_required_status_checks_policy)', !conv && 'required conversation resolution (required_review_thread_resolution)'].filter(Boolean)
      if (meta?.protected === true) {
        // classic protection may enforce what the rulesets don't — never FAIL past it
        if (process.env.BASELINE_GOV_ADMIN) {
          const p = w.forge.branchProtection(DEFAULT_BRANCH)
          if (p) {
            const s = strict || p.required_status_checks?.strict === true
            const cv = conv || p.required_conversation_resolution?.enabled === true
            if (s && cv) return { ok: true, detail: `${DEFAULT_BRANCH} enforces strict up-to-date checks and conversation resolution (ruleset + classic, admin read)` }
            const still = [!s && 'strict up-to-date status checks', !cv && 'required conversation resolution'].filter(Boolean)
            return { ok: false, detail: `${DEFAULT_BRANCH} does not enforce: ${still.join(' + ')} (ruleset + classic read)` }
          }
          return { ok: null, detail: w.forge.source === 'replay' ? 'classic protection active but no branch-protection replay fixture' : `classic protection active but /protection denied even under BASELINE_GOV_ADMIN — the token is not admin on this repo` }
        }
        return { ok: null, detail: `ruleset lacks ${missing.join(' + ')} but classic protection is active — its settings need an admin token to read; opt in: BASELINE_GOV_ADMIN=1` }
      }
      if (meta && meta.protected === false) {
        return rules.length
          ? { ok: false, detail: `ruleset on ${DEFAULT_BRANCH} does not enforce: ${missing.join(' + ')} — a stale branch can merge green` }
          : { ok: false, detail: `no active protection on ${DEFAULT_BRANCH} — strict up-to-date and conversation resolution are unset` }
      }
      return { ok: null, detail: `rules readable but ${DEFAULT_BRANCH} metadata is not — classic protection state unknowable with this token` }
    }

    if (k === 'workflow-state') {
      // OPS-07 (M7c, falsifiable smallest shape): ONE recorded forge query of the
      // reconcile workflow's state. The subject is found in the TREE (a workflow
      // file invoking `baseline… reconcile`) — no workflow wired → SKIP, so repos
      // without the cron are never wallpapered. No run-age math, no constant, no
      // knob: `active` is alive, anything else (the disabled_* family — GitHub's
      // 60-day auto-disable is the named death mode) is a dead cron that will
      // never file the issues reconcile exists to file.
      const wfs = match(['.github/workflows/*.yml', '.github/workflows/*.yaml'])
        .filter(f => /baseline(\.mjs)?['"]?\s+reconcile\b/.test((read(f) || '').split('\n').map(stripLineComment).join('\n')))
        .sort()
      if (!wfs.length) return { ok: null, detail: 'no reconcile workflow in .github/workflows/ — the cron is not wired (nothing to be alive)' }
      const file = wfs[0].split('/').pop()
      const w = LANEWORLD ? LANEWORLD() : null
      if (!w) return { ok: null, detail: 'no lane world assembled — forge asserts n/a in this runner' }
      if (!w.forge.available) return { ok: null, detail: `workflow state unreadable (${w.forge.reason})` }
      const st = w.forge.workflowState(file)
      if (!st || typeof st.state !== 'string') return { ok: null, detail: w.forge.source === 'replay' ? `workflow state unreadable (no workflow-state replay fixture for ${file})` : `workflow state query failed for ${file} — liveness not provable, never guessed` }
      const extra = wfs.length > 1 ? ` (${wfs.length} reconcile workflows in tree — asserting the first, ${file})` : ''
      if (st.state === 'active') return { ok: true, detail: `${file}: active at the forge${extra}` }
      return { ok: false, detail: `${file}: ${st.state} at the forge — the cron files nothing while disabled${st.state === 'disabled_inactivity' ? ` (GitHub's 60-day auto-disable)` : ''}; re-enable: gh workflow enable ${file}${extra}` }
    }

    // ---- M6a admit-context kind — reads through ADMITWORLD (the target-ref world
    // `baseline admit` assembles: target tip, range diff, added judgments). In any run
    // without an ADMITWORLD it is unrepresentable (contexts gating excludes it from
    // check), and the guard keeps that honest. ----

    if (k === 'descriptor-change') {
      // DESC-03: a descriptor change in the admitted range carries its judgment in the
      // SAME range — subject exactly the descriptor filename (ONE spelling, the one
      // constant the tool owns; CONTRACT.md and the jdg hint both emit it). Deterministic: diff names + record subjects; the weakening classification
      // (x-strictness ladders + gate-consumed set-rules) rides the finding text — it is
      // M7's per-axis policy seam, not this verdict's fork.
      if (!ADMITWORLD) return { ok: null, detail: 'admit-context only (no target world assembled)' }
      const { targetRef, changed, addedJudgments, headDescriptor, jdgCapped } = ADMITWORLD
      if (changed === null) return { ok: null, detail: `diff ${targetRef}...HEAD failed — change scope unreadable (admit refuses on this as gating-source loss)` }
      // belt over the no-renames diff: a descriptor ABSENT at HEAD while the target has
      // a valid one IS a change, however the diff spelled it
      const touched = changed.includes(DESCRIPTOR_FILE) || !headDescriptor?.present
      if (!touched) return { ok: true, detail: `descriptor untouched in ${targetRef}...HEAD` }
      const weak = classifyPostureDiff(DESCRIPTOR?.valid ? DESCRIPTOR.data : null, headDescriptor?.valid ? headDescriptor.data : null, DESCRIPTOR_SCHEMA)
      const weakNote = weak.length ? ` — WEAKENING: ${weak.slice(0, 3).join('; ')}${weak.length > 3 ? ` (+${weak.length - 3} more)` : ''}` : ' (no posture axis weakened)'
      // M7a kind pin: {sign-off, deviation, risk-acceptance} satisfy — break-glass is
      // EXCLUDED (it is outage relief with its own gate semantics; letting it double
      // as descriptor-change approval would conflate the two valves M6 separated).
      // One home: SANCTION_KINDS is the shared set (CTX-13/CTX-14 sanction through it too).
      const DESC_JDG_KINDS = SANCTION_KINDS
      const jdgs = addedJudgments.filter(j => j.record && DESC_JDG_KINDS.includes(j.record.kind) && j.record.subject === DESCRIPTOR_FILE && j.record.review_by >= TODAY)
      if (!jdgs.length) {
        const kindMiss = addedJudgments.find(j => j.record && j.record.subject === DESCRIPTOR_FILE && j.record.review_by >= TODAY && !DESC_JDG_KINDS.includes(j.record.kind))
        const near = addedJudgments.filter(j => j.record && j.record.subject !== DESCRIPTOR_FILE)
        const hint = kindMiss ? ` (${kindMiss.record.id} rode this range with the right subject but kind '${kindMiss.record.kind}' — break-glass is outage relief, never descriptor-change approval; use ${DESC_JDG_KINDS.join('|')})`
          : near.length ? ` (a judgment rode this range but its subject is '${near[0].record.subject}', not '${DESCRIPTOR_FILE}' — the matcher is the exact filename)` : jdgCapped ? ` (judgment parsing capped at 500 added records — a qualifying one beyond the cap does not count; shrink the range)` : ''
        return { ok: false, detail: `${DESCRIPTOR_FILE} changed with no same-range judgment${weakNote}${hint} — baseline jdg new --kind deviation --subject "${DESCRIPTOR_FILE}" --reason "why the posture changed" --review-by <date>, in this PR` }
      }
      return { ok: true, detail: `descriptor change carries ${jdgs[0].record.id} (subject ${DESCRIPTOR_FILE}, review by ${jdgs[0].record.review_by})${weakNote}` }
    }

    // ---- v3 §11 the plugin boundary (D6–D10, V38–V41) — the PLUG family's one kind. ----

    if (k === 'plugin-presence') {
      // Metadata only (D7): the probe asks whether the artifact exists, what it is, how old
      // it is and what git says of it — never what is in it. Never ok:null — an absent
      // plugin is a WARN naming the install command (D8), and the command is printed, not
      // run (D6). On WARN the log under .baseline/log/<PREFIX>.log records the path, the
      // config values with their source and git's answer (D10); a PASS removes a stale one.
      const name = String(c.plugin || '')
      const spec = pluginSpec(cfg, name)
      const install = String(c.install || '').trim()
      if (!spec) return { ok: false, detail: `rule names an unknown plugin '${name}' — the plugin table knows none by that name` }
      const p = probePlugin(REPO, name, spec)
      const envName = spec.env || null
      const where = spec.path ? spec.path : `$${envName || 'plugins.' + name + '.path'} (unset)`
      const expect = expectationWord(spec.ignored)
      const logRel = pluginLogRel(rule.id)
      const stamp = (nowUTC() ?? new Date()).toISOString()
      const logLines = (verdict, why) => [
        `${rule.id} — ${name} plugin presence probe (baseline check, ${stamp})`,
        `repo: ${REPO}`,
        `path: ${spec.path ?? `(unset — ${envName ? `${envName} not set and ` : ''}no plugins.${name}.path in baseline.config.json)`} (source: ${spec.source?.path || 'default'}${spec.path && p.abs ? `; resolved: ${p.abs}` : ''})`,
        `ignored: ${spec.ignored} (source: ${spec.source?.ignored || 'default'} — ${spec.source?.ignored === 'config' ? 'baseline.config.json plugins.' + name + '.ignored' : 'the default; no plugins.' + name + '.ignored in config'})`,
        `present: ${p.present ? `yes — ${p.kind}, mtime ${p.mtime}` : 'no'}`,
        `git: ${p.present ? (p.git === 'outside' ? 'not asked — the path is outside the repo' : p.git === null ? 'no answer (not a git repository, or git unavailable)' : `${p.git} (git ls-files --error-unmatch; git check-ignore -q)`) : 'not asked — nothing to ask about'}`,
        `verdict: ${verdict} — ${why}`,
      ]
      const warn = (detail, why) => {
        const log = writePluginLog(REPO, rule.id, logLines('WARN', why))
        return { ok: false, detail, ...(log ? { log } : {}) }
      }
      if (!p.present) {
        return warn(`${name} not found at ${where} — install: ${install}`, `${name} artifact absent at ${where}; install: ${install}`)
      }
      if (p.git === 'outside') {
        removePluginLog(REPO, rule.id)
        return { ok: true, detail: `${name} present at ${p.abs} (${p.kind}, mtime ${p.mtime}; outside the repo, so git was not asked)` }
      }
      if (p.git === null) {
        return warn(`${name} present at ${spec.path} but git could not say whether it is ${expect} (not a git repository, or git unavailable) — config expects ${expect}`, `git gave no answer; config expects ${expect}`)
      }
      if (gitMatches(p.git, spec.ignored)) {
        removePluginLog(REPO, rule.id)
        return { ok: true, detail: `${name} present at ${spec.path} (${p.kind}, ${p.git} by git as configured, mtime ${p.mtime})` }
      }
      const found = p.git === 'untracked' ? 'untracked (neither tracked nor ignored)' : p.git
      return warn(
        `${name} present at ${spec.path} but config says ${expect}, git says ${found} — set plugins.${name}.ignored in baseline.config.json or change .gitignore`,
        `config says ${expect} (source: ${spec.source?.ignored || 'default'}), git says ${found}`)
    }

    return { ok: null, detail: 'unknown check kind: ' + k }
  }

  return evalCheck
}
