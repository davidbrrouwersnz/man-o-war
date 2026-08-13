// Which words in the English content will a New Zealand English voice get wrong?
//
// §13: "Pronunciation is metadata, never different words." So we may not respell anything in the
// stories to fix the voice - every fix has to go in a separate lexicon. This finds the candidates
// so that lexicon is built from what is actually in the text rather than from memory.
//
//   node scripts/lexicon-scan.mjs
//
// Output is a starting list for a human, not a lexicon. Deciding HOW a word is said is a curator
// and speaker judgement; this only decides WHICH words need deciding about.

import { readFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

const museum = read('stories.json')
const drafted = read('stories-drafted.json')
const layers = read('layers.json')
const STORIES = { ...drafted.stories, ...museum.stories }

// Everything a Molly-voiced track would ever say, in one bucket.
const spoken = []
for (const s of Object.values(STORIES)) {
  spoken.push(s.headline)
  if (s.identification) spoken.push(s.identification)
  for (const seg of s.segments) spoken.push(seg.heading, seg.text)
}
for (const p of Object.values(museum.panels)) {
  for (const k of ['panel', 'ending']) if (p[k]) spoken.push(p[k])
}
for (const l of Object.values(layers.layers)) {
  for (const seg of l.segments) spoken.push(seg.heading, seg.text)
}
const corpus = spoken.join('\n')

const count = (re) => {
  const hits = new Map()
  for (const m of corpus.matchAll(re)) {
    const key = (m[1] ?? m[0]).trim()
    hits.set(key, (hits.get(key) ?? 0) + 1)
  }
  return [...hits].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const show = (title, why, rows) => {
  console.log(`\n${title}  (${rows.length})`)
  console.log(`  ${why}`)
  for (const [word, n] of rows) console.log(`    ${String(n).padStart(3)}x  ${word}`)
}

// ------------------------------------------------------------------ binomials
// Taken from the manifest's title field rather than pattern-matched out of the prose. The titles
// ARE the scientific names (the four catalogue prefixes are already stripped at harvest), so this
// is the authoritative list. Regexing prose for "Capitalised lowercase" pulls in every sentence
// that happens to open with two ordinary words - "Three models", "Comb jellies are".
const manifest = read('manifest.json').objects
const binomials = new Map()
for (const rec of manifest) {
  const name = rec.title?.trim()
  if (!name || !/^[A-Z][a-z]+\s+[a-z]/.test(name)) continue
  binomials.set(name, (binomials.get(name) ?? 0) + 1)
}
// Alternate names appear only in the identification notes, and get spoken too.
for (const s of Object.values(STORIES)) {
  if (!s.identification) continue
  for (const m of s.identification.matchAll(/\b([A-Z][a-z]{2,}\s+[a-z]{3,})\b/g)) {
    if (!binomials.has(m[1])) binomials.set(m[1], 0)
  }
}
show(
  'SCIENTIFIC NAMES',
  'Latin, from manifest titles and identification notes. An English voice applies English stress.',
  [...binomials].sort((a, b) => a[0].localeCompare(b[0]))
)

// The genus is the reusable unit - one lexicon entry for Physalia covers every Physalia species.
// Manifest titles only. The identification notes are prose, so scraping them for a genus picks up
// whatever ordinary word happens to start the sentence.
const genera = new Map()
for (const rec of manifest) {
  const name = rec.title?.trim()
  if (!name || !/^[A-Z][a-z]+\s+[a-z]/.test(name)) continue
  const g = name.split(/\s+/)[0]
  genera.set(g, (genera.get(g) ?? 0) + 1)
}
show(
  'DISTINCT GENERA',
  'One lexicon entry per genus covers every species under it. This is the real list to record.',
  [...genera].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
)

// ------------------------------------------------------------------ jargon
// Hand-listed because there is no pattern that catches them - they are ordinary-looking English
// words with non-obvious stress, or Greek loans.
const JARGON = [
  'zooid', 'zooids', 'siphonophore', 'siphonophores', 'ctenophore', 'ctenophores',
  'nudibranch', 'nudibranchs', 'cnidarian', 'cnidarians', 'nematocyst', 'nematocysts',
  'pteropod', 'pteropods', 'medusa', 'medusae', 'polyp', 'polyps', 'tunicate', 'tunicates',
  'ascidian', 'ascidians', 'salp', 'salps', 'chordate', 'chordates', 'notochord',
  'echinoderm', 'echinoderms', 'ossicle', 'ossicles', 'sclerite', 'sclerites',
  'anemone', 'anemones', 'holothurian', 'crinoid', 'crinoids', 'ophiuroid',
  'annelid', 'annelids', 'polychaete', 'polychaetes', 'gastropod', 'gastropods',
  'cephalopod', 'cephalopods', 'nautilus', 'argonaut', 'argonauts', 'chloroplast',
  'chloroplasts', 'symbiotic', 'planktonic', 'pelagic', 'benthic', 'sessile',
  'radula', 'operculum', 'byssus', 'cilia', 'ciliary', 'gonad', 'gonads',
]
const jargonHits = JARGON.map((w) => {
  const n = [...corpus.matchAll(new RegExp(`\\b${w}\\b`, 'gi'))].length
  return [w, n]
}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
show('DOMAIN VOCABULARY', 'Greek and Latin loans. Stress is not guessable from the spelling.', jargonHits)

// ------------------------------------------------------------------ names
show(
  'PEOPLE AND PLACES',
  'German and Māori names read by an English voice.',
  count(/\b(Blaschka|Leopold|Rudolf|Dresden|Hochstetter|Haast|Aotearoa|Māori|Maori|Ngāi Tahu|Te Papa|Canterbury|Christchurch)\b/g)
)

// ------------------------------------------------------------------ numbers
// The classic TTS failures. A voice that says "one eight eight four" or "twenty-eight cm" has
// changed what the visitor hears from what the page says.
show(
  'NUMBERS, DATES AND UNITS',
  'Read wrongly by default: years as digits, ordinals, abbreviated units.',
  count(/\b(\d+(?:st|nd|rd|th)-century|\d+(?:st|nd|rd|th)|\d{4}s?|\d+\s*(?:centimetres|centimetre|millimetres|metres|cm|mm|m)\b)/g)
)

// ------------------------------------------------------------------ punctuation
// Apostrophes and hyphens that a voice may swallow, spell out, or turn into a pause.
show(
  'AWKWARD PUNCTUATION',
  'Elision and hyphenation a voice may mispronounce or read aloud as punctuation.',
  count(/\b([a-zA-Z]+\s+o'\s*[a-zA-Z]+|[a-zA-Z]+'[a-zA-Z]+|[a-z]+-[a-z]+-[a-z]+)\b/g).filter(
    ([w]) => !/^(it's|its|that's|there's|doesn't|don't|didn't|isn't|wasn't|can't|won't|hasn't|haven't|isn't|isn|you're|they're|we're|he's|she's|what's|here's|isn't)$/i.test(w)
  )
)

console.log(`\nCorpus: ${corpus.length} characters of English that Molly would read.`)
