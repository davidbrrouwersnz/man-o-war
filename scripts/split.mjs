// Split the manifest into one chunk per group, plus a small index the whole app can afford to carry.
//
// The single manifest put all 128 objects' data - and 113KB of base64 placeholders - into the main
// bundle, so every visitor downloaded the whole collection to read one page of eight. Nothing in §5
// or §8 requires one file; §5 only requires the harvest to happen once, at build time, which it
// still does. This runs as a prebuild step from the harvest output.
//
//   node scripts/split.mjs

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

const manifest = read('manifest.json')
const groups = read('groups.json')
const names = read('names.json')
const museum = read('stories.json')
const drafted = read('stories-drafted.json')

const OBJECTS = new Map(manifest.objects.map((o) => [o.accession, o]))
const STORIES = { ...drafted.stories, ...museum.stories }
const DRAFTED = new Set(Object.keys(drafted.stories))

const WPM = 150
const words = (s) => (s ? s.trim().split(/\s+/).length : 0)
const storyWords = (s) => s.segments.reduce((t, x) => t + words(x.heading) + words(x.text), 0)

const dir = new URL('../src/data/chunks/', import.meta.url)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

const index = { groups: [], groupOf: {} }
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
      story: story ? { ...story, drafted: DRAFTED.has(accession) } : null,
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

const indexJson = JSON.stringify(index)
writeFileSync(new URL('index.json', dir), indexJson)

const before = gzipSync(JSON.stringify(manifest)).length + gzipSync(JSON.stringify(museum)).length + gzipSync(JSON.stringify(drafted)).length + gzipSync(JSON.stringify(names)).length + gzipSync(JSON.stringify(groups)).length
console.log(`\nindex (always loaded)   ${(gzipSync(indexJson).length / 1024).toFixed(0)}KB gz`)
console.log(`chunks (loaded on demand, total across all 11)   ${(chunkTotal / 1024).toFixed(0)}KB gz`)
console.log(`was: ${(before / 1024).toFixed(0)}KB gz of data in the main bundle, every route`)

if (readdirSync(dir).length !== groups.groups.length + 1) throw new Error('chunk count mismatch')
