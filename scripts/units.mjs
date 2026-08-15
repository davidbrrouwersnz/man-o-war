// The single definition of what is translatable, and the only place that decides it.
//
// scripts/translate.mjs and scripts/translate-guard.mjs both import this, for the same reason
// collect() in scripts/audio.mjs is the single definition of what is spoken: two lists that are
// meant to agree will not, and the one that drifts is the one nobody is looking at.
//
// A unit is one translatable string with a stable id. The id is deliberately the same shape as the
// audio pipeline's segment ids, so a changed unit names the audio it invalidates without a lookup
// table:
//
//   ui:collectionTitle
//   group:jellyfish
//   layerTitle:how-it-was-made
//   panel:jellyfish:panel
//   layer:how-it-was-made:standfirst
//   layer:how-it-was-made:seg:the-flame:text
//   story:1884.137.33:headline
//   story:1884.137.33:seg:look:text
//
// `path` is the array path into a language pack. Array form rather than a dot-string throughout,
// because accession numbers contain dots and splitting on them shreds the lookup — see src/i18n.js.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

// Which of the three pack files a unit is written back into. Split by tier so a language can gain
// object stories without rewriting its interface pack — §7 tiers by verification burden, and
// scripts/split.mjs counts coverage per tier on the strength of that split.
export const PACK = 'pack' //     src/data/i18n/{code}.json
export const LAYERS = 'layers' // src/data/i18n/layers/{code}.json
export const STORIES = 'stories' //src/data/i18n/stories/{code}.json
export const ELSEWHERE = 'elsewhere' // src/data/i18n/elsewhere/{code}.json

const flat = (o, p = []) =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, [...p, k]) : [[[...p, k], v]]))

export function collect() {
  const museum = read('stories.json')
  const drafted = read('stories-drafted.json')
  const layers = read('layers.json')
  const groups = read('groups.json')
  const en = read('i18n/en.json')

  // Museum-sourced stories win over drafted ones, exactly as scripts/audio.mjs and
  // scripts/audio-scale.mjs merge them. Any other order silently voices the draft.
  const stories = { ...drafted.stories, ...museum.stories }

  const units = []
  const add = (id, text, kind, file, path, extra = {}) => {
    if (typeof text !== 'string' || !text.trim()) return
    units.push({ id, text, kind, file, path, noAuto: false, ...extra })
  }

  // ---------------------------------------------------------------- interface
  // §7 puts orientation and interface text in the widest tier: cheapest to verify, highest equity
  // return. It is also the tier where a mistranslation is most visible, being on every screen.
  for (const [keys, value] of flat(en.ui)) add(`ui:${keys.join('.')}`, value, 'ui', PACK, ['ui', ...keys])

  for (const g of groups.groups) add(`group:${g.slug}`, g.title, 'group', PACK, ['groups', g.slug])

  for (const [slug, l] of Object.entries(layers.layers))
    add(`layerTitle:${slug}`, l.title, 'layerTitle', PACK, ['layerTitles', slug])

  // ---------------------------------------------------------------- panels and endings
  // §10: the group panel is what stops a short entry reading as neglect, and the ending is what
  // makes the page end in words. Both are spoken (§6), so both are held to the audio standard.
  for (const [slug, p] of Object.entries(museum.panels ?? {})) {
    add(`panel:${slug}:panel`, p.panel, 'panel', PACK, ['panels', slug, 'panel'])
    add(`panel:${slug}:ending`, p.ending, 'panel', PACK, ['panels', slug, 'ending'])
  }

  // ---------------------------------------------------------------- layer essays
  for (const [slug, l] of Object.entries(layers.layers)) {
    add(`layer:${slug}:standfirst`, l.standfirst, 'layer', LAYERS, ['layers', slug, 'standfirst'], {
      noAuto: !!l.noAuto,
    })
    for (const seg of l.segments ?? []) {
      const at = ['layers', slug, 'segments', seg.id]
      const extra = { noAuto: !!seg.noAuto, noAutoWhy: seg.noAutoWhy }
      add(`layer:${slug}:seg:${seg.id}:heading`, seg.heading, 'layer', LAYERS, [...at, 'heading'], extra)
      add(`layer:${slug}:seg:${seg.id}:text`, seg.text, 'layer', LAYERS, [...at, 'text'], extra)
    }
  }

  // ---------------------------------------------------------------- object stories
  //
  // `catalogueName` is deliberately absent. §6 has the catalogue speak its own description, visibly
  // as the record's words rather than restyled into ours, and the string is a Latin binomial behind
  // a boilerplate prefix. No pack has ever carried one, so the lookup in src/pages/group.jsx has
  // always fallen back to English — which is the correct rendering, not a gap.
  //
  // `identification` is absent for a different reason: it is no longer rendered in any language and
  // scripts/split.mjs strips it out of the chunks. Translating text nobody can read costs the
  // visitor bytes and teaches nothing.
  for (const [accession, s] of Object.entries(stories)) {
    const at = ['stories', accession]
    add(`story:${accession}:headline`, s.headline, 'story', STORIES, [...at, 'headline'], {
      accession,
      noAuto: !!s.noAuto,
    })
    for (const seg of s.segments ?? []) {
      const segAt = [...at, 'segments', seg.id]
      const extra = { accession, noAuto: !!seg.noAuto, noAutoWhy: seg.noAutoWhy }
      add(`story:${accession}:seg:${seg.id}:heading`, seg.heading, 'story', STORIES, [...segAt, 'heading'], extra)
      add(`story:${accession}:seg:${seg.id}:text`, seg.text, 'story', STORIES, [...segAt, 'text'], extra)
    }
  }

  // ---------------------------------------------------------------- further reading (§6)
  //
  // ONLY the `why` — our own sentence about why a source is worth a visitor's time. Three fields
  // sit beside it and each is deliberately left in English:
  //
  //   `title` is somebody else's article, named as they named it. A citation is not translated,
  //   and translating it would tell a German reader that "Fragile Legacy" leads somewhere German.
  //   It does not. src/data/layers.json's `sources` have always behaved this way.
  //
  //   the publisher's `name` is a proper noun — "Te Ara — the Encyclopedia of New Zealand" is what
  //   that institution is called, in every language.
  //
  //   `claim` is not here because it is already a UI string (ui.claim.*) and is collected above
  //   with the rest of the interface. It is the one part of a link that MUST translate, so it was
  //   put where translation is cheapest and most visible rather than left as free text per link.
  //
  // Keyed on the link's own authored id, never its position — the same rule as story segments, and
  // for the same reason: reordering the file must not pair one link's words with another's.
  const elsewhere = read('elsewhere.json')
  for (const [scope, list] of [
    ['collection', elsewhere.collection],
    ...Object.entries(elsewhere.groups),
    ...Object.entries(elsewhere.objects),
  ]) {
    for (const l of list) {
      if (!l.id) throw new Error(`elsewhere.json: a link in "${scope}" has no id — see the note in scripts/units.mjs`)
      add(`elsewhere:${l.id}:why`, l.why, 'elsewhere', ELSEWHERE, ['elsewhere', l.id, 'why'])
    }
  }

  return units
}

// Every binomial in the collection, longest first so "Physalia pelagica" is matched before
// "Physalia". manifest `title` is the name with the boilerplate prefix already stripped (§5), which
// is exactly the binomial — there is no separate field for it.
export function binomials() {
  const manifest = read('manifest.json')
  const names = new Set()
  for (const o of manifest.objects) if (o.title?.trim()) names.add(o.title.trim())
  return [...names].sort((a, b) => b.length - a.length)
}

// pathToFileURL rather than string-building the URL: on Windows argv[1] is a drive path, which
// yields file://C:/... against import.meta.url's file:///C:/... and the check silently never fires.
// Guarded, because argv[1] is undefined when this is imported from `node -e` and pathToFileURL
// throws on undefined — which turned a report into a crash.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const units = collect()
  const by = {}
  for (const u of units) by[u.kind] = (by[u.kind] ?? 0) + 1
  const chars = units.reduce((t, u) => t + u.text.length, 0)
  console.log('TRANSLATABLE UNITS')
  for (const [kind, n] of Object.entries(by)) console.log(`  ${kind.padEnd(12)} ${String(n).padStart(5)}`)
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(units.length).padStart(5)}   ${chars.toLocaleString()} characters`)
  console.log(`  ${'held back'.padEnd(12)} ${String(units.filter((u) => u.noAuto).length).padStart(5)}   flagged noAuto`)
  console.log(`\n  ${binomials().length} distinct binomials to protect`)
}
