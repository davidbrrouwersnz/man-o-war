// The pieces every reading surface shares: a translated paragraph, the Listen control, and the
// media well.

import { useEffect, useRef, useState } from 'react'
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
function Listen({ queue, available, note }) {
  const [t] = useT()
  const audio = useAudio()
  if (!available) return null
  const isThis = audio?.queue?.key === queue.key
  const playing = isThis && audio.playing
  return (
    <p className="object-listen">
      <button
        type="button"
        className={`listen${playing ? ' is-playing' : ''}`}
        onClick={() => audio.start(queue)}
        aria-label={playing ? t('ui.listenStop') : `${t('ui.listen')} — ${queue.title}`}
      >
        <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
        {playing ? t('ui.listenStop') : t('ui.listen')}
      </button>
      {note && <span className="listen-note">{note}</span>}
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
