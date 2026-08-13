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

const WPM = 150
const words = (s) => (s ? s.trim().split(/\s+/).length : 0)
const storyWords = (s) => s.segments.reduce((t, x) => t + words(x.heading) + words(x.text), 0)

const dir = new URL('../src/data/chunks/', import.meta.url)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const index = { groups: [], groupOf: {} }
const BY_ORDER = new Map(groups.groups.map((g) => [g.slug, g.title]))
let chunkTotal = 0

for (const g of groups.groups) {
  const panel = museum.panels[g.slug]

  const objects = g.accessions.map((accession) => {
    const o = OBJECTS.get(accession)
    const story = STORIES[accession]
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
    }
  })

  // §10 wants the cost computed at build time from word counts, never asserted. This is where.
  const total = words(panel?.panel) + words(panel?.ending) + objects.reduce((t, o) => t + (o.story ? storyWords(o.story) : 0), 0)

  const chunk = { slug: g.slug, title: g.title, panel: panel?.panel ?? null, ending: panel?.ending ?? null, objects }
  const json = JSON.stringify(chunk)
  writeFileSync(new URL(`${g.slug}.json`, dir), json)
  chunkTotal += gzipSync(json).length

  const rep = OBJECTS.get(g.representative)
  index.groups.push({
    slug: g.slug,
    title: g.title,
    order: g.order,
    size: g.accessions.length,
    minutes: Math.max(1, Math.round(total / WPM)),
    words: total,
    representative: { url: rep.image.large.url, placeholder: rep.placeholder },
  })
  for (const a of g.accessions) index.groupOf[a] = g.slug

  console.log(`  ${g.slug.padEnd(24)} ${String(objects.length).padStart(2)} objects  ${(gzipSync(json).length / 1024).toFixed(0)}KB gz  ${index.groups.at(-1).minutes} min`)
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
const allJson = JSON.stringify(all)
writeFileSync(new URL('all.json', dir), allJson)

// Search. §6: grouping by appearance spreads phyla across pages, so there is no page for "all the
// jellyfish-type things" and that has to be bought back with search. The index is names, catalogue
// names and accession numbers — no story text, which would make it far larger for little gain.
const search = {
  objects: manifest.objects.map((o) => ({
    accession: o.accession,
    name: names.names[o.accession]?.name ?? null,
    title: o.title,
    slug: index.groupOf[o.accession],
    group: BY_ORDER.get(index.groupOf[o.accession]),
  })),
}
const searchJson = JSON.stringify(search)
writeFileSync(new URL('search.json', dir), searchJson)

// One pack per language, loaded only when that language is active. English is compiled into the
// main bundle instead, because §7 makes it the terminal fallback: it has to be there before any
// resolution runs, or the chain dead-ends on a blank while a chunk is still in flight.
const langDir = new URL('../src/data/i18n/', import.meta.url)
const en = JSON.parse(readFileSync(new URL('en.json', langDir), 'utf8'))
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]))
const enKeys = flat(en.ui).map((k) => `ui.${k}`)

const allAccessions = new Set(manifest.objects.map((o) => o.accession))

const packs = []
for (const file of readdirSync(langDir)) {
  if (file === 'en.json' || file === 'layers' || file === 'stories') continue
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
    pack.stories = ts.stories
    storiesDone = Object.keys(ts.stories ?? {}).length
  }

  const panelsDone = Object.keys(pack.panels ?? {}).length
  const json = JSON.stringify(pack)
  writeFileSync(new URL(`lang-${code}.json`, dir), json)
  packs.push({ code, missing: missing.length, panels: panelsDone, layers: layersDone, stories: storiesDone, kb: (gzipSync(json).length / 1024).toFixed(1) })
}

console.log('')
for (const p of packs) {
  console.log(`  ${p.code.padEnd(8)} ui ${String(enKeys.length - p.missing).padStart(2)}/${enKeys.length}  panels ${String(p.panels).padStart(2)}/11  layers ${p.layers}/3  stories ${String(p.stories).padStart(3)}/128  ${p.kb}KB gz${p.missing ? '  <- falls back to English' : ''}`)
}

index.languages = packs.map((p) => p.code)

// Layers 3–5, written once and reached from any group page (§6, §10).
const layers = read('layers.json')
const layersJson = JSON.stringify(layers)
writeFileSync(new URL('layers.json', dir), layersJson)
index.layers = layers.order.map((slug) => ({ slug, title: layers.layers[slug].title }))

const indexJson = JSON.stringify(index)
writeFileSync(new URL('index.json', dir), indexJson)

console.log(`all (128 tiles)         ${(gzipSync(allJson).length / 1024).toFixed(0)}KB gz`)
console.log(`search                  ${(gzipSync(searchJson).length / 1024).toFixed(0)}KB gz`)
console.log(`layers 3-5              ${(gzipSync(layersJson).length / 1024).toFixed(0)}KB gz`)

const before = gzipSync(JSON.stringify(manifest)).length + gzipSync(JSON.stringify(museum)).length + gzipSync(JSON.stringify(drafted)).length + gzipSync(JSON.stringify(names)).length + gzipSync(JSON.stringify(groups)).length
console.log(`\nindex (always loaded)   ${(gzipSync(indexJson).length / 1024).toFixed(0)}KB gz`)
console.log(`chunks (loaded on demand, total across all 11)   ${(chunkTotal / 1024).toFixed(0)}KB gz`)
console.log(`was: ${(before / 1024).toFixed(0)}KB gz of data in the main bundle, every route`)

if (readdirSync(dir).length !== groups.groups.length + 4 + index.languages.length) throw new Error('chunk count mismatch')
