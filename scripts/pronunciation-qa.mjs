// Build a page that plays every uncertain pronunciation, so checking them is a ten-minute job
// rather than a hundred-minute one.
//
//   node scripts/pronunciation-qa.mjs      ->  public/pronunciation-qa.html
//
// Run it after the audio exists. It reads the word timings the pipeline already wrote and finds
// the exact second each flagged word is spoken, so a reviewer presses play on the word itself
// instead of hunting through a track for it.
//
// This exists because of a specific failure mode: 161 pronunciation entries is far too many to
// check by listening front to back, so nobody would, and the seventeen that are genuinely guesses
// would ship unchecked among the hundred-odd that are fine.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const pron = JSON.parse(readFileSync(join(root, 'src/data/pronunciation.json'), 'utf8'))
const audioDir = join(root, 'public/audio/en')

if (!existsSync(audioDir)) {
  console.error('No audio yet. Run npm run audio first.')
  process.exit(1)
}

// ---------------------------------------------------------------- index the timings

const vtts = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.vtt')) vtts.push(p)
  }
}
walk(audioDir)

const toSeconds = (t) => {
  const [h, m, s] = t.split(':')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

// word -> [{ src, at }]. One cue per word, which is what the pipeline writes, so a cue whose text
// equals the word IS an occurrence of it.
const occurrences = new Map()
for (const vtt of vtts) {
  const src = `/audio/en/${relative(audioDir, vtt).replace(/\\/g, '/').replace(/\.vtt$/, '.mp3')}`
  const lines = readFileSync(vtt, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d\d:\d\d:\d\d\.\d\d\d) --> /)
    if (!m) continue
    const word = (lines[i + 1] ?? '').trim().replace(/[.,;:!?'"()]/g, '').toLowerCase()
    if (!word) continue
    if (!occurrences.has(word)) occurrences.set(word, [])
    // Start a beat early so the word is not clipped by the seek.
    occurrences.get(word).push({ src, at: Math.max(0, toSeconds(m[1]) - 0.4) })
  }
}

// ---------------------------------------------------------------- collect what to check

const GROUPS = { genera: 'genus', epithets: 'species', terms: 'term', names: 'name' }
const entries = []
for (const [group, label] of Object.entries(GROUPS)) {
  for (const [word, e] of Object.entries(pron[group] ?? {})) {
    if (e.confidence === 'high') continue
    const found = occurrences.get(word.toLowerCase()) ?? []
    entries.push({ word, label, ...e, clips: found.slice(0, 3), total: found.length })
  }
}
const RANK = { low: 0, medium: 1 }
entries.sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || b.total - a.total || a.word.localeCompare(b.word))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const section = (conf, title, blurb) => {
  const rows = entries.filter((e) => e.confidence === conf)
  if (!rows.length) return ''
  return `
  <section>
    <h2>${esc(title)} <span class="count">${rows.length}</span></h2>
    <p class="blurb">${blurb}</p>
    ${rows
      .map(
        (e) => `
    <article class="entry${e.total ? '' : ' silent'}">
      <div class="word">
        <strong>${esc(e.word)}</strong>
        <span class="kind">${esc(e.label)}</span>
      </div>
      <div class="say">${esc(e.say)}</div>
      <div class="why">${esc(e.why ?? '')}</div>
      <div class="clips">
        ${
          e.total
            ? e.clips
                .map((c, i) => `<button data-src="${esc(c.src)}" data-at="${c.at.toFixed(2)}">▶ hear it${e.clips.length > 1 ? ` ${i + 1}` : ''}</button>`)
                .join('')
            : '<span class="none">never spoken on the site</span>'
        }
      </div>
    </article>`
      )
      .join('')}
  </section>`
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pronunciation check — Blaschka audio guide</title>
<style>
  :root { --ink:#14110f; --paper:#faf8f5; --line:#e0dad2; --quiet:#6b625a; --flag:#8a3324; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#f0ece7; --paper:#14110f; --line:#332e29; --quiet:#a49a90; --flag:#e0785f; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:2.5rem 1.25rem 6rem; background:var(--paper); color:var(--ink);
         font:16px/1.55 ui-serif, Georgia, serif; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.6rem; margin:0 0 .4rem; }
  .lede { color:var(--quiet); margin:0 0 2.5rem; }
  h2 { font-size:1.05rem; margin:2.5rem 0 .25rem; text-transform:uppercase;
       letter-spacing:.06em; font-family:ui-sans-serif,system-ui,sans-serif; }
  .count { color:var(--quiet); font-weight:400; }
  .blurb { color:var(--quiet); margin:0 0 1.25rem; font-size:.92rem; }
  .entry { display:grid; grid-template-columns: 12rem 1fr; gap:.2rem 1.25rem;
           padding:.9rem 0; border-top:1px solid var(--line); align-items:baseline; }
  .entry.silent { opacity:.5; }
  .word { font-size:1.05rem; }
  .kind { display:block; font-size:.75rem; color:var(--quiet); font-family:ui-sans-serif,system-ui,sans-serif; }
  .say { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.95rem; }
  .why { grid-column:2; color:var(--quiet); font-size:.88rem; }
  .clips { grid-column:2; margin-top:.45rem; display:flex; gap:.5rem; flex-wrap:wrap; }
  button { font:inherit; font-size:.85rem; font-family:ui-sans-serif,system-ui,sans-serif;
           padding:.3rem .7rem; border:1px solid var(--line); border-radius:2rem;
           background:transparent; color:var(--ink); cursor:pointer; }
  button:hover { border-color:var(--ink); }
  button[aria-pressed="true"] { background:var(--ink); color:var(--paper); }
  .none { font-size:.85rem; color:var(--quiet); }
  @media (max-width: 34rem) { .entry { grid-template-columns:1fr; } .why,.clips { grid-column:1; } }
</style>
</head>
<body>
<main>
  <h1>Pronunciation check</h1>
  <p class="lede">
    ${
      pron.reviewed
        ? `Approved by ${esc(pron.reviewedBy ?? 'a reviewer')} on ${esc(pron.reviewedOn ?? '')}. Kept as the record of which readings were a judgement call rather than a rule, and so anyone can hear them. Press <strong>hear it</strong> to jump straight to the word in the real audio.`
        : `Every word below is one the narration says aloud and I was not certain about. Press <strong>hear it</strong> to jump straight to the word in the real audio. You do not need to write phonetics — just say whether it is right.`
    }
  </p>
  ${section(
    'low',
    pron.reviewed ? 'Judgement, not rule' : 'Needs an answer',
    'Nearly all are named after people, and a person’s name does not follow Latin rules — no amount of rule-following gets you there.'
  )}
  ${section('medium', pron.reviewed ? 'Defensible either way' : 'Worth a look', 'A specialist may prefer the other variant.')}
</main>
<script>
  // One audio element, reused. Playing a second clip stops the first, which is what you want when
  // comparing two readings of the same word.
  const audio = new Audio();
  let active = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-src]');
    if (!b) return;
    if (active === b && !audio.paused) { audio.pause(); b.setAttribute('aria-pressed','false'); active = null; return; }
    if (active) active.setAttribute('aria-pressed','false');
    active = b;
    b.setAttribute('aria-pressed','true');
    if (audio.src !== location.origin + b.dataset.src) audio.src = b.dataset.src;
    const go = () => { audio.currentTime = Number(b.dataset.at); audio.play(); };
    if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once:true });
  });
  audio.addEventListener('ended', () => { if (active) active.setAttribute('aria-pressed','false'); active = null; });
</script>
</body>
</html>
`

writeFileSync(join(root, 'public/pronunciation-qa.html'), html)

const low = entries.filter((e) => e.confidence === 'low').length
const withClip = entries.filter((e) => e.total > 0).length
console.log(
  pron.reviewed
    ? `public/pronunciation-qa.html — ${entries.length} entries, approved ${pron.reviewedOn} (${low} were judgement calls)`
    : `public/pronunciation-qa.html — ${entries.length} entries to check (${low} need an answer)`
)
console.log(`  ${withClip} have audio to play; ${entries.length - withClip} are never spoken on the site`)
console.log(`  indexed ${vtts.length} timing files`)
console.log(`  open http://localhost:5173/pronunciation-qa.html after npm run dev`)
