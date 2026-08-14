// Page height for every group page, in screen-heights, at a given viewport.
//   node scripts/heights.mjs http://127.0.0.1:4174 390x844
//   node scripts/heights.mjs http://127.0.0.1:4174 1440x900
//
// "Is a group page finishable?" is question 2 of the prototype findings, and the answer is a
// number that changes every time the layout does. One Chrome, eleven navigations.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4174'
const [W, H] = (process.argv[3] ?? '390x844').split('x').map(Number)
const SCHEME = process.argv[4] ?? 'light'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const index = JSON.parse(readFileSync(join(root, 'src/data/chunks/index.json'), 'utf8'))

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('no Chrome found')

const PORT = 9337
const profile = mkdtempSync(join(tmpdir(), 'blaschka-heights-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--hide-scrollbars',
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

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCHEME }] })

console.log(`${W}x${H}  ${SCHEME}\n`)
console.log('group'.padEnd(26) + 'objects'.padStart(8) + 'px'.padStart(9) + 'screens'.padStart(9))

let total = 0
for (const g of index.groups) {
  await send('Page.navigate', { url: `${ORIGIN}/g/${g.slug}` })
  // The chunk is fetched after mount, so height is meaningless until the objects render.
  const { result } = await send('Runtime.evaluate', {
    expression: `(async()=>{
      for (let i=0;i<60;i++){
        if (document.querySelectorAll('.object').length === ${g.size}) break;
        await new Promise(r=>setTimeout(r,200));
      }
      await new Promise(r=>setTimeout(r,600));
      return JSON.stringify({
        h: document.documentElement.scrollHeight,
        n: document.querySelectorAll('.object').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  const r = JSON.parse(result.value)
  const screens = r.h / H
  total += screens
  const warn = r.n !== g.size ? `  !! rendered ${r.n} of ${g.size}` : r.overflow ? '  !! h-overflow' : ''
  console.log(
    g.slug.padEnd(26) + String(g.size).padStart(8) + String(r.h).padStart(9) + screens.toFixed(1).padStart(9) + warn
  )
}
console.log('\n' + 'total'.padEnd(26) + ''.padStart(8) + ''.padStart(9) + total.toFixed(1).padStart(9))

chrome.kill()
process.exit(0)
