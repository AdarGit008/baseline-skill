// The ~28 declarative check kinds. makeEvalCheck(ctx) closes over the repo index,
// resolved config, and run flags; evalCheck(c, rule) -> {ok:true|false|null, detail, soft?, signoff?}.
// ok:null means "not evaluable here" and always tags SKIP — one broken rule can't take down the run.
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { DAY, asArr, parseDate, daysAgo, getPath, reOf, nonEmpty, stripLineComment, isAdrFile, statusOf, FRONTMATTER_RE, nowUTC, globToRe } from './util.mjs'
import { DESCRIPTOR_FILE } from './descriptor.mjs'
import { scan, loadAllowlist } from './scrub.mjs'
import { loadClaims, CLAIM_RECORD_GLOB } from './claims.mjs'

// Every check kind evalCheck() knows how to run. --self-check flags any rule referencing one not in here.
export const CHECK_KINDS = new Set(['any-of', 'implies', 'workflow-permissions', 'doc-code-age', 'any-file', 'grep', 'file-contains', 'json-field', 'command', 'status-stamp', 'adr-status', 'adr-forward-link', 'config-nonempty', 'required-files', 'doc-freshness', 'md-links', 'path-integrity', 'version-consistency', 'dockerfile-digest', 'claims-field', 'claims-citations', 'signoff', 'descriptor', 'records-append-only', 'records-scrub', 'records-one-home', 'branch-session-record', 'branch-atomicity'])

export function makeEvalCheck({ repo, cfg, NO_EXEC, SIGNOFF, JDGS, DESCRIPTOR, BRANCH = null, DEFAULT_BRANCH = null }) {
  const { REPO, FILES, HEAD, match, read, readText, readRaw, gitCommitISO, gitObjExists, gitIsAncestor, gitLag, gitIsShallow, gitNameStatus, gitDiffNames, gitBlobAt, gitCatFile } = repo
  // The lane rules diff against where the branch diverged: the descriptor-declared
  // default branch, preferring whichever of local/origin twin is NEWER (a stale
  // local default widens the branch diff with upstream-authored commits); an
  // undeclared or unresolvable base is a SKIP (never a guess against a wrong base).
  function baseRef() {
    if (!DEFAULT_BRANCH) return null
    const local = gitObjExists(`${DEFAULT_BRANCH}^{commit}`) ? DEFAULT_BRANCH : null
    const remote = gitObjExists(`origin/${DEFAULT_BRANCH}^{commit}`) ? `origin/${DEFAULT_BRANCH}` : null
    if (local && remote) return gitIsAncestor(local, remote) === 0 ? remote : local
    return local || remote
  }
  // one clock (util.nowUTC): the override is parsed + ISO-normalized so a
  // non-ISO-but-parseable BASELINE_LOG_NOW can't turn expiry comparisons into
  // lexicographic garbage; unparseable falls back to the wall clock — a scoring
  // run degrades to real time rather than crashing or silently lying
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

    if (k === 'json-field') {
      const files = match(globsOf(c))
      if (!files.length) return { ok: null, detail: 'no ' + asArr(globsOf(c)).slice(0, 2).join('/') + ' present' }
      for (const f of files) {
        const t = read(f); if (!t) continue
        let data; try { data = JSON.parse(t) } catch { return { ok: false, detail: `${f} is not valid JSON` } }
        const v = getPath(data, c.path)
        if (c.assert === 'true') { if (v === true) return { ok: true, detail: `${f}: ${c.path}=true` } }
        else if (c.assert === 'nonempty') { if (nonEmpty(v)) return { ok: true, detail: `${f}: ${c.path} set` } }
        else if (c.assert === 'present') { if (v !== undefined && v !== null) return { ok: true, detail: `${f}: ${c.path} present` } }
        else if (c.equals !== undefined) { if (v === c.equals) return { ok: true, detail: `${f}: ${c.path}=${v}` } }
      }
      return { ok: false, detail: `${c.path} not satisfied in ${files.slice(0, 2).join(', ')}` }
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

    if (k === 'status-stamp') {
      const f = cfg[c.file_from_config]
      // an unhonored opt-out (engine let it through: no valid descriptor) fails with the fix, not "missing: false"
      if (f === false) return { ok: false, detail: `${c.file_from_config}:false is honored only with a valid ${DESCRIPTOR_FILE} present (orient replaces the status file)` }
      const t = f && read(f); if (!t) return { ok: false, detail: `status file missing: ${f}` }
      const m = t.match(new RegExp(c.stamp_key + '\\s*[:=]\\s*([^\\n]+)', 'i'))
      if (!m) return { ok: false, detail: `no '${c.stamp_key}:' stamp in ${f}` }
      const val = m[1].trim()
      if (!c.match_head) return { ok: true, detail: `stamped: ${val.slice(0, 40)}` }
      const hexes = val.match(/\b[0-9a-f]{7,40}\b/g) || []
      if (!hexes.length) return { ok: false, detail: `stamp has no commit SHA (got '${val.slice(0, 30)}') — can't verify freshness` }
      if (!HEAD) return { ok: true, detail: `stamped ${hexes[0].slice(0, 8)} (no git — freshness not verifiable)` }
      // shallow clone (CI fetch-depth:1) can't resolve ancestry — accept a present stamp as unverifiable-but-fresh
      if (gitIsShallow()) return { ok: true, detail: `stamped ${hexes[0].slice(0, 8)} (shallow clone — freshness not verifiable)` }
      // a compact date is hex-valid too — pick the hex that names a real commit, else the first
      const sha = hexes.find(h => gitObjExists(`${h}^{commit}`)) || hexes[0]
      const maxLag = cfg.stamp_max_lag_commits ?? 3
      if (HEAD.startsWith(sha.slice(0, 7)) || sha.startsWith(HEAD)) return { ok: true, detail: `stamped ${sha.slice(0, 8)} (HEAD)` }
      // A stamp can't name the commit that contains it, so accept a RECENT ANCESTOR as fresh.
      if (gitIsAncestor(sha) !== 0) return { ok: false, detail: `bogus: stamp ${sha.slice(0, 8)} is not an ancestor of HEAD ${HEAD} — points outside this history` } // BLOCKER
      const lag = gitLag(sha)
      if (lag != null && lag > maxLag) return { ok: false, soft: true, detail: `stale: stamp ${lag} commits behind HEAD (max ${maxLag}) — reconcile` } // WARN: honest but old
      return { ok: true, detail: `stamped ${sha.slice(0, 8)} (${lag ?? '?'} behind HEAD, within ${maxLag})` }
    }

    if (k === 'adr-status') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const allowed = /(proposed|accepted|superseded|deprecated|rejected|amended|draft|active)/i
      const bad = []
      for (const f of files) {
        const t = read(f) || ''
        const st = statusOf(t)
        if (!st || !allowed.test(st)) { bad.push(`${f.split('/').pop()}: no/invalid Status`); continue }
        if (/superseded|deprecated|replaced/i.test(st) && !/supersed(ed)?\s*by|replaced\s*by|→\s*adr|see\s+adr/i.test(t)) bad.push(`${f.split('/').pop()}: superseded w/o forward link`)
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${files.length} decision doc(s) ok` }
    }

    if (k === 'adr-forward-link') {
      const files = match(cfg[c.globs_from_config]).filter(isAdrFile); if (!files.length) return { ok: null, detail: 'no numbered ADR files found' }
      const bad = []
      for (const f of files) {
        const t = read(f) || ''
        const sm = t.match(/supersed(?:ed)?\s*by[^\n]*?(?:adr[- ]?)?(\d{1,4})/i)
        if (!sm) continue
        const n = sm[1]
        const padded = new Set([n, n.padStart(2, '0'), n.padStart(3, '0'), n.padStart(4, '0')])
        const found = files.some(g => { const base = g.split('/').pop(); const nums = base.match(/\d{1,4}/); return nums && (padded.has(nums[0]) || padded.has(String(parseInt(nums[0], 10)))) && g !== f })
        if (!found) bad.push(`${f.split('/').pop()} → ADR ${n} (no such file)`)
      }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `forward-links resolve` }
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
      const files = match(globsOf(c))
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
      if (!files.length) return { ok: null, detail: 'no Dockerfile' }
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
      // dual-read (M4c): exploded records/claims/CLM-*.json + the legacy monolith,
      // records shadowing migrated legacy ids — one merged set, one verdict.
      const loaded = loadClaims(repo, cfg)
      if (loaded.errors.length) return { ok: false, detail: loaded.errors.slice(0, 2).join('; ') + (loaded.errors.length > 2 ? ` (+${loaded.errors.length - 2})` : '') }
      let claims = loaded.claims
      if (!claims.length) return { ok: false, detail: loaded.legacyPresent ? `claims register is empty: ${cfg.claims_file}` : `no claims found (${cfg.claims_file} or ${CLAIM_RECORD_GLOB})` }
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

    if (k === 'signoff') {
      // the unified ledger first (M4b): a kind=sign-off JDG whose subject is this
      // rule id satisfies it while unexpired — a lapsed one is honestly NOT signed.
      // Legacy signoff.json keeps its exact V1 semantics + detail until M7.
      const j = JDGS && JDGS[rule.id]
      if (j) {
        if (j.review_by < TODAY) return { ok: false, detail: `sign-off ${j.id} lapsed (review_by ${j.review_by}) — re-judge: baseline jdg new`, signoff: true }
        return { ok: true, detail: `${j.id} by ${j.by} ${j.date} (review by ${j.review_by})` }
      }
      const e = SIGNOFF[rule.id]; if (e && e.date) return { ok: true, detail: `signed ${e.by || '?'} ${e.date}` }
      return { ok: false, detail: 'no sign-off recorded', signoff: true }
    }

    if (k === 'records-append-only') {
      // REC-01 (C12/CF7): prove from history that committed records were never edited.
      // Layer 1: any modify/delete/rename event under the scope is a finding (MDR).
      // Layer 2 (the evil-merge holes MDR can't see, because plain `git log` shows no
      // file changes for merge commits): (a) a path that was Added but neither exists
      // now nor has a D/R disposal event vanished inside a merge; (b) a still-present
      // path with no M/R event whose HEAD blob matches NO add-blob was edited inside
      // a merge. "Introduction" is deliberately the SET of add-blobs across full
      // history (--full-history: a side-branch-only add is invisible to the default
      // simplified walk, and two lanes adding the same path then resolving to one
      // side must not read as an edit). Deterministic; shallow history is a SKIP.
      const scope = c.path || 'records/'
      if (!HEAD) return { ok: null, detail: 'no commit history here (not a git repo, or no commits yet)' }
      if (gitIsShallow()) return { ok: null, detail: 'shallow clone — history truncated, append-only not provable' }
      const mdr = gitNameStatus('MDR', scope, { fullHistory: true })
      const adds = gitNameStatus('A', scope, { fullHistory: true })
      if (mdr === null || adds === null) return { ok: null, detail: 'git history unreadable' }
      const current = new Set(match([scope + '**'], { tracked: true }))
      if (!adds.length && !mdr.length && !current.size) return { ok: null, detail: `no committed records under ${scope} yet` }
      const bad = mdr.map(e => `${e.sha.slice(0, 7)} ${e.status === 'M' ? 'edited' : e.status === 'D' ? 'deleted' : 'renamed'} ${e.to || e.path}`)
      const touched = new Set(mdr.map(e => e.path))
      const addBlobs = new Map() // path -> Set of blob shas at each add
      for (const e of adds) { const b = gitBlobAt(e.sha, e.path); if (b) { if (!addBlobs.has(e.path)) addBlobs.set(e.path, new Set()); addBlobs.get(e.path).add(b) } }
      for (const [p, blobs] of addBlobs) {
        if (!current.has(p)) { if (!mdr.some(e => (e.status === 'D' || e.status === 'R') && e.path === p)) bad.push(`${p} vanished with no recorded delete (merge-hidden?)`); continue }
        if (touched.has(p)) continue // already reported above
        const now = gitBlobAt('HEAD', p)
        if (now && blobs.size && !blobs.has(now)) bad.push(`${p} content differs from its introduction with no recorded edit (merge-hidden?)`)
      }
      return { ok: bad.length === 0, detail: bad.length ? `${bad.length} mutation(s): ` + bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') : `${current.size} record(s), history append-only` }
    }

    if (k === 'records-scrub') {
      // REC-02 (C34): re-scan LANDED records with the one scan API the write gate
      // uses — blob content at HEAD, not the worktree ("what landed" must give the
      // same verdict on a dirty tree and in CI, or M7's promotion to blocker breaks
      // reproducibility). Deterministic signatures fail the rule (warn now; M7's
      // promotion is a pure severity flip); heuristic findings are soft — they stay
      // WARN even at blocker. A blob we cannot read is surfaced as unscanned, never
      // folded into the clean count.
      const files = match(c.globs || ['records/**'], { tracked: true })
      if (!files.length) return { ok: null, detail: 'no committed records to scan' }
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
      const unscannedNote = unscanned.length ? ` — ${unscanned.length} record(s) UNSCANNED at HEAD (${unscanned.slice(0, 2).join(', ')}${unscanned.length > 2 ? ', …' : ''})` : ''
      if (det.length) return { ok: false, detail: `deterministic secret shape(s): ` + det.slice(0, 3).join('; ') + (det.length > 3 ? ` (+${det.length - 3})` : '') + unscannedNote }
      if (heu.length) return { ok: false, soft: true, detail: `heuristic finding(s): ` + heu.slice(0, 3).join('; ') + (heu.length > 3 ? ` (+${heu.length - 3})` : '') + unscannedNote }
      if (unscanned.length) return { ok: false, soft: true, detail: `${scanned} scanned clean, but${unscannedNote.slice(3)}` }
      return { ok: true, detail: `${scanned} record(s) scrub-clean at HEAD` + (allowed ? ` (${allowed} allowlisted)` : '') }
    }

    if (k === 'records-one-home') {
      // REC-04 (C09, pinned warn-only per CF10): the same fact must not live in two
      // record homes — duplicate ids/slugs across record files, or the session
      // narrative kept in both the V2 home and the legacy prototype home.
      const bad = []
      const seen = new Map() // key -> first file
      const claim = (key, f) => { const prev = seen.get(key); if (prev && prev !== f) bad.push(`${key} in both ${prev} and ${f}`); else seen.set(key, f) }
      let any = false, unparseable = 0
      for (const [kind, glob] of [['JDG', 'records/judgments/*.json'], ['CLM', 'records/claims/*.json']]) {
        for (const f of match([glob])) {
          any = true
          const raw = read(f); if (raw == null) continue
          // BOM-tolerant: a BOM-prefixed duplicate must not escape the cross-check;
          // still-unparseable files are counted, not silently waved through
          let obj; try { obj = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { unparseable++; continue }
          if (obj.id) claim(`${kind} ${obj.id}`, f)
          if (kind === 'CLM' && obj.slug) claim(`slug '${obj.slug}'`, f)
        }
      }
      for (const f of match(cfg.decision_globs)) {
        const m = f.split('/').pop().match(/^ADR-?(\d{1,4})/i)
        if (m) { any = true; claim(`ADR ${String(parseInt(m[1], 10))}`, f) }
      }
      const v2Sessions = match(['records/sessions/**']), legacySessions = match(['docs/session-log/**'])
      if (v2Sessions.length || legacySessions.length) any = true
      if (v2Sessions.length && legacySessions.length) bad.push(`session narrative has two homes (records/sessions/ and docs/session-log/)`)
      if (!any) return { ok: null, detail: 'no records to cross-check' }
      const unpNote = unparseable ? ` (${unparseable} unparseable file(s) not cross-checked)` : ''
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') + (bad.length > 3 ? ` (+${bad.length - 3})` : '') + unpNote : 'every record fact has one home' + unpNote }
    }

    if (k === 'branch-session-record') {
      // FLOW-02 (C14): work on a lane carries its own session record — the forensic
      // tier rides the same PR as the change it describes. Engine gates guarantee
      // this only runs on a non-default branch of a declared multi-lane repo.
      const base = baseRef()
      if (!base) return { ok: null, detail: `default branch '${DEFAULT_BRANCH}' not resolvable locally — lane coupling not provable` }
      const changed = gitDiffNames(`${base}...HEAD`, null)
      if (changed === null) return { ok: null, detail: `diff ${base}...HEAD failed — lane coupling not provable` }
      // a freshly-cut lane with no work yet has nothing for a record to describe —
      // the record couples to the merge, not to branch creation (ceremony thinnest
      // where value is thinnest)
      if (!changed.length) return { ok: null, detail: 'no work on this branch yet — nothing for a record to describe' }
      const added = gitDiffNames(`${base}...HEAD`, `records/sessions/${BRANCH}/`, { addedOnly: true })
      if (added === null) return { ok: null, detail: `diff ${base}...HEAD failed — lane coupling not provable` }
      return { ok: added.length > 0, detail: added.length ? `${added.length} session record(s) ride this lane` : `no session record for lane '${BRANCH}' — write one: baseline log -m "..." --next "..."` }
    }

    if (k === 'branch-atomicity') {
      // FLOW-06 (C14/C26, heuristic per CF9): a branch changing a gated subject
      // should carry the corresponding record in the same range — same-PR atomicity.
      const base = baseRef()
      if (!base) return { ok: null, detail: `default branch '${DEFAULT_BRANCH}' not resolvable locally` }
      const changed = gitDiffNames(`${base}...HEAD`, null)
      if (changed === null) return { ok: null, detail: `diff ${base}...HEAD failed` }
      const hits = globs => { const res = asArr(globs).map(globToRe); return changed.some(f => res.some(re => re.test(f))) }
      const bad = []; let triggered = 0
      for (const p of (c.pairs || [])) {
        if (!hits(p.if_changed)) continue
        triggered++
        if (!hits(p.expect)) bad.push(p.note || `${asArr(p.if_changed).join(',')} changed without ${asArr(p.expect).join(',')}`)
      }
      if (!triggered) return { ok: null, detail: 'no gated subject changed on this branch' }
      return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 2).join('; ') : `${triggered} gated change(s) carry their record` }
    }

    if (k === 'descriptor') {
      const d = DESCRIPTOR
      if (!d || !d.present) return { ok: false, soft: true, detail: `no ${DESCRIPTOR_FILE} — the repo doesn't declare itself (type/lifecycle/maturity/owner/workflow); scaffold it with init` }
      if (!d.valid) return { ok: false, detail: `${DESCRIPTOR_FILE} invalid: ${d.errors.slice(0, 2).join('; ')}${d.errors.length > 2 ? ` (+${d.errors.length - 2} more)` : ''}` }
      const x = d.data
      return { ok: true, detail: `type=${x.type} · ${x.lifecycle}/${x.maturity} · workflow=${x.workflow} · anchoring=${x.anchoring}` }
    }

    return { ok: null, detail: 'unknown check kind: ' + k }
  }

  return evalCheck
}
