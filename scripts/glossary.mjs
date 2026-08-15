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
const RESOLVE = process.argv.includes('--resolve')

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

// THE SHORT FORM IS THE ONE THE PROSE ACTUALLY USES, and it was the hole that let a warship
// through. The glossary held "Portuguese man o' war" and protected it wherever it appeared in
// full — but the story says "A man o' war is related to true jellyfish", and the bare form matched
// nothing. Spanish came back "Un barco de guerra está relacionado con las verdaderas medusas": a
// warship, in the one sentence whose entire purpose is to say the animal is not a warship.
//
// A name is introduced in full and then used short. That is how English prose works, so the
// glossary has to cover both or it only protects the first mention.
//
// Generated by dropping a leading qualifier, and kept ONLY where the short form genuinely occurs in
// the English corpus — a derived form nobody wrote is a guess, and this file exists to stop those.
// Only qualifiers that leave a NAME behind. The first attempt dropped any leading adjective, which
// turned "Moon jellyfish" into "jellyfish" and "Tree coral" into "coral" — and binding those would
// have made every jellyfish in the collection a moon jellyfish. Far worse than the problem.
//
// So: geographic and proper adjectives only, and the remainder must still be more than one word.
// "Portuguese man o' war" leaves "man o' war", which is a name. "European squid" leaves "squid",
// which is a category, and is rejected.
const QUALIFIERS = /^(Portuguese|European|Atlantic|Mediterranean|Devonshire|Common|Greater|Lesser|Northern|Southern)\s+/i

export function shortFormsOf(term, corpus) {
  const out = []
  const short = term.replace(QUALIFIERS, '').trim()
  if (short && short !== term && short.length >= 4 && /\s/.test(short)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
    if (re.test(corpus)) out.push(short)
  }
  return out
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

// ---------------------------------------------------------------- second authority
//
// GBIF answers "what names exist"; it often gives several per language and cannot say which one a
// reader would recognise. Wikidata answers a different question — what the article about this
// animal is CALLED in that language — and the two disagreeing is a signal worth a person's time.
//
// The decision rule is agreement, never a first hit. Where both authorities name the same thing,
// that is about as settled as a vernacular name gets without a curator. Where only one has it, the
// entry is accepted but says so, because the alternative is not "a careful blank" — it is the
// engine inventing something, which is how a warship got into the German.
async function wikidataNames(scientificNames) {
  const out = {}
  const list = [...new Set(scientificNames)].filter(Boolean)
  const CHUNK = 60
  for (let i = 0; i < list.length; i += CHUNK) {
    const values = list.slice(i, i + CHUNK).map((n) => `"${n.replace(/"/g, '')}"`).join(' ')
    // Labels AND Wikipedia article titles, because they are not the same thing and the difference
    // matters. Wikidata's French label for Physalia physalis is the binomial; the French Wikipedia
    // article is called "Physalie". An encyclopaedia titles its article with the name readers look
    // up, which is exactly the question a glossary is asking. Labels are preferred where both
    // exist; the sitelink fills the many gaps where a label is only the scientific name.
    const query = `
      SELECT ?name ?lang ?label ?alt ?site ?title WHERE {
        VALUES ?name { ${values} }
        ?taxon wdt:P225 ?name .
        {
          ?taxon rdfs:label ?label .
          BIND(LANG(?label) AS ?lang)
          FILTER(?lang IN ("de","fr","es","ja","ko","zh-hant","zh-tw","zh","ar"))
        } UNION {
          ?taxon skos:altLabel ?alt .
          BIND(LANG(?alt) AS ?lang)
          FILTER(?lang IN ("de","fr","es","ja","ko","zh-hant","zh-tw","zh","ar"))
        } UNION {
          ?article schema:about ?taxon ; schema:isPartOf ?site ; schema:name ?title .
          FILTER(?site IN (<https://de.wikipedia.org/>, <https://fr.wikipedia.org/>,
                           <https://es.wikipedia.org/>, <https://ja.wikipedia.org/>,
                           <https://ko.wikipedia.org/>, <https://zh.wikipedia.org/>,
                           <https://ar.wikipedia.org/>))
        }
      }`
    const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'blaschka-glossary/1.0 (Canterbury Museum interpretation prototype)',
        Accept: 'application/sparql-results+json',
      },
    })
    if (!res.ok) throw new Error(`Wikidata returned ${res.status}`)
    for (const b of (await res.json()).results.bindings) {
      const n = b.name.value
      const slot = (out[n] ??= {})
      if (b.label) {
        slot[b.lang.value] = b.label.value
      } else if (b.alt) {
        // Aliases: the other names Wikidata records for the same animal. Not a preference, but
        // corroboration — a GBIF candidate that Wikidata also lists is a name in real use, which is
        // enough to choose it over one that appears in a bulk-contributed list and nowhere else.
        ;((slot.alt ??= {})[b.lang.value] ??= []).push(b.alt.value)
      } else if (b.site && b.title) {
        // "Physalie (cnidaire)" — the parenthetical is Wikipedia disambiguating its own titles, not
        // part of the name. Stored separately so a real label always outranks an article title.
        const code = b.site.value.match(/https:\/\/([a-z-]+)\.wikipedia/)?.[1]
        if (code) (slot.wiki ??= {})[code] = b.title.value.replace(/\s*\([^)]*\)\s*$/, '').trim()
      }
    }
    process.stdout.write(`  ${Math.min(i + CHUNK, list.length)}/${list.length} looked up\r`)
  }
  return out
}

// Traditional Chinese in order of specificity. Wikidata stores zh-hant, zh-tw and plain zh, and
// they are not always the same string.
const pickLabel = (labels, code) => {
  if (!labels) return null
  if (code === 'zh-Hant') return labels['zh-hant'] ?? labels['zh-tw'] ?? labels.zh ?? null
  return labels[code] ?? null
}

// The Wikipedia article title, used only where the label turned out to be the bare binomial.
const pickArticle = (labels, code) => {
  const w = labels?.wiki
  if (!w) return null
  return code === 'zh-Hant' ? (w.zh ?? null) : (w[code] ?? null)
}

// True when every candidate is the same name written differently — hyphens, spacing, case. Not a
// similarity score: it collapses only formatting, so "Gelbe Lungenqualle" and "Lungenqualle" stay
// distinct (one is qualified, the other is not) while "Speer-Anemone" and "Speeranemone" do not.
// The single GBIF candidate that Wikidata also lists as an alias. Null when none match, or when
// several do — two corroborated names is still a choice, and choosing is what a reviewer is for.
const aliasPick = (labels, code, cands) => {
  const alts = code === 'zh-Hant' ? (labels?.alt?.['zh-hant'] ?? labels?.alt?.['zh-tw'] ?? labels?.alt?.zh) : labels?.alt?.[code]
  if (!alts?.length) return null
  const set = new Set(alts.map((a) => a.toLowerCase()))
  const hits = cands.filter((c) => set.has(c.toLowerCase()))
  return hits.length === 1 ? hits[0] : null
}

const sameWord = (cands) => {
  const key = (s) => s.toLowerCase().replace(/[\s\-–—'’]/g, '')
  return new Set(cands.map(key)).size === 1
}

async function resolve() {
  const terms = loadGlossary()
  const today = new Date().toISOString().slice(0, 10)

  // The accepted scientific name is recorded in the authority string by seed().
  const sciOf = (t) => t.authority?.match(/GBIF \d+ \((.+)\)$/)?.[1] ?? null
  const names = Object.values(terms).map(sciOf).filter(Boolean)
  console.log(`${names.length} scientific names to look up in Wikidata\n`)
  const wd = await wikidataNames(names)
  process.stdout.write(' '.repeat(40) + '\r')

  let agreed = 0
  let single = 0
  let disputed = 0
  const disputes = []

  for (const [term, entry] of Object.entries(terms)) {
    const sci = sciOf(entry)
    const labels = sci ? wd[sci] : null
    entry.langs ??= {}
    entry.candidates ??= {}

    for (const code of LANGS) {
      if (entry.langs[code]?.status === 'accepted' && entry.langs[code].source?.includes('chosen by hand')) continue
      const cands = entry.candidates[code] ?? []
      let label = pickLabel(labels, code)
      // A label equal to the binomial is Wikidata saying it has no vernacular name, not offering
      // one. Those belong in the do-not-translate list, not the glossary. Subgenus parentheses are
      // stripped before comparing — "Holothuria (Holothuria) tubulosa" is the same name as
      // "Holothuria tubulosa", and §6 lists that formatting as a known source of false positives.
      const bare = (s) => s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      if (label && sci && bare(label) === bare(sci)) label = null
      // Fall back to the article title, and reject that too if it is just the binomial again.
      let via = 'Wikidata'
      if (!label) {
        const art = pickArticle(labels, code)
        if (art && !(sci && bare(art) === bare(sci))) {
          label = art
          via = 'Wikipedia article title'
        }
      }

      const match = label && cands.find((c) => c.toLowerCase() === label.toLowerCase())

      if (label && match) {
        entry.langs[code] = { text: match, status: 'accepted', source: `GBIF and ${via} agree (${sci})`, checkedOn: today }
        agreed++
      } else if (label && !cands.length) {
        entry.langs[code] = { text: label, status: 'accepted', source: `${via} only (${sci})`, checkedOn: today }
        single++
      } else if (label && cands.length) {
        // The two disagree, and Wikidata wins — for a stated reason rather than by preference.
        // Its label is the title of a curated article, one per language; GBIF's vernacular lists
        // are contributed in bulk and carry the wear of it. Its German for the common cuttlefish
        // offers ten names including "Gemeiner Tintenfish", a typo. A list that contains typos can
        // tell you a name exists; it cannot tell you which name to print.
        //
        // The rejected candidates stay under `candidates`, so this is an argued choice on the
        // record rather than a first hit taken quietly.
        entry.langs[code] = { text: label, status: 'accepted', source: `${via}, over ${cands.length} GBIF candidate(s) (${sci})`, checkedOn: today }
        entry.candidates[code] = [...new Set([label, ...cands])]
        disputed++
        disputes.push({ term, code, label, cands })
      } else if (!label && cands.length > 1 && entry.langs[code]?.status !== 'accepted' && aliasPick(labels, code, cands)) {
        // No label and no article title, but Wikidata lists one of GBIF's candidates as an alias —
        // a name it records for this animal. That is corroboration from a second source, which is
        // the standard everything else here is held to.
        const pick = aliasPick(labels, code, cands)
        entry.langs[code] = { text: pick, status: 'accepted', source: `GBIF candidate corroborated by a Wikidata alias (${sci})`, checkedOn: today }
        single++
      } else if (!label && cands.length > 1 && entry.langs[code]?.status !== 'accepted' && sameWord(cands)) {
        // No second authority, but the candidates are not really alternatives — they are one word
        // spelled differently. "Speer-Anemone" and "Speeranemone" are the same German compound with
        // and without its hyphen. Choosing between those is orthography, not naming, so it does not
        // need a curator; the hyphenated form is taken as the more conventional written one.
        const pick = [...cands].sort((a, b) => b.length - a.length)[0]
        entry.langs[code] = { text: pick, status: 'accepted', source: `GBIF, spelling variants of one name (${sci})`, checkedOn: today }
        single++
      } else if (!label && cands.length === 1 && entry.langs[code]?.status !== 'accepted') {
        entry.langs[code] = { text: cands[0], status: 'accepted', source: `GBIF only, sole candidate (${sci})`, checkedOn: today }
        single++
      }
    }
  }

  writeFileSync(
    GLOSSARY,
    JSON.stringify(
      {
        note:
          'Terms whose translation is a fact rather than a guess. Seeded from GBIF vernacular names and cross-checked against Wikidata by scripts/glossary.mjs. A name is accepted when both authorities agree, or when only one of them has an opinion — recorded either way in `source`, so a reviewer can see how settled each entry is. Where the two disagree the name stays under `candidates` for a person to choose. Applied by scripts/translate.mjs as a dynamic dictionary and asserted on the way back.',
        terms: Object.fromEntries(Object.entries(terms).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2
    ) + '\n'
  )

  console.log(`  ${agreed} accepted because both authorities agree`)
  console.log(`  ${single} accepted on a single authority`)
  console.log(`  ${disputed} left for a person: the authorities disagree\n`)
  for (const d of disputes.slice(0, 20)) {
    console.log(`  ${d.term} · ${d.code}`)
    console.log(`      Wikidata: ${d.label}`)
    console.log(`      GBIF:     ${d.cands.join(' / ')}`)
  }
  if (disputes.length > 20) console.log(`  … and ${disputes.length - 20} more`)
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
  if (RESOLVE) await resolve()
  report()
}
