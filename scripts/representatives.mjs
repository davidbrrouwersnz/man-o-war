// Rank every object in every group by how black its photograph is, and pick the blackest as the
// group's representative. Uses the baked placeholders, so it makes no network requests.
//
//   node scripts/representatives.mjs          report only
//   node scripts/representatives.mjs --write  rewrite representative/representativeRationale
//
// Needs a visible page to decode jpegs onto a canvas, so it boots headless Chrome over CDP.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WRITE = process.argv.includes('--write')

// 1884.137.92 is an unidentified fragment that reads as a rendering fault. It is also, inevitably,
// one of the blackest frames in the collection — so the rule has to exclude it explicitly.
const NEVER = new Set(['1884.137.92'])

// Blackest ground alone selects for the object filling least of the frame, which is the other way a
// tile fails to read. A photograph is only eligible if the lit subject fills at least this much.
const MIN_SUBJECT = 0.08

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('Chrome not found')

const profile = mkdtempSync(join(tmpdir(), 'blaschka-rep-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${profile}`, '--no-first-run'])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      return (await (await fetch('http://127.0.0.1:9334/json/version')).json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error('Chrome did not start')
}

const ws = new WebSocket(await endpoint())
const pending = new Map()
let id = 0
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(m.error.message)) : resolve(m.result)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const rpc = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify({ id: n, method, params, sessionId }))
  })

const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true })
const send = (m, p) => rpc(m, p, sessionId)
await send('Runtime.enable')

// ---------------------------------------------------------------- measure

const manifest = JSON.parse(readFileSync('src/data/manifest.json', 'utf8'))
const groups = JSON.parse(readFileSync('src/data/groups.json', 'utf8'))

const input = manifest.objects.map((o) => ({ a: o.accession, p: o.placeholder }))

const { result } = await send('Runtime.evaluate', {
  expression: `(async () => {
    const items = ${JSON.stringify(input)};
    const out = {};
    for (const it of items) {
      const img = new Image();
      img.src = it.p;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data;
      const lum = [];
      for (let i = 0; i < d.length; i += 4) lum.push(0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]);
      lum.sort((a,b) => a-b);
      out[it.a] = {
        // how much of the frame is near-black ground
        black: lum.filter(v => v < 32).length / lum.length,
        // how much of the frame the lit subject occupies - a frame that is 99% black is empty
        subject: lum.filter(v => v > 60).length / lum.length,
        median: Math.round(lum[lum.length >> 1]),
      };
    }
    return JSON.stringify(out);
  })()`,
  awaitPromise: true,
  returnByValue: true,
})

const stats = JSON.parse(result.value)

// ---------------------------------------------------------------- report

const pct = (n) => (n * 100).toFixed(0).padStart(3) + '%'
let changed = 0

for (const g of groups.groups) {
  const ranked = g.accessions
    .filter((a) => !NEVER.has(a))
    .map((a) => ({ a, ...stats[a] }))
    .sort((x, y) => y.black - x.black)

  const eligible = ranked.filter((r) => r.subject >= MIN_SUBJECT)
  if (!eligible.length) console.log(`   !! nothing in this group reaches ${pct(MIN_SUBJECT)} subject fill — falling back to blackest`)
  const pick = eligible[0] ?? ranked[0]
  const was = g.representative

  console.log(`\n${g.order}. ${g.title}`)
  console.log(`   ${'accession'.padEnd(14)} black  subject  median`)
  for (const r of ranked.slice(0, 4)) {
    const mark = r.a === pick.a ? '->' : '  '
    const old = r.a === was ? '  (was)' : ''
    console.log(`${mark} ${r.a.padEnd(14)} ${pct(r.black)}  ${pct(r.subject)}   ${String(r.median).padStart(3)}${old}`)
  }
  console.log(`   pick: ${pick.a}  black ${pct(pick.black)}  subject ${pct(pick.subject)}`)
  if (pick.a !== was) {
    console.log(`   changed: ${was} -> ${pick.a}`)
    changed++
  } else {
    console.log(`   unchanged`)
  }

  if (WRITE) {
    g.representative = pick.a
    g.representativeRationale = `blackest ground among photographs where the object fills at least ${pct(MIN_SUBJECT)} of the frame (black ${pct(pick.black)}, subject ${pct(pick.subject)}); chosen by scripts/representatives.mjs, not by eye`
  }
}

console.log(`\n${changed} of ${groups.groups.length} representatives change under the blackest-ground rule.`)

if (WRITE) {
  groups.note = groups.note.replace(
    /representative[^]*$/,
    `representative is chosen mechanically by scripts/representatives.mjs: the blackest photograph in the group among those where the lit object fills at least ${pct(MIN_SUBJECT).trim()} of the frame, so every tile is an object on black rather than a mount board and none of them reads as an empty frame. 1884.137.92 is excluded by rule. This is a photometric choice, not a curatorial one - it does not know which object matters most to a page.`
  )
  writeFileSync('src/data/groups.json', JSON.stringify(groups, null, 2) + '\n')
  console.log('Wrote src/data/groups.json')
}

chrome.kill()
process.exit(0)
