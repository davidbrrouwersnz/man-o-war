import React, { useEffect, useRef, useState } from 'react'
import Panzoom from '@panzoom/panzoom'
import fallback from './data/fallback.json'
import './styles.css'

// The API endpoint for this one object. Fired once per session (BUILD-SPEC.md §3).
const OBJECT_URL =
  '/api/v3/opacobjects?query=accession_no%3A%221884.137.33%22&limit=1&view=detail'

// opacObjectFieldSets is an array of { identifier, opacObjectFields }, so we look a
// field up by its identifier rather than reaching for a property directly.
const field = (rec, id) =>
  rec.opacObjectFieldSets.find((f) => f.identifier === id)?.opacObjectFields?.[0]?.value ?? null

// Canvas image: first image in the array, XLARGE derivative (BUILD-SPEC.md §3).
const image = (rec) => {
  const xl = rec.imagesCollection?.images?.[0]?.imageDerivatives
    ?.find((d) => d.identifier === 'XLARGE')
  return xl ? { url: xl.url, width: +xl.width, height: +xl.height } : null
}

// Badge text is bound to the current canvas mode (BUILD-SPEC.md §7).
const BADGES = {
  1: 'Canterbury Museum 1884.137.33 · CC BY-NC 4.0',
  2: 'Generated video, from Canterbury Museum photographs',
  3: 'Generated 3D model, from Canterbury Museum photographs · not a scan',
}

// The eight narrative sections of docs/man-o-war-object-story.md (BUILD-SPEC.md §8a).
// Section 7's second paragraph carries the one amendment: the Press quote is attributed
// in-line, because the Press was never consulted directly.
const STORY = [
  { h: 'Look closely', p: [
    "This is a Portuguese man o' war, made of glass. It stands about 28 centimetres tall. Two long tentacles hang from it, and seven shorter ones. The whole model rests on a green wire rod.",
    "In New Zealand waters this animal is better known as the bluebottle. Its other name comes from its resemblance to an 18th-century Portuguese sailing warship.",
  ] },
  { h: 'Not one animal', p: [
    "A man o' war is related to true jellyfish. But it isn't one, and it isn't a single creature either.",
    "It's a colonial organism, made up of many individual organisms called zooids. Zooids stay connected as they grow. Each has its own specialised job. None can survive alone.",
  ] },
  { h: 'A float, and a sail', p: [
    "The top section works as two things at once: a float, and a sail. Man o' wars travel on the currents and the wind.",
    "And they're either left- or right-handed, depending on which way that sail curves.",
    "The tentacles below can reach ten metres. They catch small crustaceans and fish.",
  ] },
  { h: 'Why glass?', p: [
    "Preserving fluid strips a soft, see-through animal of almost all its natural colour. Soft-bodied sea creatures like this one couldn't be dried, or skinned, or preserved convincingly. They were a gap in museum displays.",
    "In Dresden, in Germany, a glassworker named Leopold Blaschka and his son Rudolf crafted a glass-working method that accurately captured the forms of creatures from the natural world. Their models were excellent teaching and research tools. Each one was also a piece of art.",
  ] },
  { h: 'A father and son', p: [
    "Leopold had a passion for natural history and practical skill in glassworking. His family business made ornaments, laboratory equipment and glass eyes, and natural history models started as a hobby.",
    "Then the sailing ship he was travelling on was becalmed — stopped, with no wind for its sails. It gave him time to observe and sketch marine life.",
    "Prince Camille de Rohan ordered a hundred glass orchids. The director of the Dresden Natural History Museum saw them, and ordered twelve sea anemones, creatures he'd found impossible to display.",
    "By 1878 the Blaschkas' catalogue listed 630 different models. Later there were more than 700.",
  ] },
  { h: 'How it was made', p: [
    "The technique is flameworking. Glass melted and bent with hand tools, at low temperatures. In places, worked into layers thinner than an eggshell.",
    "Colour was added three ways: painted on, enamelled, or built in using coloured glass from the start.",
    "They worked from descriptions and illustrations sent by scientists, and from living animals. Anton Dohrn shipped live invertebrates from Naples to Dresden so the Blaschkas could see them for themselves.",
  ] },
  { h: 'Arriving in Christchurch', p: [
    "Julius von Haast, this Museum's founding director, placed his order in 1882. The models reached Christchurch in October 1883.",
    <>
      The Press reviewed the shipment that month, and singled this one out. The man o' war,
      it wrote, "resembles nature so closely as to be deceptive". <em>(Quoted in Le Grice.)</em>
    </>,
  ] },
  { h: "Where it's been since", p: [
    "The models first went on show in the Technological Room, as industrial art applied to science. By 1895 that room had been dismantled, and they'd been moved in among the zoological displays.",
    "In the Museum's catalogue today, this one is filed under European Decorative Arts.",
  ] },
]

// Source badges at the foot of the text sheet — destinations only (BUILD-SPEC.md §8a).
const SOURCES = [
  { label: 'Collection record 1884.137.33',
    href: 'https://collection.canterburymuseum.com/objects/glass-model-invertebrate-physalia-pelagica' },
  { label: 'Le Grice, The Blaschka Collection',
    href: 'https://www.canterburymuseum.com/explore/collections/the-blaschka-collection' },
  { label: 'Shaw et al. 2017, Records of the Canterbury Museum 31',
    href: 'https://cms.canterburymuseum.com/assets/Canterbury-Museum-Records-2017.pdf' },
]

// Quiz — displayed in source order, never shuffled (BUILD-SPEC.md §8b).
const QUIZ = [
  { q: "A Portuguese man o' war looks like a single animal. What is it really?",
    a: ["One very large jellyfish",
        "A kind of floating seaweed",
        "A colony of many small animals living as one",
        "A young octopus"], correct: 2 },
  { q: "Why couldn't the Museum display a real man o' war?",
    a: ["They are too rare to catch",
        "They are too big for a display case",
        "Preserving one strips away almost all its colour",
        "They were protected by law in the 1800s"], correct: 2 },
  { q: "Every man o' war is either left-handed or right-handed. What decides which?",
    a: ["The way its sail curves",
        "Which tentacle grew first",
        "The ocean it was born in",
        "Which way it spins in the water"], correct: 0 },
]
const QUIZ_HOLD_MS = 1800 // reveal-and-hold before advancing (§8b)

/* ---- Inline SVG icons (no icon dependency, BUILD-SPEC.md §4) ---- */
const IconImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" />
    <path d="M21 16l-5-5-9 9" />
  </svg>
)
const IconVideo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)
const IconCube = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l9 5v10l-9 5-9-5V7z" />
    <path d="M3.3 7L12 12l8.7-5" />
    <path d="M12 12v10" />
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)
const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// Text sheet: the eight story sections, then the three live source badges (§8a).
function TextSheet() {
  return (
    <article className="story">
      {STORY.map((s, i) => (
        <section key={i}>
          <h2>{s.h}</h2>
          {s.p.map((para, j) => <p key={j}>{para}</p>)}
        </section>
      ))}
      <footer className="sources">
        <span className="sources-label">Sources</span>
        <div className="sources-row">
          {SOURCES.map((src) => (
            <a key={src.href} className="source-badge" href={src.href}
               target="_blank" rel="noopener noreferrer">
              {src.label}
            </a>
          ))}
        </div>
      </footer>
    </article>
  )
}

// Quiz sheet: one question at a time; on selection all options lock, the chosen one is
// marked and the correct one highlighted at the same moment, then it advances (§8b).
function QuizSheet({ index, answers, complete, onAnswer, onClose }) {
  if (complete) {
    const score = answers.filter((a, i) => a === QUIZ[i].correct).length
    return (
      <div className="quiz-results">
        <p className="quiz-score">{score} of {QUIZ.length}</p>
        <button className="quiz-close-btn" onClick={onClose}>Close</button>
      </div>
    )
  }
  const q = QUIZ[index]
  const chosen = answers[index]
  const answered = chosen !== undefined
  return (
    <div className="quiz">
      <h2 className="quiz-q">{q.q}</h2>
      <ul className="quiz-options">
        {q.a.map((opt, oi) => {
          const isCorrect = oi === q.correct
          const isChosen = oi === chosen
          let cls = 'quiz-option'
          if (answered) {
            cls += ' locked'
            if (isCorrect) cls += ' correct'
            else if (isChosen) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <li key={oi}>
              <button className={cls} disabled={answered} onClick={() => onAnswer(oi)}>
                <span className="quiz-option-text">{opt}</span>
                {answered && isCorrect && <span className="quiz-mark" aria-hidden="true">✓</span>}
                {answered && isChosen && !isCorrect && <span className="quiz-mark" aria-hidden="true">✗</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function App() {
  const [rec, setRec] = useState(null)
  const [canvasMode, setCanvasMode] = useState(1) // 1 image | 2 video | 3 model
  const [sheet, setSheet] = useState(null) // null | 'text' | 'quiz'
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [eager, setEager] = useState(false) // heavy assets start after the image loads
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState([]) // chosen option index per question
  const [quizComplete, setQuizComplete] = useState(false)
  const audioRef = useRef(null)
  const imgRef = useRef(null)
  const videoRef = useRef(null)
  const eagerRef = useRef(false)

  // One fetch per session (BUILD-SPEC.md §3). Falls back to the committed fixture.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(OBJECT_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const record = json.opacObjects?.[0]
        if (!record) throw new Error('no opacObjects in response')
        console.log('[man-o-war] title from network:', field(record, 'name'))
        setRec(record)
      } catch (err) {
        console.warn('[man-o-war] live fetch failed, using src/data/fallback.json —', err.message)
        setRec(fallback.opacObjects[0])
      }
    }
    load()
  }, [])

  const imageUrl = rec ? image(rec)?.url : null

  // Pan and zoom on the XLARGE image, capped at 2.5× (BUILD-SPEC.md §5). The image is
  // fill-cropped via CSS; contain:'outside' keeps it covering with no letterbox gaps.
  useEffect(() => {
    if (!imageUrl || !imgRef.current) return
    const el = imgRef.current
    const pz = Panzoom(el, {
      minScale: 1,
      maxScale: 2.5,
      contain: 'outside',
      cursor: 'grab',
    })
    const viewport = el.parentElement
    const onWheel = (e) => pz.zoomWithWheel(e)
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      pz.destroy()
    }
  }, [imageUrl])

  // Mode 2 video (BUILD-SPEC.md §5): autoplay on every entry, pause on exit. currentTime
  // persists because the element is never unmounted, so play() resumes where it left off.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (canvasMode === 2) {
      v.muted = true // property, not just the attribute — required for autoplay
      v.play().catch(() => {}) // muted playback is allowed without a gesture
    } else {
      v.pause() // otherwise it keeps playing under the other canvases
    }
  }, [canvasMode])

  // Tap toggles play/pause while in the video mode (§5).
  const toggleVideo = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  // Once the image has loaded (or failed), start pulling the two heavy files so the
  // visitor never waits at a mode switch (BUILD-SPEC.md §5).
  const startEager = () => {
    if (eagerRef.current) return
    eagerRef.current = true
    setEager(true) // hands the GLB its src (model-viewer begins loading)
    fetch('/man-o-war.mp4').catch(() => {}) // warm the video cache; quiet if absent
  }

  // Leaving the quiz from its results screen resets it; leaving mid-quiz keeps progress
  // and the score, so reopening resumes the same question (BUILD-SPEC.md §8b).
  const resetQuiz = () => { setQuizIndex(0); setQuizAnswers([]); setQuizComplete(false) }
  const leaveQuiz = () => { if (sheet === 'quiz' && quizComplete) resetQuiz() }
  const openSheet = (which) => { leaveQuiz(); setSheet(which) }
  const closeSheet = () => { leaveQuiz(); setSheet(null) }

  const answerQuiz = (choice) => {
    if (quizAnswers[quizIndex] !== undefined) return // already answered — locked
    const next = quizAnswers.slice()
    next[quizIndex] = choice
    setQuizAnswers(next)
  }

  // After a question is answered, hold the reveal, then advance (or finish). Gated on the
  // quiz sheet being open, so closing mid-hold pauses; reopening re-shows and re-arms.
  useEffect(() => {
    if (sheet !== 'quiz' || quizComplete) return
    if (quizAnswers[quizIndex] === undefined) return
    const t = setTimeout(() => {
      if (quizIndex < QUIZ.length - 1) setQuizIndex(quizIndex + 1)
      else setQuizComplete(true)
    }, QUIZ_HOLD_MS)
    return () => clearTimeout(t)
  }, [sheet, quizAnswers, quizIndex, quizComplete])

  // Escape closes the open sheet (BUILD-SPEC.md §8).
  useEffect(() => {
    if (!sheet) return
    const onKey = (e) => { if (e.key === 'Escape') closeSheet() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, quizComplete])

  const toggleAudio = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play()
        .then(() => setAudioPlaying(true))
        .catch((err) => {
          console.warn('[man-o-war] audio guide unavailable —', err.message)
          setAudioPlaying(false)
        })
    } else {
      el.pause()
      setAudioPlaying(false)
    }
  }

  const title = rec ? field(rec, 'name') : 'Loading…'
  const desc = rec ? (field(rec, 'brief_desc') || '').replace(/ {2,}/g, ' ') : ''

  return (
    <div className="app">
      {/* Canvas layer — all three modes stay mounted, hidden via visibility so the
          element keeps its size. model-viewer re-frames its camera if it collapses to
          0×0 (as display:none does), which would break camera persistence (§5, §10). */}
      <div className="canvas-layer">
        <div className="canvas-mode" style={{ visibility: canvasMode === 1 ? 'visible' : 'hidden' }}>
          <div className="pz-viewport">
            {imageUrl && (
              <img
                ref={imgRef}
                className="pz-image"
                src={imageUrl}
                alt={title}
                draggable="false"
                onLoad={startEager}
                onError={startEager}
              />
            )}
          </div>
        </div>
        <div className="canvas-mode" style={{ visibility: canvasMode === 2 ? 'visible' : 'hidden' }}>
          <video
            ref={videoRef}
            className="video-el"
            src="/man-o-war.mp4"
            muted
            loop
            playsInline
            preload="auto"
            onClick={toggleVideo}
          />
        </div>
        <div className="canvas-mode" style={{ visibility: canvasMode === 3 ? 'visible' : 'hidden' }}>
          <model-viewer
            src={eager ? '/man-o-war.glb' : undefined}
            loading="eager"
            camera-controls
            touch-action="none"
            class="viewer"
            interaction-prompt="none"
          ></model-viewer>
        </div>
      </div>

      {/* Header: title + desktop-only description */}
      <header className="header">
        <h1 className="title">{title}</h1>
        {desc && <p className="desc">{desc}</p>}
      </header>

      {/* Top-right controls: audio, text, quiz (§4 order) */}
      <div className="controls">
        <button className="btn" onClick={toggleAudio}
                aria-label={audioPlaying ? 'Pause audio guide' : 'Play audio guide'}
                aria-pressed={audioPlaying}>
          {audioPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button className={`btn${sheet === 'text' ? ' active' : ''}`}
                onClick={() => openSheet('text')} aria-label="Read the story">
          <span className="btn-label">Aa</span>
        </button>
        <button className={`btn${sheet === 'quiz' ? ' active' : ''}`}
                onClick={() => openSheet('quiz')} aria-label="Take the quiz">
          <span className="btn-label">?</span>
        </button>
      </div>

      {/* Left tab rail: image, video, 3D (§4) */}
      <nav className="rail" aria-label="Canvas mode">
        <button className={`btn${canvasMode === 1 ? ' active' : ''}`}
                onClick={() => setCanvasMode(1)} aria-label="Image" aria-pressed={canvasMode === 1}>
          <IconImage />
        </button>
        <button className={`btn${canvasMode === 2 ? ' active' : ''}`}
                onClick={() => setCanvasMode(2)} aria-label="Video" aria-pressed={canvasMode === 2}>
          <IconVideo />
        </button>
        <button className={`btn${canvasMode === 3 ? ' active' : ''}`}
                onClick={() => setCanvasMode(3)} aria-label="3D model" aria-pressed={canvasMode === 3}>
          <IconCube />
        </button>
      </nav>

      {/* Attribution badge, bound to canvas mode (§7) */}
      <div className="badge">{BADGES[canvasMode]}</div>

      {/* Sheet — empty for step 1; slides from the right (§8) */}
      {sheet && (
        <>
          <div className="backdrop" onClick={closeSheet} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-label={sheet}>
            <button className="sheet-close" onClick={closeSheet} aria-label="Close">
              <IconClose />
            </button>
            <div className="sheet-scroll">
              {sheet === 'text' && <TextSheet />}
              {sheet === 'quiz' && (
                <QuizSheet
                  index={quizIndex}
                  answers={quizAnswers}
                  complete={quizComplete}
                  onAnswer={answerQuiz}
                  onClose={closeSheet}
                />
              )}
            </div>
          </aside>
        </>
      )}

      {/* Audio guide — always mounted so it plays across modes and sheets (§6).
          Wired now; fails quietly if the file is not yet present. */}
      <audio ref={audioRef} src="/audio-guide.mp3" preload="none"
             onEnded={() => setAudioPlaying(false)}
             onError={() => setAudioPlaying(false)} />
    </div>
  )
}
