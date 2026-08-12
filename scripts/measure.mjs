// Measurement harness for the four questions. Drives a headless Chrome over CDP so the page is
// actually visible (rAF runs, so IntersectionObserver fires) and the connection is really throttled.
//
//   node scripts/measure.mjs http://127.0.0.1:4174

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4174'
const THROUGHPUT = 130 * 1024 // bytes/sec
const LATENCY = 150 // ms RTT — gallery wifi / 4G assumption, stated not measured
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('Chrome not found')

const profile = mkdtempSync(join(tmpdir(), 'blaschka-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9333',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-extensions',
  '--hide-scrollbars',
])
process.on('exit', () => chrome.kill())

// ---------------------------------------------------------------- CDP

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9333/json/version')
      return (await r.json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error('Chrome did not start')
}

function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  const listeners = []
  let id = 0
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg))
    }
  })
  const ready = new Promise((res) => ws.addEventListener('open', res))
  return {
    ready,
    on: (fn) => listeners.push(fn),
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const n = ++id
        pending.set(n, { resolve, reject })
        ws.send(JSON.stringify({ id: n, method, params, sessionId }))
      }),
  }
}

const cdp = connect(await endpoint())
await cdp.ready

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
const send = (m, p) => cdp.send(m, p, sessionId)

// ---------------------------------------------------------------- run one page

async function measure(path, { settle = 6000, scroll = false, shot = null, jump = null } = {}) {
  await send('Network.enable')
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.clearBrowserCache')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, screenWidth: 390, screenHeight: 844 })
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: LATENCY,
    downloadThroughput: THROUGHPUT,
    uploadThroughput: THROUGHPUT / 4,
  })

  const requests = new Map()
  let bytes = 0
  const marks = {}
  const t0 = Date.now()

  const off = (msg) => {
    if (msg.sessionId !== sessionId) return
    const p = msg.params
    if (msg.method === 'Network.responseReceived') {
      requests.set(p.requestId, { url: p.response.url, type: p.type, status: p.response.status })
    }
    if (msg.method === 'Network.loadingFinished') {
      const r = requests.get(p.requestId)
      if (r) {
        r.bytes = p.encodedDataLength
        r.at = Date.now() - t0
        bytes += p.encodedDataLength
      }
    }
    if (msg.method === 'Page.lifecycleEvent') {
      if (!marks[p.name]) marks[p.name] = Date.now() - t0
    }
  }
  cdp.on(off)
  await send('Page.setLifecycleEventsEnabled', { enabled: true })

  await send('Page.navigate', { url: ORIGIN + path })
  await new Promise((r) => setTimeout(r, settle))

  if (scroll) {
    await send('Runtime.evaluate', {
      expression: `(async()=>{const step=innerHeight*0.9;for(let y=0;y<document.body.scrollHeight;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,700));}})()`,
      awaitPromise: true,
    })
    await new Promise((r) => setTimeout(r, 3000))
  }

  const { result } = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      vw: innerWidth, vh: innerHeight,
      docHeight: document.documentElement.scrollHeight,
      screenHeights: +(document.documentElement.scrollHeight/innerHeight).toFixed(1),
      objects: document.querySelectorAll('.object').length,
      wells: document.querySelectorAll('.well').length,
      mounted: document.querySelectorAll('.well-img').length,
      loaded: [...document.querySelectorAll('.well-img')].filter(i=>i.complete&&i.naturalWidth>0).length,
      url: location.pathname,
      fcp: (performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime,
      lcp: window.__lcp,
      arrivedFlag: !!document.querySelector('.arrived-flag'),
      arrivedTop: (document.querySelector('.arrived-flag')||{getBoundingClientRect:()=>({top:null})}).getBoundingClientRect().top,
      sections: [...document.querySelectorAll('.object')].map(s=>({
        h: Math.round(s.getBoundingClientRect().height),
        stub: !!s.querySelector('.is-placeholder')
      }))
    })`,
    returnByValue: true,
  })

  if (jump != null) {
    await send('Runtime.evaluate', {
      expression: `(async()=>{const o=document.querySelectorAll('.object')[${jump}];scrollTo(0,o.offsetTop-8);await new Promise(r=>setTimeout(r,5000));})()`,
      awaitPromise: true,
    })
  }

  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(shot, Buffer.from(data, 'base64'))
    console.log(`  screenshot -> ${shot}`)
  }

  const dom = JSON.parse(result.value)
  const list = [...requests.values()].filter((r) => r.bytes != null)
  return { path, bytes, dom, marks, list }
}

// LCP has to be observed before navigation completes, so inject via a new-document script.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `new PerformanceObserver(l=>{const e=l.getEntries();window.__lcp=Math.round(e[e.length-1].startTime)}).observe({type:'largest-contentful-paint',buffered:true});
           addEventListener('load',()=>{const a=document.querySelector('.arrived-flag');window.__arrivedTop=a?Math.round(a.getBoundingClientRect().top):null});`,
})

const report = (r, note) => {
  const kb = (n) => (n / 1024).toFixed(0) + 'KB'
  console.log(`\n=== ${r.path}${note ? '  ' + note : ''}`)
  console.log(`  viewport ${r.dom.vw}x${r.dom.vh}   final URL ${r.dom.url}`)
  console.log(`  page height   ${r.dom.docHeight}px = ${r.dom.screenHeights} screen-heights (${r.dom.objects} objects)`)
  console.log(`  first contentful paint   ${Math.round(r.dom.fcp)}ms`)
  console.log(`  largest contentful paint ${r.dom.lcp}ms`)
  console.log(`  total transferred        ${kb(r.bytes)} in ${r.list.length} requests`)
  const byType = {}
  for (const x of r.list) byType[x.type] = (byType[x.type] ?? 0) + x.bytes
  console.log(`  by type: ${Object.entries(byType).map(([k, v]) => `${k} ${kb(v)}`).join(', ')}`)
  console.log(`  media wells ${r.dom.wells}, image elements mounted ${r.dom.mounted}, loaded ${r.dom.loaded}`)
  if (r.dom.arrivedFlag) console.log(`  arrival marker present, at y=${Math.round(r.dom.arrivedTop)}px`)
  if (r.dom.sections?.length) {
    const stub = r.dom.sections.filter((s) => s.stub).map((s) => s.h)
    const written = r.dom.sections.filter((s) => !s.stub).map((s) => s.h)
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0)
    console.log(`  section height: written ${written.join('/')}px  stubs avg ${avg(stub)}px (${stub.length} of ${r.dom.sections.length})`)
    if (written.length) {
      const all = written[0] * r.dom.sections.length + (r.dom.docHeight - r.dom.sections.reduce((a, s) => a + s.h, 0))
      console.log(`  if every object were written: ~${Math.round(all)}px = ${(all / r.dom.vh).toFixed(1)} screen-heights`)
      console.log(`  a 19-object page, all written: ~${((written[0] * 19 + 900) / r.dom.vh).toFixed(1)} screen-heights`)
    }
  }
  const slowest = r.list.sort((a, b) => b.bytes - a.bytes).slice(0, 4)
  console.log(`  heaviest: ${slowest.map((x) => `${x.url.split('/').pop().slice(0, 22)} ${kb(x.bytes)}@${x.at}ms`).join('  ')}`)
}

console.log(`Throttled to ${THROUGHPUT / 1024}KB/s, ${LATENCY}ms latency, viewport ${VIEWPORT.width}x${VIEWPORT.height}`)

report(await measure('/'), '(the eleven tiles)')
report(await measure('/g/floating-colonies', { shot: 'C:/Users/david/.claude/jobs/8bf8c2e5/tmp/group-top.jpg' }), '(group page, no scroll — what loads up front)')
report(await measure('/o/1884.137.33', { shot: 'C:/Users/david/.claude/jobs/8bf8c2e5/tmp/qr-arrival.jpg' }), '(QR arrival)')
report(await measure('/g/floating-colonies', { scroll: true, settle: 4000 }), '(group page, scrolled to the bottom)')
report(await measure('/g/floating-colonies', { jump: 1, shot: 'C:/Users/david/.claude/jobs/8bf8c2e5/tmp/stub.jpg' }), '(second object — a placeholder entry)')

await send('Page.close').catch(() => {})
chrome.kill()
process.exit(0)
