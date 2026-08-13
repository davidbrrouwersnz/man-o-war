// Screenshot the eleven tiles, all at once, at real tile size. Throwaway visual check.
//   node scripts/grid-shot.mjs http://127.0.0.1:4175 out.jpg

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4175'
const OUT = process.argv[3] ?? 'grid.jpg'
const PATH = process.argv[4] ?? '/'
const PNG = OUT.endsWith('.png')
const TALL = PATH === '/'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'blaschka-grid-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars'])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      return (await (await fetch('http://127.0.0.1:9335/json/version')).json()).webSocketDebuggerUrl
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
// Tall viewport at phone width so all eleven tiles fit one frame at their real rendered size.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: TALL ? 3000 : 844, deviceScaleFactor: 2, mobile: true })
if (process.env.LOCALE) {
  await send('Network.enable')
  await send('Network.setUserAgentOverride', { userAgent: '', acceptLanguage: process.env.LOCALE })
  await send('Emulation.setLocaleOverride', { locale: process.env.LOCALE })
}
await send('Page.navigate', { url: ORIGIN + PATH })
await new Promise((r) => setTimeout(r, 4000))

await send('Runtime.evaluate', {
  expression: `(async()=>{
    const grid = document.querySelector('.grid');
    if (!grid) { await new Promise(r=>setTimeout(r,3000)); return }
    document.querySelectorAll('.tile-img').forEach(i=>i.loading='eager');
    grid.style.gridTemplateColumns='repeat(2,1fr)';
    for(let i=0;i<40;i++){
      const n=[...document.querySelectorAll('.tile-img')].filter(i=>i.complete&&i.naturalWidth>0).length;
      if(n===11) break;
      await new Promise(r=>setTimeout(r,500));
    }
    await new Promise(r=>setTimeout(r,800));
  })()`,
  awaitPromise: true,
})

const { result } = await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.tile-img')].filter(i=>i.complete&&i.naturalWidth>0).length + ' of 11 loaded'`,
  returnByValue: true,
})
console.log(result.value)

const { data } = await send('Page.captureScreenshot', PNG ? { format: 'png', captureBeyondViewport: TALL } : { format: 'jpeg', quality: 88, captureBeyondViewport: TALL })
writeFileSync(OUT, Buffer.from(data, 'base64'))
console.log('wrote ' + OUT)

chrome.kill()
process.exit(0)
