// A faithful screenshot. No DOM mutation, no forced layout — what the page actually does.
//
//   node scripts/shot.mjs <origin> <out.jpg> [path] [WxH] [light|dark] [full|fold]
//   node scripts/shot.mjs http://127.0.0.1:4174 out.jpg /o/1884.137.33 390x844 light fold
//   node scripts/shot.mjs http://127.0.0.1:4174 wide.jpg /g/sea-anemones 1440x900 light fold
//
// scripts/grid-shot.mjs is a contact sheet and deliberately overrides the grid to two columns so
// eleven tiles fit one frame. That makes it useless for judging layout, which is what this is for.
//
// It also reports the page height in screen-heights, which is the number §10 and the prototype
// findings actually argue about.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4174'
const OUT = process.argv[3] ?? 'shot.jpg'
const PATH = process.argv[4] ?? '/'
const [W, H] = (process.argv[5] ?? '390x844').split('x').map(Number)
const SCHEME = process.argv[6] ?? 'light'
const FULL = (process.argv[7] ?? 'fold') === 'full'
// Optional 8th argument: scroll this many px before capturing. Needed to see anything sticky,
// which by definition looks identical to static until the page moves.
const SCROLL = Number(process.argv[8] ?? 0)
const PNG = OUT.endsWith('.png')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('no Chrome found')

const PORT = 9336
const profile = mkdtempSync(join(tmpdir(), 'blaschka-shot-'))
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
await send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 2,
  mobile: W < 700,
})
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: SCHEME }],
})
if (process.env.LOCALE) {
  await send('Network.enable')
  await send('Network.setUserAgentOverride', { userAgent: '', acceptLanguage: process.env.LOCALE })
  await send('Emulation.setLocaleOverride', { locale: process.env.LOCALE })
}

// SEED writes localStorage before the app boots, so a persisted preference (a11yPrefs, lang) is
// already in place on first paint rather than applied a frame later.
//   SEED='{"a11yPrefs":{"textScale":2,"highContrast":true}}' node scripts/shot.mjs …
if (process.env.SEED) {
  const entries = Object.entries(JSON.parse(process.env.SEED))
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: entries.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join(''),
  })
}

await send('Page.navigate', { url: ORIGIN + PATH })
await new Promise((r) => setTimeout(r, 3500))

// CLICK opens whatever the screenshot is meant to show — a dialog is invisible until something
// presses the button.
//   CLICK='.tool-button' node scripts/shot.mjs …
if (process.env.CLICK) {
  const { result: clicked } = await send('Runtime.evaluate', {
    expression: `(async()=>{
      const el = document.querySelector(${JSON.stringify(process.env.CLICK)});
      if (!el) return 'no match';
      el.click();
      await new Promise(r=>setTimeout(r,1400));
      return 'clicked';
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  console.log(`click ${process.env.CLICK}: ${clicked.value}`)
}

// Only when capturing the whole page: mount every lazy image first, or the tail of a long group
// page screenshots as a column of empty wells.
if (FULL) {
  await send('Runtime.evaluate', {
    expression: `(async()=>{
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
        scrollTo(0, y); await new Promise(r=>setTimeout(r,180));
      }
      scrollTo(0,0);
      await new Promise(r=>setTimeout(r,1200));
    })()`,
    awaitPromise: true,
  })
}

if (SCROLL) {
  await send('Runtime.evaluate', {
    expression: `(async()=>{ scrollTo(0, ${SCROLL}); await new Promise(r=>setTimeout(r,900)) })()`,
    awaitPromise: true,
  })
}

const { result } = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    h: document.documentElement.scrollHeight,
    vw: innerWidth,
    stuck: (() => {
      const f = [...document.querySelectorAll('.object-media')]
        .map(el => ({ top: Math.round(el.getBoundingClientRect().top),
                      pos: getComputedStyle(el).position }))
        .filter(x => x.top > -400 && x.top < innerHeight);
      return f.length ? f.map(x => x.pos + '@' + x.top).join(' ') : 'none in view';
    })(),
    screens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1),
    cols: (() => { const g = document.querySelector('.grid');
      return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null })(),
    // Compared against the DEVICE width, not innerWidth. On a mobile viewport an overflowing
    // element widens the layout viewport itself, so innerWidth grows to match and
    // scrollWidth > innerWidth stays false while the page is visibly too wide.
    overflow: innerWidth > ${W}
      ? 'layout viewport widened to ' + innerWidth + ' on a ${W}px device'
      : document.documentElement.scrollWidth > innerWidth
        ? document.documentElement.scrollWidth + ' > ' + innerWidth : 'none',
    widest: (() => {
      if (innerWidth <= ${W} && document.documentElement.scrollWidth <= innerWidth) return null;
      let worst = null;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > ${W} + 1 && (!worst || r.right > worst.right)) {
          worst = { right: Math.round(r.right), w: Math.round(r.width),
                    sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                      ? '.' + el.className.trim().split(/\\s+/).join('.') : '') };
        }
      }
      return worst;
    })(),
  })`,
  returnByValue: true,
})
const info = JSON.parse(result.value)
console.log(
  `${PATH}  ${info.vw}px  ${info.h}px tall = ${info.screens} screens` +
    (info.cols ? `  grid: ${info.cols} col` : '') +
    `  h-overflow: ${info.overflow}` +
    (info.widest ? `\n  widest offender: ${info.widest.sel} (${info.widest.w}px wide, right edge ${info.widest.right})` : '') +
    (SCROLL ? `\n  scrolled ${SCROLL}px — media wells in view: ${info.stuck}` : '')
)

const { data } = await send(
  'Page.captureScreenshot',
  PNG ? { format: 'png', captureBeyondViewport: FULL } : { format: 'jpeg', quality: 86, captureBeyondViewport: FULL }
)
writeFileSync(OUT, Buffer.from(data, 'base64'))
console.log('wrote ' + OUT)

chrome.kill()
process.exit(0)
