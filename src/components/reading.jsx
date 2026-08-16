// The pieces every reading surface shares: a translated paragraph, the Listen control, and the
// media well.

import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { langAttrs, useT } from '../lang.jsx'
import { Spoken, useAudio } from '../audio.jsx'

function Translated({ r, className, itemId, block = 0 }) {
  return (
    <p className={className} {...langAttrs(r)}>
      {itemId ? <Spoken text={r.text} itemId={itemId} block={block} /> : r.text}
    </p>
  )
}

// The label shown in the player for a block that has no heading of its own — a panel, a standfirst,
// the prototype note. Its own opening words are a better signpost than any name I could invent,
// and they cost no new strings to translate.
const firstWords = (text, max = 42) => {
  const line = String(text ?? '').split(/[.\n]/)[0].trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// Every page that offers audio needs the same control and the same rule about when to show it, so
// it lives in one place. `available` is the caller's own check that what is rendered is English —
// the narration exists in English only, and offering it beside translated words would break the
// rule the whole pipeline is built on.
//
// `pending` is for a control whose queue is still being fetched. It holds the button's place and
// disables it rather than hiding it, because a control that pops into existence a moment after the
// page paints shoves everything below it down — measured at 0.03 CLS on a phone when the collection
// page's tour control waited for the essays chunk. Sub-second in practice, and a disabled control
// is exempt from the contrast floor (WCAG 1.4.3), which is what lets it dim.
function Listen({ queue, available, note, pending = false, compact = false }) {
  const [t] = useT()
  const audio = useAudio()
  if (!available) return null
  const isThis = !pending && audio?.queue?.key === queue.key
  const playing = isThis && audio.playing
  // One string, used twice: as the button's accessible name, and as the tooltip. It names what
  // will play rather than the action — "Listen — European squid, female" — which is the useful
  // half when the control itself is an unlabelled circle.
  const label = playing ? t('ui.listenStop') : `${t('ui.listen')} — ${queue.title}`

  const button = (
    <Button
      variant="quiet"
      size={compact ? 'icon-touch' : 'touch'}
      className="listen"
      data-playing={playing ? 'true' : 'false'}
      onClick={() => audio.start(queue)}
      disabled={pending}
      aria-label={label}
    >
      {playing
        ? <PauseIcon aria-hidden="true" focusable="false" />
        : <PlayIcon aria-hidden="true" focusable="false" />}
      {/* The compact form is the icon alone. The name is not lost — it is on aria-label either
          way, and the tooltip below puts the same words back on screen for a pointer. */}
      {!compact && (playing ? t('ui.listenStop') : t('ui.listen'))}
    </Button>
  )

  return (
    <p className={`object-listen${compact ? ' is-compact' : ''}`}>
      {/* shadcn's Button, in the app's own `quiet` variant at the `touch` size — see
          components/ui/button.jsx for why the museum's controls are variants there rather than
          rules in styles.css. The `listen` class is kept only as a hook for the few rules CSS still
          owns and for the scripts that measure this control. */}
      {/* Only the compact control. The full one already says the word, and a tooltip repeating a
          label that is right there is noise.

          aria-hidden on the bubble, because the button's accessible name is this same string: Base
          UI points aria-describedby at the popup, so without it a screen reader would read the name
          and then read it again as the description. The tooltip is these words made visible for a
          pointer, not a second piece of information. */}
      {compact ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent aria-hidden="true" className="text-[length:var(--step--1)]">
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {/* No note beside a compact control: it is a sentence, and it cannot share a line with a
          44px circle tucked against a heading. Nothing is lost — the same fallback is already
          stated inline in the body of any passage that fell back to English. */}
      {note && !compact && <span className="listen-note">{note}</span>}
    </p>
  )
}


// ------------------------------------------------------------------ further reading (§6)

// Decision 9 was "layers with links to external factual sources". This is that, at all three
// scales: the collection, a group, and one object.
//
// THE CLAIM IS THE POINT. Every link says how close its source actually is to the thing in the
// case — the same species, or only the same kind of animal, or just the group. §6 spends a page on
// why: "A photograph is not the modelled animal. GBIF returns some individual of the currently
// accepted species, photographed anywhere. Caption it a photograph of the species as currently
// accepted — the same discipline as 'not a scan'." A Te Ara photograph of a New Zealand spoon worm
// beside a Blaschka model of a Mediterranean one is worth linking and is NOT the same animal, and
// an interface that leaves that unsaid is asserting something nobody checked.
//
// Links open in a new tab, which is the one place this app does that. A visitor who is standing in
// a gallery halfway down a group page has a scroll position and a queue of audio, and sending them
// off-site in the same tab throws both away.
function ExternalLink({ link, publishers, variant }) {
  const [, tr] = useT()
  const source = publishers[link.p]
  // The claim is printed wherever it says something the placement does not. Under a group heading
  // a link claiming "the group" is saying only what the reader can see, and "the group, not this
  // object" is worse than nothing there — there is no object on that part of the page to contrast
  // with. Under an OBJECT it always prints, including "the same species": that is the case where
  // being explicit is the whole point, and it is what gives "a related animal" its meaning when it
  // appears two links later.
  const redundant = (variant === 'group' && link.claim === 'this-group') || (variant === 'collection' && link.claim === 'this-collection')
  const claimR = redundant ? null : tr(`ui.claim.${link.claim}`)

  // The sentence about why a source is worth reading is ours, so it translates. Resolved by the
  // link's own id — array form, because several ids end in an accession and every accession
  // contains dots that a dot-string path would shred (src/i18n.js).
  //
  // MarLIN's links carry a key instead: the same sentence sits on all 28 of them, so it lives in
  // the interface pack and is translated once rather than 28 times per language.
  const whyR = link.whyKey ? tr(link.whyKey) : link.why ? tr(['elsewhere', link.id, 'why'], null, link.why) : null

  // §7: lang and dir follow what is actually RENDERED. The title of somebody else's article and the
  // name of the institution that published it are NOT translated — a citation is quoted as printed,
  // and translating it would tell a German reader that "Fragile Legacy" leads somewhere German. So
  // they are English, permanently, and must say so: left unmarked inside an Arabic page they
  // inherit dir="rtl", and Unicode bidi then moves every sentence-final full stop to the LEFT of
  // the sentence. It was doing exactly that.
  //
  // The dir attribute on an inline element also isolates it, which is what keeps an English title
  // from reordering the Arabic around it.
  const english = { lang: 'en', dir: 'ltr' }

  const anchor = (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="elsewhere-link">
      {link.title}
    </a>
  )

  return (
    /* Title and publisher are ONE English phrase and share one block, rather than two inline
       elements each marked English on its own. Marked separately they were isolated separately:
       inside an Arabic page the RTL flow then laid the two boxes out right to left and printed the
       institution BEFORE the title of its own article.

       A plain <p>, not a list item: further reading was a <ul> of these on request, now it is not
       — one flat paragraph per link, the same shape .record-line already used for the catalogue
       record beneath it, so the two no longer look like two different kinds of list stitched
       together. */
    <p className="elsewhere-title" {...english}>
      {/* The why and the claim used to be printed under the link, always. Moved into a tooltip on
          request; no `aria-hidden` on the content, unlike the Listen button's tooltip, because this
          text is not said anywhere else on the page — hiding it from the accessibility tree too
          would delete it rather than relocate it.

          Measured rather than assumed: this version of Base UI's Tooltip does NOT wire
          aria-describedby or role="tooltip" on its own, so a screen reader tabbing to the link is
          not told this text exists — verified with a real Tab key press, not element.focus(), since
          Chromium only opens the tooltip on genuine :focus-visible focus. A sighted keyboard user
          does see it open on Tab; a sighted mouse user sees it on hover; a touch user has neither
          gesture available.

          That is a real cost, not a footnote: §6 put the claim in the flow on purpose — "not a
          decorative badge" — specifically so a visitor never has to find it, and §11 is built around
          exactly the visitor a hover-only disclosure fails, someone standing in a gallery reading
          this on a phone. Flagged to the user rather than solved unasked; the fix most likely to
          hold — a separate always-visible affordance a tap can open without triggering the link's
          own navigation — is a bigger change than "put it in a tooltip." */}
      {whyR || claimR ? (
        <Tooltip>
          <TooltipTrigger render={anchor} />
          <TooltipContent
            className="elsewhere-tooltip flex-col items-start gap-1 max-w-sm py-2 text-[length:var(--step--1)] text-start text-pretty"
            side="bottom"
          >
            {whyR && <span {...langAttrs(whyR)}>{whyR.text}</span>}
            {claimR && (
              <span {...langAttrs(claimR)} className="elsewhere-tooltip-claim">
                {claimR.text}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        anchor
      )}
      {/* A middle dot rather than a dash: several publisher names carry a dash of their own — "Te
          Ara — the Encyclopedia of New Zealand", "MarLIN — the Marine Life Information Network" —
          and two dashes in one line made the title and the institution impossible to tell apart. */}
      {source && <span className="elsewhere-source"> · {source.name}</span>}
    </p>
  )
}

// The catalogue record's taxonomy, in two lines at most.
//
// §6: "Never silently replace a catalogue name with a modern one. Show both. The record's own words
// stay; the current name sits beside them." Roughly 57% of this collection's names have been
// superseded, so the second line is the common case rather than the exception — and without it the
// WoRMS link under an object titled "Physalia pelagica" would land the visitor on a page headed
// Physalia physalis with nothing to explain the change.
//
// The date is not decoration either. WoRMS opinions are revised continuously; an undated answer
// implies a timeless truth, which is the thing §6 forbids.
// The trailing half of a record line — " — the name on the catalogue record". Its own element so
// it can carry the language it actually resolved to: these are UI strings, so they are Arabic on an
// Arabic page and English until that language has them, and the dash has to sit on whichever side
// the resolved language reads from.
function Note({ children: r }) {
  return (
    <span className="record-note" {...langAttrs(r)}>
      {' — '}
      {r.text}
    </span>
  )
}

// No heading of its own any more — see the note on Elsewhere below. The date it used to print
// ("Last checked against WoRMS and GBIF: {date}") is gone on request too; WoRMS opinions are still
// revised continuously and an undated answer is still, in principle, implying a timeless truth, but
// that is now a cost the page has chosen to accept rather than one this component states.
function Record({ taxon }) {
  const [t, tr] = useT()
  if (!taxon) return null

  if (!taxon.resolved) {
    // The third state, and it is real content: three objects have no animal to look up, and a
    // further twenty-one carry a name that no longer resolves to one species. §6 requires this
    // state to exist "without it the UI renders an empty link".
    return (
      <p className="record-line" {...langAttrs(tr('ui.recordUnresolved'))}>
        {t('ui.recordUnresolved')}
      </p>
    )
  }

  const { catalogue, current, gbif } = taxon
  // A binomial is Latin, and §7 requires it to be marked as Latin or a screen reader speaks it with
  // the surrounding language's phonetics. dir="ltr" alongside, because Latin inside an Arabic
  // paragraph needs isolating as well as labelling — .binomial already exists for the first half of
  // that job and is used everywhere else in the app for the same reason.
  const latin = { lang: 'la', dir: 'ltr' }
  return (
    <>
      <p className="record-line">
        <a href={catalogue.url} target="_blank" rel="noreferrer noopener" {...latin}>
          <i className="binomial">{catalogue.name}</i>
        </a>
        {catalogue.authority && (
          <span className="record-authority" lang="en" dir="ltr">
            {' '}
            {catalogue.authority}
          </span>
        )}
        <Note>{tr('ui.recordCatalogue')}</Note>
      </p>
      {current && (
        <p className="record-line">
          <a href={current.url} target="_blank" rel="noreferrer noopener" {...latin}>
            <i className="binomial">{current.name}</i>
          </a>
          <Note>{tr('ui.recordCurrent')}</Note>
        </p>
      )}
      {gbif && (
        <p className="record-line">
          {(() => {
            const r = tr('ui.recordSightings', { n: gbif.occurrences.toLocaleString() })
            return (
              <a href={gbif.url} target="_blank" rel="noreferrer noopener" {...langAttrs(r)}>
                {r.text}
              </a>
            )
          })()}
          {gbif.occurrencesNZ > 0 && <Note>{tr('ui.recordSightingsNZ', { n: gbif.occurrencesNZ.toLocaleString() })}</Note>}
        </p>
      )}
    </>
  )
}

// One block, several placements, and one heading over all of it now. The external links and the
// catalogue record used to print under two: "Read more elsewhere", then "The catalogue entry"
// wherever Record was not the only thing in the block. Consolidated on request — the record's own
// heading only ever repeated words the outer one had already said a few lines up, and splitting one
// further-reading list in two by KIND (an article, a taxonomic identifier) needed a reason nothing
// else on the page gave it. `Record` takes no heading prop any more; see the note there.
//
// On a group page's own objects it is a disclosure, closed by default. That is a deliberate
// exception to this app's own rule that nothing worth reading sits behind a tap — §6 puts the
// story inline precisely because "every tap between a visitor and the writing is where most of
// them stop". Further reading is not that: it is the thing you do afterwards, and §10's measured
// problem is that a group page is already 11.7 screen-heights and a nineteen-object page would be
// 38.4. An open block on every object would add most of a screen-height per object to the one page
// the spec already says is too long.
//
// On a group and on the collection it is open, because there is one of it per page — and that is
// the actual reason the group page's own objects collapse, not something inherent to an object's
// further reading as a category. The collection page's on-display object is also exactly one
// object, so it takes `collapsed={false}` from ObjectSection and gets the open treatment instead;
// see the note there.
function Elsewhere({ links = [], taxon = null, publishers, variant = 'group', collapsed = variant === 'object', className = '' }) {
  const [, tr] = useT()
  if (!links.length && !taxon) return null

  // The heading is a UI string like any other, so it carries the language it actually resolved to.
  // Until a pack has these keys it resolves to English, and an English heading left unmarked in an
  // Arabic page is right-aligned against text it does not belong to.
  const headingR = tr(links.length ? 'ui.elsewhere' : 'ui.record')

  // A flat run of paragraphs now, not a list wrapping a nested block: every link is its own <p>
  // (ExternalLink), and the record's own lines (also <p>) just follow on, both under whichever
  // heading is above — either is a valid place for a reader to stop, so nothing in the markup marks
  // a boundary between them beyond that.
  const body = (
    <>
      {links.map((l) => (
        <ExternalLink key={l.url} link={l} publishers={publishers} variant={variant} />
      ))}
      <Record taxon={taxon} />
    </>
  )

  if (collapsed) {
    // Ninety of the 128 objects have no further reading anyone could verify — the name resolves to
    // a record and no more. Labelling those "Read more elsewhere" promises an article and opens on
    // a taxonomic entry, so the summary says which of the two this actually is.
    return (
      <details className={`elsewhere is-${variant} ${className}`.trim()}>
        <summary className="elsewhere-summary" {...langAttrs(headingR)}>
          {headingR.text}
        </summary>
        {body}
      </details>
    )
  }

  return (
    <section className={`elsewhere is-${variant} ${className}`.trim()}>
      <h3 className="elsewhere-head" {...langAttrs(headingR)}>
        {headingR.text}
      </h3>
      {body}
    </section>
  )
}

// ------------------------------------------------------------------ media
// Only media near the viewport loads. Everything else is the baked-in placeholder.

function Media({ object, priority }) {
  const ref = useRef(null)
  const [near, setNear] = useState(priority)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (near || !ref.current) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '150% 0px' }
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [near])

  const xlarge = object.image?.xlarge
  const large = object.image?.large
  const src = xlarge?.url

  // Every well is the same width and takes its height from the photograph — see the note on .well
  // in styles.css. Known before the image loads, so nothing reflows and a QR arrival keeps its
  // scroll position.
  const aspect = object.aspect > 0 ? object.aspect : null

  return (
    <div className="well" ref={ref} style={aspect ? { '--aspect': aspect } : undefined}>
      <img className="well-blur" src={object.placeholder} alt="" aria-hidden="true" />
      {near && src && (
        <img
          className={`well-img${loaded ? ' is-loaded' : ''}`}
          src={src}
          // Only two derivatives exist, and at 2-3x DPR a phone wants the larger of them anyway.
          // This is worth having for the 1x case — a desktop or a cheap tablet takes the 545px
          // file instead of the 681px one.
          srcSet={large && xlarge ? `${large.url} ${large.width}w, ${xlarge.url} ${xlarge.width}w` : undefined}
          sizes="(min-width: 64rem) 40rem, 100vw"
          alt={object.description || object.title}
          width={xlarge.width}
          height={xlarge.height}
          decoding="async"
          // The object someone scanned a code to see is the LCP element on that route. Everything
          // else stays lazy — the anemone page transfers 296KB on arrival against 1,373KB scrolled.
          fetchPriority={priority ? 'high' : undefined}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  )
}

export { Translated, firstWords, Listen, Media, Elsewhere, ExternalLink }
