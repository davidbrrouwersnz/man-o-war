// Which telling of the collection the visitor is reading: the full stories, or the short tier —
// simpler, quicker versions of the same stories, written for younger listeners and for anyone who
// wants a faster visit.
//
// A content tier, not a display preference, which is why this is its own module rather than a
// fourth field in a11yPrefs: it decides which authored words are printed and spoken, the way the
// language does, and it deliberately is NOT §18's Easy Read tier — that remains a separate,
// procured accessibility standard (see the note in src/a11y.jsx), and this toggle must never be
// presented as it.
//
// Coverage is partial by design: src/data/stories-short.json holds only the objects whose short
// telling has been written. A page whose object has no short version renders the full story and
// says so inline (ui.tierFallbackNotice) — the toggle always reflects the visitor's choice, never
// per-page availability, so it cannot flicker between routes.

import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'storyTier'
export const TIERS = ['full', 'short']

const Ctx = createContext({ tier: 'full', setTier: () => {} })
export const useTier = () => useContext(Ctx)

function read() {
  try {
    // Validated rather than trusted, like a11yPrefs: a stale or hand-edited value would otherwise
    // ask the pages for a tier that does not exist and render nothing.
    const raw = localStorage.getItem(KEY)
    return TIERS.includes(raw) ? raw : 'full'
  } catch {
    // Private browsing throws on localStorage. The toggle still works for the session.
    return 'full'
  }
}

export function TierProvider({ children }) {
  const [tier, setTier] = useState(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, tier)
    } catch {
      // As above — the choice holds for this session and is simply not remembered.
    }
  }, [tier])

  return <Ctx.Provider value={{ tier, setTier }}>{children}</Ctx.Provider>
}
