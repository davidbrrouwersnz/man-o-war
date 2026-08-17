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
// Every text in the app has a short telling (src/data/stories-short.json). If one is ever removed,
// the page renders the full story silently — the inline fallback disclaimer was removed on request
// (2026-08-17). The toggle always reflects the visitor's choice, never per-page availability, so
// it cannot flicker between routes. The short tier also collapses the Further reading sections by
// default (see ElsewhereShell in components/reading.jsx): a visitor who chose the quick telling is
// assumed less interested in external links.

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
