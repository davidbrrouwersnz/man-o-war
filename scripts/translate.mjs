// Translate what changed, and only what changed.
//
//   npm run translate           sync — retranslate units whose English has changed
//   npm run translate:check     --dry-run, no API calls, guards and diff still run
//   npm run translate:probe     one tiny request: is the engine reachable, is DNT honoured
//   node scripts/translate.mjs --lang de --backfill    fill this language's gaps, deliberately
//   node scripts/translate.mjs --only 1884.137.33
//
// Modelled on scripts/audio.mjs, down to the ledger and the hash, because it answers the same
// question about a different artefact: what changed since last time, and what does that invalidate.
//
// WHY INCREMENTAL, since the obvious answer is wrong. It is not the money: every English word in
// this app is 85,673 characters, so retranslating the whole collection into every language costs
// about six dollars. It is the REVIEW. §7 makes verification the cost that scales linearly with
// languages, and reviewStatus per unit is what the disclosure line is built on. Retranslating a
// segment a person has already checked silently destroys their work and downgrades content that was
// trustworthy. That is worth engineering around; six dollars is not.
//
// THREE STATES, and keeping them apart is the whole design:
//
//   in the pack, hash matches      leave alone
//   in the pack, hash differs      the English moved — retranslate, reviewStatus back to unreviewed
//   not in the pack               a gap. Only --backfill fills it, never a sync run
//
// A unit in the pack with no ledger entry is SEEDED rather than translated: its current English
// hash is recorded and its engine marked unknown. That is what makes the first run safe — it
// establishes the baseline for content translated before this script existed, instead of
// retranslating 4,650 fields nobody asked it to touch.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { LANGUAGES } from '../src/i18n.js'
import { collect, PACK, LAYERS, STORIES } from './units.mjs'
import { loadGlossary } from './glossary.mjs'
import {
  assertAudited,
  assertGlossed,
  assertNumerals,
  assertProtected,
  assertStructure,
  carveOut,
  protect,
  protectedTerms,
  unprotect,
} from './translate-guard.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const value = (f) => {
  const i = argv.indexOf(f)
  return i === -1 ? null : argv[i + 1]
}

const DRY = has('--dry-run')
const PROBE = has('--probe')
const BACKFILL = has('--backfill')
const ONLY = value('--only')
const ONE_LANG = value('--lang')
// Where to write the list of units this run actually touched. The workflow passes one so the drift
// sweep can check exactly what changed rather than re-checking the whole corpus every push.
const REPORT = value('--report')

// Bumped by hand when the wire format changes in a way that should invalidate every translation —
// a different DNT mechanism, a different block split. Same role as PIPELINE in scripts/audio.mjs.
const PIPELINE = 1
const hashOf = (s) => createHash('sha256').update(`v${PIPELINE}\n${s}`).digest('hex').slice(0, 16)

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------- engine

const KEY = process.env.AZURE_TRANSLATOR_KEY
const REGION = process.env.AZURE_TRANSLATOR_REGION ?? process.env.AZURE_SPEECH_REGION
const RAW_ENDPOINT = (process.env.AZURE_TRANSLATOR_ENDPOINT ?? 'https://api.cognitive.microsofttranslator.com').replace(/\/+$/, '')
const DEPLOYMENT = process.env.AZURE_TRANSLATOR_DEPLOYMENT

// LLM translation runs only on an Azure AI Foundry resource, and needs a model deployment in it.
// The classic global Translator host serves NMT and answers 404 to the newer API, so the engine is
// chosen from what the configuration can actually reach rather than from what was asked for. A run
// that quietly used a different engine than it recorded would make the ledger a liar.
const FOUNDRY = /\.services\.ai\.azure\.com|\.cognitiveservices\.azure\.com/.test(RAW_ENDPOINT)
const WANT_LLM = FOUNDRY && DEPLOYMENT && !DEPLOYMENT.startsWith('<')
const ENGINE = WANT_LLM ? `llm:${DEPLOYMENT}` : 'nmt'

// The two engines have different limits, and the LLM one is twenty times tighter: NMT accepts 1,000
// array elements and 50,000 characters, generative AI accepts 50 and 5,000. Batching to the NMT
// figures would work perfectly until the day the endpoint changed, then fail on the first request.
// Both are set below the ceiling anyway, because a smaller batch loses less on a retry and keeps a
// single failure legible.
const MAX_ELEMENTS = WANT_LLM ? 40 : 80
const MAX_CHARS = WANT_LLM ? 4500 : 9000

// One block over the per-element ceiling cannot be batched around, only reported.
const ELEMENT_CEILING = WANT_LLM ? 5000 : 50000

async function callAzure(texts, to) {
  const url = WANT_LLM
    ? `${RAW_ENDPOINT}/translator/text/?api-version=2026-06-06`
    : `${RAW_ENDPOINT}/translate?api-version=3.0&from=en&to=${encodeURIComponent(to)}&textType=html`

  const body = WANT_LLM
    ? JSON.stringify({
        inputs: texts.map((Text) => ({
          Text,
          language: 'en',
          // §6 declines to write in the Museum's voice; formal is the register the prose already
          // has, not an attempt to add authority it has not earned.
          targets: [{ Language: to, DeploymentName: DEPLOYMENT, Tone: 'formal' }],
        })),
      })
    : JSON.stringify(texts.map((Text) => ({ Text })))

  const headers = {
    'Ocp-Apim-Subscription-Key': KEY,
    'Content-Type': 'application/json; charset=UTF-8',
  }
  if (REGION) headers['Ocp-Apim-Subscription-Region'] = REGION

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body })
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`Azure returned ${res.status} after ${attempt} retries`)
      const wait = 2 ** attempt * 1000
      console.log(`    ${res.status} — waiting ${wait / 1000}s`)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(`Azure returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = await res.json()
    // Both shapes return one result per input, in order.
    const out = WANT_LLM
      ? json.outputs?.map((o) => o.translations?.[0]?.text ?? o.Translations?.[0]?.Text)
      : json.map((o) => o.translations?.[0]?.text)
    if (!Array.isArray(out) || out.length !== texts.length || out.some((t) => typeof t !== 'string')) {
      throw new Error(`Azure returned ${out?.length} results for ${texts.length} inputs`)
    }
    return out
  }
}

// ---------------------------------------------------------------- packs

const dataDir = new URL('../src/data/', import.meta.url)
const fileFor = (kind, code) =>
  kind === PACK
    ? new URL(`i18n/${code}.json`, dataDir)
    : kind === LAYERS
      ? new URL(`i18n/layers/${code}.json`, dataDir)
      : new URL(`i18n/stories/${code}.json`, dataDir)

const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback)

const getAt = (o, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o)
const setAt = (o, path, val) => {
  let node = o
  for (const k of path.slice(0, -1)) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {}
    node = node[k]
  }
  node[path.at(-1)] = val
}

// ---------------------------------------------------------------- ledger

const LEDGER_URL = new URL('translation-index.json', dataDir)
const ledger = readJson(LEDGER_URL, { pipeline: PIPELINE, note: '', languages: {} })
ledger.pipeline = PIPELINE
ledger.note =
  'Written by scripts/translate.mjs. One entry per translatable unit per language. `hash` is of the ENGLISH text it was translated from, so a changed source is detectable without storing the source twice. reviewStatus resets to unreviewed whenever a unit is retranslated — that reset is the point of the whole pipeline. Do not hand-edit.'
ledger.languages ??= {}

// ---------------------------------------------------------------- run

const targets = LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code)
const chosen = ONE_LANG ? targets.filter((c) => c === ONE_LANG) : targets
if (ONE_LANG && !chosen.length) throw new Error(`--lang ${ONE_LANG} is not a shipped target. Targets: ${targets.join(', ')}`)

const units = collect()

// Refuses to start rather than skipping quietly (§7). Runs even under --dry-run, because the whole
// value of the check is knowing before you spend anything.
assertAudited(units)

const translatable = units.filter((u) => !carveOut(u))
const held = units.length - translatable.length
const scoped = ONLY ? translatable.filter((u) => u.accession === ONLY) : translatable

if (PROBE) {
  console.log(`PROBE — engine ${ENGINE}, endpoint ${RAW_ENDPOINT}`)
  const sample = 'The whole thing is glass. Physalia pelagica was modelled in Dresden in 1883.'
  const { html, protectedHere } = protect(sample)
  const [out] = await callAzure([html], chosen[0] ?? 'de')
  const plain = unprotect(out)
  console.log(`  sent      ${sample}`)
  console.log(`  returned  ${plain}`)
  let honoured = true
  try {
    assertProtected(protectedHere, plain, 'probe')
    assertNumerals(sample, plain, 'probe')
  } catch (e) {
    honoured = false
    console.log(`  FAILED    ${e.message}`)
  }
  console.log(`\n  class="notranslate" honoured on this engine: ${honoured ? 'yes' : 'NO'}`)
  if (!honoured) {
    console.log('  Do not run a real translation on this configuration: binomials would be translated.')
    process.exit(1)
  }
  process.exit(0)
}

if (!DRY && (!KEY || KEY.startsWith('<'))) {
  throw new Error('AZURE_TRANSLATOR_KEY is not set. Put it in .env.local, unprefixed — never VITE_.')
}

console.log(`${DRY ? 'DRY RUN — ' : ''}engine ${ENGINE}${WANT_LLM ? '' : RAW_ENDPOINT.includes('microsofttranslator') ? ' (classic Translator resource: NMT only)' : ''}`)
console.log(`${units.length} units, ${held} held back by §7 carve-outs, ${scoped.length} in scope\n`)

const TERMS = protectedTerms()
const GLOSSARY = loadGlossary()
const touchedByLang = {}
let totalSeeded = 0
let totalStale = 0
let totalFilled = 0
let totalChars = 0
const rows = []

for (const code of chosen) {
  const entries = (ledger.languages[code] ??= {})

  // One read per file, one write per file, so a language is updated atomically rather than a
  // hundred times.
  const files = {
    [PACK]: readJson(fileFor(PACK, code), { __code: code, reviewed: false }),
    [LAYERS]: readJson(fileFor(LAYERS, code), { __code: code, reviewed: false, layers: {} }),
    [STORIES]: readJson(fileFor(STORIES, code), { __code: code, reviewed: false, stories: {} }),
  }
  const touched = new Set()

  const seeded = []
  const stale = []
  const gaps = []

  for (const unit of scoped) {
    const hash = hashOf(unit.text)
    const existing = getAt(files[unit.file], unit.path)
    const entry = entries[unit.id]
    const present = typeof existing === 'string' && existing.trim()

    if (!present) {
      gaps.push(unit)
      continue
    }
    if (!entry) {
      // Translated before this script existed. Record the baseline; do not touch the text. The
      // engine is honestly unknown rather than claimed.
      entries[unit.id] = { hash, engine: 'unknown-legacy', translatedAt: null, reviewStatus: 'unreviewed' }
      seeded.push(unit)
      continue
    }
    if (entry.hash !== hash) stale.push(unit)
  }

  const todo = [...stale, ...(BACKFILL ? gaps : [])]
  totalSeeded += seeded.length
  totalStale += stale.length

  if (todo.length && !DRY) {
    // Blocks, not units. src/audio.jsx splits a segment on /\n{2,}/ and every block becomes its own
    // audio file and its own WebVTT cue, so the boundaries have to come back exactly as they went.
    const jobs = []
    for (const unit of todo) {
      const blocks = unit.text.split(/\n{2,}/)
      for (let i = 0; i < blocks.length; i++) {
        // Names with an agreed answer are supplied to the engine rather than left to it. The
        // glossary is per language, so the same block is wrapped differently for German than for
        // Japanese — which is why this sits inside the per-language loop rather than above it.
        const { html, protectedHere, glossedHere } = protect(blocks[i], { terms: TERMS, glossary: GLOSSARY, lang: code })
        if (html.length > ELEMENT_CEILING) {
          throw new Error(
            `${unit.id} block ${i} is ${html.length} characters, over this engine's ${ELEMENT_CEILING} ceiling. ` +
              `Split the paragraph in the English source — it is also too long to hear in one breath.`
          )
        }
        jobs.push({ unit, i, source: blocks[i], html, protectedHere, glossedHere })
      }
    }

    const results = new Map()
    for (let at = 0; at < jobs.length; ) {
      const batch = []
      let chars = 0
      while (at < jobs.length && batch.length < MAX_ELEMENTS && chars + jobs[at].html.length <= MAX_CHARS) {
        chars += jobs[at].html.length
        batch.push(jobs[at])
        at++
      }
      if (!batch.length) batch.push(jobs[at++]) // one oversized block on its own
      process.stdout.write(`  ${code}  ${Math.min(at, jobs.length)}/${jobs.length} blocks\r`)
      const out = await callAzure(batch.map((j) => j.html), code)
      out.forEach((text, k) => results.set(batch[k], unprotect(text)))
      totalChars += chars
    }

    for (const unit of todo) {
      const parts = jobs.filter((j) => j.unit === unit).sort((a, b) => a.i - b.i)
      const text = parts.map((p) => results.get(p)).join('\n\n')
      assertStructure(unit.text, text, `${code} ${unit.id}`)
      assertNumerals(unit.text, text, `${code} ${unit.id}`)
      assertProtected([...new Set(parts.flatMap((p) => p.protectedHere))], text, `${code} ${unit.id}`)
      assertGlossed([...new Set(parts.flatMap((p) => p.glossedHere ?? []))], text, `${code} ${unit.id}`)
      setAt(files[unit.file], unit.path, text)
      touched.add(unit.file)
      entries[unit.id] = { hash: hashOf(unit.text), engine: ENGINE, translatedAt: today(), reviewStatus: 'unreviewed' }
      if (gaps.includes(unit)) totalFilled++
    }
    process.stdout.write(' '.repeat(40) + '\r')
  }

  // Units the English no longer has. Same sweep as scripts/audio.mjs, and for the same reason: a
  // ledger that remembers deleted content reports coverage nobody can read.
  const live = new Set(units.map((u) => u.id))
  let orphans = 0
  for (const id of Object.keys(entries)) if (!live.has(id)) (delete entries[id], orphans++)

  if (!DRY && (touched.size || seeded.length || orphans)) {
    for (const kind of touched) {
      const url = fileFor(kind, code)
      mkdirSync(new URL('.', url), { recursive: true })
      writeFileSync(url, JSON.stringify(files[kind], null, 2) + '\n')
    }
  }

  rows.push({ code, seeded: seeded.length, stale: stale.length, gaps: gaps.length, orphans })
  if (todo.length) touchedByLang[code] = todo.map((u) => u.id)
}

console.log(`  ${'lang'.padEnd(9)} ${'seeded'.padStart(7)} ${'changed'.padStart(8)} ${'gaps'.padStart(6)} ${'orphans'.padStart(8)}`)
for (const r of rows) {
  console.log(`  ${r.code.padEnd(9)} ${String(r.seeded).padStart(7)} ${String(r.stale).padStart(8)} ${String(r.gaps).padStart(6)} ${String(r.orphans).padStart(8)}`)
}

if (!DRY) {
  writeFileSync(LEDGER_URL, JSON.stringify(ledger, null, 2) + '\n')
}

// Always written when asked for, even when empty — a workflow needs to be able to tell "nothing
// changed" from "the step did not run", and an absent file cannot say which.
if (REPORT) {
  writeFileSync(
    REPORT,
    JSON.stringify({ engine: ENGINE, languages: touchedByLang, count: Object.values(touchedByLang).flat().length }, null, 2) + '\n'
  )
}

console.log('')
if (totalSeeded) console.log(`  ${totalSeeded} unit(s) seeded into the ledger without being retranslated`)
if (totalStale) console.log(`  ${totalStale} unit(s) had changed English${DRY ? ' and would be retranslated' : ' and were retranslated'}`)
if (totalFilled) console.log(`  ${totalFilled} gap(s) filled by --backfill`)
if (!BACKFILL && rows.some((r) => r.gaps)) {
  console.log(`  ${rows.reduce((t, r) => t + r.gaps, 0)} gap(s) left alone. Fill one language deliberately:`)
  console.log(`      node scripts/translate.mjs --lang <code> --backfill`)
}
// NMT bills per source character; generative AI bills per input and output token against Azure
// OpenAI pricing, which this has no way to know. Reporting dollars for the LLM path would be a
// figure invented to look precise.
if (!DRY && totalChars) {
  console.log(
    WANT_LLM
      ? `  ${totalChars.toLocaleString()} characters sent (billed per token by the model deployment, not per character)`
      : `  ${totalChars.toLocaleString()} characters billed (~$${((totalChars / 1e6) * 10).toFixed(2)} at $10/M)`
  )
}
if (DRY) console.log('  Nothing was sent and nothing was written.')
