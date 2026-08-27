// The declarative check kinds (CHECK_KINDS is the registry; --self-check derives the
// count). makeEvalCheck(ctx) closes over the repo index, resolved config, and run flags;
// evalCheck(c, rule) -> {ok:true|false|null, detail, soft?}.
// ok:null means "not evaluable here" and resolves to an n/a row (v3 D4) — one broken rule can't take down the run.
//
// v4 rule-set cut: 23 kinds went with the rules they served (the adr/claims/descriptor/
// forge families, the combinators any-of and implies, and every heuristic doc/CI reader).
// What is left is what the surviving eight rules read plus one deliberate orphan.
import { DAY, asArr, reOf, FRONTMATTER_RE, nowUTC } from './util.mjs'
import { pluginSpec, probePlugin, gitMatches, expectationWord, pluginLogRel, writePluginLog, removePluginLog } from './plugins.mjs'

// Every check kind evalCheck() knows how to run. --self-check flags any rule referencing one not in here.
//
// `doc-code-age` has NO consumer in the v4 rule set: CTX-11, its only rule, was deleted.
// It is kept on purpose — the incoming CTX-16 (tdd freshness) is exactly this git-date
// arithmetic (compare a committed artifact's commit date against the newest commit under
// its declared sources), so the ordering logic is preserved rather than rewritten. Delete
// it only if CTX-16 is abandoned.
export const CHECK_KINDS = new Set(['doc-code-age', 'any-file', 'grep', 'file-contains', 'plugin-presence'])

export function makeEvalCheck({ repo, cfg }) {
  const { REPO, match, read, readText, readRaw, gitCommitISO } = repo
  function globsOf(c) { return c.globs_from_config ? cfg[c.globs_from_config] : (c.file_from_config ? cfg[c.file_from_config] : c.globs) }

  function evalCheck(c, rule) {
    const k = c.kind

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

    // ---- v3 §11 the plugin boundary (D6–D10, V38–V41) — the PLUG family's one kind. ----

    if (k === 'plugin-presence') {
      // Metadata only (D7): the probe asks whether the artifact exists, what it is, how old
      // it is and what git says of it — never what is in it. On a FAIL the log under
      // .baseline/log/<PREFIX>.log records the path, the config values with their source
      // and git's answer (D10); a PASS removes a stale one. The install command is printed,
      // never run (D6).
      //
      // v4 MEMBERSHIP is the first question, asked before the probe. baseline SUPPORTS
      // every plugin in the table but this repo has ADOPTED only the ones its config names
      // (repo.mjs `member`). A tool it never adopted is a SUGGESTION: n/a, excluded from
      // the AND-gate, no log, never a finding — which is the enabler property stated as
      // code. A member is the opposite: the repo asked for this gate, so a missing artifact
      // is a blocker. Absent-and-not-a-member is n/a; member-and-missing fails the build.
      const name = String(c.plugin || '')
      const spec = pluginSpec(cfg, name)
      const install = String(c.install || '').trim()
      if (!spec) return { ok: false, detail: `rule names an unknown plugin '${name}' — the plugin table knows none by that name` }
      if (!spec.member) {
        // a suggestion leaves no trace: any log an earlier membership left behind is stale
        removePluginLog(REPO, rule.id)
        return { ok: null, detail: `${name} is suggested, not adopted — it is not in this repo's trust circle, so nothing is gated (adopt it with \`baseline trust add ${name}\`)` }
      }
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
        `member: yes — baseline.config.json plugins.${name} names it, so this rule gates`,
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
