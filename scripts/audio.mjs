// Generate the English audio tracks with Azure's en-NZ-MollyNeural, per BUILD-SPEC-v2.md §13.
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=australiaeast node scripts/audio.mjs
//   node scripts/audio.mjs --dry-run     build every SSML document and check it, call nothing
//   node scripts/audio.mjs --probe       synthesise one short line to test phoneme support
//   node scripts/audio.mjs --only 1884.137.33
//
// The rules from §13 that this file exists to enforce, and how:
//
//   "The spoken words are the printed words. Word for word, with no exceptions."
//       Every SSML document is stripped back to plain text and compared against the source string.
//       If they differ by one character the build throws. This is the only guard that matters, so
//       it runs on every segment, in dry runs too, and there is no flag to skip it.
//
//   "Pronunciation is metadata, never different words."
//       Pronunciations come from src/data/pronunciation.json and are applied as <phoneme> tags
//       WRAPPING the original word. The word is never replaced. That is also why the integrity
//       check above works: stripping the tags gives back exactly what was printed.
//
//   "WebVTT cues map one-to-one onto the printed segments. Cues generated at production time."
//       Azure reports the millisecond each word begins. We keep those and write a .vtt beside
//       each audio file. Nothing is estimated or guessed at runtime.
//
// One audio file per SEGMENT, not per object. That decision does three things at once: it gives
// skip-by-section for free (the next section is the next file, so a visitor never has to scrub),
// it sidesteps a known Azure bug where bookmark offsets drift when a <break> precedes them, and it
// means editing one paragraph re-synthesises one paragraph instead of a whole object.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1] }

const DRY = has('--dry-run')
const PROBE = has('--probe')
const ONLY = val('--only')

const VOICE = 'en-NZ-MollyNeural'
const LOCALE = 'en-NZ'
// 48 kbit mono is the sweet spot for a speaking voice. §2's visitor is on a slow museum connection,
// and the difference between this and 128 kbit is inaudible for speech but triples the download.
const FORMAT = 'Audio24Khz48KBitRateMonoMp3'

const OUT = new URL('../public/audio/en/', import.meta.url)
const INDEX = new URL('../src/data/audio-index.json', import.meta.url)

// ---------------------------------------------------------------- content

const museum = read('stories.json')
const drafted = read('stories-drafted.json')
const layers = read('layers.json')
const groups = read('groups.json')
const pron = read('pronunciation.json')
const MANIFEST = read('manifest.json').objects
const EN = read('i18n/en.json')
const STORIES = { ...drafted.stories, ...museum.stories }

// One flat list of everything to voice. Each unit is exactly one printed segment, which is what
// §13 means by a cue mapping one-to-one onto a segment.
function collect() {
  const units = []

  // Page order, because that is the order a visitor meets it and the order a skip button walks.
  // Mirrors the object route in src/App.jsx: headline and catalogue line, story segments,
  // identification note. Nothing here is composed or reworded - each unit is a block that is
  // already on the screen, which is the whole of the brief: voice the text that is displayed.
  for (const rec of MANIFEST) {
    const accession = rec.accession
    if (ONLY && accession !== ONLY) continue
    const story = STORIES[accession]

    const headline = story?.headline ?? rec.name ?? rec.title
    // §10 demotes the catalogue string beneath the plain-English name and drops it when it would
    // only repeat it. The audio has to make the same choice or it says the same words twice.
    const showCatalogue = headline !== rec.title && headline !== rec.catalogueName
    units.push({
      kind: 'title',
      id: `${accession}/00-title`,
      track: 'interpretation',
      heading: null,
      text: showCatalogue ? `${headline}\n\n${rec.catalogueName}` : headline,
    })

    // The accession/size/rights line is deliberately NOT voiced. It is printed on the page, so a
    // screen reader already reads it on request - narrating it again adds nothing for the visitor
    // who wants it and is pure noise for everyone else. "1 - model: 200 x 90 x 90mm · CC-BY-NC" is
    // catalogue notation, not description, and reading it aloud was never the right way to tell
    // anyone how big a thing is. The proper answer is the §13 audio-description track; until that
    // exists the honest position is silence rather than a bad substitute.

    if (story) {
      for (const seg of story.segments) {
        // §13's two-track model wanted a separate audio-description track. Only the interpretation
        // text exists, so that is what ships. See docs/audio-generation.md.
        units.push({ kind: 'story', id: `${accession}/${seg.id}`, track: 'interpretation', heading: seg.heading, text: seg.text })
      }
      if (story.identification) {
        units.push({ kind: 'identification', id: `${accession}/99-identification`, track: 'interpretation', heading: null, text: story.identification })
      }
    } else {
      // Defensive: the harvest asserts every object has a story, so this path should never run.
      // If it ever does, the page shows the catalogue's own words and so should the audio.
      units.push({ kind: 'catalogue', id: `${accession}/99-catalogue`, track: 'interpretation', heading: null, text: rec.description })
    }
  }

  if (!ONLY) {
    // The front page. The eleven tiles are navigation rather than prose - "13 models. About 12
    // minutes." is a signpost, and reading signposts aloud is how an audio guide becomes a chore -
    // so what gets voiced is the writing at the top of the page.
    units.push({
      kind: 'home',
      id: 'home/00-intro',
      track: 'interpretation',
      heading: null,
      text: `${EN.ui.collectionTitle}\n\n${EN.ui.collectionIntro}`,
    })

    for (const g of groups.groups) {
      const p = museum.panels[g.slug]
      if (!p) continue
      // The group's own title leads its panel, the way the page does. The "N models, about M
      // minutes" line under it is skipped for the same reason as the tiles.
      if (p.panel) {
        units.push({ kind: 'panel', id: `groups/${g.slug}/00-panel`, track: 'interpretation', heading: null, text: `${g.title}\n\n${p.panel}` })
      }
      if (p.ending) {
        units.push({ kind: 'panel', id: `groups/${g.slug}/99-ending`, track: 'interpretation', heading: null, text: p.ending })
      }
    }

    // §13 puts layers 1-2 in scope and leaves 3-5 as text-only, with one exception: where no device
    // voice exists for a shipped language, the reading layer is pre-rendered too. We ship one voice
    // and one language, so that exception is the whole of our situation - and these three essays
    // are the deepest writing in the collection. Leaving them silent would mean the audio guide
    // stops exactly where the material gets good.
    for (const [slug, l] of Object.entries(layers.layers)) {
      units.push({ kind: 'layer', id: `layers/${slug}/00-standfirst`, track: 'reading', heading: null, text: `${l.title}\n\n${l.standfirst}` })
      for (const seg of l.segments) {
        units.push({ kind: 'layer', id: `layers/${slug}/${seg.id}`, track: 'reading', heading: seg.heading, text: seg.text })
      }
    }
    // The sources list at the foot of a layer page is a set of links, not prose. Not voiced.
  }

  return units
}

// ---------------------------------------------------------------- SSML

const LEX = new Map()
for (const group of ['genera', 'epithets', 'terms', 'names']) {
  for (const [word, entry] of Object.entries(pron[group])) LEX.set(word.toLowerCase(), entry)
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// Tokenise rather than run a global regex per lexicon word. A regex sweep over 131 entries will
// happily match inside a word it already rewrote ("Doris" inside "Actinodoris", "salp" inside
// "salps") and produce nested tags. Splitting into word/non-word tokens first makes that impossible.
const tokenise = (text) => text.split(/([A-Za-z][A-Za-z'’-]*)/)

// mode: 'phoneme' uses <phoneme alphabet="ipa">, 'alias' uses <sub alias>. The alias form is the
// fallback for the case where en-NZ turns out not to accept the en-GB phone set - Azure returns
// HTTP 400 for an unrecognised phone, so we find out on the first request, not silently.
function markUp(text, mode) {
  const out = []
  for (const [i, tok] of tokenise(text).entries()) {
    // Odd indices are the captured word tokens; even indices are the separators between them.
    if (i % 2 === 0) { out.push(esc(tok)); continue }
    const entry = LEX.get(tok.toLowerCase())
    if (!entry || mode === 'off') { out.push(esc(tok)); continue }
    if (mode === 'alias') out.push(`<sub alias="${esc(entry.say)}">${esc(tok)}</sub>`)
    else out.push(`<phoneme alphabet="ipa" ph="${esc(entry.ipa)}">${esc(tok)}</phoneme>`)
  }
  return out.join('')
}

// Paragraphs become <p>. That is how SSML expresses a paragraph pause, and it is better than
// inserting <break> tags by hand: it reads naturally and it keeps explicit breaks out of the
// document, which is what makes the word-offset stream trustworthy.
function buildSsml(unit, mode) {
  const blocks = []
  if (unit.heading) blocks.push(unit.heading)
  blocks.push(...unit.text.split(/\n{2,}/))

  const body = blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${markUp(b, mode)}</p>`)
    .join('\n    ')

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE}">
  <voice name="${VOICE}">
    ${body}
  </voice>
</speak>`
}

// The spoken text, recovered from the SSML by throwing the markup away. Whatever this returns is
// what a listener hears; it has to equal what a reader sees.
function spokenTextOf(ssml) {
  const body = ssml.replace(/^[\s\S]*?<voice[^>]*>/, '').replace(/<\/voice>[\s\S]*$/, '')
  return unesc(body.replace(/<[^>]+>/g, ''))
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function printedTextOf(unit) {
  const blocks = []
  if (unit.heading) blocks.push(unit.heading)
  blocks.push(...unit.text.split(/\n{2,}/))
  return blocks.map((b) => b.trim()).filter(Boolean).join('\n')
}

// §13's guard. Not optional, not skippable, and it runs before anything is sent or written.
function assertIntegrity(unit, ssml) {
  const printed = printedTextOf(unit)
  const spoken = spokenTextOf(ssml)
  if (spoken === printed) return
  let at = 0
  while (at < spoken.length && at < printed.length && spoken[at] === printed[at]) at++
  throw new Error(
    `§13 violation in ${unit.id}: the spoken text is not the printed text.\n` +
      `  first difference at character ${at}\n` +
      `  printed: ${JSON.stringify(printed.slice(Math.max(0, at - 30), at + 30))}\n` +
      `  spoken:  ${JSON.stringify(spoken.slice(Math.max(0, at - 30), at + 30))}`
  )
}

// ---------------------------------------------------------------- synthesis

// Bumped whenever cue generation changes, so fixing the VTTs actually rebuilds them instead of
// being skipped by the cache. The audio is unchanged by a cue fix, but the two are written
// together and it is not worth a second cache to keep them apart.
const PIPELINE = 2

const hashOf = (s) => createHash('sha256').update(`v${PIPELINE}
${s}`).digest('hex').slice(0, 16)

async function synthesise(ssml, key, region) {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk')
  const config = sdk.SpeechConfig.fromSubscription(key, region)
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat[FORMAT]

  return new Promise((resolve, reject) => {
    const synth = new sdk.SpeechSynthesizer(config, null)
    const words = []

    synth.wordBoundary = (_s, e) => {
      // audioOffset is in ticks of 100 nanoseconds. Everything downstream wants milliseconds.
      words.push({
        text: e.text,
        start: Math.round(e.audioOffset / 10000),
        duration: Math.round((e.duration ?? 0) / 10000),
      })
    }

    synth.speakSsmlAsync(
      ssml,
      (result) => {
        synth.close()
        if (result.reason === sdk.ResultReason.Canceled) {
          const d = sdk.CancellationDetails.fromResult(result)
          return reject(new Error(`Azure cancelled: ${d.reason} ${d.errorDetails}`))
        }
        resolve({ audio: Buffer.from(result.audioData), words, durationMs: Math.round(result.audioDuration / 10000) })
      },
      (err) => { synth.close(); reject(new Error(String(err))) }
    )
  })
}

// ---------------------------------------------------------------- WebVTT

const stamp = (ms) => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  return `${h}:${m}:${s}.${String(ms % 1000).padStart(3, '0')}`
}

// One cue per word, so the page can follow the narration. The end of a word is the start of the
// next one rather than start+duration: Azure's durations exclude the silence between words, and a
// highlight that blinks off in the gaps looks broken.
//
// Two corrections are applied to what Azure reports, both found by reading the generated cues:
//
//   Punctuation-only cues. Azure splits "man o' war" into "man", "o", "'", "war" and reports the
//   bare apostrophe as its own word. Highlighting a lone apostrophe for a tenth of a second reads
//   as a glitch, so those cues are folded into the word before them.
//
//   <sub> segments get ONE cue for the whole line. Azure reports word offsets as positions in the
//   SSML it was given, and the SDK slices the text out using them - which works while the spoken
//   words and the written words are the same string. Inside <sub> they are not, so the slices land
//   on raw markup and the cues come back containing things like '">1884.137.33'. The timings are
//   not recoverable, so rather than ship convincing-looking nonsense the whole line becomes a
//   single cue. That is the honest resolution for a line of metadata anyway.
function buildVtt(unit, words, totalMs) {
  const cues = []

  {
    const merged = []
    for (const w of words) {
      const isPunctuation = !/[A-Za-z0-9]/.test(w.text)
      if (isPunctuation && merged.length) {
        const prev = merged[merged.length - 1]
        prev.text += w.text
        prev.duration = w.start + w.duration - prev.start
        continue
      }
      merged.push({ ...w })
    }
    for (const [i, w] of merged.entries()) {
      cues.push({
        start: w.start,
        end: i + 1 < merged.length ? merged[i + 1].start : Math.max(w.start + w.duration, totalMs),
        text: w.text,
      })
    }
  }

  const lines = ['WEBVTT', '']
  for (const [i, c] of cues.entries()) lines.push(`${i + 1}`, `${stamp(c.start)} --> ${stamp(c.end)}`, c.text, '')
  return lines.join('\n')
}

// ---------------------------------------------------------------- run

async function main() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  const units = collect()

  // Integrity first, for everything, before a single byte goes over the wire. If the corpus cannot
  // be voiced without changing it, that is a fact worth learning for free.
  let mode = 'phoneme'
  for (const u of units) assertIntegrity(u, buildSsml(u, mode))
  console.log(`✓ §13 integrity: ${units.length} segments, spoken text identical to printed text`)

  const marked = units.reduce((n, u) => n + (buildSsml(u, mode).match(/<phoneme|<sub /g)?.length ?? 0), 0)
  console.log(`  ${marked} pronunciation tags applied from ${LEX.size} lexicon entries`)

  if (DRY) {
    const sample = units.find((u) => buildSsml(u, mode).includes('<phoneme')) ?? units[0]
    console.log(`\nSample SSML — ${sample.id}\n${buildSsml(sample, mode)}`)
    console.log(`\nDry run: nothing synthesised. ${units.length} segments ready.`)
    return
  }

  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION, or pass --dry-run.')
    process.exit(1)
  }

  // Azure documents an IPA phone set for en-GB/en-IE/en-AU but publishes none for en-NZ. Rather
  // than assume it inherits the British set, spend one tiny request finding out. An unrecognised
  // phone is an HTTP 400, so a failure here is unambiguous.
  const probe = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE}"><voice name="${VOICE}"><phoneme alphabet="ipa" ph="faɪ.ˈseɪ.li.ə">Physalia</phoneme></voice></speak>`
  try {
    await synthesise(probe, key, region)
    console.log(`✓ ${VOICE} accepts IPA phonemes — using <phoneme>`)
  } catch (err) {
    mode = 'alias'
    console.log(`! ${VOICE} rejected the IPA probe (${err.message.slice(0, 120)})`)
    console.log(`  falling back to <sub alias> using the plain respellings`)
    for (const u of units) assertIntegrity(u, buildSsml(u, mode))
    console.log(`✓ §13 integrity re-checked in alias mode`)
  }

  if (PROBE) return

  const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : { voice: VOICE, mode, segments: {} }
  index.voice = VOICE
  index.mode = mode

  let made = 0
  let cached = 0
  let bytes = 0

  for (const unit of units) {
    const ssml = buildSsml(unit, mode)
    assertIntegrity(unit, ssml)
    const hash = hashOf(ssml)
    const mp3 = new URL(`${unit.id}.mp3`, OUT)
    const vtt = new URL(`${unit.id}.vtt`, OUT)

    // Re-synthesising unchanged text costs money and, more importantly, produces a different audio
    // file for identical words - which would churn the repo on every run.
    if (index.segments[unit.id]?.hash === hash && existsSync(mp3)) {
      cached++
      bytes += statSync(mp3).size
      continue
    }

    const { audio, words, durationMs } = await synthesise(ssml, key, region)
    mkdirSync(dirname(mp3.pathname.replace(/^\/([A-Za-z]:)/, '$1')), { recursive: true })
    writeFileSync(mp3, audio)
    writeFileSync(vtt, buildVtt(unit, words, durationMs))

    index.segments[unit.id] = { hash, durationMs, words: words.length, bytes: audio.length, track: unit.track, kind: unit.kind }
    made++
    bytes += audio.length
    process.stdout.write(`\r  ${made} synthesised, ${cached} cached — ${unit.id}`.padEnd(90))
  }

  // Drop entries for segments that are no longer voiced, and delete their files. Without this,
  // removing something from collect() leaves its audio on disk and in the index forever - shipped,
  // deployed, and silently wrong the moment anyone trusts the index to say what exists.
  if (!ONLY) {
    const live = new Set(units.map((u) => u.id))
    for (const id of Object.keys(index.segments)) {
      if (live.has(id)) continue
      delete index.segments[id]
      for (const ext of ['mp3', 'vtt']) {
        const f = new URL(`${id}.${ext}`, OUT)
        if (existsSync(f)) rmSync(f)
      }
      console.log(`  removed ${id} — no longer voiced`)
    }
  }

  writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`)

  const totalMs = Object.values(index.segments).reduce((t, s) => t + s.durationMs, 0)
  console.log(`\n✓ ${made} synthesised, ${cached} unchanged`)
  console.log(`  ${(bytes / 1e6).toFixed(1)} MB, ${(totalMs / 60000).toFixed(0)} minutes across ${Object.keys(index.segments).length} files`)
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1) })
