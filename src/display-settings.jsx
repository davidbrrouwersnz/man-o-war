// The panel behind the display button (§18). Its own module, and lazily imported, because Base
// UI's dialog is ~34KB gzipped — more than half the size of everything else in the main bundle —
// and a settings panel is the least-opened thing in the app. §18 makes data cost an equity issue;
// the prototype measured a 1.45s floor on gallery wifi that was almost entirely blocking script.
//
// Native radios and a native checkbox rather than styled substitutes. They arrive with grouping,
// keyboard behaviour and state announcement already correct, and this is the one dialog in the app
// that must not be clever.

import { useEffect } from 'react'
import { TEXT_SCALES, useA11y } from './a11y.jsx'
import { useT } from './lang.jsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function DisplayPanel({ open, onOpenChange }) {
  const [t] = useT()
  const { prefs, set } = useA11y()

  // §18: "The sheet must implement the modal behaviour it declares — focus moved in, Tab trapped,
  // focus restored on close, background inert. v1 declared role="dialog" and implemented none of
  // it." Base UI does the first three, and marks #root aria-hidden — which hides the page from a
  // screen reader but leaves every link in it still focusable. `inert` is the attribute that does
  // both. Safe to set here because the dialog is portalled to a sibling of #root, not inside it.
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || !open) return
    root.inert = true
    return () => {
      root.inert = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings">
        <DialogHeader>
          {/* §18: "Real names on dialogs, not 'quiz'." */}
          <DialogTitle>{t('ui.display')}</DialogTitle>
          <DialogDescription>{t('ui.displayHelp')}</DialogDescription>
        </DialogHeader>

        <fieldset className="setting">
          <legend>{t('ui.textSize')}</legend>
          <div className="setting-choices">
            {TEXT_SCALES.map((s) => (
              <label key={s} className={prefs.textScale === s ? 'is-current' : ''}>
                <input
                  type="radio"
                  name="text-scale"
                  value={s}
                  checked={prefs.textScale === s}
                  onChange={() => set({ textScale: s })}
                />
                {/* Capped at 1.5em so the 200% option does not push the row taller than the
                    dialog. The percentage beside it is what states the value. */}
                <span aria-hidden="true" style={{ fontSize: `${Math.min(s, 1.5)}em` }}>
                  A
                </span>
                {`${Math.round(s * 100)}%`}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="setting">
          <legend>{t('ui.contrast')}</legend>
          <label className="setting-switch">
            <input
              type="checkbox"
              checked={prefs.highContrast}
              onChange={(e) => set({ highContrast: e.target.checked })}
            />
            {t('ui.highContrast')}
          </label>
        </fieldset>

        {/* §13's cues map one-to-one onto the printed segments, which is only worth anything if
            the highlighted word is on screen. A preference rather than a player button: it
            persists, and it keeps the bar to five controls. */}
        <fieldset className="setting">
          <legend>{t('ui.reading')}</legend>
          <label className="setting-switch">
            <input
              type="checkbox"
              checked={prefs.followWords}
              onChange={(e) => set({ followWords: e.target.checked })}
            />
            {t('ui.followWords')}
          </label>
        </fieldset>
      </DialogContent>
    </Dialog>
  )
}
