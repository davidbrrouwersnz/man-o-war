// The language context, per BUILD-SPEC-v2.md §7.
//
// Lifted out of App.jsx so that a lazily-loaded component can read translations without importing
// App and forming a cycle. src/i18n.js holds the resolution rules; this holds the React plumbing
// over them.

import { createContext, useContext } from 'react'
import englishPack from './data/i18n/en.json'
import { dirOf, resolve } from './i18n.js'

export const Lang = createContext({ code: 'en', pack: englishPack, setCode: () => {} })
export const useLang = () => useContext(Lang)

// t() returns the string. tr() returns the string AND the language it is actually in, for the
// places that must carry lang/dir on the element itself.
export function useT() {
  const { pack } = useLang()
  // englishOverride is for content that lives in a data chunk rather than in en.json — a group
  // panel, say. The English is already loaded; only the translation needs resolving.
  const tr = (path, vars, englishOverride) => {
    // path may be a dot-string ("ui.language") or an array of keys — arrays are required wherever
    // a key can itself contain a dot, which every accession number does (i18n.js explains why).
    const keys = Array.isArray(path) ? path : path.split('.')
    const fromEn = keys.reduce((o, k) => (o == null ? undefined : o[k]), englishPack)
    const r = resolve(pack, keys, englishOverride ?? fromEn ?? keys.join('.'))
    const text = vars ? r.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`) : r.text
    return { ...r, text }
  }
  return [(path, vars) => tr(path, vars).text, tr]
}

// §7: lang and dir follow what is actually rendered. This puts that on the element itself, so an
// English fallback inside an Arabic page is an LTR block carrying lang="en".
export const langAttrs = (r) => ({ lang: r.lang, dir: dirOf(r.lang) })
