// Generate the narration with Azure Neural TTS, per BUILD-SPEC-v2.md §13.
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=australiaeast node scripts/audio.mjs
//   node scripts/audio.mjs --dry-run     build every SSML document and check it, call nothing
//   node scripts/audio.mjs --probe       synthesise one short line to test phoneme support
//   node scripts/audio.mjs --only 1884.137.33
//   node scripts/audio.mjs --lang de     voice a language other than English
//
// A language only ever voices the words it actually has. A translated pack is a map of overrides
// onto English, so where a language has no entry the page shows English — and §13's rule that the
// spoken words ARE the printed words then means the English file is the correct one to play there.
// Generating a German file containing English words to fill the gap would be precisely the
// divergence the rule exists to prevent, so gaps are skipped rather than padded.
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
const LANG = val('--lang') ?? 'en'
// Keep files the index no longer lists. Used by the workflow: deleting audio is a decision a person
// should make deliberately, not something a push quietly does on their behalf. The English index
// still holds 24 retired identification and ending units, and an automated sweep would remove them
// on the first run without anyone choosing to.
const NO_SWEEP = has('--no-sweep')
// Regenerate narration that exists and has gone stale; never create narration that does not.
// Used by the workflow for translated languages. Without it, a one-word change to an English title
// notices that German has 128 translated stories and synthesises all 414 of its files — 44MB into
// the repository as a side effect of a rename nobody connected to audio. It is the line the
// translator already draws between sync and backfill: keeping something current is a consequence
// of a change, deciding to produce it in the first place is a decision with a bill attached.
// Checked per SEGMENT rather than per language, because a language with four files is still a
// language that has not been voiced.
const NO_NEW = has('--no-new')

// Which voice speaks which language. Two things are easy to get wrong here and both are recorded
// rather than assumed:
//
//   A language is not a locale. `zh-Hant` is a script, and Azure speaks locales — so it maps to
//   zh-TW. NOT zh-HK: Traditional Chinese is the shared written form, but the Hong Kong voices
//   speak Cantonese, a different spoken language. Picking it because the script matched would be
//   the same error as reading Iranian Persian to an Afghan audience, which §7 exists to prevent.
//
//   Arabic has sixteen locales and the choice is argued in docs/audio-generation.md. Short version:
//   the text is Modern Standard Arabic whichever voice reads it, so this is an accent rather than a
//   language, and ar-SA reads MSA closest to the norm — Egyptian would render ج as /g/, which is
//   instantly Egyptian. It is a recommendation pending an Arabic community reviewer, not a finding.
//
// Female throughout, following en-NZ-MollyNeural, and every one carries a News, Narration or
// E-learning tailoring tag — voices tuned for formal read-aloud rather than conversation. Listed
// from the service itself; `npm run audio -- --voices` reprints the current catalogue.
const VOICES = {
  en: { locale: 'en-NZ', voice: 'en-NZ-MollyNeural' },
  de: { locale: 'de-DE', voice: 'de-DE-KatjaNeural' },
  fr: { locale: 'fr-FR', voice: 'fr-FR-DeniseNeural' },
  es: { locale: 'es-ES', voice: 'es-ES-ElviraNeural' },
  ja: { locale: 'ja-JP', voice: 'ja-JP-NanamiNeural' },
  ko: { locale: 'ko-KR', voice: 'ko-KR-SunHiNeural' },
  'zh-Hant': { locale: 'zh-TW', voice: 'zh-TW-HsiaoChenNeural' },
  ar: { locale: 'ar-SA', voice: 'ar-SA-ZariyahNeural' },
}

if (!VOICES[LANG]) {
  console.error(`No voice configured for "${LANG}". Known: ${Object.keys(VOICES).join(', ')}`)
  process.exit(1)
}
const { locale: LOCALE, voice: VOICE } = VOICES[LANG]

// 48 kbit mono is the sweet spot for a speaking voice. §2's visitor is on a slow museum connection,
// and the difference between this and 128 kbit is inaudible for speech but triples the download.
const FORMAT = 'Audio24Khz48KBitRateMonoMp3'

const OUT = new URL(`../public/audio/${LANG}/`, import.meta.url)
const INDEX = new URL('../src/data/audio-index.json', import.meta.url)

// ---------------------------------------------------------------- content

const museum = read('stories.json')
const drafted = read('stories-drafted.json')
const layers = read('layers.json')
const groups = read('groups.json')
const MANIFEST = read('manifest.json').objects
const EN = read('i18n/en.json')

// The lexicon is per language, not global. src/data/pronunciation.json holds 161 IPA entries tuned
// for en-NZ-MollyNeural; the same IPA through a German voice is not the same sound, and a binomial
// inside German prose is a genuinely different pronunciation problem rather than the same one
// again. So a language gets src/data/pronunciation/{code}.json if someone has written one, and an
// empty lexicon if not — which is honest. Binomial pronunciation outside English is unsolved, and
// leaving the map empty says so rather than shipping en-NZ vowels under a German voice.
const readIfExists = (p) => {
  const u = new URL(`../src/data/${p}`, import.meta.url)
  return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : null
}
const pron = LANG === 'en' ? read('pronunciation.json') : readIfExists(`pronunciation/${LANG}.json`)

// The words a given language actually has. A translated pack is a map of overrides onto English
// (see scripts/split.mjs), so an absent entry is a gap and the page falls back to English there.
// §13's rule is that the spoken words ARE the printed words, so a gap must NOT be voiced in this
// language: the page shows English at that point and the English audio already exists to match it.
// Voicing a German file containing English words would be the exact divergence the rule prevents.
const PACK = LANG === 'en' ? null : readIfExists(`i18n/${LANG}.json`)
const PACK_STORIES = LANG === 'en' ? null : readIfExists(`i18n/stories/${LANG}.json`)
const PACK_LAYERS = LANG === 'en' ? null : readIfExists(`i18n/layers/${LANG}.json`)

const STORIES = { ...drafted.stories, ...museum.stories }

// Resolve one string in the target language, or null when this language has not got it. English
// resolves to itself, so the English run is unchanged in behaviour.
const say = (english, translated) => {
  if (LANG === 'en') return english
  return typeof translated === 'string' && translated.trim() ? translated : null
}

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

    const tStory = PACK_STORIES?.stories?.[accession]
    const headline = say(story?.headline ?? rec.name ?? rec.title, tStory?.headline)
    // §10 demotes the catalogue string beneath the plain-English name and drops it when it would
    // only repeat it. The audio has to make the same choice or it says the same words twice.
    // The catalogue name is never translated (§6 — the catalogue speaks its own words), so it is
    // the same string in every language.
    if (headline) {
      const showCatalogue = headline !== rec.title && headline !== rec.catalogueName
      units.push({
        kind: 'title',
        id: `${accession}/00-title`,
        track: 'interpretation',
        heading: null,
        text: showCatalogue ? `${headline}\n\n${rec.catalogueName}` : headline,
      })
    }

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
        const t = tStory?.segments?.[seg.id]
        const heading = say(seg.heading, t?.heading)
        const text = say(seg.text, t?.text)
        // Both halves or neither: a file whose heading is German and whose body is English would
        // put two languages in one breath, and the read-along would highlight across the seam.
        if (!text || (seg.heading && !heading)) continue
        units.push({ kind: 'story', id: `${accession}/${seg.id}`, track: 'interpretation', heading, text })
      }
      // No identification unit. The note is no longer printed on the page, and §13's rule is that
      // the spoken words ARE the printed words — generating narration for text nobody can read is
      // exactly the divergence this pipeline exists to prevent. The 28 already-generated
      // 99-identification files under public/audio/en are now unused; they are left in place rather
      // than deleted, since nothing loads them and regenerating audio costs money.
    } else if (LANG === 'en') {
      // Defensive: the harvest asserts every object has a story, so this path should never run.
      // If it ever does, the page shows the catalogue's own words and so should the audio. English
      // only — the catalogue's description is not translated, so there is nothing to voice.
      units.push({ kind: 'catalogue', id: `${accession}/99-catalogue`, track: 'interpretation', heading: null, text: rec.description })
    }
  }

  if (!ONLY) {
    // The front page. The eleven tiles are navigation rather than prose - "13 models. About 12
    // minutes." is a signpost, and reading signposts aloud is how an audio guide becomes a chore -
    // so what gets voiced is the writing at the top of the page.
    const title = say(EN.ui.collectionTitle, PACK?.ui?.collectionTitle)
    const intro = say(EN.ui.collectionIntro, PACK?.ui?.collectionIntro)
    if (title && intro) {
      units.push({
        kind: 'home',
        id: 'home/00-intro',
        track: 'interpretation',
        heading: null,
        text: `${title}\n\n${intro}`,
      })
    }

    for (const g of groups.groups) {
      const p = museum.panels[g.slug]
      if (!p) continue
      // The group's own title leads its panel, the way the page does. The "N models, about M
      // minutes" line under it is skipped for the same reason as the tiles.
      const gTitle = say(g.title, PACK?.groups?.[g.slug])
      const gPanel = say(p.panel, PACK?.panels?.[g.slug]?.panel)
      if (gTitle && gPanel) {
        units.push({ kind: 'panel', id: `groups/${g.slug}/00-panel`, track: 'interpretation', heading: null, text: `${gTitle}\n\n${gPanel}` })
      }
      // No ending unit. The closing line is no longer printed, and §13's rule is that the spoken
      // words ARE the printed words. The 20 already-generated 99-ending files under public/audio/en
      // are unused now; left in place, since nothing loads them and regenerating costs money.
    }

    // §13 puts layers 1-2 in scope and leaves 3-5 as text-only, with one exception: where no device
    // voice exists for a shipped language, the reading layer is pre-rendered too. We ship one voice
    // and one language, so that exception is the whole of our situation - and these three essays
    // are the deepest writing in the collection. Leaving them silent would mean the audio guide
    // stops exactly where the material gets good.
    for (const [slug, l] of Object.entries(layers.layers)) {
      const tl = PACK_LAYERS?.layers?.[slug]
      const lTitle = say(l.title, PACK?.layerTitles?.[slug])
      const lStand = say(l.standfirst, tl?.standfirst)
      if (lTitle && lStand) {
        units.push({ kind: 'layer', id: `layers/${slug}/00-standfirst`, track: 'reading', heading: null, text: `${lTitle}\n\n${lStand}` })
      }
      for (const seg of l.segments) {
        const t = tl?.segments?.[seg.id]
        const heading = say(seg.heading, t?.heading)
        const text = say(seg.text, t?.text)
        if (!text || (seg.heading && !heading)) continue
        units.push({ kind: 'layer', id: `layers/${slug}/${seg.id}`, track: 'reading', heading, text })
      }
    }
    // The sources list at the foot of a layer page is a set of links, not prose. Not voiced.
  }

  return units
}

// ---------------------------------------------------------------- SSML

const LEX = new Map()
if (pron) {
  for (const group of ['genera', 'epithets', 'terms', 'names']) {
    for (const [word, entry] of Object.entries(pron[group] ?? {})) LEX.set(word.toLowerCase(), entry)
  }
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
  let mode = LEX.size ? 'phoneme' : 'off'
  for (const u of units) assertIntegrity(u, buildSsml(u, mode))
  console.log(`${LANG} — ${VOICE}`)
  console.log(`✓ §13 integrity: ${units.length} segments, spoken text identical to printed text`)

  if (!units.length) {
    console.log(`  Nothing to voice: no content exists in "${LANG}" yet.`)
    return
  }

  if (LEX.size) {
    const marked = units.reduce((n, u) => n + (buildSsml(u, mode).match(/<phoneme|<sub /g)?.length ?? 0), 0)
    console.log(`  ${marked} pronunciation tags applied from ${LEX.size} lexicon entries`)
  } else {
    console.log(`  no pronunciation lexicon for ${LANG} — write src/data/pronunciation/${LANG}.json to add one`)
  }

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

  // A voice name that does not exist fails per request with a cancellation, which at 438 segments
  // means finding out 438 times. The catalogue is authoritative and one call, so ask it first —
  // Azure retires and renames voices, and a map written once in a comment rots quietly.
  const list = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  })
  if (list.ok) {
    const all = await list.json()
    if (!all.some((v) => v.ShortName === VOICE)) {
      const alternatives = all.filter((v) => v.Locale === LOCALE).map((v) => v.ShortName)
      throw new Error(
        `${VOICE} is not in this resource's voice catalogue.\n` +
          (alternatives.length
            ? `  Voices for ${LOCALE}: ${alternatives.join(', ')}`
            : `  No voices at all for ${LOCALE}. Check the locale in VOICES.`)
      )
    }
    console.log(`✓ ${VOICE} exists in ${region}`)
  }

  // Azure documents an IPA phone set for en-GB/en-IE/en-AU but publishes none for en-NZ. Rather
  // than assume it inherits the British set, spend one tiny request finding out. An unrecognised
  // phone is an HTTP 400, so a failure here is unambiguous. Skipped where there is no lexicon,
  // since there is then nothing to fall back from.
  if (mode === 'phoneme') {
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
  }

  if (PROBE) return

  // One index, a section per language. `base` is where the files are served from, and it exists so
  // that moving audio out of the repo later is a value in this file rather than a change to the
  // player: src/audio.jsx reads it instead of hardcoding a path. English alone is 44MB, and nine
  // languages of it is not something git should be asked to carry indefinitely.
  const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {}

  // Migrate the flat single-language shape — { voice, mode, segments } — into languages.en. Without
  // this the 438 English hashes read as absent, every file is resynthesised for words that have not
  // changed, and 44MB of byte-different audio churns the repo for nothing. Runs once; after that
  // there is no top-level `segments` to find.
  if (index.segments && !index.languages) {
    index.languages = { en: { voice: index.voice, locale: 'en-NZ', mode: index.mode, base: '/audio/en', segments: index.segments } }
    delete index.segments
    delete index.voice
    delete index.mode
    console.log(`  migrated ${Object.keys(index.languages.en.segments).length} English entries into the per-language index`)
  }

  index.note =
    'Written by scripts/audio.mjs, one section per language. `base` is the URL prefix the player fetches from — change it to move a language’s audio off the repo without touching the player.'
  index.languages ??= {}
  const section = (index.languages[LANG] ??= { segments: {} })
  section.voice = VOICE
  section.locale = LOCALE
  section.mode = mode
  section.base = section.base ?? `/audio/${LANG}`
  section.segments ??= {}

  let made = 0
  let cached = 0
  let skipped = 0
  let bytes = 0

  for (const unit of units) {
    const ssml = buildSsml(unit, mode)
    assertIntegrity(unit, ssml)
    const hash = hashOf(ssml)
    const mp3 = new URL(`${unit.id}.mp3`, OUT)
    const vtt = new URL(`${unit.id}.vtt`, OUT)

    // Re-synthesising unchanged text costs money and, more importantly, produces a different audio
    // file for identical words - which would churn the repo on every run.
    if (section.segments[unit.id]?.hash === hash && existsSync(mp3)) {
      cached++
      bytes += statSync(mp3).size
      continue
    }

    // Under --no-new, a segment with no file yet is a gap rather than a job. Counted so the run
    // says how much narration this language is missing instead of silently doing less than asked.
    if (NO_NEW && !section.segments[unit.id]) {
      skipped++
      continue
    }

    const { audio, words, durationMs } = await synthesise(ssml, key, region)
    mkdirSync(dirname(mp3.pathname.replace(/^\/([A-Za-z]:)/, '$1')), { recursive: true })
    writeFileSync(mp3, audio)
    writeFileSync(vtt, buildVtt(unit, words, durationMs))

    section.segments[unit.id] = { hash, durationMs, words: words.length, bytes: audio.length, track: unit.track, kind: unit.kind }
    made++
    bytes += audio.length
    process.stdout.write(`\r  ${made} synthesised, ${cached} cached — ${unit.id}`.padEnd(90))
  }

  // Drop entries for segments that are no longer voiced, and delete their files. Without this,
  // removing something from collect() leaves its audio on disk and in the index forever - shipped,
  // deployed, and silently wrong the moment anyone trusts the index to say what exists.
  if (!ONLY && !NO_SWEEP) {
    const live = new Set(units.map((u) => u.id))
    for (const id of Object.keys(section.segments)) {
      if (live.has(id)) continue
      delete section.segments[id]
      for (const ext of ['mp3', 'vtt']) {
        const f = new URL(`${id}.${ext}`, OUT)
        if (existsSync(f)) rmSync(f)
      }
      console.log(`  removed ${id} — no longer voiced`)
    }
  }

  writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`)

  const totalMs = Object.values(section.segments).reduce((t, s) => t + s.durationMs, 0)
  console.log(`\n✓ ${made} synthesised, ${cached} unchanged`)
  if (skipped) {
    console.log(`  ${skipped} segment(s) have no narration yet and --no-new left them alone.`)
    console.log(`  Voice them deliberately: node scripts/audio.mjs --lang ${LANG}`)
  }
  console.log(`  ${(bytes / 1e6).toFixed(1)} MB, ${(totalMs / 60000).toFixed(0)} minutes across ${Object.keys(section.segments).length} files`)
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1) })
