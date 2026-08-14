// The pronunciation list, laid out for a human to correct.
//
//   node scripts/pronunciation-review.mjs            everything, ordered by how much it needs you
//   node scripts/pronunciation-review.mjs --urgent   only the entries that need an answer
//   node scripts/pronunciation-review.mjs --md       markdown, for pasting into an email
//
// The IPA in pronunciation.json is what the machine reads. Nobody proofreads IPA, so this prints
// the plain respelling instead, with the reason beside anything that was a judgement call rather
// than a rule. A reviewer only has to answer one question per line: is that how you say it?

import { readFileSync } from 'node:fs'

const pron = JSON.parse(readFileSync(new URL('../src/data/pronunciation.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(readFileSync(new URL('../src/data/manifest.json', import.meta.url), 'utf8')).objects

const args = process.argv.slice(2)
const URGENT = args.includes('--urgent')
const MD = args.includes('--md')

// How often each word is actually spoken, so a reviewer spends their attention where it is heard.
// A wrong pronunciation on the man o' war matters more than one on a genus mentioned once.
const spoken = []
for (const rec of manifest) {
  spoken.push(rec.title ?? '', rec.catalogueName ?? '')
}
const stories = JSON.parse(readFileSync(new URL('../src/data/stories.json', import.meta.url), 'utf8'))
const drafted = JSON.parse(readFileSync(new URL('../src/data/stories-drafted.json', import.meta.url), 'utf8'))
for (const s of Object.values({ ...drafted.stories, ...stories.stories })) {
  spoken.push(s.headline, s.identification ?? '')
  for (const seg of s.segments) spoken.push(seg.heading, seg.text)
}
for (const p of Object.values(stories.panels)) for (const k of ['panel', 'ending']) if (p[k]) spoken.push(p[k])
const corpus = spoken.join('\n').toLowerCase()
const heard = (word) => (corpus.match(new RegExp(`\\b${word.toLowerCase()}\\b`, 'g')) ?? []).length

const GROUPS = { genera: 'Scientific names (genus)', epithets: 'Scientific names (species)', terms: 'Biological terms', names: 'People and places' }
const RANK = { low: 0, medium: 1, high: 2 }

const rows = []
for (const [group, label] of Object.entries(GROUPS)) {
  for (const [word, e] of Object.entries(pron[group] ?? {})) {
    rows.push({ group: label, word, say: e.say, why: e.why ?? '', confidence: e.confidence, heard: heard(word) })
  }
}

const shown = URGENT ? rows.filter((r) => r.confidence === 'low') : rows
shown.sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || b.heard - a.heard || a.word.localeCompare(b.word))

const HEADING = {
  low: 'NEEDS AN ANSWER — I am guessing, and a guess read aloud in a gallery is worse than a gap',
  medium: 'WORTH A LOOK — defensible, but a specialist may prefer the other variant',
  high: 'CONFIDENT — rule-derived; skim for anything that looks wrong',
}

if (MD) {
  console.log(`# Pronunciation review — Blaschka audio guide\n`)
  console.log(`Voice: Molly (New Zealand English). ${rows.length} entries.`)
  console.log(`\nEach line is a word the narration says aloud. "Said as" is how it will sound.`)
  console.log(`Please correct anything that is wrong — you do not need to write phonetics, just tell`)
  console.log(`me how you say it.\n`)
  let last = null
  for (const r of shown) {
    if (r.confidence !== last) { console.log(`\n## ${HEADING[r.confidence]}\n`); console.log(`| Word | Said as | Times heard | Note |`); console.log(`| --- | --- | --- | --- |`); last = r.confidence }
    console.log(`| ${r.word} | ${r.say} | ${r.heard} | ${r.why} |`)
  }
} else {
  let last = null
  for (const r of shown) {
    if (r.confidence !== last) { console.log(`\n${'='.repeat(78)}\n${HEADING[r.confidence]}\n${'='.repeat(78)}`); last = r.confidence }
    const times = r.heard ? `${r.heard}x` : '—'
    console.log(`  ${r.word.padEnd(20)} ${r.say.padEnd(30)} ${times.padStart(4)}  ${r.why}`)
  }
  const counts = rows.reduce((a, r) => ({ ...a, [r.confidence]: (a[r.confidence] ?? 0) + 1 }), {})
  console.log(`\n${rows.length} entries — ${counts.low ?? 0} need an answer, ${counts.medium ?? 0} worth a look, ${counts.high ?? 0} confident`)
  const unheard = rows.filter((r) => r.heard === 0).length
  console.log(`${unheard} are never actually spoken on the site; they are here so the list stays complete if the text changes.`)
}
