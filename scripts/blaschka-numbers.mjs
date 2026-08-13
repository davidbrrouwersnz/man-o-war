// Extract the Blaschka model-number crosswalk from the plate captions of Shaw et al. 2017,
// "Ideas made glass: Blaschka glass models at Canterbury Museum", Records of the Canterbury Museum
// 31: 5-84. https://cms.canterburymuseum.com/assets/Ideas-made-glass.pdf
//
// BUILD-SPEC-v2.md §5 states the Blaschka number "is not in the API at all" and that a route key on
// it "requires a hand-authored crosswalk the Museum must own". The first half is true. The second is
// not: the Museum has already published the crosswalk, in its own paper, for most of the collection.
//
//   pdftotext -layout Ideas-made-glass.pdf shaw2017.txt
//   node scripts/blaschka-numbers.mjs shaw2017.txt

import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync(process.argv[2] ?? 'shaw2017.txt', 'utf8')
const manifest = JSON.parse(readFileSync('src/data/manifest.json', 'utf8'))
const known = new Set(manifest.objects.map((o) => o.accession))

// Captions read: "Blaschka Number 609. Boltenia rubra 1884.137.85" - the separator after the number
// is a full stop on most and a comma on a few.
const re = /Blaschka Number (\d+)[.,]\s*([A-Za-z][^\d]*?)\s*(1884\.137\.\d+)/g

const entries = {}
const dupes = []
let m
while ((m = re.exec(src))) {
  const [, number, name, accession] = m
  if (entries[accession] && entries[accession].blaschkaNumber !== Number(number)) dupes.push(accession)
  entries[accession] = { blaschkaNumber: Number(number), catalogueNameInPaper: name.trim().replace(/\s+/g, ' ') }
}

const stray = Object.keys(entries).filter((a) => !known.has(a))
const missing = [...known].filter((a) => !entries[a])

console.log(`${Object.keys(entries).length} of ${known.size} objects have a published Blaschka number`)
console.log(`${stray.length} accessions in the paper are not in the manifest${stray.length ? ': ' + stray.join(', ') : ''}`)
console.log(`${missing.length} objects have no published number: ${missing.join(', ')}`)
if (dupes.length) console.log(`conflicting numbers for: ${dupes.join(', ')}`)

const out = {
  note: 'Blaschka model numbers, transcribed from the plate captions of Shaw et al. 2017, Records of the Canterbury Museum 31: 5-84. This is the Museum\'s own publication, so the crosswalk BUILD-SPEC-v2.md §5 asks the Museum to author already exists in print. Not verified object by object against the plates by a human; the extraction is mechanical and the paper is the authority. catalogueNameInPaper is the name the paper prints, which is the 1880s catalogue name and often differs from the currently accepted one.',
  source: {
    citation: 'Shaw MD, Szczepanski JZ, Murray SF, Hodge S, Vink CJ. 2017. Ideas made glass: Blaschka glass models at Canterbury Museum. Records of the Canterbury Museum 31: 5-84.',
    url: 'https://cms.canterburymuseum.com/assets/Ideas-made-glass.pdf',
    retrieved: '2026-08-13',
  },
  count: Object.keys(entries).length,
  withoutNumber: missing,
  numbers: Object.fromEntries(Object.entries(entries).sort((a, b) => a[1].blaschkaNumber - b[1].blaschkaNumber)),
}

writeFileSync('src/data/blaschka-numbers.json', JSON.stringify(out, null, 2) + '\n')
console.log('Wrote src/data/blaschka-numbers.json')
