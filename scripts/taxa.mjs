// Resolve every object's catalogue binomial to a taxonomic record that can be linked, once, at
// build time — WoRMS for the name, GBIF for the occurrences.
//
//   node scripts/taxa.mjs            resolve everything, write src/data/taxa.json
//   node scripts/taxa.mjs --verify   re-check that every URL already in taxa.json still answers
//
// §6 is explicit that this never runs at runtime: "the ambiguities below need human adjudication,
// and a visitor's page must not depend on a third party being up. WoRMS opinions are revised
// continuously, so an undated cached answer implies a timeless truth." So every record carries the
// date it was looked up, and the app prints it.
//
// The traps in §6 are what most of this file is. Each one is a measured way that a naive resolver
// publishes a confident wrong answer:
//
//   - Never hits[0]. Oceania phosphorica returns two records resolving to two species; Tethys
//     leporina three, resolving to two species plus one invalid. Where the hits disagree about
//     which species is meant, this resolves NOTHING and says why.
//   - Never fuzzy. Twelve misspellings across fourteen objects resolve only by fuzzy match. A
//     fuzzy hit is recorded as a candidate for a human to confirm; it is never published.
//   - marine_only=false. Ten objects are land or freshwater animals — the slugs, the snails, the
//     ramshorn, the flatworms — and the marine filter reports all ten as unfound.
//   - Qualifiers are stripped before querying, and the variety is kept in the DISPLAYED name even
//     when it is unresolvable: stripping it discards a distinction the Blaschkas recorded.
//   - Three objects cannot participate at all and degrade to no record rather than an empty one.

import { readFileSync, writeFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))
const OUT = new URL('../src/data/taxa.json', import.meta.url)

const manifest = read('manifest.json')
const VERIFY = process.argv.includes('--verify')

// The date this resolution happened, passed in rather than read from the clock so a re-run that
// changes nothing does not churn the file. Falls back to today.
const TODAY = process.env.TAXA_DATE ?? new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ what cannot be resolved

// §6: "Three objects cannot participate at all — 1884.137.92, 1884.137.136 ("soft coral polyp")
// and 1884.137.59 (Porpita, genus only). Degrade to no panel, not an empty one."
//
// .59 is here for a different reason from the other two: Porpita IS a resolvable genus, and the
// object gets a genus-rank record below. What it cannot have is a species-level claim.
const NO_SPECIES = {
  '1884.137.92': 'The catalogue calls it "Glass studded spike from unknown model". There is no animal to look up.',
  '1884.137.136': 'The catalogue name is "soft coral polyp" — a description, not a binomial. No species was ever recorded.',
}

// ------------------------------------------------------------------ catalogue name → query name

// Everything after the first comma is the Museum's own qualifier on the model, not part of the
// name: ", adult", ", female", ", stages of development", ", Stage One and Two".
const QUALIFIER = /,.*$/
// "showing development in three stages.", "male polyps and medusa" — the same qualifier without
// the comma, on the four titles that were catalogued without one.
const TRAILING = /\s+(showing development.*|male polyps and medusa|anatomy)\.?$/i
// §6: six titles carry a variety and only one exists in WoRMS. Stripped for the QUERY only.
const VARIETY = /\s+variety\s+\S+$/i

const FOLD = { ë: 'e', ï: 'i', ö: 'o', ü: 'u', é: 'e', è: 'e', æ: 'ae' }

// Two titles are hyphenated compounds of two epithets — "Salpa democratica-mucronata",
// "Doliolum Ehrenbergii-Troschelii". Each is one model of an animal with two names in circulation
// in the 1880s, not one name. Both halves are queried and both must agree, or nothing is published.
const HYPHEN = /^(\S+)\s+(\S+)-(\S+)$/

function queryNames(title) {
  const base = title
    .replace(QUALIFIER, '')
    .replace(TRAILING, '')
    .replace(VARIETY, '')
    .replace(/\.$/, '')
    .trim()
    .replace(/[ëïöüéèæ]/g, (c) => FOLD[c])

  const m = base.match(HYPHEN)
  if (m) {
    const [, genus, a, b] = m
    return [`${genus} ${a.toLowerCase()}`, `${genus} ${b.toLowerCase()}`]
  }
  // The epithet is capitalised on three titles (Ehrenbergii, Troschelii, Sieboldii-style patronyms
  // written the nineteenth-century way). WoRMS matches case-insensitively but the stored name
  // should be the modern form.
  const parts = base.split(/\s+/)
  if (parts.length === 2) return [`${parts[0]} ${parts[1].toLowerCase()}`]
  return [base]
}

// ------------------------------------------------------------------ the two services

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'blaschka-prototype/1.0 (Canterbury Museum companion, build-time)' } })
      if (res.status === 204) return null // WoRMS says "no match" with a 204 and an empty body
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(500 * (i + 1))
    }
  }
}

// WoRMS. like=false is exact-match only — §6 forbids publishing on a fuzzy hit, so the fuzzy
// endpoint is queried separately and its answer is stored as a candidate, never as a resolution.
const WORMS = 'https://www.marinespecies.org/rest'

async function worms(name) {
  const hits = (await json(`${WORMS}/AphiaRecordsByName/${encodeURIComponent(name)}?like=false&marine_only=false`)) ?? []
  if (!hits.length) return { hits: [], fuzzy: await wormsFuzzy(name) }
  return { hits, fuzzy: null }
}

async function wormsFuzzy(name) {
  const out = await json(`${WORMS}/AphiaRecordsByMatchNames?scientificnames[]=${encodeURIComponent(name)}&marine_only=false`)
  const first = out?.[0]?.[0]
  if (!first) return null
  return { name: first.scientificname, aphiaID: first.AphiaID, matchType: first.match_type ?? 'near', status: first.status }
}

// GBIF. `match` gives a usageKey and, critically, a matchType — EXACT, FUZZY, HIGHERRANK, NONE.
// Only EXACT at the rank we asked for is published.
const GBIF = 'https://api.gbif.org/v1'

async function gbif(name, rank) {
  const m = await json(`${GBIF}/species/match?name=${encodeURIComponent(name)}&rank=${rank}&strict=false`)
  if (!m || m.matchType === 'NONE') return null
  return {
    usageKey: m.usageKey,
    scientificName: m.canonicalName ?? m.scientificName,
    matchType: m.matchType,
    confidence: m.confidence,
    rank: m.rank,
    status: m.status,
  }
}

// How many occurrence records GBIF holds for the accepted taxon, and how many of those are in
// New Zealand. §6's occurrence layer wants the count shown rather than rounded into "common here".
async function occurrences(usageKey) {
  const all = await json(`${GBIF}/occurrence/search?taxonKey=${usageKey}&limit=0`)
  const nz = await json(`${GBIF}/occurrence/search?taxonKey=${usageKey}&country=NZ&limit=0`)
  return { total: all?.count ?? 0, nz: nz?.count ?? 0 }
}

// ------------------------------------------------------------------ resolve one object

// The whole adjudication, in one place. Everything it refuses to answer, it refuses loudly: an
// entry always exists, and `resolved` is what says whether anything may be linked.
async function resolve(object) {
  const title = object.title
  const entry = { accession: object.accession, catalogueName: title, retrieved: TODAY }

  if (NO_SPECIES[object.accession]) {
    return { ...entry, resolved: false, why: NO_SPECIES[object.accession] }
  }

  const queries = queryNames(title)
  const rank = queries[0].includes(' ') ? 'species' : 'genus'
  entry.queried = queries
  entry.rank = rank

  const results = []
  for (const q of queries) {
    const w = await worms(q)
    results.push({ query: q, ...w })
  }

  // Every accepted-or-not record WoRMS returned, reduced to the thing that decides the link: which
  // currently-valid taxon does this name point at? Distinct valid AphiaIDs across the hits is the
  // homonym test — one is an answer, two is a coin flip.
  const flat = results.flatMap((r) => r.hits)
  const valid = [...new Set(flat.map((h) => h.valid_AphiaID).filter(Boolean))]

  if (!flat.length) {
    const fuzzy = results.map((r) => r.fuzzy).find(Boolean)
    return {
      ...entry,
      resolved: false,
      why: fuzzy
        ? `No exact match in WoRMS. A fuzzy match suggests ${fuzzy.name} (AphiaID ${fuzzy.aphiaID}), which §6 forbids publishing on without a human confirming it.`
        : 'No match in WoRMS, exact or fuzzy.',
      fuzzyCandidate: fuzzy ?? null,
    }
  }

  if (valid.length > 1) {
    return {
      ...entry,
      resolved: false,
      why: `${flat.length} WoRMS records resolving to ${valid.length} different accepted taxa. §6: never take hits[0].`,
      candidates: flat.map((h) => ({ aphiaID: h.AphiaID, name: h.scientificname, status: h.status, valid: h.valid_name, validAphiaID: h.valid_AphiaID })),
    }
  }

  // One name, one answer. The record WoRMS returned for the catalogue's own spelling, and the
  // record for the name that spelling now points at — which may be the same one.
  const hit = flat.find((h) => h.valid_AphiaID === valid[0]) ?? flat[0]
  const accepted = hit.status === 'accepted'
  let current = hit
  if (!accepted && hit.valid_AphiaID && hit.valid_AphiaID !== hit.AphiaID) {
    current = (await json(`${WORMS}/AphiaRecordByAphiaID/${hit.valid_AphiaID}`)) ?? hit
  }

  const g = await gbif(current.valid_name ?? current.scientificname, current.rank?.toLowerCase() ?? rank)
  const counts = g && g.matchType === 'EXACT' ? await occurrences(g.usageKey) : null

  return {
    ...entry,
    resolved: true,
    worms: {
      aphiaID: hit.AphiaID,
      name: hit.scientificname,
      authority: hit.authority,
      status: hit.status,
      unacceptReason: hit.unacceptreason ?? null,
      url: `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${hit.AphiaID}`,
      citation: hit.citation ?? null,
    },
    // Only present where the catalogue's name is not the current one. §6: "Never silently replace a
    // catalogue name with a modern one. Show both."
    current:
      current.AphiaID === hit.AphiaID
        ? null
        : {
            aphiaID: current.AphiaID,
            name: current.valid_name ?? current.scientificname,
            authority: current.valid_authority ?? current.authority,
            url: `https://www.marinespecies.org/aphia.php?p=taxdetails&id=${current.AphiaID}`,
          },
    gbif:
      g && g.matchType === 'EXACT'
        ? {
            usageKey: g.usageKey,
            name: g.scientificName,
            url: `https://www.gbif.org/species/${g.usageKey}`,
            occurrences: counts.total,
            occurrencesNZ: counts.nz,
          }
        : null,
    gbifWhy: g && g.matchType !== 'EXACT' ? `GBIF matched only by ${g.matchType} at ${g.confidence}% confidence — not published.` : g ? null : 'No GBIF match.',
    classification: { phylum: current.phylum ?? null, class: current.class ?? null, order: current.order ?? null, family: current.family ?? null },
  }
}

// ------------------------------------------------------------------ MarLIN

// The Marine Life Information Network's species pages are the best plain-English writing available
// for this collection specifically — MarLIN covers the north-east Atlantic, and the north-east
// Atlantic is what the Blaschkas modelled. A page there is a paragraph on what the animal does,
// where it lives and how it breeds, written for a general reader.
//
// Matched against MarLIN's own A–Z index rather than guessed from a URL pattern: the index gives
// the exact id for an exact scientific name, so a match is a string equality and never a search
// ranking. Species rank only — MarLIN holds a sibling species for a further fourteen objects, and
// linking "another animal in the same genus" as though it were this one is the mistake §6 spends a
// page warning about.
const MARLIN_AZ = 'https://www.marlin.ac.uk/species/az/scientific'
const MARLIN_ROW = /href="https:\/\/www\.marlin\.ac\.uk\/species\/detail\/(\d+)"[^>]*>[\s\S]*?<em>([^<]+)<\/em>(?:\s*\(([^)]*)\))?/gi

async function marlinIndex() {
  const index = new Map()
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const res = await fetch(`${MARLIN_AZ}/${letter}`)
    if (!res.ok) throw new Error(`MarLIN A–Z ${letter}: HTTP ${res.status}`)
    const html = await res.text()
    for (const m of html.matchAll(MARLIN_ROW)) {
      index.set(m[2].trim(), { id: m[1], common: (m[3] ?? '').trim() })
    }
    await sleep(120)
  }
  return index
}

// WoRMS writes subgenera as "Caryophyllia (Caryophyllia) smithii" and so does MarLIN, but only one
// of them does it on any given name. §6: "Subgenus formatting produces false positives" — here it
// produces false NEGATIVES, so both spellings are tried and neither is invented.
const withoutSubgenus = (n) => n.replace(/\s*\([^)]*\)\s*/, ' ').replace(/\s+/g, ' ').trim()

function marlinFor(index, entry) {
  if (!entry.resolved) return null
  const accepted = entry.current?.name ?? entry.worms.name
  for (const candidate of [accepted, withoutSubgenus(accepted)]) {
    const hit = index.get(candidate)
    if (hit) return { id: hit.id, name: candidate, common: hit.common || null, url: `https://www.marlin.ac.uk/species/detail/${hit.id}` }
    // The index key may carry the subgenus where our name does not.
    for (const [key, value] of index) {
      if (withoutSubgenus(key) === candidate) {
        return { id: value.id, name: key, common: value.common || null, url: `https://www.marlin.ac.uk/species/detail/${value.id}` }
      }
    }
  }
  return null
}

// ------------------------------------------------------------------ verify

// Every URL this file will hand to a visitor, fetched. A link that 404s in a museum's own app is
// worse than no link, and these are third-party URLs that can rot without anyone here noticing.
async function verify() {
  const data = JSON.parse(readFileSync(OUT, 'utf8'))
  const urls = new Set()
  for (const t of Object.values(data.taxa)) {
    if (t.worms?.url) urls.add(t.worms.url)
    if (t.current?.url) urls.add(t.current.url)
    if (t.gbif?.url) urls.add(t.gbif.url)
    if (t.marlin?.url) urls.add(t.marlin.url)
  }
  // Every hand-curated link too. These are the ones a script cannot re-derive, so they are the ones
  // most worth re-checking: a rotted URL here is a dead end a visitor was invited to follow.
  const curated = JSON.parse(readFileSync(new URL('../src/data/elsewhere.json', import.meta.url), 'utf8'))
  for (const list of [curated.collection, ...Object.values(curated.groups), ...Object.values(curated.objects)]) {
    for (const link of list) urls.add(link.url)
  }
  // Te Ara, EOL and the Corning Museum sit behind a bot challenge that answers 403 to anything
  // without a real browser. That is not a dead link and must not fail a build — but it does mean
  // those URLs are checked by a human, not by this, so they are counted and named rather than
  // quietly passed.
  const CHALLENGED = ['teara.govt.nz', 'eol.org', 'cmog.org']
  // gbif.org serves the same challenge, but GBIF's API does not — and a species page is exactly as
  // real as the usage key in its URL. So the key is checked instead of the page, which is a
  // stronger test anyway: it confirms the taxon, not just that a server answered.
  const asApi = (url) => {
    const m = url.match(/^https:\/\/www\.gbif\.org\/species\/(\d+)$/)
    return m ? `https://api.gbif.org/v1/species/${m[1]}` : url
  }
  const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
  let bad = 0
  let unverifiable = 0
  for (const url of urls) {
    const challenged = CHALLENGED.some((h) => new URL(url).hostname.endsWith(h))
    const target = asApi(url)
    const headers = target === url ? UA : { accept: 'application/json' }
    // Retried, and paced. Checking 294 URLs as fast as the event loop allows makes WoRMS and MarLIN
    // drop connections, and a transient refusal reported as a dead link is worse than useless — it
    // trains everyone to ignore this output.
    let last = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(2000 * attempt)
      try {
        const res = await fetch(target, { method: 'GET', redirect: 'follow', headers })
        if (res.ok) {
          last = null
          break
        }
        last = String(res.status)
        if (challenged && (res.status === 403 || res.status === 503)) break
      } catch (e) {
        last = e.message
      }
    }
    await sleep(150)
    if (!last) continue
    if (challenged) {
      unverifiable++
      continue
    }
    console.log(`  ✗ ${last}  ${url}`)
    bad++
  }
  console.log(`\n${urls.size - bad - unverifiable}/${urls.size} URLs answered`)
  if (unverifiable) console.log(`${unverifiable} behind a bot challenge (Te Ara, EOL) — check these by hand, not here`)
  if (bad) process.exitCode = 1
}

// ------------------------------------------------------------------ run

if (VERIFY) {
  await verify()
} else {
  console.log('Reading the MarLIN A–Z index…')
  const marlin = await marlinIndex()
  console.log(`  ${marlin.size} species indexed\n`)

  const taxa = {}
  let ok = 0
  let marlinHits = 0
  for (const o of manifest.objects) {
    const r = await resolve(o)
    const m = marlinFor(marlin, r)
    if (m) {
      r.marlin = m
      marlinHits++
    }
    taxa[o.accession] = r
    if (r.resolved) ok++
    const mark = r.resolved ? (r.current ? '~' : '✓') : '✗'
    console.log(`  ${mark} ${o.accession.padEnd(14)} ${(r.queried?.[0] ?? o.title).padEnd(34)} ${r.resolved ? `Aphia ${r.worms.aphiaID}${r.gbif ? `  GBIF ${r.gbif.occurrences} recs (${r.gbif.occurrencesNZ} NZ)` : '  no GBIF'}${m ? `  MarLIN ${m.id}` : ''}` : r.why}`)
    await sleep(120)
  }

  const out = {
    note:
      'Machine-resolved taxonomic records, one per object, produced by scripts/taxa.mjs and NOT hand-edited — a re-run overwrites this file. ' +
      'It exists so §6\'s external links can be built without a runtime dependency on WoRMS or GBIF. `resolved: false` is a real answer and the ' +
      'app must render it as one: the reasons are the homonyms, the misspellings and the three objects with no animal to look up, all of which §6 ' +
      'names. Hand-curated further reading lives in src/data/elsewhere.json instead, which this file never touches.',
    generatedBy: 'scripts/taxa.mjs',
    retrieved: TODAY,
    sources: {
      worms: { name: 'World Register of Marine Species', url: 'https://www.marinespecies.org', licence: 'CC BY 4.0' },
      gbif: { name: 'Global Biodiversity Information Facility', url: 'https://www.gbif.org', licence: 'CC BY 4.0' },
      marlin: { name: 'MarLIN — the Marine Life Information Network', url: 'https://www.marlin.ac.uk', licence: 'CC BY-NC-SA 4.0' },
    },
    counts: { total: manifest.objects.length, resolved: ok, unresolved: manifest.objects.length - ok, marlin: marlinHits },
    taxa,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log(`\n${ok}/${manifest.objects.length} resolved, ${marlinHits} with a MarLIN species page  →  src/data/taxa.json`)
}
