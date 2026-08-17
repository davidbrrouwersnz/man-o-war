// Prove §7's language rules actually hold in a browser, rather than asserting them in a document.
//
// Needs the built site being served, in another terminal:
//
//   npm run build && npm run preview -- --port 4182
//   npm run i18n:check
//
// A real headless Chrome rather than the editor's preview pane, which is a permanently hidden tab:
// rAF is throttled there and media never advances, so anything measured in it is measuring the
// throttle. Here the page is visible and the checks are about what a visitor would actually get.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// localhost, not 127.0.0.1: vite preview binds "localhost", which on this Node resolves to the
// IPv6 loopback [::1] only. Chrome connects to whichever family answers; a hardcoded 127.0.0.1
// finds nothing listening and every check then runs against Chrome's connection-error page —
// which is lang="en", has no app markup, and throws on localStorage (opaque origin), so the
// failures look like broken locale emulation rather than what they are. Hence the preflight below.
const ORIGIN = process.argv[2] ?? 'http://localhost:4182'

// Fail here, in one line, rather than sixty lines later with every check measuring an error page.
try {
  await fetch(ORIGIN + '/', { signal: AbortSignal.timeout(3000) })
} catch {
  console.error(`nothing serving at ${ORIGIN} — run: npm run build && npm run preview -- --port 4182`)
  process.exit(1)
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p))

const profile = mkdtempSync(join(tmpdir(), 'blaschka-i18n-'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9338', `--user-data-dir=${profile}`, '--no-first-run'])
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

// Poll instead of a fixed sleep: re-evaluate until the predicate accepts the value or the deadline
// passes, and return the last value either way, so a check that then fails reports what the page
// actually held rather than crashing on what it hoped for. Chunks load on demand and CI machines
// are slow on bad days; a fixed number is wrong in one direction or the other on both counts.
// The __stale guard closes a race: Page.navigate resolves before the new document exists, and the
// OLD page may already satisfy the predicate (it has a .lang-trigger too). nav() brands the old
// document; the brand does not survive the navigation, so a branded read returns null and polls on.
async function settle(expression, ready, ms = 8000) {
  const deadline = Date.now() + ms
  for (;;) {
    const { result } = await send('Runtime.evaluate', { expression: `window.__stale ? null : (${expression})`, returnByValue: true })
    if (ready(result.value) || Date.now() > deadline) return result.value
    await new Promise((r) => setTimeout(r, 150))
  }
}

const nav = async (url) => {
  await send('Runtime.evaluate', { expression: `window.__stale = true` })
  await send('Page.navigate', { url })
}

let failed = 0
const check = (ok, label, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}

// §7: match on language, not on string. zh-Hant-TW must find Traditional Chinese; en-NZ must find
// English. An exact comparison fails for most real devices.
for (const [tag, expect] of [
  ['zh-Hant-TW', 'zh-Hant'],
  ['en-NZ', 'en'],
  ['ar-EG', 'ar'],
  ['de-CH', 'de'],
  ['pt-BR', 'en'], // no Portuguese pack: falls through rather than guessing
]) {
  await send('Network.enable')
  await send('Network.setUserAgentOverride', { userAgent: '', acceptLanguage: tag })
  await send('Emulation.setLocaleOverride', { locale: tag })
  await send('Runtime.evaluate', { expression: `try{localStorage.removeItem('lang')}catch{}` })
  await nav(ORIGIN + '/')
  // The static shell is already lang="en" before React mounts, so only read the attribute once the
  // app has rendered something into #root — otherwise the en cases pass vacuously.
  const lang = await settle(
    `document.getElementById('root')?.childElementCount ? document.documentElement.lang : null`,
    (v) => v === expect,
  )
  check(lang === expect, `BCP 47 lookup: ${tag} → ${lang}`, `expected ${expect}`)
}

// §7: dir follows the rendered language, and the media is not mirrored.
await send('Network.setUserAgentOverride', { userAgent: '', acceptLanguage: 'ar-EG,ar' })
await send('Emulation.setLocaleOverride', { locale: 'ar-EG' })
await nav(ORIGIN + '/g/jellyfish')
// The group page lives in an on-demand chunk. Wait for its markup rather than sleeping a number,
// and return nothing until both queried elements exist — getComputedStyle on a missing .well is a
// crash, not a failed check.
const rtl = await settle(
  `(() => {
    if (!document.querySelector('.group-panel') || !document.querySelector('.well')) return null
    return JSON.stringify({
    root: document.documentElement.dir,
    lang: document.documentElement.lang,
    wellDir: getComputedStyle(document.querySelector('.well')).direction,
    bodyDir: getComputedStyle(document.body).direction,
    notices: document.querySelectorAll('.fallback-notice').length,
    // A story body carries lang="en" exactly when its text fell back to English, because
    // langAttrs() puts the RESOLVED language on the element. So this is the count of fallbacks
    // actually on the page, and the notice count has to match it.
    fellBack: document.querySelectorAll('.story section > div[lang="en"]').length,
    // ...and a notice that is NOT inside a fallen-back body is a page telling a visitor its Arabic
    // is English when it is not.
    strayNotices: [...document.querySelectorAll('.fallback-notice')]
      .filter((n) => !n.closest('.story section > div[lang="en"]')).length,
    // The catalogue name is never translated by design — §6 has the catalogue speak its own words,
    // and scripts/units.mjs deliberately collects no unit for it. So on an Arabic page these are
    // guaranteed to exist and are guaranteed to be English, which makes them the one anchor for
    // §7's marking rule that does not depend on how complete a language happens to be.
    catalogueAll: document.querySelectorAll('.object-catalogue').length,
    catalogueEn: document.querySelectorAll('.object-catalogue[lang="en"][dir="ltr"]').length,
    panelText: (document.querySelector('.group-panel')?.textContent ?? '').slice(0,30)
    })
  })()`,
  (v) => v != null,
)
// A page that never produced its markup fails one check loudly here; the substitute object makes
// every check below fail on its own terms too (NaN equals nothing, and the text is Latin), rather
// than throwing on undefined — or worse, passing because undefined === undefined.
check(rtl != null, 'the group page rendered (.group-panel and .well present)', rtl == null ? 'timed out waiting for the chunk' : undefined)
const r = rtl ? JSON.parse(rtl) : { notices: NaN, strayNotices: NaN, panelText: 'never rendered' }
check(r.root === 'rtl', 'root dir is rtl for Arabic', r.root)
check(r.bodyDir === 'rtl', 'layout mirrors', r.bodyDir)
check(r.wellDir === 'ltr', 'media well is NOT mirrored', r.wellDir)

// §7: "The fallback is never silent." This used to assert that SOME notice was on the page, which
// stopped being a statement about the rule the day Arabic reached 128/128 stories: there was no
// longer anything on this page to fall back, so the check could not pass however correct the app
// was. It had been failing on the deployed build too, which is how a check earns being ignored.
//
// Stated as the invariant instead — one notice per fallen-back body, no notices anywhere else — it
// is true at every level of coverage, and it still fails loudly if the notice stops rendering or
// starts rendering on translated text. The exercised count is printed rather than hidden, because
// an invariant that currently holds over zero cases is passing vacuously and should say so.
check(r.notices === r.fellBack, 'every fallen-back body states it, and only those', `${r.notices} notices / ${r.fellBack} fell back`)
check(r.strayNotices === 0, 'no fallback notice on text that did not fall back', `${r.strayNotices} stray`)
if (r.fellBack === 0) console.log('  note  nothing on this page falls back — the two checks above passed over zero cases')

// The rule those checks can no longer exercise, tested on content that is English BY DESIGN and
// therefore always present: the catalogue's own words, marked as English inside an Arabic page.
check(r.catalogueAll > 0 && r.catalogueEn === r.catalogueAll, 'untranslated-by-design text carries lang="en" dir="ltr"', `${r.catalogueEn}/${r.catalogueAll} catalogue names`)
check(!/^[A-Za-z]/.test(r.panelText.trim()), 'the group panel is in Arabic', r.panelText)

// The override must beat the device language and survive a reload.
await send('Runtime.evaluate', { expression: `localStorage.setItem('lang','zh-Hant')` })
await nav(ORIGIN + '/')
const ov = await settle(
  `document.getElementById('root')?.childElementCount
    ? JSON.stringify({lang: document.documentElement.lang, dir: document.documentElement.dir})
    : null`,
  (v) => v != null && JSON.parse(v).lang === 'zh-Hant',
)
const o = ov ? JSON.parse(ov) : {}
check(o.lang === 'zh-Hant', 'stored choice beats the device language', o.lang)
check(o.dir === 'ltr', 'dir returns to ltr for Chinese', o.dir)

// §7's disclosure — "a museum trades on authority; this is the difference between being trusted
// and being caught" — was removed from the picker on request (2026-08-17, commit 9bc0d74). The
// translationNotice strings and the per-unit review ledger remain, so restoring it is one footer
// prop; until then the app ships machine translation with no disclosure, and this comment is the
// record that §7 is unmet there by choice, not by accident. What stays checkable: the picker
// opens, lists every language, and renders no orphaned notice out of the strings left behind.
{
  const open = `(async () => {
    const trigger = document.querySelector('.lang-trigger')
    if (!trigger) return JSON.stringify({ error: 'no language trigger' })
    trigger.click()
    await new Promise((r) => setTimeout(r, 400))
    return JSON.stringify({
      notice: !!document.querySelector('.lang-notice'),
      options: document.querySelectorAll('[role="option"]').length,
    })
  })()`

  for (const lang of ['zh-Hant', 'en']) {
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lang','${lang}')` })
    await nav(ORIGIN + '/')
    // The open() expression clicks the trigger, so it has to exist before running it once.
    await settle(`!!document.querySelector('.lang-trigger')`, (v) => v === true)
    const { result } = await send('Runtime.evaluate', { expression: open, awaitPromise: true, returnByValue: true })
    const d = JSON.parse(result.value)
    check(d.options === 8, `the picker opens with all eight languages (${lang})`, `${d.options} options`)
    check(!d.notice, `no orphaned translation notice (${lang})`, 'removed on request 2026-08-17')
  }
}

console.log(failed ? `\n${failed} check(s) failed` : `\nall language checks pass`)
chrome.kill()
process.exit(failed ? 1 : 0)
