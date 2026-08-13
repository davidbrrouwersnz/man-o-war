// Language resolution, per BUILD-SPEC-v2.md §7.
//
// The rules that are easy to get wrong and expensive to retrofit, all of them from §7:
//   - Match on language, not on string. navigator.language returns en-NZ and zh-Hant-TW; a
//     comparison against "en" or "zh" fails for most real devices. BCP 47 lookup, most specific
//     subtag first.
//   - Resolution runs per piece of content, not per session: selected -> device -> English.
//   - English is the terminal fallback, so it must be complete. It is.
//   - The fallback is never silent. A visitor reading English inside a Samoan session is told why,
//     once, quietly - otherwise they reasonably conclude the app has no Samoan in it at all.
//   - lang and dir follow what is actually RENDERED, not what was selected. An English story inside
//     an Arabic session is an LTR block carrying lang="en" inside an RTL page.

// §7 tiers by verification burden rather than language count, and names its own examples: high
// resource (zh, ja, ko, de, fr, es) against low resource (sm, to, prs, ti, so). This is the
// core-interpretation tier of twelve.
//
// te reo Maori is deliberately ABSENT and must stay absent from any automated set. §7 puts English,
// te reo and NZSL outside this framework entirely - human, iwi-partnered, Deaf-led - and §6 already
// answered the te reo question: no species names, the blank is content, and the ask goes to the
// Museum rather than around it.
export const LANGUAGES = [
  { code: 'en', name: 'English', endonym: 'English', dir: 'ltr', tier: 'source' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', endonym: '繁體中文', dir: 'ltr', tier: 'high' },
  { code: 'ja', name: 'Japanese', endonym: '日本語', dir: 'ltr', tier: 'high' },
  { code: 'ko', name: 'Korean', endonym: '한국어', dir: 'ltr', tier: 'high' },
  { code: 'de', name: 'German', endonym: 'Deutsch', dir: 'ltr', tier: 'high' },
  { code: 'fr', name: 'French', endonym: 'Français', dir: 'ltr', tier: 'high' },
  { code: 'es', name: 'Spanish', endonym: 'Español', dir: 'ltr', tier: 'high' },
  { code: 'sm', name: 'Samoan', endonym: 'Gagana Sāmoa', dir: 'ltr', tier: 'low' },
  { code: 'to', name: 'Tongan', endonym: 'Lea faka-Tonga', dir: 'ltr', tier: 'low' },
  { code: 'ar', name: 'Arabic', endonym: 'العربية', dir: 'rtl', tier: 'low' },
  { code: 'prs', name: 'Dari', endonym: 'دری', dir: 'rtl', tier: 'low' },
  { code: 'ti', name: 'Tigrinya', endonym: 'ትግርኛ', dir: 'rtl-script-ltr', tier: 'low' },
  { code: 'so', name: 'Somali', endonym: 'Soomaali', dir: 'ltr', tier: 'low' },
]

export const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]))
const CODES = LANGUAGES.map((l) => l.code)

// Tigrinya is written in Ge'ez script, which runs left to right. Guard against the assumption that
// a non-Latin script implies RTL.
export const dirOf = (code) => (BY_CODE.get(code)?.dir === 'rtl' ? 'rtl' : 'ltr')

// BCP 47 lookup (RFC 4647 §3.4): progressively drop the last subtag until something matches.
// zh-Hant-TW -> zh-Hant. en-NZ -> en. de-CH -> de. pt-BR -> no match, falls through.
export function lookup(tag) {
  if (!tag) return null
  let candidate = String(tag).replace(/_/g, '-')
  for (;;) {
    const hit = CODES.find((c) => c.toLowerCase() === candidate.toLowerCase())
    if (hit) return hit
    const cut = candidate.lastIndexOf('-')
    if (cut < 1) return null
    candidate = candidate.slice(0, cut)
    // A lone singleton subtag ("x", "u") is not a language; keep cutting.
    if (/-[a-z0-9]$/i.test(candidate)) continue
  }
}

// §7: default to the device language, allow override, and never show an interstitial on arrival —
// a visitor who scans a code in a gallery has about five seconds and must not spend them choosing
// from a list.
export function detect() {
  try {
    const stored = localStorage.getItem('lang')
    if (stored && BY_CODE.has(stored)) return { code: stored, chosen: true }
  } catch {
    // Private browsing can throw on localStorage. Fall through to the device language.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const hit = lookup(tag)
    if (hit) return { code: hit, chosen: false }
  }
  return { code: 'en', chosen: false }
}

export function remember(code) {
  try {
    localStorage.setItem('lang', code)
  } catch {
    // Nothing to do. The choice lasts the session either way.
  }
}

// Resolution per piece of content. Returns the text AND the language it is actually in, because
// §7 requires lang and dir to follow what is rendered rather than what was selected.
export function resolve(pack, path, english) {
  const translated = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), pack ?? {})
  if (typeof translated === 'string' && translated.trim()) return { text: translated, lang: pack.__code, fellBack: false }
  return { text: english, lang: 'en', fellBack: true }
}
