// What the manifest costs, and what the page would cost with real stories in it.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const m = JSON.parse(readFileSync('src/data/manifest.json', 'utf8'))
const stories = JSON.parse(readFileSync('src/data/stories.json', 'utf8'))
const groups = JSON.parse(readFileSync('src/data/groups.json', 'utf8')).groups

const kb = (n) => (n / 1024).toFixed(0) + 'KB'
const full = JSON.stringify(m)
const noPlaceholders = JSON.stringify({ ...m, objects: m.objects.map((o) => ({ ...o, placeholder: null })) })

console.log('MANIFEST')
console.log(`  whole            ${kb(full.length)} raw   ${kb(gzipSync(full).length)} gzipped`)
console.log(`  base64 placeholders  ${kb(full.length - noPlaceholders.length)} raw   ${kb(gzipSync(full).length - gzipSync(noPlaceholders).length)} gzipped`)
console.log(`  everything else      ${kb(noPlaceholders.length)} raw   ${kb(gzipSync(noPlaceholders).length)} gzipped`)
console.log(`  spec §5 budget was ~150KB for 127`)

const w = (s) => (s ? s.trim().split(/\s+/).length : 0)
const g = groups.find((x) => x.slug === 'floating-colonies')
const p = stories.panels['floating-colonies']

let built = w(p.panel) + w(p.ending)
let real = built
for (const a of g.accessions) {
  const o = m.objects.find((x) => x.accession === a)
  const s = stories.stories[a]
  built += s ? s.segments.reduce((t, x) => t + w(x.heading) + w(x.text), 0) : w(o.description)
  real += 231 // the man o' war story is the benchmark for a written entry
}

console.log('\nREADING TIME at 150 wpm')
console.log(`  floating-colonies as built (1 story + 7 catalogue stubs)  ${built} words = ${(built / 150).toFixed(1)} min`)
console.log(`  floating-colonies if all 8 were written                   ${real} words = ${(real / 150).toFixed(1)} min`)
console.log(`  a 19-object page, all written                             ${19 * 231 + 100} words = ${((19 * 231 + 100) / 150).toFixed(1)} min`)
console.log(`  spec §10 example claims "8 models. About 9 minutes."`)

const descWords = m.objects.map((o) => w(o.description))
descWords.sort((a, b) => a - b)
console.log(`\n  brief_desc word counts across 128: min ${descWords[0]}, median ${descWords[64]}, max ${descWords[127]}`)
