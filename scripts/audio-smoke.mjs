// Does the audio guide actually play, highlight and skip? In a real browser, against real files.
//
//   node scripts/audio-smoke.mjs http://127.0.0.1:4181
//
// Everything here is checked from the outside, the way a visitor would see it. The player's audio
// element is created with `new Audio()` and never enters the DOM, so there is nothing to query and
// nothing to fake: the only evidence that sound is playing is the progress bar moving and a word
// lighting up. That is exactly the evidence worth testing.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4181'
const OBJECT = '/o/1884.137.33'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'blaschka-audio-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9338',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  // The click below is a real user gesture, but a headless profile has no media engagement history
  // and would still block the first play. This removes a false failure, not a real one.
  '--autoplay-policy=no-user-gesture-required',
])
process.on('exit', () => chrome.kill())

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      return (await (await fetch('http://127.0.0.1:9338/json/version')).json()).webSocketDebuggerUrl
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

const evaluate = async (expression, userGesture = false) => {
  const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture })
  return result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ------------------------------------------------------------------

await send('Page.navigate', { url: ORIGIN + OBJECT })
await wait(1800)

const before = await evaluate(`JSON.stringify({
  listen: !!document.querySelector('.listen'),
  label: (document.querySelector('.listen')||{}).textContent || '',
  bar: !!document.querySelector('.audio-bar'),
})`)
const b = JSON.parse(before)
check('listen control renders', b.listen, b.label.trim())
check('no transport bar before pressing play', !b.bar)

// A real gesture, so the browser applies its normal autoplay rules rather than a test-only path.
await evaluate(`document.querySelector('.listen').click(); true`, true)
await wait(2500)

const playing = await evaluate(`JSON.stringify({
  bar: !!document.querySelector('.audio-bar'),
  title: (document.querySelector('.audio-what strong')||{}).textContent || '',
  section: (document.querySelector('.audio-what span')||{}).textContent || '',
  width: (document.querySelector('.audio-progress span')||{style:{}}).style.width || '0%',
  marks: document.querySelectorAll('.spoken-word').length,
  marked: (document.querySelector('.spoken-word')||{}).textContent || '',
  time: (document.querySelector('.audio-time')||{}).textContent || '',
})`)
const p = JSON.parse(playing)
check('transport bar appears', p.bar)
check('names what is playing', p.title.includes('man o'), p.title)
check('names the current section', /1 of \d+/.test(p.section), p.section)
check('progress bar has advanced', parseFloat(p.width) > 0, p.width)
check('a word is highlighted', p.marks === 1, `${p.marks} marked: "${p.marked}"`)

// Let it run, then confirm the playhead is genuinely moving rather than stuck on the first cue.
const firstMark = p.marked
await wait(2500)
const later = await evaluate(`JSON.stringify({
  marked: (document.querySelector('.spoken-word')||{}).textContent || '',
  width: (document.querySelector('.audio-progress span')||{style:{}}).style.width || '0%',
})`)
const l = JSON.parse(later)
check('highlight follows the narration', l.marked !== firstMark, `"${firstMark}" → "${l.marked}"`)
check('progress keeps advancing', parseFloat(l.width) > parseFloat(p.width), `${p.width} → ${l.width}`)

// §13's skip. A section is a file, so this should land on section 2 exactly.
await evaluate(`[...document.querySelectorAll('.audio-controls button')].find(b=>b.getAttribute('aria-label')==='Next section').click(); true`, true)
await wait(2000)
const skipped = JSON.parse(
  await evaluate(`JSON.stringify({ section: (document.querySelector('.audio-what span')||{}).textContent || '' })`)
)
check('skip moves to the next section', /2 of \d+/.test(skipped.section), skipped.section)

// The narration must survive a route change - §13 says it plays across navigation.
await evaluate(`history.pushState({}, '', '/g/jellyfish'); dispatchEvent(new PopStateEvent('popstate')); true`)
await wait(1500)
const afterNav = JSON.parse(
  await evaluate(`JSON.stringify({
    bar: !!document.querySelector('.audio-bar'),
    section: (document.querySelector('.audio-what span')||{}).textContent || '',
  })`)
)
check('survives navigation', afterNav.bar, afterNav.section)

// Stop should leave no trace.
await evaluate(`[...document.querySelectorAll('.audio-controls button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Stop')).click(); true`, true)
await wait(600)
const stopped = await evaluate(`!document.querySelector('.audio-bar')`)
check('stop closes the player', stopped === true)

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks pass`)
chrome.kill()
process.exit(failed ? 1 : 0)
