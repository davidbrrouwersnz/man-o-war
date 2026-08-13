// What would it cost, in files, minutes and characters, to voice this collection?
// Exploration only — computes the scale of §13's audio requirement from the content that exists.
//
//   node scripts/audio-scale.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { LANGUAGES } from '../src/i18n.js'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

const museum = read('stories.json')
const drafted = read('stories-drafted.json')
const layers = read('layers.json')
const groups = read('groups.json')
const STORIES = { ...drafted.stories, ...museum.stories }

// Speaking rate, not reading rate. §10 computes reading at 150wpm; narration is slower.
const SPOKEN_WPM = 140
// CJK has no spaces, so whitespace word-counting is meaningless (the review flagged this).
// Billing is per character everywhere, so characters are the honest common unit.
const CJK = new Set(['zh-Hant', 'ja', 'ko'])
const CJK_CHARS_PER_MIN = 320

const words = (s) => (s ? s.trim().split(/\s+/).length : 0)
const chars = (s) => (s ? s.length : 0)

const segText = (seg) => `${seg.heading}. ${seg.text}`

// ---------------------------------------------------------------- English base

let storyWords = 0
let storyChars = 0
let storyFiles = 0
for (const s of Object.values(STORIES)) {
  for (const seg of s.segments) {
    storyWords += words(segText(seg))
    storyChars += chars(segText(seg))
  }
  storyFiles++
}

let panelWords = 0
let panelChars = 0
let panelFiles = 0
for (const g of groups.groups) {
  const p = museum.panels[g.slug]
  if (!p) continue
  for (const key of ['panel', 'ending']) {
    if (!p[key]) continue
    panelWords += words(p[key])
    panelChars += chars(p[key])
    panelFiles++
  }
}

let layerWords = 0
let layerChars = 0
let layerFiles = 0
for (const l of Object.values(layers.layers)) {
  for (const seg of l.segments) {
    layerWords += words(segText(seg))
    layerChars += chars(segText(seg))
    layerFiles++
  }
}

const mins = (w) => (w / SPOKEN_WPM).toFixed(0)

console.log('ENGLISH — what exists today')
console.log(`  object stories   ${String(storyFiles).padStart(4)} objects  ${String(storyWords).padStart(6)} words  ${String(storyChars).padStart(7)} chars  ~${mins(storyWords)} min`)
console.log(`  panels+endings   ${String(panelFiles).padStart(4)} files    ${String(panelWords).padStart(6)} words  ${String(panelChars).padStart(7)} chars  ~${mins(panelWords)} min`)
console.log(`  layer essays     ${String(layerFiles).padStart(4)} segments ${String(layerWords).padStart(6)} words  ${String(layerChars).padStart(7)} chars  ~${mins(layerWords)} min`)
console.log(`  TOTAL                       ${String(storyWords + panelWords + layerWords).padStart(6)} words  ${String(storyChars + panelChars + layerChars).padStart(7)} chars  ~${mins(storyWords + panelWords + layerWords)} min`)

// §13: layers 1-2 get audio; layers 3-5 are text-only EXCEPT where no device voice exists.
const L12_CHARS = storyChars + panelChars
console.log(`\n  §13 scope: layers 1-2 only = ${L12_CHARS} chars (~${mins(storyWords + panelWords)} min)`)
console.log(`  §13 exception: layer essays add ${layerChars} chars per language lacking a device voice`)

// ---------------------------------------------------------------- per language

const langDir = new URL('../src/data/i18n/', import.meta.url)
const packs = readdirSync(langDir).filter((f) => f.endsWith('.json') && f !== 'en.json')

console.log('\nPER LANGUAGE — characters of translated content that could be voiced today')
console.log(`  ${'lang'.padEnd(9)} ${'stories'.padStart(8)} ${'panels'.padStart(7)} ${'layers'.padStart(7)} ${'total'.padStart(8)}   note`)

let grandTotal = storyChars + panelChars + layerChars
for (const file of packs) {
  const code = file.replace(/\.json$/, '')
  const pack = JSON.parse(readFileSync(new URL(file, langDir), 'utf8'))

  let sc = 0
  const storyFile = new URL(`stories/${code}.json`, langDir)
  if (existsSync(storyFile)) {
    const ts = JSON.parse(readFileSync(storyFile, 'utf8'))
    for (const s of Object.values(ts.stories ?? {})) for (const seg of s.segments) sc += chars(segText(seg))
  }

  let pc = 0
  for (const p of Object.values(pack.panels ?? {})) for (const k of ['panel', 'ending']) if (p[k]) pc += chars(p[k])

  let lc = 0
  const layerFile = new URL(`layers/${code}.json`, langDir)
  if (existsSync(layerFile)) {
    const tl = JSON.parse(readFileSync(layerFile, 'utf8'))
    for (const l of Object.values(tl.layers ?? {})) for (const seg of l.segments) lc += chars(segText(seg))
  }

  const total = sc + pc + lc
  grandTotal += total
  const note = CJK.has(code) ? 'char-timed, not word-timed' : sc === 0 ? 'stories untranslated' : ''
  console.log(`  ${code.padEnd(9)} ${String(sc).padStart(8)} ${String(pc).padStart(7)} ${String(lc).padStart(7)} ${String(total).padStart(8)}   ${note}`)
}

console.log(`\n  ALL LANGUAGES INCLUDING ENGLISH: ${grandTotal.toLocaleString()} characters`)
const IF_COMPLETE = (storyChars + panelChars + layerChars) * 13
console.log(`  If every language were fully translated: ~${IF_COMPLETE.toLocaleString()} characters`)

// ---------------------------------------------------------------- voice coverage
//
// The finding that decides whether §13 is buildable at all, so it is computed here rather than
// asserted in prose. Checked against provider language-support pages, August 2026:
//   Azure  https://learn.microsoft.com/azure/ai-services/speech-service/language-support
//   Google https://cloud.google.com/text-to-speech/docs/list-voices-and-types
//   Polly  https://docs.aws.amazon.com/polly/latest/dg/SupportedLanguage.html
//   11Labs https://help.elevenlabs.io/hc/en-us/articles/13313366263441
//
// "approx" is not "yes". Dari is a variety of Persian, so an fa-IR voice is an Iranian accent read
// to an Afghan audience. §7 exists to stop exactly that kind of near-enough.
const VOICES = {
  en: { azure: 'en-NZ (Molly, Mitchell)', polly: 'en-NZ (Aria)', google: 'no en-NZ', eleven: 'yes' },
  'zh-Hant': { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  ja: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  ko: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  de: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  fr: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  es: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  ar: { azure: 'yes', polly: 'yes', google: 'yes', eleven: 'yes' },
  sm: { azure: 'no', polly: 'no', google: 'no', eleven: 'no' },
  to: { azure: 'no', polly: 'no', google: 'no', eleven: 'no' },
  prs: { azure: 'approx (fa-IR)', polly: 'no', google: 'no', eleven: 'approx (fa)' },
  ti: { azure: 'no', polly: 'no', google: 'no', eleven: 'no' },
  so: { azure: 'no', polly: 'no', google: 'no', eleven: 'yes (v3)' },
}

console.log('\nVOICE COVERAGE — is there a synthetic voice for each shipped language?')
console.log(`  ${'lang'.padEnd(9)} ${'tier'.padEnd(7)} ${'Azure'.padEnd(22)} ${'Polly'.padEnd(12)} ${'Google'.padEnd(10)} ElevenLabs`)
const unvoiced = []
for (const l of LANGUAGES) {
  const v = VOICES[l.code]
  console.log(`  ${l.code.padEnd(9)} ${l.tier.padEnd(7)} ${v.azure.padEnd(22)} ${v.polly.padEnd(12)} ${v.google.padEnd(10)} ${v.eleven}`)
  if (Object.values(v).every((x) => x === 'no' || x.startsWith('approx'))) unvoiced.push(l)
}

console.log(`\n  ${unvoiced.length} of ${LANGUAGES.length} languages have no true voice from any provider:`)
console.log(`    ${unvoiced.map((l) => `${l.endonym} (${l.code}, ${l.tier})`).join(', ')}`)
const allLow = unvoiced.every((l) => l.tier === 'low')
console.log(`  Every one of them is a §7 low-resource language: ${allLow ? 'YES' : 'no'}`)
console.log(`  §7 low-resource languages with no voice: ${unvoiced.length} of ${LANGUAGES.filter((l) => l.tier === 'low').length}`)

// ---------------------------------------------------------------- money
// Neural tier, Azure and Polly both $16 per million characters (August 2026).
const PER_MILLION = 16
const money = (c) => `$${((c / 1e6) * PER_MILLION).toFixed(2)}`
console.log(`\nSYNTHESIS COST at $${PER_MILLION}/million characters`)
console.log(`  English, layers 1-2, one track:            ${money(L12_CHARS)}`)
console.log(`  English, layers 1-2, both tracks:          ${money(L12_CHARS * 2)}`)
console.log(`  Everything translated, 13 langs, 1 track:  ${money(IF_COMPLETE)}`)
console.log(`  Everything translated, 13 langs, 2 tracks: ${money(IF_COMPLETE * 2)}`)
console.log(`  Re-synthesising the lot ten times over:    ${money(IF_COMPLETE * 2 * 10)}`)

// ---------------------------------------------------------------- file count

const segCount = Object.values(STORIES).reduce((t, s) => t + s.segments.length, 0)
console.log(`\nFILE COUNT (one audio file per segment, per §13's cue-per-segment rule)`)
console.log(`  English, layers 1-2:        ${segCount} story segments + ${panelFiles} panel/ending = ${segCount + panelFiles} files`)
console.log(`  ...times two tracks (description + interpretation): ${(segCount + panelFiles) * 2} files`)
console.log(`  ...times 13 languages:      ${(segCount + panelFiles) * 2 * 13} files`)
