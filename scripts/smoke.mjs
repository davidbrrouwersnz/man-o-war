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
  // Every object is a tab on the collection page now. The old path still resolves, opening that
  // tab rather than a page of its own.
  ['/all', '.grid-dense li', null],
  // The two essays moved onto the collection page; the old paths still resolve there, scrolled
  // to the section, so a printed link never dead-ends.
  ['/how-it-was-made', '.essay', null],
  ['/how-it-got-here', '.essay', null],
  ['/how-we-know', '.stub-note', null],
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

// ------------------------------------------------------------------ the collection page grids
//
// A route test only proves the markup arrived. These drive the page.
//
// The two grids were tabs over one slot and are now sections one after the other. What still
// matters is what mattered then: both are reachable, the 128-tile chunk is not paid for by someone
// who never scrolls to it, and the /all path that predates all of this still lands somewhere real.

const evaluate = async (expression, userGesture = false) => {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, userGesture })
  return result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let tabChecks = 0
const tab = (name, ok, detail = '') => {
  tabChecks++
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('')
await send('Page.navigate', { url: `${ORIGIN}/` })
await wait(1800)

const start = JSON.parse(
  await evaluate(`JSON.stringify({
    headings: [...document.querySelectorAll('.browse-title')].map((h) => h.textContent.trim()),
    tiles: document.querySelectorAll('.grid:not(.grid-dense) .tile').length,
    dense: document.querySelectorAll('.grid-dense .tile').length,
    anchor: !!document.getElementById('all-objects'),
    tabs: document.querySelectorAll('[role=tab]').length,
    scroll: Math.round(scrollY),
  })`)
)
tab('both grids are on the one page', start.headings.length === 2, start.headings.join(' / '))
tab('named Categories and All objects', start.headings[0] === 'Categories' && start.headings[1] === 'All objects')
tab('no tabs left', start.tabs === 0, `${start.tabs} found`)
tab('shows the eleven category tiles', start.tiles === 11, `${start.tiles} tiles`)
tab('the all-objects section is addressable', start.anchor)
tab('has not paid for the 128-object grid at the top of the page', start.dense === 0, `${start.dense} tiles`)

// Scrolling to it is what fetches it — the same treatment the object photographs get.
await evaluate(`document.getElementById('all-objects').scrollIntoView(); true`, true)
await wait(2500)
const scrolled = JSON.parse(
  await evaluate(`JSON.stringify({
    dense: document.querySelectorAll('.grid-dense .tile').length,
    tiles: document.querySelectorAll('.grid:not(.grid-dense) .tile').length,
  })`)
)
tab('scrolling to it loads all 128 objects', scrolled.dense === 128, `${scrolled.dense} tiles`)
tab('and the category grid is still there', scrolled.tiles === 11, `${scrolled.tiles} tiles`)

// The language select shows a globe instead of the word "Language". The word has to survive in the
// accessibility tree — an unnamed select is announced as "combo box", and this is the one control a
// visitor reaches for precisely when they cannot read the page.
await send('Accessibility.enable')
const ax = await rpc('Accessibility.getFullAXTree', {}, sessionId)
const combo = ax.nodes.find((n) => n.role?.value === 'combobox')
tab('language select keeps its accessible name', combo?.name?.value === 'Language', JSON.stringify(combo?.name?.value))

const globe = JSON.parse(
  await evaluate(`JSON.stringify({
    svg: !!document.querySelector('.lang-globe'),
    hidden: !!document.querySelector('.lang-picker .visually-hidden'),
    decorative: (document.querySelector('.lang-globe')||{}).getAttribute?.('aria-hidden') === 'true',
  })`)
)
tab('globe icon is present', globe.svg)
tab('globe is decorative, the word is hidden text', globe.decorative && globe.hidden)

// An old link to /all must land on the collection page, at that section.
await send('Page.navigate', { url: `${ORIGIN}/all` })
await wait(2500)
const deep = JSON.parse(
  await evaluate(`JSON.stringify({
    dense: document.querySelectorAll('.grid-dense .tile').length,
    h1: (document.querySelector('h1')||{}).textContent || '',
    heading: document.getElementById('all-objects-title')?.textContent.trim() || '',
    scrolledTo: Math.round(scrollY) > 200,
  })`)
)
tab('/all still lands on the collection page', deep.h1.includes('Blaschka'), deep.h1)
tab('...at the all-objects section', deep.scrolledTo && deep.heading === 'All objects', `scrollY moved: ${deep.scrolledTo}`)
tab('...with all 128 loaded without waiting to be scrolled', deep.dense === 128, `${deep.dense} tiles`)

console.log(
  failed ? `\n${failed} check(s) failed` : `\nall ${ROUTES.length} routes render, all ${tabChecks} tab checks pass`
)
chrome.kill()
process.exit(failed ? 1 : 0)
