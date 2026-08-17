// The application shell: language and accessibility providers, the audio player that outlives
// navigation, and the router.

import { useEffect, useRef, useState } from 'react'
import { detect, dirOf, remember } from './i18n.js'
import { Lang, useT } from './lang.jsx'
import { AudioBar, AudioProvider } from './audio.jsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { A11yProvider } from './a11y.jsx'
import { TierProvider } from './tier.jsx'
import englishPack from './data/i18n/en.json'
import { SUPPORTED, loadChunk } from './collection.js'
import { useRoute } from './routing.js'
import { Home } from './pages/home.jsx'
import { GroupPage } from './pages/group.jsx'
import { Missing } from './pages/missing.jsx'

// ------------------------------------------------------------------ app

export default function App() {
  const [code, setCodeRaw] = useState(() => {
    const d = detect()
    return SUPPORTED.some((l) => l.code === d.code) ? d.code : 'en'
  })
  const [pack, setPack] = useState(englishPack)

  useEffect(() => {
    if (code === 'en') {
      setPack(englishPack)
      return
    }
    let live = true
    loadChunk(`lang-${code}`)?.then((p) => {
      if (live) setPack(p)
    })
    return () => {
      live = false
    }
  }, [code])

  // §7: lang and dir go on the root, and dir is mirrored for the layout — never for the media.
  useEffect(() => {
    document.documentElement.lang = code
    document.documentElement.dir = dirOf(code)
  }, [code])

  const setCode = (next) => {
    remember(next)
    setCodeRaw(next)
  }

  return (
    <Lang.Provider value={{ code, pack, setCode }}>
      <A11yProvider>
        {/* Above the audio provider, like the language: the player watches the tier and stops when
            it changes, for the same reason it stops on a language switch. */}
        <TierProvider>
        <TooltipProvider delay={400}>
        {/* §13: the narration plays across navigation, so the player sits above the router. Moving
            it inside a page would unmount and silence it every time someone opened another object. */}
        <AudioProvider>
          <SkipLink />
          <Routes />
          <AudioBar />
        </AudioProvider>
        </TooltipProvider>
        </TierProvider>
      </A11yProvider>
    </Lang.Provider>
  )
}

// Every page is one <main>, and on a group page the first thing in it is up to nineteen objects.
// Without this the only way past the header to the content is to tab through it.
function SkipLink() {
  const [t] = useT()
  return (
    <a className="skip-link" href="#main">
      {t('ui.skipToContent')}
    </a>
  )
}

function Routes() {
  const [route, go] = useRoute()

  // A client-side navigation changes everything on screen and says nothing to a screen reader —
  // focus stays wherever the old page left it. Moving it to the new page's heading is what makes
  // "next group" announce the group you just opened.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      // Not on arrival. A QR visitor lands mid-page at their object, and stealing focus to the
      // group title would undo the one thing §11 asks this route to get right.
      firstRender.current = false
      return
    }
    const h1 = document.querySelector('main h1')
    if (!h1) return
    // Set here rather than in the markup so a heading is only in the tab order at the moment it
    // needs to receive focus, and never as a stop a keyboard user has to pass through.
    h1.tabIndex = -1
    h1.focus({ preventScroll: true })
  }, [route.view, route.slug, route.arrivedAt])

  if (route.view === 'home') return <Home go={go} route={route} />
  if (route.view === 'group') return <GroupPage route={route} go={go} />
  return <Missing route={route} go={go} />
}
