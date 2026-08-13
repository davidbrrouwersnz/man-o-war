// Render every photograph in a group at real tile size, labelled, so a representative can be
// chosen by eye instead of by formula.
//
//   node scripts/contact-sheet.mjs <group-slug> <out.jpg>

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SLUG = process.argv[2]
const OUT = process.argv[3] ?? 'sheet.jpg'

const manifest = JSON.parse(readFileSync('src/data/manifest.json', 'utf8'))
const groups = JSON.parse(readFileSync('src/data/groups.json', 'utf8'))
const names = JSON.parse(readFileSync('src/data/names.json', 'utf8'))
const by = new Map(manifest.objects.map((o) => [o.accession, o]))
const group = groups.groups.find((g) => g.slug === SLUG)
if (!group) throw new Error(`no group ${SLUG}`)

const cards = group.accessions.map((a) => {
  const o = by.get(a)
  return {
    a,
    url: o.image.large.url,
    label: names.names[a]?.name ?? o.title,
    current: a === group.representative,
  }
})

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'blaschka-sheet-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9336', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars'])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      return (await (await fetch('http://127.0.0.1:9336/json/version')).json()).webSocketDebuggerUrl
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
await send('Page.enable')
await send('Runtime.enable')

const rows = Math.ceil(cards.length / 3)
await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 140 + rows * 250, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: 'about:blank' })
await new Promise((r) => setTimeout(r, 500))

// The tiles are 4:3, object-fit contain on black - exactly how the grid renders them.
const html = `
<style>
  body { margin:0; background:#000; color:#eee; font:13px/1.35 system-ui, sans-serif; padding:16px }
  h1 { font-size:15px; font-weight:600; margin:0 0 14px }
  .g { display:grid; grid-template-columns:repeat(3,1fr); gap:14px }
  .c .w { position:relative; aspect-ratio:4/3; background:#0c0c0d; border:1px solid #1c1c1e; overflow:hidden }
  .c img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain }
  .c p { margin:6px 0 0; font-size:11px; color:#aaa }
  .c b { color:#fff; font-weight:600 }
  .cur .w { outline:2px solid #e9b98a; outline-offset:1px }
  .cur p:after { content:' - CURRENT'; color:#e9b98a }
</style>
<h1>${group.title} - ${cards.length} objects, at tile size</h1>
<div class="g">
${cards.map((c) => `<div class="c ${c.current ? 'cur' : ''}"><div class="w"><img src="${c.url}"></div><p><b>${c.a.replace('1884.137.', '.')}</b> ${c.label}</p></div>`).join('')}
</div>`

await send('Runtime.evaluate', { expression: `document.write(${JSON.stringify(html)}); document.close();` })

await send('Runtime.evaluate', {
  expression: `(async()=>{
    for(let i=0;i<60;i++){
      const im=[...document.images];
      if(im.length && im.every(x=>x.complete && x.naturalWidth>0)) break;
      await new Promise(r=>setTimeout(r,500));
    }
    await new Promise(r=>setTimeout(r,600));
  })()`,
  awaitPromise: true,
})

const { result } = await send('Runtime.evaluate', {
  expression: `[...document.images].filter(x=>x.complete&&x.naturalWidth>0).length + ' of ' + document.images.length + ' loaded'`,
  returnByValue: true,
})
console.log(result.value)

const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, captureBeyondViewport: true })
writeFileSync(OUT, Buffer.from(data, 'base64'))
console.log('wrote ' + OUT)

chrome.kill()
process.exit(0)
