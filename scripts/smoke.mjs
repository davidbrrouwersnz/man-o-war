// Load every route in a real browser and report what actually rendered. Catches the failure a
// status code cannot: an SPA returns 200 for everything, including a route that throws.
//
//   node scripts/smoke.mjs http://127.0.0.1:4181

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4181'

const ROUTES = [
  ['/', 'h1', 'The Blaschka collection'],
  ['/all', '.grid-dense li', null],
  ['/search', '.search-input', null],
  ['/how-it-was-made', '.layer-section', null],
  ['/how-it-got-here', '.layer-section', null],
  ['/how-we-know', '.layer-section', null],
  ['/g/jellyfish', '.object', null],
  ['/g/sea-anemones', '.object', null],
  ['/o/1884.137.33', '.arrived-flag', null],
  ['/o/1884.137.128', '.arrived-flag', null],
  ['/g/does-not-exist', '.stub-note', null],
  ['/o/9999.999.9', '.stub-note', null],
]

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'blaschka-smoke-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${profile}`, '--no-first-run'])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      return (await (await fetch('http://127.0.0.1:9337/json/version')).json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error('Chrome did not start')
}

const ws = new WebSocket(await endpoint())
const pending = new Map()
const errors = []
let id = 0
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(m.error.message)) : resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description ?? ''))
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
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

let failed = 0
for (const [path, selector, expectText] of ROUTES) {
  errors.length = 0
  await send('Page.navigate', { url: ORIGIN + path })
  await new Promise((r) => setTimeout(r, 1400))
  const { result } = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      count: document.querySelectorAll(${JSON.stringify(selector)}).length,
      text: (document.querySelector('h1')||{}).textContent || '',
      title: document.title,
      url: location.pathname
    })`,
    returnByValue: true,
  })
  const r = JSON.parse(result.value)
  const ok = r.count > 0 && (!expectText || r.text.includes(expectText)) && errors.length === 0
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${path.padEnd(22)} ${String(r.count).padStart(3)}× ${selector.padEnd(16)} "${r.title.slice(0, 44)}"`)
  if (errors.length) console.log(`        console: ${errors.slice(0, 2).join(' | ')}`)
}

console.log(failed ? `\n${failed} route(s) failed` : `\nall ${ROUTES.length} routes render`)
chrome.kill()
process.exit(failed ? 1 : 0)
