// The glossary: terms whose translation is a fact to be looked up, not a guess to be generated.
//
//   node scripts/glossary.mjs              report coverage and what needs a decision
//   node scripts/glossary.mjs --seed       ask GBIF for vernacular names and record candidates
//
// WHY THIS EXISTS, measured rather than assumed. Azure NMT rendered "Portuguese man o' war" into
// German as "portugiesisches Kriegsschiff" — a warship. The app is named after that animal. Marking
// the term do-not-translate would not have helped: a German reader wants "Portugiesische Galeere",
// not an English phrase sitting in German prose. The only correct move is to supply the answer.
//
// The reusable shape, and the reason this is a separate file rather than a constant in the
// translator: every collection has a set of display names and domain terms that carry a right
// answer, and a much larger body of prose that does not. A natural history collection has
// vernacular names, resolvable against GBIF. A decorative arts collection has materials and
// techniques, resolvable against the Getty AAT, which is published multilingual. The pipeline
// stays the same; only the authority changes.
//
// WHAT THIS COSTS, measured and not hidden. The glossary reaches Azure as a dynamic dictionary,
// which reliably inserts the agreed term and then leaves the grammar around it alone. Supplying
// "Portugiesische Galeere" produces "Dies ist ein Portugiesische Galeere" — right noun, wrong
// article and ending — and in Japanese it swallowed a sentence boundary. Microsoft's own guidance
// says the feature is for proper nouns, to be used sparingly, and points at Custom Translator
// instead. For a museum that trade is worth making today, because a wrong animal is a worse error
// than a clumsy article, but it is a stopgap: the production answer is a Custom Translator
// dictionary-only model, which needs no minimum training sentences and folds the terms into the
// model so it inflects around them. That costs $40 per million characters against NMT's $10 —
// about twenty-six dollars for this entire collection in every shipped language.
//
// WHAT IS NEVER DONE HERE: accept an authority's answer automatically when it is uncertain. GBIF
// returns several vernacular names per language — Physalia physalis has three in German — and
// picking the first is a coin flip presented as a fact. §6 already forbids exactly this for
// taxonomy ("never take hits[0]"), and a name printed under a museum's authority is the same kind
// of claim. Seeding records candidates; a person promotes one to accepted.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const dataUrl = (p) => new URL(`../src/data/${p}`, import.meta.url)
const read = (p) => JSON.parse(readFileSync(dataUrl(p), 'utf8'))

const GLOSSARY = dataUrl('glossary.json')
const SEED = process.argv.includes('--seed')

// GBIF publishes vernacular names under ISO 639-3; the app speaks BCP 47.
const ISO3 = { de: 'deu', fr: 'fra', es: 'spa', ja: 'jpn', ko: 'kor', 'zh-Hant': 'zho', ar: 'ara' }
const LANGS = Object.keys(ISO3)

export function loadGlossary() {
  return existsSync(GLOSSARY) ? JSON.parse(readFileSync(GLOSSARY, 'utf8')).terms ?? {} : {}
}

// The terms worth glossing are the ones a visitor reads as a NAME: the plain-English object names
// and the group titles. Not the prose — prose is what translation is for. Binomials are absent on
// purpose; they are held back with class="notranslate" instead, being identical in every language.
function sourceTerms() {
  const names = read('names.json').names
  const groups = read('groups.json').groups
  const terms = new Map()

  for (const [accession, entry] of Object.entries(names)) {
    const name = entry?.name?.trim()
    if (!name) continue
    // "Moon jelly, developmental stages" is a label, not a term. The term is the part before the
    // qualifier, which is what recurs in prose and what an authority will know.
    const base = name.split(/,| — | – /)[0].trim()
    if (base.length < 4) continue
    const t = terms.get(base) ?? { why: 'vernacular name', accessions: [], langs: {}, candidates: {} }
    t.accessions.push(accession)
    terms.set(base, t)
  }

  for (const g of groups) {
    const title = g.title.split(/ — | – |,/)[0].trim()
    if (title.length < 4 || terms.has(title)) continue
    terms.set(title, { why: 'group title', accessions: [], langs: {}, candidates: {} })
  }

  return terms
}

async function gbifNames(binomial) {
  const m = await (await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(binomial)}`)).json()
  // FUZZY and HIGHERRANK are both traps. A fuzzy hit is a guess at a misspelling; a higher-rank hit
  // gives the vernacular name of the GENUS, which is a different animal from the one on display.
  // §6 already refuses to auto-publish on a fuzzy match, and this is the same decision.
  if (m.matchType !== 'EXACT' || !m.usageKey) return { matchType: m.matchType ?? 'NONE', key: null, langs: {} }

  // Follow the synonym. §6 measures that around 57% of this catalogue's species names have been
  // superseded, and the vernacular names hang off the ACCEPTED record — so looking up the
  // catalogue's own 1880s name returns an exact match to a synonym stub with nothing attached.
  // The man o' war is the worked example: Physalia pelagica matches exactly and has no vernacular
  // names at all, while Physalia physalis has a hundred in twenty-six languages, German included.
  // Without this line the collection's most famous object gets no glossary entry and the wrong
  // German name ships.
  // Keyed off acceptedUsageKey rather than a `synonym` boolean: the match endpoint reports
  // status: "SYNONYM" and supplies acceptedUsageKey, and has no `synonym` field at all. Checking
  // for one silently never fires, which is how this looked fixed while still returning nothing.
  const key = m.acceptedUsageKey ?? m.usageKey
  const v = await (await fetch(`https://api.gbif.org/v1/species/${key}/vernacularNames?limit=300`)).json()
  const langs = {}
  for (const r of v.results ?? []) {
    if (!r.language) continue
    const code = LANGS.find((c) => ISO3[c] === r.language)
    if (code) (langs[code] ??= new Set()).add(r.vernacularName)
  }
  return { matchType: m.matchType, key, accepted: m.species ?? m.canonicalName, wasSynonym: m.status === "SYNONYM", langs }
}

async function seed() {
  const manifest = read('manifest.json').objects
  const byAccession = new Map(manifest.map((o) => [o.accession, o]))
  const existing = loadGlossary()
  const terms = sourceTerms()
  const today = new Date().toISOString().slice(0, 10)

  console.log(`${terms.size} terms from names.json and groups.json\n`)

  let asked = 0
  let accepted = 0
  let candidates = 0

  const entries = [...terms.entries()]
  const chunk = 6
  for (let i = 0; i < entries.length; i += chunk) {
    await Promise.all(
      entries.slice(i, i + chunk).map(async ([term, t]) => {
        // A group title has no binomial to look up; it is authored, so it goes straight to a human.
        const binomial = t.accessions.map((a) => byAccession.get(a)?.title).find(Boolean)
        if (!binomial) return
        asked++
        const got = await gbifNames(binomial)
        t.authority = got.key ? `GBIF ${got.key} (${got.accepted ?? binomial})` : `GBIF: no exact match for ${binomial}`
        t.checkedOn = today
        for (const [code, set] of Object.entries(got.langs)) {
          const list = [...set]
          t.candidates[code] = list
          const prior = existing[term]?.langs?.[code]
          // Never overwrite a human decision, and never make one. Exactly one candidate from an
          // EXACT match is the only case safe to accept without a person, and even that is
          // recorded with its source so it can be argued with later.
          if (prior?.status === 'accepted') {
            t.langs[code] = prior
          } else if (list.length === 1) {
            t.langs[code] = { text: list[0], status: 'accepted', source: t.authority, checkedOn: today }
            accepted++
          } else {
            candidates++
          }
        }
      })
    )
    process.stdout.write(`  ${Math.min(i + chunk, entries.length)}/${entries.length}\r`)
  }

  // Carry forward anything a person wrote by hand for a term GBIF knows nothing about.
  for (const [term, prior] of Object.entries(existing)) {
    const t = terms.get(term)
    if (!t) {
      terms.set(term, prior)
      continue
    }
    for (const [code, v] of Object.entries(prior.langs ?? {})) {
      if (v.status === 'accepted' && !t.langs[code]) t.langs[code] = v
    }
  }

  const out = {
    note:
      'Terms whose translation is a fact rather than a guess. Seeded from GBIF vernacular names by scripts/glossary.mjs, which accepts a name only on an EXACT taxonomic match with exactly one candidate in that language — everything else is left under `candidates` for a person to choose. Applied by scripts/translate.mjs as an Azure dynamic dictionary, and asserted on the way back: if the agreed word is missing from the translation the run fails.',
    terms: Object.fromEntries([...terms.entries()].sort(([a], [b]) => a.localeCompare(b))),
  }
  writeFileSync(GLOSSARY, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`\n  ${asked} terms looked up, ${accepted} accepted automatically, ${candidates} left for a person`)
}

function report() {
  const terms = loadGlossary()
  const names = Object.keys(terms)
  if (!names.length) {
    console.log('No glossary yet. Seed one:\n  node scripts/glossary.mjs --seed')
    return
  }
  console.log(`GLOSSARY — ${names.length} terms\n`)
  console.log(`  ${'lang'.padEnd(9)} ${'accepted'.padStart(9)} ${'awaiting a decision'.padStart(20)}`)
  for (const code of LANGS) {
    const accepted = names.filter((n) => terms[n].langs?.[code]?.status === 'accepted').length
    const waiting = names.filter(
      (n) => terms[n].langs?.[code]?.status !== 'accepted' && (terms[n].candidates?.[code]?.length ?? 0) > 0
    ).length
    console.log(`  ${code.padEnd(9)} ${String(accepted).padStart(9)} ${String(waiting).padStart(20)}`)
  }

  const waiting = names.filter((n) => LANGS.some((c) => terms[n].langs?.[c]?.status !== 'accepted' && terms[n].candidates?.[c]?.length > 1))
  if (waiting.length) {
    console.log(`\n${waiting.length} term(s) have more than one candidate and need a person to choose.`)
    for (const n of waiting.slice(0, 8)) {
      const shown = LANGS.filter((c) => terms[n].candidates?.[c]?.length > 1)
        .map((c) => `${c}: ${terms[n].candidates[c].join(' / ')}`)
        .join('   ')
      console.log(`  ${n}\n      ${shown}`)
    }
    if (waiting.length > 8) console.log(`  … and ${waiting.length - 8} more`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (SEED) await seed()
  report()
}
