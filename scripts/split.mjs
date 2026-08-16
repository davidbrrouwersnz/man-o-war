// Split the manifest into one chunk per group, plus a small index the whole app can afford to carry.
//
// The single manifest put all 128 objects' data - and 113KB of base64 placeholders - into the main
// bundle, so every visitor downloaded the whole collection to read one page of eight. Nothing in §5
// or §8 requires one file; §5 only requires the harvest to happen once, at build time, which it
// still does. This runs as a prebuild step from the harvest output.
//
//   node scripts/split.mjs

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

const manifest = read('manifest.json')
const groups = read('groups.json')
const names = read('names.json')
const museum = read('stories.json')
const drafted = read('stories-drafted.json')

const OBJECTS = new Map(manifest.objects.map((o) => [o.accession, o]))
const STORIES = { ...drafted.stories, ...museum.stories }

// ------------------------------------------------------------------ further reading (§6)
//
// Two files meet here and they are kept apart on purpose. src/data/taxa.json is machine-resolved
// and regenerable — a re-run of scripts/taxa.mjs overwrites it wholesale. src/data/elsewhere.json
// is hand-authored editorial judgment and nothing overwrites it. Merging happens at build time so
// that a page can render both as one list without the app knowing which is which.
//
// The prose that describes a PUBLISHER is shipped once, in the index, rather than on every link:
// "the national encyclopedia, written for a general reader" is the same sentence on all fourteen
// Te Ara links, and 128 objects' worth of repeated boilerplate is exactly the kind of payload §2's
// visitor on a gallery connection should not be asked to pay for.
const taxa = existsSync(new URL('../src/data/taxa.json', import.meta.url)) ? read('taxa.json') : { taxa: {} }
const curated = read('elsewhere.json')

// A link as it ships: the publisher by key, the link's own id so the page can find its translated
// `why`, and only the words specific to this link.
const link = (l) => ({ id: l.id, p: l.publisher, title: l.title, url: l.url, why: l.why, claim: l.claim })

// MarLIN is machine-resolved but reads as further reading rather than as a record, so it joins the
// curated list rather than the taxon block. Its own common name is kept where MarLIN has one —
// "Dustbin lid jellyfish" is the kind of thing worth arriving at.
//
// Its sentence is a UI string rather than text on the link. It is the same 180 characters on all 28
// of them, so shipping it per link cost about 5KB across the group chunks to say one thing 28
// times — and it would have cost 28 translations of one sentence in every language.
function elsewhereFor(accession) {
  const hand = curated.objects[accession] ?? []
  const m = taxa.taxa[accession]?.marlin
  const links = hand.map(link)
  if (m) {
    links.push({
      p: 'marlin',
      title: m.common ? `${m.common} (${m.name})` : m.name,
      url: m.url,
      whyKey: 'ui.marlinWhy',
      claim: 'this-species',
    })
  }
  return links
}

// The catalogue record's own taxonomy, reduced to what the page prints. §6: "Never silently replace
// a catalogue name with a modern one. Show both." So `catalogue` is always the name on the record
// and `current` is only present when those differ.
//
// `why` carries the refusal where there is one, and it is shipped rather than dropped: an object
// whose name resolves nowhere is telling a visitor something true about a 140-year-old catalogue,
// and §6's third state exists precisely so the UI does not render an empty link instead.
function taxonFor(accession) {
  const t = taxa.taxa[accession]
  if (!t) return null
  if (!t.resolved) return { resolved: false, why: t.why, retrieved: t.retrieved }
  return {
    resolved: true,
    retrieved: t.retrieved,
    catalogue: { name: t.worms.name, authority: t.worms.authority ?? null, status: t.worms.status, url: t.worms.url },
    current: t.current ? { name: t.current.name, authority: t.current.authority ?? null, url: t.current.url } : null,
    gbif: t.gbif ? { url: t.gbif.url, occurrences: t.gbif.occurrences, occurrencesNZ: t.gbif.occurrencesNZ } : null,
  }
}

// Build-time-only fields, stripped from everything written to src/data/chunks/. They instruct the
// translation pipeline — §7's carve-outs, and the reason each one is held back — and a visitor on a
// gallery connection should not pay for an argument addressed to a build script. A stringify
// replacer rather than a strip at each call site, so a new emit path cannot forget it.
const BUILD_ONLY = new Set(['noAuto', 'noAutoWhy'])
const ship = (o) => JSON.stringify(o, (k, v) => (BUILD_ONLY.has(k) ? undefined : v))

const WPM = 150
const words = (s) => (s ? s.trim().split(/\s+/).length : 0)
const storyWords = (s) => s.segments.reduce((t, x) => t + words(x.heading) + words(x.text), 0)

// ------------------------------------------------------------------ how long a group takes
//
// "8 models. About 7 minutes." used to be a word count divided by 150wpm — a guess about a
// recording that did not exist yet. It exists now: scripts/audio.mjs synthesises one file per
// printed block and records each measured length in src/data/audio-index.json. So the number on the
// tile is the sum of the files a visitor would actually hear, and because this script runs on
// prebuild, predev and prepreview, it follows the audio on its own. Regenerate a segment, rewrite a
// story, add an object — the next build restates the cost without anyone remembering to.
//
// The old estimate was also drifting: it still counted each group's closing line, which stopped
// being printed or spoken several commits ago.
const AUDIO = new URL('../src/data/audio-index.json', import.meta.url)
const audioIndex = existsSync(AUDIO) ? JSON.parse(readFileSync(AUDIO, 'utf8')) : null
// One section per language since scripts/audio.mjs learned --lang; `?? audioIndex.segments` reads
// the older flat shape so a checkout that has not run the generator since still builds.
const audioLangs = audioIndex?.languages ?? (audioIndex?.segments ? { en: audioIndex } : {})
// The tile's "about N minutes" is measured from the ENGLISH narration whatever language the tile is
// written in. That is not an oversight: English is the only language voiced end to end, and the
// cost of a group is roughly the same in any language. Where another language is fully voiced its
// own durations would be better, and this is the line to change.
const durations = audioLangs.en?.segments ?? null

// The exact queue a group's Listen control builds, in order: the panel, then each object's title
// and its story segments. Spelled out rather than pattern-matched on the audio index, because that
// index still holds units the app retired — 10 group endings, 14 identification notes — and a
// prefix match would quietly bill visitors for audio no page can play.
const tourSegments = (slug, panel, objects) => [
  ...(panel ? [`groups/${slug}/00-panel`] : []),
  ...objects.flatMap((o) => [
    `${o.accession}/00-title`,
    ...(o.story?.segments ?? []).map((s) => `${o.accession}/${s.id}`),
  ]),
]

const fellBack = []

const dir = new URL('../src/data/chunks/', import.meta.url)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const index = { groups: [], groupOf: {} }
const BY_ORDER = new Map(groups.groups.map((g) => [g.slug, g.title]))
let chunkTotal = 0

// §20: "Before launch, not before step 3: assert a non-empty `story` on all 127. The commitment in
// §6 is a build assertion or it is a wish."
//
// All 128 are written, so this passes today. It exists so that the day one is emptied, deleted or
// left half-authored, the build says so — rather than the page quietly rendering the cataloguer's
// physical description in its place, which §6 forbids as a story.
{
  const missing = []
  for (const g of groups.groups) {
    for (const accession of g.accessions) {
      const s = STORIES[accession]
      const empty = !s || !Array.isArray(s.segments) || s.segments.length === 0 ||
        s.segments.every((seg) => !String(seg.text ?? '').trim())
      if (empty) missing.push(accession)
    }
  }
  if (missing.length) {
    throw new Error(
      `§6/§20: ${missing.length} object(s) have no story: ${missing.slice(0, 8).join(', ')}` +
        (missing.length > 8 ? ` and ${missing.length - 8} more` : '')
    )
  }
}

// §6's external sources, asserted rather than trusted. Each of these has a failure mode that is
// invisible on the page: a link attributed to a publisher nobody described, a curated entry keyed
// to an accession that no longer exists, a claim strength the interface has no words for. All three
// render as something plausible and wrong, so they stop the build instead.
const CURATED_IDS = new Set()
{
  const bad = []
  const publishers = new Set(Object.keys(curated.publishers))
  const CLAIMS = new Set(['this-species', 'this-kind', 'this-group', 'this-collection'])
  const allAcc = new Set(manifest.objects.map((o) => o.accession))
  const slugs = new Set(groups.groups.map((g) => g.slug))

  for (const [where, list] of [
    ['collection', curated.collection],
    ...Object.entries(curated.groups).map(([k, v]) => [`groups.${k}`, v]),
    ...Object.entries(curated.objects).map(([k, v]) => [`objects.${k}`, v]),
  ]) {
    for (const l of list) {
      if (!publishers.has(l.publisher)) bad.push(`${where}: unknown publisher "${l.publisher}"`)
      if (!CLAIMS.has(l.claim)) bad.push(`${where}: unknown claim "${l.claim}"`)
      if (!/^https:\/\//.test(l.url)) bad.push(`${where}: not an https URL — ${l.url}`)
      // The id is what a translation is keyed to. A missing one means that link can never be
      // translated; a duplicated one is worse — two links would share one language's words, and
      // the wrong sentence under a link is exactly the failure the `claim` field exists to prevent.
      if (!l.id) bad.push(`${where}: link "${l.title}" has no id`)
      else if (CURATED_IDS.has(l.id)) bad.push(`${where}: duplicate id "${l.id}"`)
      else CURATED_IDS.add(l.id)
    }
  }
  for (const a of Object.keys(curated.objects)) if (!allAcc.has(a)) bad.push(`objects.${a}: not in the manifest`)
  for (const s of Object.keys(curated.groups)) if (!slugs.has(s)) bad.push(`groups.${s}: not a group`)
  if (bad.length) throw new Error(`§6 external sources — src/data/elsewhere.json:\n    ${bad.join('\n    ')}`)
}

for (const g of groups.groups) {
  const panel = museum.panels[g.slug]

  const objects = g.accessions.map((accession) => {
    const o = OBJECTS.get(accession)
    // `identification` is dropped from the shipped chunk rather than from the source. Fourteen
    // objects carry one and none of them is rendered or spoken any more, so shipping the text would
    // be bytes on a gallery connection that nobody ever reads. The authored text stays in
    // src/data/stories*.json, so restoring it is one line here plus the render.
    // Kept undefined when there is no story at all: an empty object here would be truthy, and the
    // page would render the story branch with no segments instead of the labelled placeholder.
    const raw = STORIES[accession]
    const story = raw ? (({ identification, ...rest }) => rest)(raw) : undefined
    return {
      accession,
      title: o.title,
      catalogueName: o.catalogueName,
      name: names.names[accession]?.name ?? null,
      description: o.description,
      measurements: o.measurements,
      rights: o.rights,
      aspect: o.aspect,
      placeholder: o.placeholder,
      image: { xlarge: o.image.xlarge, large: o.image.large },
      story,
      // Omitted rather than empty where there is nothing to link: an empty array renders as a
      // heading with no list under it, which reads as a section that failed to load.
      elsewhere: elsewhereFor(accession).length ? elsewhereFor(accession) : undefined,
      taxon: taxonFor(accession) ?? undefined,
    }
  })

  // §10 wants the cost computed at build time, never asserted. This is where.
  //
  // Measured from the narration where the narration exists, and only where ALL of it exists: a
  // half-generated group would otherwise report the few files it has and read as a short visit.
  // Where it does not, this falls back to the old 150wpm estimate and says so, so a checkout with
  // no audio still builds and nobody has to wonder which number they are looking at.
  const ids = tourSegments(g.slug, panel?.panel, objects)
  const missing = durations ? ids.filter((id) => !durations[id]) : ids
  const heardMs = durations ? ids.reduce((t, id) => t + (durations[id]?.durationMs ?? 0), 0) : 0

  const total = words(panel?.panel) + objects.reduce((t, o) => t + (o.story ? storyWords(o.story) : 0), 0)
  const measured = missing.length === 0
  const minutes = Math.max(1, Math.round(measured ? heardMs / 60000 : total / WPM))
  if (!measured) fellBack.push(`${g.slug} (${durations ? `${missing.length}/${ids.length} segments missing` : 'no audio index'})`)

  // No ending. The closing line is no longer rendered or narrated, so shipping it would be bytes
  // on a gallery connection that nobody reads. The text stays in src/data/stories.json.
  const groupLinks = (curated.groups[g.slug] ?? []).map(link)
  const chunk = { slug: g.slug, title: g.title, panel: panel?.panel ?? null, elsewhere: groupLinks, objects }
  const json = ship(chunk)
  writeFileSync(new URL(`${g.slug}.json`, dir), json)
  chunkTotal += gzipSync(json).length

  const rep = OBJECTS.get(g.representative)
  index.groups.push({
    slug: g.slug,
    title: g.title,
    order: g.order,
    size: g.accessions.length,
    minutes,
    words: total,
    representative: { url: rep.image.large.url, placeholder: rep.placeholder },
  })
  for (const a of g.accessions) index.groupOf[a] = g.slug

  const exact = measured ? `${(heardMs / 60000).toFixed(1)} min of audio` : `${total} words, estimated`
  console.log(`  ${g.slug.padEnd(24)} ${String(objects.length).padStart(2)} objects  ${(gzipSync(json).length / 1024).toFixed(0)}KB gz  ${String(minutes).padStart(2)} min  (${exact})`)
}

// ------------------------------------------------------------------ the object on display (§9)
//
// One of the 128 is out of storage and in the gallery, and the collection page now carries it in
// full — name, photograph, story, further reading, record — so a visitor standing in front of it
// reads the whole thing without navigating. See src/pages/home.jsx.
//
// Its own chunk, and that is the whole reason this block exists. The object lives in
// floating-colonies.json with seven others; fetching that to render one of them would cost 10KB gz
// on the one route every visitor loads first, to throw away seven eighths of it. This is ~3KB.
//
// The accession is written down HERE and shipped in the index, rather than being a constant in the
// page. It was hardcoded in home.jsx already; two copies of the same accession in two languages of
// the same repository is exactly the drift this file spends its length avoiding.
const ON_DISPLAY = '1884.137.33'
{
  const g = groups.groups.find((x) => x.accessions.includes(ON_DISPLAY))
  if (!g) throw new Error(`§9: the object on display (${ON_DISPLAY}) is not in any group`)
  const chunkFile = new URL(`${g.slug}.json`, dir)
  const object = JSON.parse(readFileSync(chunkFile, 'utf8')).objects.find((o) => o.accession === ON_DISPLAY)
  if (!object) throw new Error(`§9: the object on display (${ON_DISPLAY}) was not emitted into ${g.slug}.json`)
  const json = ship({ object, slug: g.slug })
  writeFileSync(new URL('on-display.json', dir), json)
  index.onDisplay = { accession: ON_DISPLAY, slug: g.slug }
  console.log(`on-display (${ON_DISPLAY})    ${(gzipSync(json).length / 1024).toFixed(0)}KB gz`)
}

// /all — the full 128-tile grid. §9 keeps it as a secondary route, not the front door, so it is a
// chunk of its own and costs nothing until someone asks for it. Placeholders only: the real images
// load lazily, as on a group page.
const all = {
  objects: manifest.objects.map((o) => ({
    accession: o.accession,
    name: names.names[o.accession]?.name ?? o.title,
    slug: index.groupOf[o.accession],
    placeholder: o.placeholder,
    url: o.image.large.url,
  })),
}
// Reading order, not accession order: sort=accession_no is lexicographic and puts .2 after .100.
const order = new Map(groups.groups.flatMap((g, gi) => g.accessions.map((a, ai) => [a, gi * 1000 + ai])))
all.objects.sort((x, y) => order.get(x.accession) - order.get(y.accession))
const allJson = ship(all)
writeFileSync(new URL('all.json', dir), allJson)

// One pack per language, loaded only when that language is active. English is compiled into the
// main bundle instead, because §7 makes it the terminal fallback: it has to be there before any
// resolution runs, or the chain dead-ends on a blank while a chunk is still in flight.
const langDir = new URL('../src/data/i18n/', import.meta.url)
const en = JSON.parse(readFileSync(new URL('en.json', langDir), 'utf8'))
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]))
const LAYERS = read('layers.json')
const LAYER_COUNT = LAYERS.order.length
const enKeys = flat(en.ui).map((k) => `ui.${k}`)

const allAccessions = new Set(manifest.objects.map((o) => o.accession))

// Translated segments are keyed by the English segment's id, never by position: a pack is a map of
// overrides onto the English source, not a parallel array. That is what lets a language hold three
// of an object's five segments and fall back for the other two, and it is what stops an inserted or
// re-ordered English segment pairing one language's heading with another's body.
//
// An id absent from the English source is a typo, or a segment since renamed or deleted. Either way
// it renders as English and looks like a translation gap rather than a bug, so it throws here. A
// missing id is the opposite — expected, and the whole point of §7's fallback.
function assertSegmentIds(file, translated, english) {
  const bad = []
  for (const [key, entry] of Object.entries(translated ?? {})) {
    const source = english[key]
    if (!source) continue // the accession/slug checks either side of this own that failure
    if (Array.isArray(entry?.segments)) {
      bad.push(`${key}: segments is still an array, keyed by position`)
      continue
    }
    const ids = new Set((source.segments ?? []).map((s) => s.id))
    for (const id of Object.keys(entry?.segments ?? {})) if (!ids.has(id)) bad.push(`${key}: "${id}"`)
  }
  if (bad.length) throw new Error(`${file}: segment ids not in the English source:\n    ${bad.join('\n    ')}`)
}

const packs = []
for (const file of readdirSync(langDir)) {
  // The per-tier pack directories are not language files. English is compiled into the bundle.
  if (file === 'en.json' || file === 'layers' || file === 'stories' || file === 'elsewhere') continue
  const code = file.replace(/\.json$/, '')
  const pack = JSON.parse(readFileSync(new URL(file, langDir), 'utf8'))
  if (pack.__code !== code) throw new Error(`${file}: __code is "${pack.__code}"`)

  const have = new Set(flat(pack.ui ?? {}).map((k) => `ui.${k}`))
  const missing = enKeys.filter((k) => !have.has(k))
  const extra = [...have].filter((k) => !enKeys.includes(k))
  if (extra.length) throw new Error(`${file}: keys not in the English source: ${extra.join(', ')}`)

  // Layer essays live in their own files so a language can gain the deep tier without rewriting its
  // interface pack. §7 tiers by verification burden: orientation goes widest, object stories next,
  // the deep reading layer narrowest, because review cost is what scales and not generation.
  const layerFile = new URL(`layers/${code}.json`, langDir)
  let layersDone = 0
  if (existsSync(layerFile)) {
    const tl = JSON.parse(readFileSync(layerFile, 'utf8'))
    assertSegmentIds(`layers/${code}.json`, tl.layers, LAYERS.layers)
    pack.layers = tl.layers
    layersDone = Object.keys(tl.layers ?? {}).length
  }

  // Object story translations, keyed by accession, in their own file per language for the same
  // reason as the layers: a language gains story coverage incrementally without touching anything
  // else, and coverage (128 max) is countable independent of the interface and layer tiers.
  const storyFile = new URL(`stories/${code}.json`, langDir)
  let storiesDone = 0
  if (existsSync(storyFile)) {
    const ts = JSON.parse(readFileSync(storyFile, 'utf8'))
    const stray = Object.keys(ts.stories ?? {}).filter((a) => !allAccessions.has(a))
    if (stray.length) throw new Error(`stories/${code}.json: accessions not in the manifest: ${stray.join(', ')}`)
    assertSegmentIds(`stories/${code}.json`, ts.stories, STORIES)
    // Same strip as the English chunk above: the identification note is no longer rendered in any
    // language, and German is the heaviest pack in the app at ~37KB gzipped. Translated text nobody
    // can read is the worst kind of payload — it costs the visitor and teaches nothing.
    pack.stories = Object.fromEntries(
      Object.entries(ts.stories ?? {}).map(([acc, s]) => {
        const { identification, ...rest } = s ?? {}
        return [acc, rest]
      })
    )
    storiesDone = Object.keys(ts.stories ?? {}).length
  }

  // Further reading annotations, keyed by the link's own id. Its own file for the same reason as
  // the layers and the stories: a language gains this tier incrementally, and its coverage is
  // countable on its own rather than hidden inside the interface percentage.
  const elseFile = new URL(`elsewhere/${code}.json`, langDir)
  let elseDone = 0
  if (existsSync(elseFile)) {
    const te = JSON.parse(readFileSync(elseFile, 'utf8'))
    const stray = Object.keys(te.elsewhere ?? {}).filter((id) => !CURATED_IDS.has(id))
    if (stray.length) throw new Error(`elsewhere/${code}.json: link ids not in src/data/elsewhere.json: ${stray.join(', ')}`)
    pack.elsewhere = te.elsewhere
    elseDone = Object.keys(te.elsewhere ?? {}).length
  }

  const panelsDone = Object.keys(pack.panels ?? {}).length
  const json = ship(pack)
  writeFileSync(new URL(`lang-${code}.json`, dir), json)
  packs.push({ code, missing: missing.length, panels: panelsDone, layers: layersDone, stories: storiesDone, elsewhere: elseDone, kb: (gzipSync(json).length / 1024).toFixed(1) })
}

console.log('')
for (const p of packs) {
  console.log(
    `  ${p.code.padEnd(8)} ui ${String(enKeys.length - p.missing).padStart(2)}/${enKeys.length}  panels ${String(p.panels).padStart(2)}/11  layers ${p.layers}/${LAYER_COUNT}  stories ${String(p.stories).padStart(3)}/128  further reading ${String(p.elsewhere).padStart(2)}/${CURATED_IDS.size}  ${p.kb}KB gz${p.missing ? '  <- falls back to English' : ''}`
  )
}

index.languages = packs.map((p) => p.code)

// Which languages have narration, and where each one's files are served from. The player reads
// `base` rather than hardcoding /audio/en, so moving a language's audio out of the repo and onto
// blob storage is a value in src/data/audio-index.json — English alone is 44MB and git should not
// be asked to carry nine of those indefinitely.
index.audio = Object.fromEntries(
  Object.entries(audioLangs)
    .filter(([, a]) => Object.keys(a.segments ?? {}).length)
    .map(([code, a]) => [code, { base: a.base ?? `/audio/${code}`, segments: Object.keys(a.segments).length }])
)

// §7's disclosure, computed rather than declared.
//
// "A quiet line in the language picker where content is machine-translated and human-reviewed. A
// museum trades on authority; this is the difference between being trusted and being caught."
//
// Every pack has carried a `reviewed: false` flag since the first translation landed, and no code
// has ever read it — so the app has been shipping machine translation with no disclosure at all,
// which is the exact failure §7 names. A hand-set boolean was never going to survive anyway: it is
// one value for a whole language, set by whoever remembered, and it stays false forever or goes
// true all at once.
//
// scripts/translate.mjs records reviewStatus per unit and resets it to unreviewed whenever a unit
// is retranslated, so the honest number is countable. Reviewing one object's story moves it, and
// changing one English sentence moves it back.
const LEDGER = new URL('../src/data/translation-index.json', import.meta.url)
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')).languages ?? {} : {}
index.review = {}
for (const p of packs) {
  const entries = Object.values(ledger[p.code] ?? {})
  const reviewed = entries.filter((e) => e.reviewStatus === 'reviewed').length
  index.review[p.code] = {
    total: entries.length,
    reviewed,
    // The engine is disclosed alongside, because "machine translated" is a different claim
    // depending on what did the translating, and §7 wants provenance to survive to 2032.
    engines: [...new Set(entries.map((e) => e.engine).filter(Boolean))].sort(),
  }
}

// Layers 3–5, written once and reached from any group page (§6, §10).

const layersJson = ship({
  ...LAYERS,
  // Collection-level further reading rides with the essays rather than in the index, because it is
  // printed at the foot of the reading column and arrives when that column does. The index is
  // loaded on every route and this is needed on one.
  elsewhere: curated.collection.map(link),
})
writeFileSync(new URL('layers.json', dir), layersJson)
index.layers = LAYERS.order.map((slug) => ({ slug, title: LAYERS.layers[slug].title }))

// Who each source is, said once. Every link anywhere in the app names a key in here, and the
// assertion above is what stops a link naming a publisher that was never described — which would
// render as an attribution line with a blank where the institution should be.
//
// The name and the institution behind it ship; the paragraph in elsewhere.json explaining why that
// institution is worth trusting does NOT. It is written for whoever reviews this file, and the
// index is loaded on every route in the app — including the ones with no links on them at all.
index.publishers = Object.fromEntries(
  Object.entries(curated.publishers).map(([key, p]) => [key, { name: p.name, publisher: p.publisher }])
)

const indexJson = JSON.stringify(index)
writeFileSync(new URL('index.json', dir), indexJson)

console.log(`all (128 tiles)         ${(gzipSync(allJson).length / 1024).toFixed(0)}KB gz`)
console.log(`layers 3-5              ${(gzipSync(layersJson).length / 1024).toFixed(0)}KB gz`)

const before = gzipSync(JSON.stringify(manifest)).length + gzipSync(JSON.stringify(museum)).length + gzipSync(JSON.stringify(drafted)).length + gzipSync(JSON.stringify(names)).length + gzipSync(JSON.stringify(groups)).length
console.log(`\nindex (always loaded)   ${(gzipSync(indexJson).length / 1024).toFixed(0)}KB gz`)
console.log(`chunks (loaded on demand, total across all 11)   ${(chunkTotal / 1024).toFixed(0)}KB gz`)
console.log(`was: ${(before / 1024).toFixed(0)}KB gz of data in the main bundle, every route`)

// index, all, layers, on-display — search.json was one of these until search was removed.
if (readdirSync(dir).length !== groups.groups.length + 4 + index.languages.length) throw new Error('chunk count mismatch')

// Loud rather than silent. A tile reading "About 3 minutes." when the narration is really eleven is
// worse than an ugly build log — a visitor deciding whether they have time for a group is the whole
// reason §10 asks for the number.
if (fellBack.length) {
  console.log(`\n⚠ run time estimated from word counts, not measured, for ${fellBack.length} of ${groups.groups.length} groups:`)
  for (const line of fellBack) console.log(`    ${line}`)
  console.log('  run `npm run audio` to generate the missing narration, and these become measured.')
} else {
  const totalMin = index.groups.reduce((t, g) => t + g.minutes, 0)
  console.log(`\nrun times measured from the narration — ${totalMin} minutes across ${groups.groups.length} groups`)
}
