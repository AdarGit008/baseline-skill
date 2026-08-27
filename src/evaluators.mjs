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
import { readStamp, verifyVerifiable, orientEntrypointState } from './trust.mjs'

// Every check kind evalCheck() knows how to run. --self-check flags any rule referencing one not in here.
//
// `doc-code-age` still has NO consumer: CTX-11, its only rule, was deleted by the v4 cut.
// It was kept for the incoming CTX-16, and CTX-16 has now landed — not by adopting the
// kind (its subject is a plugin artifact, not a frontmatter-anchored doc) but by SHARING
// its arithmetic: both go through newestCommitAmong() below, so there is exactly one
// implementation of "the newest committer date under a glob scope" in the runner. The kind
// stays registered as the named orphan the red suite exempts by name.
//
// The five v4/ctx kinds, in rule order. Four are TRUST-CIRCLE kinds — they open with the
// membership gate, so a tool this repo never adopted can never fail its build — and the
// fifth is baseline's own wiring:
//   graph-stamp-fresh     CTX-15  graphify's VERIFIABLE stamp, recomputed against the tree
//   artifact-not-lagging  CTX-16  a tracked artifact's commit vs the newest source commit
//   stamp-not-lagging     CTX-17  a RECORDED-ONLY stamp's commit vs the same
//   frozen                CTX-18  structurally incapable of a finding (see below)
//   orient-entrypoint     CTX-19  byte-identity against the shipped entrypoint
export const CHECK_KINDS = new Set(['doc-code-age', 'any-file', 'grep', 'file-contains', 'plugin-presence',
  'graph-stamp-fresh', 'artifact-not-lagging', 'stamp-not-lagging', 'frozen', 'orient-entrypoint'])

const iso = d => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : '?')

export function makeEvalCheck({ repo, cfg }) {
  const { REPO, match, read, readText, readRaw, gitCommitISO, gitCommitDateOf } = repo
  function globsOf(c) { return c.globs_from_config ? cfg[c.globs_from_config] : (c.file_from_config ? cfg[c.file_from_config] : c.globs) }

  /** The newest git COMMITTER DATE among the files matching `globs` — the right-hand clock
   *  of every "is X lagging the code?" question in the set, and the one piece of arithmetic
   *  doc-code-age and the two v4/ctx ordering kinds share.
   *  -> { state: 'no-files'|'undated'|'ok', date, file, count, dated }
   *  Always git, never mtime: a committer date is content-derived and survives a clone,
   *  while `git clone` stamps every file's mtime with the checkout time — so an mtime
   *  comparison would read as maximally fresh on the one machine (CI) that matters most. */
  function newestCommitAmong(globs, { tracked = false } = {}) {
    const files = match(globs, { tracked })
    if (!files.length) return { state: 'no-files', date: null, file: null, count: 0, dated: 0 }
    let newest = null, at = null, dated = 0
    for (const f of files) {
      const d = gitCommitISO(f)
      if (!d) continue
      dated++
      if (!newest || d > newest) { newest = d; at = f }
    }
    if (!dated) return { state: 'undated', date: null, file: null, count: files.length, dated: 0 }
    return { state: 'ok', date: newest, file: at, count: files.length, dated }
  }

  /** The trust-circle gate the four v4/ctx member kinds open with, in one place (the same
   *  two answers plugin-presence gives, for the same reasons): an unknown plugin name is
   *  LOUD, and a supported tool this repo never adopted is n/a — a suggestion cannot fail
   *  a build. -> { spec } or { answer } to return as-is. */
  function memberGate(name) {
    const spec = pluginSpec(cfg, name)
    if (!spec) return { answer: { ok: false, detail: `rule names an unknown plugin '${name}' — the plugin table knows none by that name` } }
    if (!spec.member) return { answer: { ok: null, detail: `${name} is suggested, not adopted — it is not in this repo's trust circle, so nothing is gated (adopt it with \`baseline trust add ${name}\`)` } }
    return { spec }
  }

  /** The source scope a "not lagging" rule orders against: a config key naming a glob list.
   *  Empty/unset is n/a by design (opt-in-by-empty) — baseline cannot guess which files a
   *  derived store is meant to track, and a guess would gate CI on a guess.
   *  -> { answer } for every non-ok outcome, { newest } otherwise. */
  function sourceScope(c, what) {
    const key = String(c.sources_from_config || '')
    const globs = asArr(cfg[key])
    if (!globs.length) return { answer: { ok: null, detail: `no source scope configured — set "${key}" in baseline.config.json to the globs ${what} is meant to track, and this rule starts ordering them` } }
    const n = newestCommitAmong(globs, { tracked: true })
    if (n.state === 'no-files') return { answer: { ok: null, detail: `"${key}" resolves to no tracked file — nothing to be behind` } }
    if (n.state === 'undated') return { answer: { ok: null, detail: `the ${n.count} file(s) under "${key}" have no committer date — an uncommitted tree says nothing about whether ${what} is behind` } }
    return { newest: n, key }
  }

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
        // the shared arithmetic (see newestCommitAmong): same per-file `git log -1
        // --format=%cI`, same max, same three outcomes — only the wording is this rule's
        const n = newestCommitAmong(srcGlobs)
        if (n.state === 'no-files') { bad.push(`${f.split('/').pop()}: sources anchor resolves to no files (dangling — can't verify freshness)`); checked++; continue }
        checked++
        if (n.state === 'undated') { bad.push(`${f.split('/').pop()}: anchored source(s) not committed — can't verify freshness`); continue } // untracked code can't read as "fresh"
        const newest = n.date
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

    // ---- v4/ctx: the context system's four freshness rules, plus baseline's own wiring ----
    //
    // One law over all five: EVERY answer is a pure function of the repo's committed state,
    // so the same commit scores the same on a laptop and on a CI runner. That rules out the
    // obvious implementations — an mtime does not survive `git clone`, a derived store is
    // gitignored, an off-repo bundle is not cloned at all — and leaves exactly two kinds of
    // evidence: git's own committer dates, and the stamps baseline commits (src/trust.mjs).
    // There is no day threshold anywhere here: "behind" is an ORDERING, and a number of days
    // would be a policy baseline has no standing to pick.

    if (k === 'graph-stamp-fresh') {
      // CTX-15 — the check-pipeline face of `baseline trust verify`. graphify's graph is
      // gitignored, so CI never sees it; what CI sees is the VERIFIABLE stamp, which copies
      // the per-file content hashes graphify recorded and which baseline RECOMPUTES over the
      // tracked code files in the tree. Timestamps are never compared: hashes are, so a
      // stamp cannot assert a freshness the tree contradicts.
      //
      // Every unreadable / missing / unrecognized state is n/a and never a finding — the
      // manifest and the stamp shape are graphify's business and this baseline's own format
      // respectively, and neither is a defect of the repo under check. Verification itself
      // lives in trust.mjs; nothing here reimplements it.
      const g = memberGate(String(c.plugin || ''))
      if (g.answer) return g.answer
      const s = readStamp(REPO, c.plugin)
      if (s.error) return { ok: null, detail: `${s.rel} ${s.error} — unrecognized, so there is nothing to verify` }
      if (!s.present) return { ok: null, detail: `${c.plugin} is adopted but not stamped yet — build the graph, then \`baseline trust stamp\` and commit ${s.rel}; CI reads that file and never graphify-out/` }
      if (!s.tracked) return { ok: false, detail: `${s.rel} is not tracked — CI clones tracked files, so the stamp it would verify does not exist there; \`git add ${s.rel}\`` }
      const v = verifyVerifiable(REPO, s.data, match(['**/*'], { tracked: true }).sort())
      if (v.state === 'n/a' || v.state === 'broken') return { ok: null, detail: `${s.rel}: ${v.reason} — nothing can be recomputed, so this is not a verdict about the graph` }
      if (v.state === 'ok') return { ok: true, detail: `${v.checked} tracked code file(s) recomputed from ${s.rel} — every hash matches, so the graph is not behind the code` }
      const bits = []
      if (v.changed.length) bits.push(`${v.changed.length} changed since the graph was built (${v.changed.slice(0, 2).join(', ')})`)
      if (v.missing.length) bits.push(`${v.missing.length} stamped but no longer tracked (${v.missing.slice(0, 2).join(', ')})`)
      if (v.unstamped.length) bits.push(`${v.unstamped.length} tracked but never graphed (${v.unstamped.slice(0, 2).join(', ')})`)
      return { ok: false, detail: `the graph is behind the code: ${bits.join('; ')} — rebuild the graph, then \`baseline trust stamp\` and commit ${s.rel}` }
    }

    if (k === 'artifact-not-lagging') {
      // CTX-16 — the one member whose artifact is TRACKED, so no stamp is needed and git's
      // committer date IS the fact. Pure ordering, no threshold: the artifact's commit must
      // not PREDATE the newest commit under the configured sources. Changed in the same
      // commit means the same date, which is not earlier, so it passes — the discipline
      // this rule protects is "update the tests with the code", and doing exactly that must
      // never be a finding.
      const name = String(c.plugin || '')
      const g = memberGate(name)
      if (g.answer) return g.answer
      const rel = typeof g.spec.path === 'string' && g.spec.path.trim() ? g.spec.path.trim() : null
      if (!rel) return { ok: null, detail: `${name} has no configured artifact path — nothing to date` }
      const p = probePlugin(REPO, name, g.spec)
      if (!p.present) return { ok: null, detail: `${rel} is absent — its own rule owns that finding; freshness cannot be judged from a file that is not there` }
      const artDate = gitCommitISO(rel)
      if (!artDate) return { ok: null, detail: `${rel} has no committer date (git does not track it) — its own rule owns that finding, and an untracked artifact has no clock CI could read` }
      const sc = sourceScope(c, rel)
      if (sc.answer) return sc.answer
      const n = sc.newest
      if (artDate.getTime() >= n.date.getTime()) {
        return { ok: true, detail: `${rel} was committed ${iso(artDate)}, not before the newest of ${n.dated} tracked file(s) under "${sc.key}" (${iso(n.date)}, ${n.file}) — the test state moved with the code` }
      }
      return { ok: false, detail: `${rel} was last committed ${iso(artDate)}, but ${n.file} under "${sc.key}" moved later (${iso(n.date)}) — the code changed and the test state did not follow. Rerun the plugin and commit ${rel} in the same change as the code` }
    }

    if (k === 'stamp-not-lagging') {
      // CTX-17 — the bundle lives OUTSIDE the repo, so it cannot be read in CI at all. What
      // CI can read is the committed RECORDED stamp, which names the commit the bundle was
      // indexed at. The integrity tier is the point and it stays in the words on every
      // surface: baseline RECORDS this and cannot verify it. So the ordering below is over
      // a CLAIM SOMEONE MADE, not over a checked fact, and both verdicts say so — a passing
      // row here means "the claim is not self-evidently stale", never "the store is fresh".
      const name = String(c.plugin || '')
      const g = memberGate(name)
      if (g.answer) return g.answer
      const s = readStamp(REPO, name)
      if (s.error) return { ok: null, detail: `${s.rel} ${s.error} — unrecognized, so there is no claim to order` }
      if (!s.present) return { ok: null, detail: `${name} is adopted but not stamped yet — index the bundle, then \`baseline trust stamp --member ${name}\` and commit ${s.rel}; CI clones tracked files and never sees the bundle itself` }
      if (!s.tracked) return { ok: false, detail: `${s.rel} is not tracked — CI never sees the one file that carries this claim; \`git add ${s.rel}\`` }
      const at = typeof s.data.recorded_at === 'string' ? s.data.recorded_at : null
      if (!at) return { ok: null, detail: `${s.rel} records no commit — nothing to order against` }
      const rec = gitCommitDateOf(at)
      if (!rec) return { ok: null, detail: `${s.rel} records commit ${at}, which is not in this history (a shallow clone, or a claim about another repo) — RECORDED ONLY, and not orderable here` }
      const sc = sourceScope(c, `the ${name} bundle`)
      if (sc.answer) return sc.answer
      const n = sc.newest
      if (rec.getTime() >= n.date.getTime()) {
        return { ok: true, detail: `RECORDED ONLY (baseline cannot verify this — it is a claim someone made): ${name} is recorded as indexed at ${at} (${iso(rec)}), which is not behind the newest of ${n.dated} tracked file(s) under "${sc.key}" (${iso(n.date)})` }
      }
      return { ok: false, detail: `${name} is recorded as indexed at ${at} (${iso(rec)}) — a RECORDED-ONLY claim baseline cannot verify — but ${n.file} under "${sc.key}" was committed later (${iso(n.date)}), so even the claim is behind the code. Re-index, then \`baseline trust stamp --member ${name}\` and commit ${s.rel}` }
    }

    if (k === 'frozen') {
      // CTX-18 — a FROZEN rule: declared so the roster is honest about a tool that does not
      // exist yet, and structurally incapable of a verdict until it does. It always answers
      // ok:null, which the engine renders as an n/a row: nothing in the human report, and
      // state "n/a" with this reason in --json. That is why the rule carries NO severity
      // (src/selfcheck.mjs): "blocker" would be an empty claim about a check that cannot
      // fire, and "warn" would be a lie about a tier this rule set does not have.
      const name = String(c.plugin || '')
      return { ok: null, detail: `${name} does not exist yet — this rule is FROZEN: it is declared so the trust circle is honest about the tool, carries no severity, and can produce no verdict until there is something to check (${String(c.why || 'fail-silent by decision')})` }
    }

    if (k === 'orient-entrypoint') {
      // CTX-19 — baseline's OWN wiring, and the one rule here that is not about a plugin
      // (so it belongs to the baseline rules layer, not the trust circle). IDENTITY, not
      // existence: the committed entrypoint must be BYTE-IDENTICAL to the one this baseline
      // ships, because "a script called orient.sh is here" proves nothing while "this repo
      // opens the way every baseline-activated repo opens" is the fact worth having.
      // The comparison target and the version skew wording live in src/trust.mjs, beside
      // `baseline trust wire`, which is what installs the file in the first place.
      const s = orientEntrypointState(REPO)
      if (s.state === 'n/a') return { ok: null, detail: s.reason }
      if (s.state === 'ok') return { ok: true, detail: s.reason }
      return { ok: false, detail: s.reason }
    }

    return { ok: null, detail: 'unknown check kind: ' + k }
  }

  return evalCheck
}
