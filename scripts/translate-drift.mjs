// Find the terms that need a glossary entry, without anyone having to read seven languages.
//
//   node scripts/translate-drift.mjs --lang de            check every unit
//   node scripts/translate-drift.mjs --lang de --terms    check names and titles only (cheap)
//
// THE PROBLEM THIS SOLVES. "Portuguese man o' war" came back as "portugiesisches Kriegsschiff" — a
// warship. Nobody caught it for months, because catching it required a German reader who also knew
// what the object was. That does not scale to seven languages, and it certainly does not scale to
// every collection in the museum.
//
// THE METHOD. Translate out, translate back, compare to the original. Meaning that survives a round
// trip is usually intact; meaning that does not is worth a person's attention. It needs no
// authority, no glossary and no domain knowledge, which is what makes it the part that generalises.
//
// WHAT IT IS NOT. Proof of correctness. "comb jelly" round-trips cleanly through German as
// "Kammgelee" — literally comb-flavoured jelly, and quite wrong; the German is Rippenqualle. A
// clean round trip means the engine is self-consistent, not that it is right. §7 says this in
// general terms — automated checks find errors well and are close to blind to whether the writing
// is any good — and this is that limitation in miniature. Treat a DRIFT as a summons and a pass as
// no information.
//
// Cost is one extra translation of whatever is checked. Over every unit in every language that is
// about twelve dollars at NMT rates; over the names and titles alone it is pennies.

import { readFileSync } from 'node:fs'
import { collect } from './units.mjs'
import { loadGlossary } from './glossary.mjs'
import { carveOut } from './translate-guard.mjs'

const argv = process.argv.slice(2)
const value = (f) => {
  const i = argv.indexOf(f)
  return i === -1 ? null : argv[i + 1]
}
const LANG = value('--lang')
const TERMS_ONLY = argv.includes('--terms')

if (!LANG) {
  console.error('Which language? e.g. --lang de')
  process.exit(1)
}

const KEY = process.env.AZURE_TRANSLATOR_KEY
const REGION = process.env.AZURE_TRANSLATOR_REGION ?? process.env.AZURE_SPEECH_REGION
if (!KEY || KEY.startsWith('<')) {
  console.error('AZURE_TRANSLATOR_KEY is not set.')
  process.exit(1)
}

async function translate(texts, from, to) {
  const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${from}&to=${encodeURIComponent(to)}`
  const headers = {
    'Ocp-Apim-Subscription-Key': KEY,
    'Content-Type': 'application/json; charset=UTF-8',
  }
  if (REGION) headers['Ocp-Apim-Subscription-Region'] = REGION
  const out = []
  for (let i = 0; i < texts.length; i += 80) {
    const batch = texts.slice(i, i + 80)
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(batch.map((Text) => ({ Text }))) })
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
    out.push(...(await res.json()).map((o) => o.translations[0].text))
    process.stdout.write(`  ${Math.min(i + 80, texts.length)}/${texts.length} ${from}→${to}\r`)
  }
  return out
}

// Compared on words rather than characters, so punctuation and casing do not raise a false alarm.
const normalise = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

const similarity = (a, b) => {
  const A = normalise(a)
  const B = new Set(normalise(b))
  if (!A.length) return 1
  return A.filter((w) => B.has(w)).length / A.length
}

const glossary = loadGlossary()
const glossed = new Set(
  Object.entries(glossary)
    .filter(([, e]) => e.langs?.[LANG]?.status === 'accepted')
    .map(([term]) => term.toLowerCase())
)

let sources
if (TERMS_ONLY) {
  sources = Object.keys(glossary).map((term) => ({ id: `term:${term}`, text: term }))
} else {
  sources = collect()
    .filter((u) => !carveOut(u))
    .map((u) => ({ id: u.id, text: u.text }))
}

console.log(`${sources.length} strings, ${LANG}\n`)

const out = await translate(sources.map((s) => s.text), 'en', LANG)
const back = await translate(out, LANG, 'en')
process.stdout.write(' '.repeat(40) + '\r')

const rows = sources.map((s, i) => ({
  ...s,
  out: out[i],
  back: back[i],
  score: similarity(s.text, back[i]),
  covered: glossed.has(s.text.toLowerCase()),
}))

// Short strings are names, and a name that comes back different is the exact failure this exists
// for. Long prose drifts a little by nature, so it needs a lower bar before it is worth reading.
const THRESHOLD = (text) => (normalise(text).length <= 4 ? 0.99 : 0.6)

const drifted = rows.filter((r) => r.score < THRESHOLD(r.text)).sort((a, b) => a.score - b.score)
const uncovered = drifted.filter((r) => !r.covered)

console.log(`${drifted.length} of ${rows.length} drifted; ${uncovered.length} of those have no glossary entry for ${LANG}\n`)
for (const r of uncovered.slice(0, 25)) {
  console.log(`  ${(r.score * 100).toFixed(0).padStart(3)}%  ${r.id}`)
  console.log(`        ${r.text.replace(/\s+/g, ' ').slice(0, 88)}`)
  console.log(`     →  ${r.out.replace(/\s+/g, ' ').slice(0, 88)}`)
  console.log(`     ←  ${r.back.replace(/\s+/g, ' ').slice(0, 88)}`)
}
if (uncovered.length > 25) console.log(`  … and ${uncovered.length - 25} more`)

const covered = drifted.filter((r) => r.covered)
if (covered.length) console.log(`\n${covered.length} drifted but already have a glossary entry — the entry is doing its job.`)

console.log(`\nA pass is not a clean bill of health: "comb jelly" round-trips as "Kammgelee" and is still wrong.`)
