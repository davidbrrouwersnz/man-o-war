// Text size and high contrast, per BUILD-SPEC-v2.md §18 and §19.
//
// §18 is unusually direct about this: "Large text and high contrast are the PRIMARY vision
// provision for the reading layer, ahead of screen-reader support." §19 lists
// `a11yPrefs { textScale, highContrast, easyRead }` as persisted state. Neither existed.
//
// Only two of the three are here. Easy Read is a separate authored content tier procured from
// People First NZ (§18) — it is not a rendering mode and a toggle for it would be a lie until the
// content exists.
//
// Everything the preference does is a custom property on <html>, so no component has to know the
// setting exists: `--text-scale` multiplies the root font size, which every rem in the stylesheet
// already follows, and `data-contrast` swaps the token block.

import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'a11yPrefs'

// Four steps rather than a slider. A slider invites a value nobody tested, needs a drag to operate
// — which WCAG 2.2 SC 2.5.7 then requires an alternative for — and is harder to hit on a phone in
// a gallery. 200% is where WCAG 1.4.4 sets the bar, so it is the top of the range rather than an
// arbitrary maximum.
export const TEXT_SCALES = [1, 1.25, 1.5, 2]

// followWords lives here rather than in the audio provider because it is a preference, not a
// transport control — it belongs beside text size, and it should still be set the next time the
// visitor opens the app. Keeping it out of the player also keeps the bar to five controls, which
// is what fits across a 390px phone without crushing the title to "The…".
const DEFAULTS = { textScale: 1, highContrast: false, followWords: true }

const Ctx = createContext({ prefs: DEFAULTS, set: () => {} })
export const useA11y = () => useContext(Ctx)

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw)
    return {
      // Validated rather than trusted. This value is multiplied into the root font size, so a
      // stale or hand-edited entry could otherwise render the app at 40x and leave no way back.
      textScale: TEXT_SCALES.includes(p?.textScale) ? p.textScale : DEFAULTS.textScale,
      highContrast: p?.highContrast === true,
      followWords: p?.followWords !== false,
    }
  } catch {
    // Private browsing throws on localStorage. The controls still work for the session.
    return DEFAULTS
  }
}

export function A11yProvider({ children }) {
  const [prefs, setPrefs] = useState(read)

  useEffect(() => {
    const el = document.documentElement
    el.style.setProperty('--text-scale', String(prefs.textScale))
    if (prefs.highContrast) el.dataset.contrast = 'high'
    else delete el.dataset.contrast
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      // As above — the setting holds for this session and is simply not remembered.
    }
  }, [prefs])

  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }))
  return <Ctx.Provider value={{ prefs, set }}>{children}</Ctx.Provider>
}
