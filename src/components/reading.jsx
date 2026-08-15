// The pieces every reading surface shares: a translated paragraph, the Listen control, and the
// media well.

import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  return (
    <p className={`object-listen${compact ? ' is-compact' : ''}`}>
      {/* shadcn's Button, in the app's own `quiet` variant at the `touch` size — see
          components/ui/button.jsx for why the museum's controls are variants there rather than
          rules in styles.css. The `listen` class is kept only as a hook for the few rules CSS still
          owns and for the scripts that measure this control. */}
      <Button
        variant="quiet"
        size={compact ? 'icon-touch' : 'touch'}
        className="listen"
        data-playing={playing ? 'true' : 'false'}
        onClick={() => audio.start(queue)}
        disabled={pending}
        aria-label={playing ? t('ui.listenStop') : `${t('ui.listen')} — ${queue.title}`}
      >
        {playing
          ? <PauseIcon aria-hidden="true" focusable="false" />
          : <PlayIcon aria-hidden="true" focusable="false" />}
        {/* The compact form is the icon alone. The name is not lost — it is on the button's
            aria-label either way, and that label is the more useful of the two, because it says
            what will play rather than just "Listen". */}
        {!compact && (playing ? t('ui.listenStop') : t('ui.listen'))}
      </Button>
      {/* No note beside a compact control: it is a sentence, and it cannot share a line with a
          44px circle tucked against a heading. Nothing is lost — the same fallback is already
          stated inline in the body of any passage that fell back to English. */}
      {note && !compact && <span className="listen-note">{note}</span>}
    </p>
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

export { Translated, firstWords, Listen, Media }
