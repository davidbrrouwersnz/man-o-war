// The chrome that appears on every route: the language picker (§7) and the display settings
// button (§18).

import { Suspense, lazy, useState } from 'react'
import { ContrastIcon, GlobeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLang, useT } from '../lang.jsx'
import { SUPPORTED } from '../collection.js'

// Base UI's dialog is ~34KB gzipped — more than half the size of everything else in the main
// bundle — and almost nobody opens a settings panel. §18 makes data cost an equity issue and the
// prototype measured a 1.45s floor on gallery wifi that was almost entirely blocking JavaScript,
// so this is fetched on the first press of the button and never before.
const DisplayPanel = lazy(() => import('../display-settings.jsx'))

// §7's visible fallback — a Somali speaker who gets an English story with no explanation
// reasonably concludes the app has no Somali in it — is rendered inline by Essay and
// ObjectSection. A `Fallback` wrapper component used to sit here as well, unused: its markup had
// been copied into both call sites rather than being called.

function LanguagePicker() {
  const { code, setCode } = useLang()
  const [t] = useT()
  return (
    <div className="lang-picker">
      {/* The word "Language" is hidden, not deleted. An icon is a hint, not a name — a select with
          no accessible name is announced as just "combo box", and the one control on the page a
          visitor most needs when they cannot read the page is the one that stops saying what it is.
          So the globe carries the meaning visually and the word carries it to a screen reader. */}
      <span className="visually-hidden" id="lang-label">{t('ui.language')}</span>
      <GlobeIcon className="lang-globe" size={18} aria-hidden="true" focusable="false" />
      {/* shadcn's Select. It replaces a native <select>, and that is a genuine trade rather than a
          free upgrade: the native one handed a phone its own full-screen picker, which is large,
          familiar and works with VoiceOver without anyone writing a line. What this buys back is
          one appearance on every browser — a native select is the control least amenable to being
          styled, and it was the one piece of chrome that did not look like the rest of the app.

          `items` is passed so the trigger can render an endonym for the current value rather than
          the raw code. Each option keeps its own lang attribute, which is what tells a screen
          reader to pronounce Deutsch in German. */}
      <Select
        value={code}
        onValueChange={(v) => v && setCode(v)}
        items={SUPPORTED.map((l) => ({ value: l.code, label: l.endonym }))}
      >
        <SelectTrigger className="lang-trigger min-h-11" size="touch" aria-labelledby="lang-label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED.map((l) => (
            <SelectItem key={l.code} value={l.code} lang={l.code}>
              {l.endonym}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// §18: large text and high contrast are the primary vision provision for the reading layer, which
// means controls, which means somewhere to put them. Native radios and a native checkbox rather
// than styled substitutes — they arrive with grouping, keyboard behaviour and state announcement
// already correct, and this is the one dialog in the app that must not be clever.
// The button is in the main bundle; the panel behind it is not. `wanted` latches on the first
// press so the chunk is fetched once and the dialog can then open and close without refetching.
function DisplaySettings() {
  const [t] = useT()
  const [wanted, setWanted] = useState(false)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="quiet"
        size="icon-touch"
        className="tool-button"
        aria-label={t('ui.display')}
        aria-haspopup="dialog"
        onClick={() => {
          setWanted(true)
          setOpen(true)
        }}
      >
        {/* The half-filled circle is the conventional contrast glyph, and it is what this panel is
            mostly for. */}
        <ContrastIcon size={18} aria-hidden="true" focusable="false" />
      </Button>
      {wanted && (
        <Suspense fallback={null}>
          <DisplayPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}

// The language picker used to be rendered by Home and by nothing else. A visitor who scans a code
// in the gallery lands on /o/{accession}, which is a group page — so the one control §7 is built
// around was unreachable from the one route §11 is built around, unless they first went "back" to
// a collection page they had never seen. Both tools now travel together and appear on every route.
function Tools() {
  return (
    <div className="tools">
      <LanguagePicker />
      <DisplaySettings />
    </div>
  )
}

export { LanguagePicker, DisplaySettings, Tools }
