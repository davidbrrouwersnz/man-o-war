// Asserts every colour pair the interface actually renders, against its WCAG floor.
//   node scripts/contrast.mjs
//
// This exists because §15's control-border bug has now shipped twice. v1 had the borders at
// ~1.75:1 against a 3:1 floor; §15 said "fix v1's control borders"; v2 then shipped them at
// 1.30:1. A number nobody checks is a number that drifts, so the check is a build step.
//
// Values are read out of src/styles.css rather than repeated here. A token renamed or retuned in
// the stylesheet is therefore checked at its new value, and a token this file names but the
// stylesheet no longer defines is a hard failure rather than a silent skip.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/styles.css'), 'utf8')

// ---------------------------------------------------------------- token extraction

// The light values come from the first :root; the dark overrides from the :root inside the
// prefers-color-scheme block. Anything not overridden there is inherited from light, which is
// exactly how the cascade treats it.
const blockAfter = (marker) => {
  const i = css.indexOf(marker)
  if (i === -1) throw new Error(`could not find ${marker} in styles.css`)
  const open = css.indexOf('{', i + marker.length - 1)
  let depth = 0
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j)
  }
  throw new Error(`unbalanced braces after ${marker}`)
}

const parse = (text) => {
  const out = {}
  for (const m of text.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2]
  return out
}

const light = parse(blockAfter('\n:root {'))

// Deliberately specific. `@media (prefers-color-scheme: dark)` on its own first matches the
// @custom-variant block at the top of the file, which holds no colours at all — and the check
// then silently compared the light palette against itself and passed everything twice.
const dark = { ...light, ...parse(blockAfter('@media (prefers-color-scheme: dark) {\n  :root {')) }

if (JSON.stringify(dark) === JSON.stringify(light)) {
  throw new Error('the dark palette resolved identical to light — the token block was not found')
}

// ---------------------------------------------------------------- contrast

const lin = (c) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex) => {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)]
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

// ---------------------------------------------------------------- what is actually rendered
//
// floors: 4.5 body text · 3 large text (>=24px, or >=18.66px bold) · 3 UI component boundaries
// (WCAG 1.4.11). Nothing here claims AAA; §18 uses 2.2 AA as a measuring instrument, not a target.

const BLACK = '#000'

const checks = [
  // --- the light reading ground -------------------------------------------------
  ['light', 'body text', '--ink', '--paper', 4.5],
  ['light', 'secondary prose', '--ink-soft', '--paper', 4.5],
  ['light', 'captions, eyebrows, metadata at 13px', '--ink-meta', '--paper', 4.5],
  ['light', 'control boundaries: .listen, .search-input, .audio-play, .audio-rate', '--edge', '--paper', 3],
  ['light', 'brand as link and focus ring', '--brand', '--paper', 4.5],
  ['light', 'arrival marker text on its own ground', '--brand', '--brand-bg', 4.5],
  ['light', 'read-along highlight: body ink over the tint', '--ink', '--mark-bg', 4.5],

  // --- the dark reading ground --------------------------------------------------
  ['dark', 'body text', '--ink', '--paper', 4.5],
  ['dark', 'secondary prose', '--ink-soft', '--paper', 4.5],
  ['dark', 'captions, eyebrows, metadata at 13px', '--ink-meta', '--paper', 4.5],
  ['dark', 'control boundaries', '--edge', '--paper', 3],
  ['dark', 'brand as link and focus ring', '--brand', '--paper', 4.5],
  ['dark', 'arrival marker text on its own ground', '--brand', '--brand-bg', 4.5],
  ['dark', 'read-along highlight: body ink over the tint', '--ink', '--mark-bg', 4.5],

  // --- the permanently dark surfaces (§9). These never invert, so they are checked
  //     against black once rather than per scheme. -------------------------------
  ['always-dark', 'collection heading on black', '--dark-ink', BLACK, 4.5],
  ['always-dark', 'tile metadata and the standfirst on black', '--dark-ink-soft', BLACK, 4.5],
  ['always-dark', 'control boundaries on black: the language select', '--dark-edge', BLACK, 3],
  ['always-dark', 'focus ring on the collection page', '--dark-brand', BLACK, 3],
]

let failures = 0
let current = null

for (const [scheme, what, fg, bg, floor] of checks) {
  const vars = scheme === 'dark' ? dark : light
  const a = vars[fg]
  const b = bg.startsWith('--') ? vars[bg] : bg
  if (!a) throw new Error(`${fg} is not defined in styles.css (${scheme})`)
  if (!b) throw new Error(`${bg} is not defined in styles.css (${scheme})`)

  const v = ratio(a, b)
  const ok = v >= floor
  if (!ok) failures++

  if (scheme !== current) {
    current = scheme
    process.stdout.write(`\n${scheme}\n`)
  }
  const on = bg.startsWith('--') ? bg : 'black'
  process.stdout.write(
    `  ${ok ? 'ok  ' : 'FAIL'} ${v.toFixed(2).padStart(6)}  (>=${String(floor).padEnd(3)}) ${fg} on ${on}  — ${what}\n`
  )
}

// A colour token that exists but nothing checks is how the last one slipped through, so anything
// without a floor has to be named here and say why. `--edge` and `--dark-edge` exist precisely so
// that no control boundary is ever drawn with one of these.
const NO_FLOOR = {
  '--paper': 'a ground, not a foreground — checked as the background of every pair above',
  '--dark': 'the permanently dark ground (§9)',
  '--dark-2': 'the tile well behind a contained photograph',
  '--rule': 'decorative hairline between sections. Never a control boundary',
  '--dark-rule': 'decorative hairline on the dark surfaces. Never a control boundary',
  '--brand-bg': 'a ground — checked as the background of the arrival marker',
  '--mark-bg': 'a ground — checked as the background of the read-along highlight',
}

const declared = new Set(checks.flatMap(([, , fg, bg]) => [fg, bg]).filter((t) => t.startsWith('--')))
const unchecked = Object.keys(light).filter(
  (t) => /^--(ink|edge|rule|paper|brand|mark|dark)/.test(t) && !declared.has(t) && !(t in NO_FLOOR)
)
if (unchecked.length) {
  process.stdout.write(`\nFAIL — colour tokens with no floor and no stated reason: ${unchecked.join(', ')}\n`)
  failures += unchecked.length
}

if (failures) {
  process.stdout.write(`\n${failures} pair(s) below the floor.\n`)
  process.exit(1)
}
process.stdout.write(`\nall ${checks.length} pairs pass.\n`)
