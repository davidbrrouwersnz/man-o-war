// Build-time harvest. Run manually: node scripts/harvest.mjs
// Writes src/data/manifest.json. The live API is never called at runtime (BUILD-SPEC-v2.md §5).

import { readFileSync, writeFileSync } from 'node:fs'

const BASE = 'https://collection.canterburymuseum.com/api/v3/opacobjects'
const QUERY = 'maker_name:"Leopold Blaschka"' // NOT collection:"Blaschka Glass" — that drops 1884.137.110

// ---------------------------------------------------------------- fetch

async function page(offset) {
  const url = `${BASE}?query=${encodeURIComponent(QUERY)}&limit=100&offset=${offset}&view=detail`
  const t = Date.now()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`)
  const body = await res.text()
  console.log(`  offset=${offset}  ${res.status}  ${(body.length / 1024).toFixed(0)}KB  ${Date.now() - t}ms`)
  return JSON.parse(body)
}

async function harvest() {
  const out = []
  for (let offset = 0; offset < 1000; offset += 100) {
    const json = await page(offset)
    const batch = json.opacObjects
    if (!batch || batch.length === 0) break // terminate on opacObjects, never on totalObjects
    out.push(...batch)
  }
  return out
}

// ---------------------------------------------------------------- parse

// opacObjectFieldSets is an array of { identifier, opacObjectFields: [{value}] } — no direct access.
const values = (rec, id) => {
  const set = rec.opacObjectFieldSets?.find((s) => s.identifier === id)
  return (set?.opacObjectFields ?? []).map((f) => f.value).filter((v) => v !== '' && v != null)
}
const value = (rec, id) => values(rec, id)[0] ?? ''

// Four prefix spellings exist, not three (§5 says three; 1884.137.110 adds a fourth).
const PREFIX = /^\s*glass\s+(?:model\s+invertebrate|invertebrate\s+model)\s*:\s*/i
const seenPrefixes = new Set()

function stripPrefix(name) {
  const m = name.match(PREFIX)
  if (!m) return { title: name.trim(), stripped: false }
  seenPrefixes.add(m[0].trim())
  return { title: name.slice(m[0].length).trim(), stripped: true }
}

// width/height are STRINGS on every derivative — coerce or aspect is NaN.
function derivative(image, id) {
  const d = image?.imageDerivatives?.find((x) => x.identifier === id)
  if (!d) return null
  return { url: d.url, width: Number(d.width), height: Number(d.height) }
}

// ---------------------------------------------------------------- placeholder

// The NANO derivative is 24px wide but ships ~19KB of Photoshop/EXIF/XMP metadata copied from the
// master, which would make the manifest several megabytes. Strip every APPn and COM segment; the
// pixels are untouched, nothing is re-encoded.
function stripJpegMetadata(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf
  const keep = [0xff, 0xd8]
  let i = 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xd9) break
    const len = (buf[i + 2] << 8) | buf[i + 3]
    const isApp = marker >= 0xe0 && marker <= 0xef
    const isCom = marker === 0xfe
    if (!isApp && !isCom) keep.push(...buf.subarray(i, i + 2 + len))
    i += 2 + len
    if (marker === 0xda) {
      // start of scan — entropy-coded data runs to the end of the file
      keep.push(...buf.subarray(i))
      break
    }
  }
  return Buffer.from(keep)
}

async function placeholder(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const raw = Buffer.from(await res.arrayBuffer())
  const lean = stripJpegMetadata(raw)
  return { data: `data:image/jpeg;base64,${lean.toString('base64')}`, raw: raw.length, lean: lean.length }
}

async function pooled(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    })
  )
  return out
}

// ---------------------------------------------------------------- run

console.log(`Harvesting ${QUERY}`)
const records = await harvest()
console.log(`  ${records.length} records\n`)

const objects = records.map((rec) => {
  const accession = value(rec, 'accession_no')
  const name = value(rec, 'name')
  const { title, stripped } = stripPrefix(name)
  const image = rec.imagesCollection?.images?.[0] ?? null
  const rights = value(rec, 'current_rights_code') // empty string on 9 records, not an absent key

  return {
    accession,
    title, // the catalogue name with the boilerplate prefix removed — usually the binomial
    catalogueName: name, // the full catalogue string, kept verbatim and demoted in the UI
    prefixStripped: stripped,
    description: value(rec, 'brief_desc'),
    measurements: values(rec, 'measurements'), // multi-valued on most records — parse, never concatenate
    rights: rights || null,
    image: image
      ? {
          medium: derivative(image, 'MEDIUM'),
          large: derivative(image, 'LARGE'),
          xlarge: derivative(image, 'XLARGE'),
          nano: derivative(image, 'NANO'),
        }
      : null,
    imageCount: rec.imagesCollection?.totalImages ?? 0,
  }
})

for (const o of objects) {
  const src = o.image?.xlarge ?? o.image?.large
  o.aspect = src ? Number((src.width / src.height).toFixed(4)) : null
}

console.log('Fetching placeholders (NANO derivative, metadata stripped)')
let rawTotal = 0
let leanTotal = 0
const pls = await pooled(objects, 8, async (o) => (o.image?.nano ? placeholder(o.image.nano.url) : null))
objects.forEach((o, i) => {
  const p = pls[i]
  o.placeholder = p?.data ?? null
  if (p) {
    rawTotal += p.raw
    leanTotal += p.lean
  }
  delete o.image.nano
})
console.log(`  ${(rawTotal / 1024).toFixed(0)}KB of NANO jpegs -> ${(leanTotal / 1024).toFixed(0)}KB after stripping metadata\n`)

// ---------------------------------------------------------------- assertions

const groups = JSON.parse(readFileSync(new URL('../src/data/groups.json', import.meta.url), 'utf8'))
const fail = []
const check = (ok, msg) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`)
  if (!ok) fail.push(msg)
}

console.log('Assertions')
check(objects.length === 128, `128 records harvested (got ${objects.length})`)

const noImage = objects.filter((o) => !o.image?.xlarge)
check(noImage.length === 0, `every record has an image (${noImage.length} without)`)

check(seenPrefixes.size === 4, `four title prefix spellings (got ${seenPrefixes.size}: ${[...seenPrefixes].join(' | ')})`)

const unstripped = objects.filter((o) => !o.prefixStripped)
check(unstripped.length === 0, `every title prefix stripped (${unstripped.length} left: ${unstripped.map((o) => o.accession).join(', ')})`)

const manifestAcc = new Set(objects.map((o) => o.accession))
const groupAcc = new Set(groups.groups.flatMap((g) => g.accessions))
const missing = [...groupAcc].filter((a) => !manifestAcc.has(a))
const orphan = [...manifestAcc].filter((a) => !groupAcc.has(a))
check(missing.length === 0, `every groups.json accession is in the manifest (${missing.length} missing: ${missing.join(', ')})`)
check(orphan.length === 0, `every manifest accession is in groups.json (${orphan.length} orphaned: ${orphan.join(', ')})`)
check(manifestAcc.size === objects.length, `accession numbers are unique`)

const noPlaceholder = objects.filter((o) => !o.placeholder)
check(noPlaceholder.length === 0, `every record has a placeholder (${noPlaceholder.length} without)`)

const badAspect = objects.filter((o) => !o.aspect || Number.isNaN(o.aspect))
check(badAspect.length === 0, `every aspect ratio is a number (${badAspect.length} bad)`)

const reps = groups.groups.map((g) => g.representative)
check(!reps.includes('1884.137.92'), `1884.137.92 is not a representative image`)

// Plain-English names are authored, so they can drift from the manifest silently. They cannot here.
const names = JSON.parse(readFileSync(new URL('../src/data/names.json', import.meta.url), 'utf8'))
const named = Object.keys(names.names)
const unnamed = names.deliberatelyUnnamed.accessions
const strayName = [...named, ...unnamed].filter((a) => !manifestAcc.has(a))
check(strayName.length === 0, `every named accession exists (${strayName.length} stray: ${strayName.join(', ')})`)

const bothWays = named.filter((a) => unnamed.includes(a))
check(bothWays.length === 0, `no accession is both named and deliberately unnamed (${bothWays.join(', ')})`)

const uncovered = [...manifestAcc].filter((a) => !named.includes(a) && !unnamed.includes(a))
check(uncovered.length === 0, `every object is either named or explicitly unnamed (${uncovered.length} missed: ${uncovered.join(', ')})`)

check(
  names.counts.total === objects.length && names.counts.named === named.length && names.counts.unnamed === unnamed.length,
  `names.json counts match reality (says ${names.counts.named}/${names.counts.unnamed}, actual ${named.length}/${unnamed.length})`
)

// §6: the build fails if any object has no story. That is a commitment, not a hope.
const museumStories = JSON.parse(readFileSync(new URL('../src/data/stories.json', import.meta.url), 'utf8'))
const draftStories = JSON.parse(readFileSync(new URL('../src/data/stories-drafted.json', import.meta.url), 'utf8'))
const museumAcc = Object.keys(museumStories.stories)
const draftAcc = Object.keys(draftStories.stories)

const strayStory = [...museumAcc, ...draftAcc].filter((a) => !manifestAcc.has(a))
check(strayStory.length === 0, `every story maps to a real object (${strayStory.length} stray: ${strayStory.join(', ')})`)

const overlap = museumAcc.filter((a) => draftAcc.includes(a))
check(overlap.length === 0, `no object is written twice in both provenances (${overlap.join(', ')})`)

const storyless = [...manifestAcc].filter((a) => !museumAcc.includes(a) && !draftAcc.includes(a))
check(storyless.length === 0, `every object has a story (${storyless.length} without: ${storyless.join(', ')})`)

const emptySegments = [...museumAcc, ...draftAcc].filter((a) => {
  const s = museumStories.stories[a] ?? draftStories.stories[a]
  return !s.segments?.length || s.segments.some((x) => !x.id || !x.heading || !x.text?.trim())
})
check(emptySegments.length === 0, `every story has complete segments (${emptySegments.join(', ')})`)

console.log(`  --    ${museumAcc.length} stories from Museum copy, ${draftAcc.length} drafted from third-party sources`)

// ---------------------------------------------------------------- write

const manifest = {
  harvestedFrom: QUERY,
  harvestedOn: new Date().toISOString().slice(0, 10),
  count: objects.length,
  objects,
}
const path = new URL('../src/data/manifest.json', import.meta.url)
writeFileSync(path, JSON.stringify(manifest))
const size = JSON.stringify(manifest).length
console.log(`\nWrote src/data/manifest.json — ${(size / 1024).toFixed(0)}KB, ${objects.length} objects`)

const blankRights = objects.filter((o) => !o.rights)
console.log(`Records with no rights code: ${blankRights.length} (${blankRights.map((o) => o.accession).join(', ')})`)
console.log(`Aspect ratios: ${Math.min(...objects.map((o) => o.aspect)).toFixed(2)} to ${Math.max(...objects.map((o) => o.aspect)).toFixed(2)}`)

if (fail.length) {
  console.error(`\n${fail.length} assertion(s) failed`)
  process.exit(1)
}
