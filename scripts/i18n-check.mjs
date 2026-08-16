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

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4182'

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
  await send('Page.navigate', { url: ORIGIN + '/' })
  await new Promise((r) => setTimeout(r, 1500))
  const { result } = await send('Runtime.evaluate', {
    expression: `document.documentElement.lang`,
    returnByValue: true,
  })
  check(result.value === expect, `BCP 47 lookup: ${tag} → ${result.value}`, `expected ${expect}`)
}

// §7: dir follows the rendered language, and the media is not mirrored.
await send('Network.setUserAgentOverride', { userAgent: '', acceptLanguage: 'ar-EG,ar' })
await send('Emulation.setLocaleOverride', { locale: 'ar-EG' })
await send('Page.navigate', { url: ORIGIN + '/g/jellyfish' })
await new Promise((r) => setTimeout(r, 2200))
const { result: rtl } = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
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
    panelText: (document.querySelector('.group-panel')||{}).textContent.slice(0,30)
  })`,
  returnByValue: true,
})
const r = JSON.parse(rtl.value)
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
await send('Page.navigate', { url: ORIGIN + '/' })
await new Promise((r) => setTimeout(r, 1500))
const { result: ov } = await send('Runtime.evaluate', {
  expression: `JSON.stringify({lang: document.documentElement.lang, dir: document.documentElement.dir})`,
  returnByValue: true,
})
const o = JSON.parse(ov.value)
check(o.lang === 'zh-Hant', 'stored choice beats the device language', o.lang)
check(o.dir === 'ltr', 'dir returns to ltr for Chinese', o.dir)

// §7's disclosure. "A museum trades on authority; this is the difference between being trusted and
// being caught." It lived in the packs for months with nothing reading it, so it is checked in a
// browser rather than trusted to stay wired — including that it speaks the reader's language, since
// a disclosure a visitor cannot read discloses nothing.
{
  const open = `(async () => {
    const trigger = document.querySelector('.lang-trigger')
    if (!trigger) return JSON.stringify({ error: 'no language trigger' })
    trigger.click()
    await new Promise((r) => setTimeout(r, 400))
    const note = document.querySelector('.lang-notice')
    const list = document.querySelector('[role="listbox"]')
    return JSON.stringify({
      present: !!note,
      text: note ? note.textContent.trim() : null,
      // A note inside the listbox would be neither an option nor announced.
      insideListbox: !!(note && list && list.contains(note)),
      options: document.querySelectorAll('[role="option"]').length,
    })
  })()`

  for (const [lang, expectLatin] of [['zh-Hant', false], ['en', null]]) {
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lang','${lang}')` })
    await send('Page.navigate', { url: ORIGIN + '/' })
    await new Promise((r) => setTimeout(r, 1600))
    const { result } = await send('Runtime.evaluate', { expression: open, awaitPromise: true, returnByValue: true })
    const d = JSON.parse(result.value)

    if (lang === 'en') {
      check(!d.present, 'English shows no translation notice', 'it is the source, not a translation')
    } else {
      check(d.present, 'a machine-translated language discloses it', d.text?.slice(0, 34))
      check(!d.insideListbox, 'the notice sits outside the listbox', `${d.options} options`)
      check(d.text && /[一-鿿]/.test(d.text) === !expectLatin, 'the notice is in the reader\'s language', d.text?.slice(0, 20))
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : `\nall language checks pass`)
chrome.kill()
process.exit(failed ? 1 : 0)
