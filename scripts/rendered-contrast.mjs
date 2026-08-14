// Contrast as it actually renders, not as the tokens promise.
//
//   node scripts/rendered-contrast.mjs <origin> [WxH] [light|dark] [path ...]
//
// scripts/contrast.mjs checks that each token pair clears its floor. It cannot catch the mistake
// this app keeps making, which is using a correct token on the wrong ground: the Listen control in
// --ink on a permanently black header (1.2:1), the language picker in --dark-ink once it moved onto
// cream, the collection standfirst left in --dark-ink-soft when the header became a light column
// (2.65:1). Every one of those passed contrast.mjs.
//
// So this walks the rendered page, takes each element's computed colour and the first opaque
// background painted behind it, and reports anything under its floor. Large text (>=24px, or
// >=18.66px bold) gets 3:1; everything else 4.5:1.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:4179'
const [W, H] = (process.argv[3] ?? '1440x900').split('x').map(Number)
const SCHEME = process.argv[4] ?? 'light'
const PATHS = process.argv.slice(5).length ? process.argv.slice(5) : ['/']

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('no Chrome found')

const PORT = 9379
const profile = mkdtempSync(join(tmpdir(), 'rendered-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars'])
process.on('exit', () => chrome.kill())
async function ep() { for (let i=0;i<80;i++){ try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl } catch { await new Promise(r=>setTimeout(r,250)) } } throw new Error('Chrome did not start') }
const ws = new WebSocket(await ep()); const pending = new Map(); let id = 0
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } })
await new Promise((r) => ws.addEventListener('open', r))
const rpc = (m, p = {}, s) => new Promise((res, rej) => { const n = ++id; pending.set(n, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: n, method: m, params: p, sessionId: s })) })
const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true })
const send = (m, p) => rpc(m, p, sessionId)
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCHEME }] })

const PROBE = `(async()=>{
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  for (let i=0;i<60;i++){ if (document.querySelector('main')) break; await wait(200) }
  await wait(1200);

  const parse = c => {
    const m = c.match(/[\\d.]+/g);
    if (!m) return null;
    return { r:+m[0], g:+m[1], b:+m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  const lin = v => { v/=255; return v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) };
  const lum = c => 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b);
  const ratio = (a,b) => { const x=lum(a), y=lum(b); const hi=Math.max(x,y), lo=Math.min(x,y); return (hi+0.05)/(lo+0.05) };
  // flatten a translucent colour onto what is behind it
  const over = (fg,bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });

  const groundOf = el => {
    let stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
    }
    stack.push({ r:255, g:255, b:255, a:1 });
    return stack.reverse().reduce((acc, c) => over(c, acc));
  };

  const out = [];
  for (const el of document.querySelectorAll('main *')) {
    // only elements that paint their own text
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!direct) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
    if (el.closest('.visually-hidden, .skip-link')) continue;

    const fg = parse(cs.color);
    if (!fg || fg.a === 0) continue;
    const bg = groundOf(el);
    const flat = over(fg, bg);
    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight,10) || 400) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const floor = large ? 3 : 4.5;
    const v = ratio(flat, bg);
    if (v + 0.005 < floor) {
      out.push({
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
        text: (el.textContent || '').trim().slice(0, 44),
        fg: cs.color, bg: 'rgb(' + [bg.r,bg.g,bg.b].map(Math.round).join(',') + ')',
        px: Math.round(px), ratio: +v.toFixed(2), floor,
      });
    }
  }
  // one row per distinct selector
  const seen = new Set();
  return JSON.stringify(out.filter(o => !seen.has(o.sel) && seen.add(o.sel)));
})()`

let failures = 0
for (const path of PATHS) {
  await send('Page.navigate', { url: ORIGIN + path })
  const { result } = await send('Runtime.evaluate', { expression: PROBE, awaitPromise: true, returnByValue: true })
  const rows = JSON.parse(result.value)
  console.log(`\n${path}  ${W}x${H}  ${SCHEME}`)
  if (!rows.length) {
    console.log('  every rendered text colour clears its floor')
    continue
  }
  for (const r of rows) {
    failures++
    console.log(`  FAIL ${String(r.ratio).padStart(5)} (needs ${r.floor})  ${r.px}px  ${r.sel}`)
    console.log(`        ${r.fg} on ${r.bg}   "${r.text}"`)
  }
}
console.log(failures ? `\n${failures} rendered failure(s)` : '\nall clear')
chrome.kill()
process.exit(failures ? 1 : 0)
