// The chrome that appears on every route: the language picker (§7) and the display settings
// button (§18).

import { Suspense, lazy, useState } from 'react'
import { GlobeIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLang, useT } from '../lang.jsx'
import { useTier } from '../tier.jsx'
import { SUPPORTED } from '../collection.js'

// Base UI's dialog is ~34KB gzipped — more than half the size of everything else in the main
// bundle — and almost nobody opens a settings panel. §18 makes data cost an equity issue and the
// prototype measured a 1.45s floor on gallery wifi that was almost entirely blocking JavaScript,
// so this is fetched on the first press of the button and never before.
const DisplayPanel = lazy(() => import('../display-settings.jsx'))

// §7's visible fallback — an Arabic speaker who gets an English story with no explanation
// reasonably concludes the app has no Arabic in it — is rendered inline by Essay and
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
          {/* Inside the control, not beside it: globe, language, chevron reads as one thing to
              press. Loose, the globe was a label floating next to a button, and on a phone it was
              a 18px target's worth of dead space that looked pressable and was not.

              size-[1.15em] rather than the size prop, because the trigger forces every svg without
              a size- class to 1rem — the class is how that selector is opted out of, and 1.15em is
              what every other icon in the app uses. It has no colour of its own now; it takes the
              trigger's, which is what puts it on the right side of the §15 boundary on the dark
              collection header without a rule of its own. */}
          <GlobeIcon className="lang-globe size-[1.15em]" aria-hidden="true" focusable="false" />
          <SelectValue />
        </SelectTrigger>
        {/* §7's machine-translation notice was removed from this picker on request (2026-08-17).
            The `ui.translationNotice` strings in every pack and the per-unit review ledger remain,
            so restoring it is one footer prop here — and deleting the strings from en.json would
            needlessly trigger the translate workflow. */}
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
        variant="bare"
        size="icon-touch"
        className="tool-button"
        aria-label={t('ui.display')}
        aria-haspopup="dialog"
        onClick={() => {
          setWanted(true)
          setOpen(true)
        }}
      >
        {/* A gear reads as "settings" at a glance; the half-filled contrast circle it replaced named
            only one of the panel's two controls (text size, then contrast) and was easy to mistake
            for a dark-mode toggle, which this app does not have — §15 already ties dark and light to
            the device, not to a switch. */}
        <SettingsIcon size={18} aria-hidden="true" focusable="false" />
      </Button>
      {wanted && (
        <Suspense fallback={null}>
          <DisplayPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}

// The two tellings of the collection: the full stories, and the short tier written for younger
// listeners and quicker visits. A visible control in the page's own chrome rather than a row in
// the display dialog, deliberately — most visitors arrive by scanning a code and never open a
// settings panel, and a choice nobody finds is a choice nobody has. It reflects the visitor's
// persisted preference and is never hidden or disabled; every text in the app now has a short
// telling, and the old per-object fallback notice was removed on request (2026-08-17).
//
// A segmented pair of toggle buttons (on request — it replaced radio chips): two joined halves,
// exactly one pressed. aria-pressed carries the state, unlike the Listen control's data-playing —
// there the label already says playing/stopped, here the labels are constant and the pressed
// state IS the information. The labels name only the length ("Short", "Full"); who the short tier
// suits is the tooltip's and the described-by hint's job, so neither audience reads the other's
// name on the control.
//
// The joined look travels as utilities (rounded-e-none / rounded-s-none, logical so RTL flips it)
// because a shadcn Button styles itself in the last cascade layer — see the note in button.jsx.
function TierToggle() {
  const { tier, setTier } = useTier()
  const [t] = useT()

  const pressed =
    'aria-pressed:bg-[var(--control-ink)] aria-pressed:text-[var(--control-ground)] aria-pressed:border-[var(--control-ink)]'

  return (
    <>
      <span className="visually-hidden" id="tier-label">{t('ui.tierLabel')}</span>
      {/* The hint is real text in the DOM, not only a tooltip: aria-describedby carries it to a
          screen reader whether or not the pointer ever hovers. */}
      <span className="visually-hidden" id="tier-hint">{t('ui.tierShortHint')}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="tier-toggle" role="group" aria-labelledby="tier-label" aria-describedby="tier-hint">
              {['short', 'full'].map((v, i) => (
                <Button
                  key={v}
                  variant="quiet"
                  size="touch"
                  className={`tier-btn ${i === 0 ? 'rounded-e-none border-e-0' : 'rounded-s-none'} ${pressed}`}
                  aria-pressed={tier === v}
                  onClick={() => setTier(v)}
                >
                  {t(v === 'short' ? 'ui.tierShort' : 'ui.tierFull')}
                </Button>
              ))}
            </div>
          }
        />
        {/* aria-hidden for the same reason as the compact Listen control's tooltip: the hint is
            already the group's accessible description, and a tooltip that is also announced would
            read the same sentence twice. */}
        <TooltipContent aria-hidden="true" className="text-[length:var(--step--1)]">
          {t('ui.tierShortHint')}
        </TooltipContent>
      </Tooltip>
    </>
  )
}

// The language picker used to be rendered by Home and by nothing else. A visitor who scans a code
// in the gallery lands on /o/{accession}, which is a group page — so the one control §7 is built
// around was unreachable from the one route §11 is built around, unless they first went "back" to
// a collection page they had never seen. Both tools now travel together and appear on every route.
// `listen` is the control that plays the whole page. It is passed in rather than built here
// because only the page knows what its own guide contains — the collection page's is the
// standfirst and both essays, a group page's is the panel and every object on it — but it belongs
// in this row, beside the language selector, because those three are the page's chrome and the
// rest of the Listen controls on the page belong to particular things on it.
function Tools({ listen = null }) {
  return (
    <div className="tools">
      {listen}
      <TierToggle />
      <LanguagePicker />
      <DisplaySettings />
    </div>
  )
}

export { LanguagePicker, DisplaySettings, TierToggle, Tools }
