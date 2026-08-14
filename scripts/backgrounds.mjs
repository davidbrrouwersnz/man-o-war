// The colour of the ground each object was photographed against, sampled from the baked
// placeholder. Written to src/data/backgrounds.json and folded into the chunks by split.mjs.
//
//   node scripts/backgrounds.mjs          report only
//   node scripts/backgrounds.mjs --write  write src/data/backgrounds.json
//
// Why this exists: every media well is one width, and the photographs are not one shape. Whatever
// aspect the well takes, some photographs are letterboxed inside it. If the well is painted the
// same colour as the photograph's own ground, that letterboxing is invisible and every object is
// presented in the same frame instead of each in a box cut to its own negative.
//
// Samples the outer border rather than the whole frame: the subject is in the middle, the ground is
// at the edge. Median rather than mean, so a subject or a label touching one edge cannot drag it.
//
// Uses the placeholders, so it makes no network requests — same approach as
// scripts/representatives.mjs, which needs a canvas to decode jpegs and so boots headless Chrome.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WRITE = process.argv.includes('--write')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'src/data/manifest.json'), 'utf8'))
const records = manifest.objects ?? manifest.records ?? manifest

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('no Chrome found')

const PORT = 9361
const profile = mkdtempSync(join(tmpdir(), 'blaschka-bg-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl
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

const list = (Array.isArray(records) ? records : Object.values(records)).filter((r) => r?.placeholder)
console.log(`sampling ${list.length} placeholders\n`)

const out = {}
const rows = []
for (const rec of list) {
  const { result } = await send('Runtime.evaluate', {
    expression: `(async()=>{
      const img = new Image();
      img.src = ${JSON.stringify(rec.placeholder)};
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      const { data, width: W, height: H } = x.getImageData(0, 0, c.width, c.height);
      // A frame one-twelfth of the shorter side thick, never less than one pixel.
      const t = Math.max(1, Math.round(Math.min(W, H) / 12));
      const px = [];
      for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
          const edge = y < t || y >= H - t || xx < t || xx >= W - t;
          if (!edge) continue;
          const i = (y * W + xx) * 4;
          px.push([data[i], data[i+1], data[i+2]]);
        }
      }
      const med = (n) => { const v = px.map(p => p[n]).sort((a,b)=>a-b); return v[Math.floor(v.length/2)] };
      const rgb = [med(0), med(1), med(2)];
      // Spread across the border tells us whether the ground is actually uniform.
      const lum = px.map(p => 0.2126*p[0] + 0.7152*p[1] + 0.0722*p[2]).sort((a,b)=>a-b);
      return JSON.stringify({ rgb, p10: Math.round(lum[Math.floor(lum.length*0.1)]), p90: Math.round(lum[Math.floor(lum.length*0.9)]), n: px.length });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  const r = JSON.parse(result.value)
  const hex = '#' + r.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
  const lum = 0.2126 * r.rgb[0] + 0.7152 * r.rgb[1] + 0.0722 * r.rgb[2]
  out[rec.accession] = hex
  rows.push({ accession: rec.accession, hex, lum, spread: r.p90 - r.p10 })
}

rows.sort((a, b) => b.lum - a.lum)
console.log('brightest borders — these are the ones a black well does not match:')
for (const r of rows.slice(0, 10)) {
  console.log(`  ${r.accession.padEnd(14)} ${r.hex}  luminance ${r.lum.toFixed(0).padStart(3)}  border spread ${r.spread}`)
}
const bands = { 'near-black (<12)': 0, 'dark (12-40)': 0, 'mid (40-110)': 0, 'light (>110)': 0 }
for (const r of rows) {
  if (r.lum < 12) bands['near-black (<12)']++
  else if (r.lum < 40) bands['dark (12-40)']++
  else if (r.lum < 110) bands['mid (40-110)']++
  else bands['light (>110)']++
}
console.log('\ndistribution:', bands)
console.log('objects whose border is NOT near-black:', rows.filter((r) => r.lum >= 12).length, 'of', rows.length)

if (WRITE) {
  writeFileSync(join(root, 'src/data/backgrounds.json'), JSON.stringify({ backgrounds: out }, null, 2) + '\n')
  console.log('\nwrote src/data/backgrounds.json')
}

chrome.kill()
process.exit(0)
