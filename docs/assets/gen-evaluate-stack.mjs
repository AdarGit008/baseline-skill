#!/usr/bin/env node
// Generates docs/assets/evaluate-stack-{light,dark}.svg — the README "evaluate stack" board.
// Deterministic (seeded wobble): re-running produces byte-identical SVGs, so diffs stay honest.
// Usage: node docs/assets/gen-evaluate-stack.mjs
import fs from 'node:fs'
import path from 'node:path'

const W = 1440, H = 1265
const HAND = 'Segoe Print, Bradley Hand, Chalkboard SE, Comic Sans MS, Comic Neue, cursive, sans-serif'
const MONO = 'ui-monospace, Menlo, Consolas, monospace'

// ---------- seeded rng + hand-drawn primitives ----------
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const f1 = n => Math.round(n * 10) / 10

function wobblyRectPath(x, y, w, h, rng, amp = 1.7) {
  const pts = []
  const edge = (x1, y1, x2, y2) => { const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 60)); for (let i = 0; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + (rng() * 2 - 1) * amp, y1 + (y2 - y1) * t + (rng() * 2 - 1) * amp]) } }
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y)
  return 'M' + pts.map(p => `${f1(p[0])},${f1(p[1])}`).join(' L') + ' Z'
}
function wobblyCirclePath(cx, cy, r, rng, amp = 1.2) {
  const pts = []
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const rr = r + (rng() * 2 - 1) * amp; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]) }
  return 'M' + pts.map(p => `${f1(p[0])},${f1(p[1])}`).join(' L') + ' Z'
}
function roughRect(x, y, w, h, { fill, stroke, sw = 2.4, rot = 0, dash = null, opacity = 1 }, rng) {
  const d = wobblyRectPath(x, y, w, h, rng)
  const tr = rot ? ` transform="rotate(${rot} ${f1(x + w / 2)} ${f1(y + h / 2)})"` : ''
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity < 1 ? ` opacity="${opacity}"` : ''}${tr}/>`
}
function handLine(x1, y1, x2, y2, { stroke, sw = 2.4, dash = null, bend = 6 }, rng) {
  const mx = (x1 + x2) / 2 + (rng() * 2 - 1) * bend, my = (y1 + y2) / 2 + (rng() * 2 - 1) * bend
  return `<path d="M${f1(x1)},${f1(y1)} Q${f1(mx)},${f1(my)} ${f1(x2)},${f1(y2)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
}
function arrowHead(x, y, angle, { stroke, sw = 2.4, len = 11 }) {
  const a1 = angle + 2.6, a2 = angle - 2.6
  return `<path d="M${f1(x + Math.cos(a1) * len)},${f1(y + Math.sin(a1) * len)} L${f1(x)},${f1(y)} L${f1(x + Math.cos(a2) * len)},${f1(y + Math.sin(a2) * len)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
}
function handArrow(x1, y1, x2, y2, opts, rng) { return handLine(x1, y1, x2, y2, opts, rng) + arrowHead(x2, y2, Math.atan2(y1 - y2, x1 - x2), opts) }
function text(x, y, s, { size = 15, fill, weight = 'normal', anchor = 'start', family = HAND, spacing = null, opacity = 1 }) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}${opacity < 1 ? ` opacity="${opacity}"` : ''}>${esc(s)}</text>`
}
function lines(x, y, arr, { size = 14.5, lh = 20, ...rest }) { return arr.map((s, i) => text(x, y + i * lh, s, { size, ...rest })).join('\n') }
function sticky(x, y, w, h, { fill, stroke, rot = -1.6 }, rng) {
  const fold = 16
  const body = wobblyRectPath(x, y, w, h, rng)
  return `<g transform="rotate(${rot} ${f1(x + w / 2)} ${f1(y + h / 2)})">` +
    `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M${f1(x + w - fold)},${f1(y + h)} L${f1(x + w)},${f1(y + h - fold)} L${f1(x + w - fold)},${f1(y + h - fold)} Z" fill="${stroke}" opacity="0.35"/></g>`
}

// ---------- palettes ----------
const PALETTES = {
  light: {
    bg: '#FBF9F3', ink: '#2E2E36', soft: '#6E6E79', faint: '#7A7A85',
    layers: [
      { fill: '#EDEFFD', stroke: '#5C61C9', text: '#383D96' },
      { fill: '#F5ECFC', stroke: '#9038D8', text: '#6B21A8' },
      { fill: '#FDF3E0', stroke: '#D28309', text: '#8A4B06' },
      { fill: '#E7F9F4', stroke: '#0E9384', text: '#0F5E56' },
      { fill: '#F0F1F3', stroke: '#71767F', text: '#3E434C' },
    ],
    sticky: { fill: '#FFF1A8', stroke: '#C9A92C', text: '#584D14' },
    v2sticky: { fill: '#DDF0FF', stroke: '#4C93CE', text: '#14506E' },
    red: '#C92A2A', green: '#1F9D4D', blue: '#2E6FD8', amber: '#C07A08', gray: '#7C828C',
    chipFill: '#FFFFFF', traceFill: '#FFFFFF', traceOp: 0.55,
  },
  dark: {
    bg: '#0D1117', ink: '#E7E9EE', soft: '#A6ACB8', faint: '#7B818C',
    layers: [
      { fill: '#1C2044', stroke: '#8F94F2', text: '#C9CCFF' },
      { fill: '#2B1A40', stroke: '#C77DFF', text: '#E4CBFF' },
      { fill: '#38290F', stroke: '#F0A32F', text: '#FFD98A' },
      { fill: '#0E2E29', stroke: '#2FB5A5', text: '#9FE8DD' },
      { fill: '#22262C', stroke: '#8B919B', text: '#C8CDD5' },
    ],
    sticky: { fill: '#3B3417', stroke: '#C7AA3A', text: '#EFDF9C' },
    v2sticky: { fill: '#122B3D', stroke: '#4C9BD8', text: '#A8D5F5' },
    red: '#F26D6D', green: '#4CC272', blue: '#6EA8FE', amber: '#F0A32F', gray: '#9AA0AB',
    chipFill: '#161B22', traceFill: '#161B22', traceOp: 0.6,
  },
}

// ---------- content ----------
const LAYERS = [
  { nick: 'THE CLI', file: 'check.mjs · 44 lines', role: 'the only entry point', knows: ['flags: --repo · --json · --no-exec', 'loads rules.json — the 69-rule', 'standard, as pure data'], never: ['what any rule means'] },
  { nick: 'THE JUDGE', file: 'engine.mjs · 21 lines', role: 'gate → evaluate → tag', knows: ['3 gates: wrong type? profile off?', 'opted out? → SKIP, never punished', 'the tag ladder + severity'], never: ['how anything is checked'] },
  { nick: 'THE LAB', file: 'evaluators.mjs · 21 kinds', role: 'facts only', knows: ['how to verify each claim: grep,', 'any-file, json-field, command,', 'signoff… (any-of & implies recurse)'], never: ['severity, or what happens', 'to its result'] },
  { nick: 'THE SENSES', file: 'repo.mjs · 64 lines', role: 'the repo index, built once', knows: ['find: match(globs) · read: 3', 'paranoia levels · ask git: age,', 'ancestry, lag behind HEAD'], never: ['what a “rule” even is'] },
  { nick: 'THE WORLD', file: 'node:fs + git', role: 'the only true things', knows: ['bytes on disk', 'the git object database'], never: ['everything above'] },
]
const WAISTS = [
  { code: 'runRules(rules, cfg, evalCheck)', note: 'the standard + the resolved config, handed down' },
  { code: 'evalCheck(check, rule) → { ok: true | false | null, detail }', note: 'narrow waist #1 — the entire judge ↔ lab interface' },
  { code: 'match · read · readText · readRaw · git*', note: 'narrow waist #2 — all the lab ever sees of a repo' },
  { code: `readFileSync · execFile('git', …)`, note: 'argv only, no shell strings — a hostile repo can’t inject' },
]
const STEPS = [
  { main: 'SEC-01 loaded — severity: blocker', note: 'the rule is data; the CLI doesn’t interpret it' },
  { main: 'gates pass → try { evalCheck(check, rule) }', note: 'a crashing check degrades to SKIP — never a false FAIL' },
  { main: 'kind: grep — credential regex, mode: “absent”', note: 'pass only if NOTHING matches' },
  { main: 'readRaw(“.env”) — the paranoid read', note: 'big & binary files not skipped: secrets hide there' },
  { main: 'AWS_SECRET_ACCESS_KEY=wJalrXUtn…', note: 'a planted fake key in the node-fail fixture' },
]
const CHIPS = [
  { tag: 'SKIP', sub: ['couldn’t judge —', 'not held against you'], ck: 'gray' },
  { tag: 'PASS', sub: ['checked,', 'it’s fine'], ck: 'green' },
  { tag: 'SIGN-OFF', sub: ['a human judged it,', 'dated + on record'], ck: 'blue' },
  { tag: 'WARN', sub: ['real shortfall,', 'doesn’t block'], ck: 'amber' },
  { tag: 'FAIL', sub: ['blockers only', '→ exit 1'], ck: 'red' },
]

// ---------- the board ----------
function board(p) {
  const rng = rngOf(20260710)
  const o = []
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">`)
  o.push(`<title id="t">How /baseline decides — the evaluate stack</title>`)
  o.push(`<rect width="${W}" height="${H}" fill="${p.bg}"/>`)

  // header
  o.push(text(36, 66, 'How /baseline decides', { size: 36, weight: 'bold', fill: p.ink }))
  o.push(text(36, 98, 'five layers turn a repository into an exit code — each layer knows less than the one above it', { size: 17, fill: p.soft }))
  o.push(roughRect(880, 36, 524, 40, { fill: 'none', stroke: p.faint, sw: 1.8 }, rng))
  o.push(text(1142, 62, 'node check.mjs --repo <path>  →  69 rules  →  scorecard  →  exit code', { size: 14, fill: p.soft, family: MONO, anchor: 'middle' }))

  // vertical margin note
  o.push(`<g transform="rotate(-90 20 520)">` + text(20, 520, '↓ questions go down · facts come up ↑', { size: 13, fill: p.faint, anchor: 'middle' }) + `</g>`)

  // layer bands + waists
  const BX = 36, BW = 850, BH = 112, Y0 = 136, GAP = 46
  const bandY = i => Y0 + i * (BH + GAP)
  LAYERS.forEach((L, i) => {
    const y = bandY(i), cy = y + BH / 2, c = p.layers[i]
    o.push(roughRect(BX, y, BW, BH, { fill: c.fill, stroke: c.stroke, sw: 2.8, rot: i % 2 ? 0.25 : -0.25 }, rng))
    o.push(`<path d="${wobblyCirclePath(BX + 42, cy, 21, rng)}" fill="none" stroke="${c.stroke}" stroke-width="2.6"/>`)
    o.push(text(BX + 42, cy + 7, `L${i + 1}`, { size: 19, weight: 'bold', fill: c.text, anchor: 'middle' }))
    o.push(text(BX + 78, cy - 14, L.nick, { size: 21, weight: 'bold', fill: c.text }))
    o.push(text(BX + 78, cy + 10, L.file, { size: 12.5, fill: c.text, family: MONO, opacity: 0.85 }))
    o.push(text(BX + 78, cy + 32, L.role, { size: 12.5, fill: c.text, opacity: 0.8 }))
    o.push(text(BX + 352, y + 26, 'KNOWS', { size: 11, fill: c.stroke, spacing: '2', weight: 'bold' }))
    o.push(lines(BX + 352, y + 48, L.knows, { size: 14, lh: 19.5, fill: c.text }))
    o.push(sticky(BX + 638, y + 14, 196, 84, { fill: p.sticky.fill, stroke: p.sticky.stroke, rot: i % 2 ? 1.8 : -1.8 }, rng))
    o.push(text(BX + 652, y + 38, 'never knows:', { size: 11.5, fill: p.sticky.text, weight: 'bold' }))
    o.push(lines(BX + 652, y + 58, L.never, { size: 13, lh: 18, fill: p.sticky.text }))
    // waist hourglass to next band
    if (i < 4) {
      const gy = y + BH, cx = 210
      o.push(`<path d="M${cx - 34},${f1(gy + 2)} L${cx - 9},${f1(gy + GAP / 2)} L${cx - 34},${f1(gy + GAP - 2)} M${cx + 34},${f1(gy + 2)} L${cx + 9},${f1(gy + GAP / 2)} L${cx + 34},${f1(gy + GAP - 2)}" fill="none" stroke="${p.faint}" stroke-width="2.2" stroke-linecap="round"/>`)
      o.push(arrowHead(cx, gy + GAP - 6, -Math.PI / 2, { stroke: p.faint, sw: 2, len: 8 }))
      o.push(handLine(cx, gy + 6, cx, gy + GAP - 6, { stroke: p.faint, sw: 2, bend: 2 }, rng))
      o.push(text(270, gy + 20, WAISTS[i].code, { size: 13.5, fill: p.ink, family: MONO }))
      o.push(text(270, gy + 38, WAISTS[i].note, { size: 13, fill: p.soft }))
    }
  })

  // trace column
  const TX = 915, TW = 489, TY = 136, TH = 744
  o.push(roughRect(TX, TY, TW, TH, { fill: p.traceFill, stroke: p.ink, sw: 2, dash: '9 7', opacity: 1 }, rng))
  o.push(`<path d="${wobblyRectPath(TX, TY, TW, TH, rngOf(7))}" fill="${p.traceFill}" opacity="${p.traceOp}" stroke="none"/>`)
  o.push(text(TX + 24, TY + 38, 'watch one rule run', { size: 22, weight: 'bold', fill: p.ink }))
  o.push(text(TX + 24, TY + 62, 'SEC-01 “no committed secrets” · on the node-fail fixture repo', { size: 13.5, fill: p.soft }))
  const sy = i => TY + 106 + i * 130
  STEPS.forEach((s, i) => {
    const y = sy(i), c = p.layers[i]
    if (i > 0) o.push(handArrow(TX + 40, sy(i - 1) + 14, TX + 40, y - 14, { stroke: p.faint, sw: 2, dash: '2 6', bend: 3 }, rng))
    o.push(`<path d="${wobblyCirclePath(TX + 40, y, 14, rng)}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.4"/>`)
    o.push(text(TX + 40, y + 5.5, String(i + 1), { size: 14, weight: 'bold', fill: c.text, anchor: 'middle' }))
    o.push(handLine(TX + 26, y, BX + BW + 4, bandY(i) + BH / 2, { stroke: c.stroke, sw: 1.4, dash: '1 5', bend: 4 }, rng))
    o.push(text(TX + 66, y - 2, s.main, { size: 14.5, weight: 'bold', fill: p.ink }))
    o.push(text(TX + 66, y + 18, s.note, { size: 13, fill: p.soft }))
  })

  // verdict flow (under the trace): the answer climbs back up.
  // Arrow first, heading after with a bg halo — the line passes behind the text.
  const VY = 915
  o.push(handArrow(TX + 40, sy(4) + 20, TX + 40, VY + 40, { stroke: p.red, sw: 2.2, bend: 4 }, rng))
  o.push(`<text x="730" y="${VY + 12}" font-family="${HAND}" font-size="15.5" font-weight="bold" fill="${p.red}" paint-order="stroke" stroke="${p.bg}" stroke-width="7" stroke-linejoin="round">${esc('…and the answer climbs back up the stack:')}</text>`)
  o.push(roughRect(730, VY + 26, 250, 78, { fill: p.chipFill, stroke: p.layers[2].stroke, sw: 2.2, rot: -0.4 }, rng))
  o.push(lines(748, VY + 56, ['{ ok: false, “matched in', '2 file(s): .env, config.js” }'], { size: 12.5, lh: 18, fill: p.ink, family: MONO }))
  o.push(text(748, VY + 96, 'the lab states facts + evidence', { size: 12.5, fill: p.soft }))
  o.push(handArrow(984, VY + 64, 1016, VY + 64, { stroke: p.red, sw: 2.2, bend: 2 }, rng))
  o.push(roughRect(1020, VY + 26, 208, 78, { fill: p.chipFill, stroke: p.layers[1].stroke, sw: 2.2, rot: 0.4 }, rng))
  o.push(lines(1038, VY + 56, ['ladder: not null · not true ·', 'no sign-off → blocker ⇒ FAIL'], { size: 12.5, lh: 18, fill: p.ink }))
  o.push(text(1038, VY + 96, 'the judge applies meaning', { size: 12.5, fill: p.soft }))
  o.push(handArrow(1232, VY + 64, 1264, VY + 64, { stroke: p.red, sw: 2.2, bend: 2 }, rng))
  o.push(roughRect(1268, VY + 26, 136, 78, { fill: p.chipFill, stroke: p.red, sw: 2.6, rot: -0.5 }, rng))
  o.push(text(1336, VY + 60, 'exit 1', { size: 19, weight: 'bold', fill: p.red, anchor: 'middle' }))
  o.push(text(1336, VY + 84, 'CI goes red', { size: 12.5, fill: p.red, anchor: 'middle' }))

  // tag ladder chips
  o.push(text(36, VY + 12, 'the tag ladder — meaning first, severity is consulted LAST', { size: 15.5, weight: 'bold', fill: p.ink }))
  CHIPS.forEach((c, i) => {
    const x = 36 + i * 133, col = p[c.ck]
    o.push(roughRect(x, VY + 26, 121, 78, { fill: p.chipFill, stroke: col, sw: 2.4, rot: i % 2 ? 0.6 : -0.6 }, rng))
    o.push(text(x + 60, VY + 52, c.tag, { size: 15.5, weight: 'bold', fill: col, anchor: 'middle' }))
    o.push(lines(x + 60, VY + 72, c.sub, { size: 10.5, lh: 14, fill: p.soft, anchor: 'middle' }))
    if (i < 4) o.push(handArrow(x + 122, VY + 65, x + 132, VY + 65, { stroke: p.faint, sw: 1.8, bend: 1 }, rng))
  })

  // stickies + footer
  const SY = 1075
  o.push(sticky(36, SY, 400, 150, { fill: p.sticky.fill, stroke: p.sticky.stroke, rot: -0.8 }, rng))
  o.push(text(60, SY + 34, 'kept honest — this repo’s own CI', { size: 15.5, weight: 'bold', fill: p.sticky.text }))
  o.push(lines(60, SY + 62, ['--self-check → rules.json is internally valid', 'golden corpus → 5 fixture repos × 69 pinned', '     verdicts — ANY drift fails the build', 'self-score → baseline scores its own repo'], { size: 13, lh: 22, fill: p.sticky.text }))
  o.push(sticky(470, SY, 400, 150, { fill: p.v2sticky.fill, stroke: p.v2sticky.stroke, rot: 0.8 }, rng))
  o.push(text(494, SY + 34, 'next: V2 — “Lens & Ledger”', { size: 15.5, weight: 'bold', fill: p.v2sticky.text }))
  o.push(lines(494, SY + 62, ['layer 4, THE SENSES, grows into three', 'ground-truth planes: TREE · HISTORY · FORGE —', 'status derived on demand, never hand-written', '→ docs/v2/PLAN.md'], { size: 13, lh: 22, fill: p.v2sticky.text }))
  o.push(lines(1404, SY + 96, ['drawn from the code on main — regenerate:', 'node docs/assets/gen-evaluate-stack.mjs', 'more: REFERENCE.md · GLOSSARY.md'], { size: 12.5, lh: 20, fill: p.faint, anchor: 'end', family: MONO }))

  o.push('</svg>')
  return o.join('\n') + '\n'
}

const here = path.dirname(new URL(import.meta.url).pathname)
for (const [name, p] of Object.entries(PALETTES)) fs.writeFileSync(path.join(here, `evaluate-stack-${name}.svg`), board(p))
console.log('wrote evaluate-stack-light.svg + evaluate-stack-dark.svg')
