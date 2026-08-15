// §7's carve-outs, enforced in code rather than policy — its words, and the reason this file is
// not a paragraph in a README.
//
//   Quotations · anything touching taonga, Ngāi Tahu or mana whenua · anything with legal effect ·
//   safety content.
//
// Four jobs here, and they run at different moments:
//
//   audit()      before anything is sent — refuses to start if a carve-out is unflagged
//   protect()    on the way out    — hides names the model would otherwise translate
//   unprotect()  on the way back   — returns plain text, because the store holds plain text
//   assert*()    on the way back   — structure, names and numerals survived the round trip
//
// Run it on its own to audit the corpus without translating anything:
//
//   node scripts/translate-guard.mjs

import { pathToFileURL } from 'node:url'
import { collect, binomials } from './units.mjs'

// ---------------------------------------------------------------- carve-outs

// §13 deliberately removed the quotation marks — they are inaudible, so attribution goes first
// instead and the printed text carries the same order. The consequence for this file is that
// punctuation finds nothing: scanning all 753 units for a quotation mark returns zero. The phrasing
// is the only thing left to detect, so these match the shapes of reported speech rather than
// its typography.
export const ATTRIBUTION = [
  /\btold (its|his|her|their) readers\b/i,
  /\bwrote (that|of)\b/i,
  /\bin the words of\b/i,
  /\b(reported|said|claimed|declared|observed) that\b/i,
  /\bquoted\b/i,
  /\bcalled it\b/i,
  /["“”]/,
]

// §7's governance carve-out. Currently this matches nothing — there is no te reo in the corpus at
// all, because §6 answered the te reo question with a documented no. That is exactly why it is
// here: the guard is preventive, and the moment layer 2 gains a te reo name or a line of mātauranga
// Māori (§7 says it may) it must not quietly go through a pipeline on its way to twelve languages.
export const GOVERNED = [
  /\bNgāi Tahu\b/i, /\bKāi Tahu\b/i, /\bNgāi Tūāhuriri\b/i, /\bTe Rūnanga\b/i, /\brūnanga\b/i,
  /\bmana whenua\b/i, /\btaonga\b/i, /\btaoka\b/i, /\bmātauranga\b/i, /\bkaitiakitanga\b/i,
  /\btikanga\b/i, /\bŌhākī\b/i, /\bpapatipu\b/i, /\bwhakapapa\b/i, /\biwi\b/i, /\bhapū\b/i,
]

// Not currently present either, and listed for the same preventive reason. A rights statement or a
// safety instruction that drifts in translation is the one failure mode with consequences outside
// the app.
export const LEGAL_OR_SAFETY = [
  /\ball rights reserved\b/i,
  /\bCC[ -]BY\b/i,
  /\bcopyright\b/i,
  /\bemergency\b/i,
  /\bevacuat/i,
  /\bdo not touch\b/i,
]

const CARVE_OUTS = [
  ['quotation', ATTRIBUTION],
  ['governed', GOVERNED],
  ['legal-or-safety', LEGAL_OR_SAFETY],
]

// Why a unit is held back, or null if it may be translated automatically.
export function carveOut(unit) {
  if (unit.noAuto) return unit.noAutoWhy ?? 'flagged noAuto in the source'
  for (const [reason, patterns] of CARVE_OUTS) for (const re of patterns) if (re.test(unit.text)) return reason
  return null
}

// Refuses to start rather than skipping quietly. A carve-out that silently drops out of the run
// looks identical to a language that simply has not been translated yet, and §7's whole disclosure
// argument rests on those two being distinguishable.
export function audit(units) {
  const held = []
  const unflagged = []
  for (const unit of units) {
    const why = carveOut(unit)
    if (!why) continue
    held.push({ unit, why })
    if (!unit.noAuto) unflagged.push({ unit, why })
  }
  return { held, unflagged }
}

export function assertAudited(units) {
  const { unflagged } = audit(units)
  if (!unflagged.length) return
  const lines = unflagged.map(
    ({ unit, why }) => `    ${unit.id}\n      ${why}: ${unit.text.replace(/\s+/g, ' ').slice(0, 110)}…`
  )
  throw new Error(
    `${unflagged.length} unit(s) hit a §7 carve-out but are not marked noAuto in the source.\n` +
      `Add "noAuto": true (and a "noAutoWhy") to the segment, or rewrite the line.\n\n` +
      lines.join('\n\n')
  )
}

// ---------------------------------------------------------------- do not translate

// Proper nouns the model will otherwise render helpfully and wrongly. Word-bounded, or "Ward" —
// the 1878/1888 catalogue — also matches toward, awkward and inward, which is 19 false hits.
export const PROPER_NOUNS = [
  'Blaschka', 'Blaschkas', 'Leopold', 'Rudolf', 'Haast', 'Dohrn', 'Haeckel', 'Gosse', 'Ward',
  'Dresden', 'Lyttelton', 'Ōtautahi', 'Aotearoa', 'Te Waipounamu',
]

// Longest first, so "Physalia pelagica" is protected before "Physalia" can match inside it.
export function protectedTerms() {
  return [...binomials(), ...PROPER_NOUNS].sort((a, b) => b.length - a.length)
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Azure's documented mechanism: class="notranslate" with textType=html. The span is a wrapper for
// the wire only — it never reaches disk, because scripts/audio.mjs asserts that SSML stripped back
// to text matches the printed text character for character, and stray markup breaks that.
export function protect(text, terms = protectedTerms()) {
  let out = text
  const seen = []
  for (const term of terms) {
    const re = new RegExp(`\\b${escape(term)}\\b`, 'g')
    if (!re.test(out)) continue
    seen.push(term)
    out = out.replace(re, `<span class="notranslate">${term}</span>`)
  }
  return { html: out, protectedHere: seen }
}

export function unprotect(html) {
  return html
    .replace(/<span class="notranslate">/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// ---------------------------------------------------------------- round-trip assertions

// Paragraph breaks are load-bearing, not cosmetic: src/audio.jsx splits a segment on /\n{2,}/ and
// every block becomes its own audio file and its own WebVTT cue. A translation that merges two
// paragraphs silently changes the file count and every cue after it. Blocks are therefore
// translated one at a time and rejoined, and this asserts the rejoin.
export function assertStructure(english, translated, id) {
  const a = english.split(/\n{2,}/).length
  const b = translated.split(/\n{2,}/).length
  if (a !== b) throw new Error(`${id}: ${a} paragraph blocks in English, ${b} in the translation`)
  if (/<[^>]+>/.test(translated)) throw new Error(`${id}: markup survived into the stored text: ${translated.slice(0, 80)}`)
}

// §6 rule 7 keeps numerals in ordinary print style rather than bending them for the voice, so a
// dropped or reformatted number is a content error rather than a stylistic one. Listed as an
// unverified risk in docs/translation-review-prompt.md; cheaper as an assertion than as a review.
// Group separators are localised, and correctly so: 1,003 is 1.003 in German and 1 003 in French.
// Comparing raw digit runs would either wave that through as two numbers that happen to appear, or
// fail every language that groups differently — and worse, a naive /\d+/ reads "1,003" as "1" and
// "003", so dropping a digit inside a grouped number passes. Strip the separators from both sides
// first and the comparison is about the number rather than its typography.
const digitRuns = (s) => {
  let t = s
  for (;;) {
    const next = t.replace(/(\d)[.,   ](\d{3})(?!\d)/g, '$1$2')
    if (next === t) break
    t = next
  }
  return t.match(/\d+/g) ?? []
}

export function assertNumerals(english, translated, id) {
  const want = digitRuns(english)
  const have = digitRuns(translated)
  const pool = [...have]
  const missing = []
  for (const n of want) {
    const at = pool.indexOf(n)
    if (at === -1) missing.push(n)
    else pool.splice(at, 1)
  }
  if (missing.length) throw new Error(`${id}: numerals missing from the translation: ${missing.join(', ')}`)
}

// A protected name that came back changed means class="notranslate" was not honoured — which is
// the whole reason scripts/translate.mjs probes for it before a run rather than after one.
export function assertProtected(terms, translated, id) {
  const lost = terms.filter((t) => !translated.includes(t))
  if (lost.length) throw new Error(`${id}: protected names did not survive translation: ${lost.join(', ')}`)
}

// ---------------------------------------------------------------- audit mode

// Guarded: argv[1] is undefined under `node -e`, and pathToFileURL throws on undefined.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const units = collect()
  const { held, unflagged } = audit(units)

  console.log(`CARVE-OUTS — ${held.length} of ${units.length} units held back from automation\n`)
  for (const { unit, why } of held) {
    console.log(`  ${unit.noAuto ? 'flagged  ' : 'UNFLAGGED'}  ${unit.id}`)
    console.log(`             text   ${unit.text.replace(/\s+/g, ' ').slice(0, 92)}${unit.text.length > 92 ? '…' : ''}`)
    console.log(`             why    ${why.replace(/\s+/g, ' ').slice(0, 92)}${why.length > 92 ? '…' : ''}`)
  }
  if (!held.length) console.log('  (none)')

  const terms = protectedTerms()
  const hit = terms.filter((t) => {
    const re = new RegExp(`\\b${escape(t)}\\b`)
    return units.some((u) => re.test(u.text))
  })
  console.log(`\nDO NOT TRANSLATE — ${terms.length} terms known, ${hit.length} of them present in the corpus`)
  console.log(`  ${hit.slice(0, 14).join(' · ')}${hit.length > 14 ? ' …' : ''}`)

  const blocks = units.reduce((t, u) => t + u.text.split(/\n{2,}/).length, 0)
  console.log(`\nWIRE SHAPE — ${units.length} units, ${blocks} blocks, one request element per block`)
  console.log(`  digits to check: ${units.filter((u) => /\d/.test(u.text)).length} units`)

  if (unflagged.length) {
    console.log(`\n  ${unflagged.length} carve-out(s) are not marked noAuto — a translate run would refuse to start.`)
    process.exit(1)
  }
}
