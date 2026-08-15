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
// A report written by scripts/translate.mjs --report. Narrows the sweep to the units that run
// actually touched, which is what makes this affordable on every push rather than once a quarter.
const IDS = value('--ids')
// Exit non-zero when anything drifted. Off by default so a person can look at the list without the
// shell shouting; on in CI, where the point is to stop the commit.
const STRICT = argv.includes('--strict')

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

const wanted = IDS ? new Set(JSON.parse(readFileSync(IDS, 'utf8')).languages?.[LANG] ?? []) : null
const units = collect()
  .filter((u) => !carveOut(u))
  .filter((u) => !wanted || wanted.has(u.id))

let sources
if (TERMS_ONLY) {
  // With --ids, check only the terms the changed text actually uses. That keeps the gate
  // proportionate: a glossary is built as the words come up, rather than every commit being held
  // hostage until all of it is decided. Without --ids it checks the lot, which is the sweep you
  // run deliberately.
  const haystack = wanted ? units.map((u) => u.text.toLowerCase()).join('\n') : null
  sources = Object.keys(glossary)
    .filter((term) => !haystack || haystack.includes(term.toLowerCase()))
    .map((term) => ({ id: `term:${term}`, text: term }))
} else {
  sources = units.map((u) => ({ id: u.id, text: u.text }))
}

if (!sources.length) {
  // exit() rather than exitCode here: this must stop, not fall through into translating an empty
  // list. One short line is already flushed, so there is nothing queued to lose.
  console.log(`Nothing to check for ${LANG}.`)
  process.exit(0)
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

// In CI this is a gate rather than a report. Only UNCOVERED drift stops the run: a term that
// drifted and already has a glossary entry is the entry doing its job, and failing on it would
// train everyone to ignore the check.
if (STRICT && uncovered.length) {
  console.error(`\n${uncovered.length} string(s) drifted with no glossary entry for ${LANG}.`)
  console.error(`Add entries with: npm run glossary:seed, then choose a candidate in src/data/glossary.json`)
  // exitCode rather than exit(): process.exit() tears the loop down with writes still queued, and
  // on Windows that aborts with a libuv assertion instead of printing the reason it failed. A gate
  // that crashes rather than explaining itself is worse than no gate.
  process.exitCode = 1
}
