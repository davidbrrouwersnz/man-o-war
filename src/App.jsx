import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import manifest from './data/manifest.json'
import groupData from './data/groups.json'
import storyData from './data/stories.json'
import nameData from './data/names.json'
import draftedData from './data/stories-drafted.json'

// Two provenances, deliberately in two files: stories.json is paraphrased from the Museum's own
// published writing; stories-drafted.json is written from third-party natural history and is
// unverified. The Museum's version wins where both exist.
const STORIES = { ...draftedData.stories, ...storyData.stories }
const DRAFTED = new Set(Object.keys(draftedData.stories))

const OBJECTS = new Map(manifest.objects.map((o) => [o.accession, o]))
const GROUPS = groupData.groups
const BY_SLUG = new Map(GROUPS.map((g) => [g.slug, g]))
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.accessions.map((a) => [a, g])))

// All eleven group pages render. They were stubbed while only one object had a story.

const WPM = 150
// §6 makes the man o' war's story the benchmark for a written layer-1–2 entry. An object with no
// story yet is costed at that length, because §9's number exists to tell a visitor what the page
// costs — and §6 commits every object to a real story. Costing the placeholder instead understates
// a 19-object page by a factor of six.
const BENCHMARK_WORDS = 231

const words = (s) => (s ? s.trim().split(/\s+/).length : 0)

function storyWords(accession) {
  const story = STORIES[accession]
  return story ? story.segments.reduce((t, s) => t + words(s.heading) + words(s.text), 0) : null
}

// Derived from the content, once, at module load — never a number anyone typed. Adding a story
// changes it automatically.
const READING = new Map(
  GROUPS.map((g) => {
    const p = storyData.panels[g.slug]
    // Every group has a drafted panel seed even where the final panel is unwritten.
    let total = words(p?.panel ?? g.panelSeed) + words(p?.ending)
    let written = 0
    for (const accession of g.accessions) {
      const n = storyWords(accession)
      if (n === null) {
        total += BENCHMARK_WORDS
      } else {
        total += n
        written++
      }
    }
    return [g.slug, { minutes: Math.max(1, Math.round(total / WPM)), written, size: g.accessions.length }]
  })
)

// ------------------------------------------------------------------ routing
// /                  the eleven group tiles
// /g/{slug}          a group page — rendering only
// /o/{accession}     canonical. Resolves to the group page, scrolled to that object.
// A fragment URL of the form /g/{slug}#{accession} is never produced.

function parse(pathname) {
  const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { view: 'home' }
  const g = path.match(/^\/g\/([^/]+)$/)
  if (g) return { view: 'group', slug: g[1] }
  const o = path.match(/^\/o\/([^/]+)$/)
  if (o) {
    const group = GROUP_OF.get(o[1])
    return group ? { view: 'group', slug: group.slug, arrivedAt: o[1] } : { view: 'missing', accession: o[1] }
  }
  return { view: 'missing' }
}

function useRoute() {
  const [route, setRoute] = useState(() => parse(location.pathname))
  useEffect(() => {
    const onPop = () => setRoute(parse(location.pathname))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  // pushState only on deliberate jumps. Scrolling uses replaceState and never touches history.
  const go = (href) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    history.pushState(null, '', href)
    setRoute(parse(href))
  }
  return [route, go]
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

  const src = object.image?.xlarge?.url
  return (
    <div className="well" ref={ref}>
      <img className="well-blur" src={object.placeholder} alt="" aria-hidden="true" />
      {near && src && (
        <img
          className={`well-img${loaded ? ' is-loaded' : ''}`}
          src={src}
          alt={object.description || object.title}
          width={object.image.xlarge.width}
          height={object.image.xlarge.height}
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ home

function Home({ go }) {
  useLayoutEffect(() => {
    document.title = 'The Blaschka collection — Canterbury Museum'
    scrollTo(0, 0)
  }, [])

  return (
    <main className="home">
      <header className="home-head">
        <h1>The Blaschka collection</h1>
        <p>
          Glass models of invertebrates, made by Leopold and Rudolf Blaschka in Dresden and acquired by Canterbury Museum
          in 1883. One is on display. The rest are in storage.
        </p>
      </header>
      <ol className="grid">
        {GROUPS.map((g) => {
          const rep = OBJECTS.get(g.representative)
          return (
            <li key={g.slug} className="tile">
              <a href={`/g/${g.slug}`} onClick={go(`/g/${g.slug}`)}>
                <div className="tile-well">
                  <img className="tile-blur" src={rep.placeholder} alt="" aria-hidden="true" />
                  <img className="tile-img" src={rep.image.large.url} alt="" loading="lazy" decoding="async" />
                </div>
                <div className="tile-text">
                  <h2>{g.title}</h2>
                  <p>
                    {g.size} models. About {READING.get(g.slug).minutes} minutes.
                  </p>
                </div>
              </a>
            </li>
          )
        })}
      </ol>
      <p className="foot">
        Prototype. Object count is what the collection record holds, not a published total — the published figures
        disagree. Times are computed from the writing at {WPM} words a minute and are not asserted; they move as the
        writing changes. Most object entries are drafts written from general natural history and are marked as such
        where they appear.
      </p>
    </main>
  )
}

// ------------------------------------------------------------------ group page

function ObjectSection({ object, arrived, registry }) {
  const ref = useRef(null)
  // Layout effect, not passive: child layout effects run before the parent's, so the registry is
  // populated by the time GroupPage tries to scroll to the arrived-at object.
  useLayoutEffect(() => {
    registry.current.set(object.accession, ref.current)
    return () => registry.current.delete(object.accession)
  }, [object.accession, registry])

  const story = STORIES[object.accession]
  const size = object.measurements[0]?.replace(/^Dimensions \(LxWxH\):\s*/i, '').trim()

  // §10 wants a plain-English headline with the catalogue string demoted beneath it. Where no
  // English name exists the headline falls back to the catalogue's own name, and the demoted line
  // would then repeat it word for word — so it is dropped rather than printed twice.
  const plainName = nameData.names[object.accession]?.name
  const headline = story?.headline ?? plainName ?? object.title
  const showCatalogue = headline !== object.title

  return (
    <article className={`object${arrived ? ' is-arrived' : ''}`} ref={ref} id={`obj-${object.accession}`}>
      {arrived && <p className="arrived-flag">The object you scanned</p>}
      <h2 className="object-name">{headline}</h2>
      {showCatalogue && <p className="object-catalogue">{object.catalogueName}</p>}

      <Media object={object} priority={arrived} />

      <p className="object-meta">
        {object.accession}
        {size && <> · {size}</>} · {object.rights ? object.rights : 'Canterbury Museum — rights not stated on this record'}
      </p>

      {story ? (
        <div className="story">
          {story.segments.map((s) => (
            <section key={s.id}>
              <h3>{s.heading}</h3>
              {s.text.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
          {story.identification && <p className="identification">{story.identification}</p>}
          {DRAFTED.has(object.accession) && (
            <p className="draft-flag">
              Draft, not yet checked. This entry was written from general natural history rather than from the Museum's
              own published writing, and no curator has reviewed it.
            </p>
          )}
        </div>
      ) : (
        <div className="story is-placeholder">
          <p className="placeholder-flag">No story written yet. Below is the catalogue record's own description.</p>
          <p className="catalogue-words">{object.description}</p>
        </div>
      )}
    </article>
  )
}

function GroupPage({ route, go }) {
  const group = BY_SLUG.get(route.slug)
  const registry = useRef(new Map())

  useLayoutEffect(() => {
    if (!group) return
    document.title = `${group.title} — the Blaschka collection`
    // Arriving at /o/{accession} scrolls to that object without animation.
    if (route.arrivedAt) {
      const el = registry.current.get(route.arrivedAt)
      if (el) scrollTo({ top: el.offsetTop - 8, behavior: 'instant' })
    } else {
      scrollTo(0, 0)
    }
  }, [group, route.arrivedAt, route.slug])

  // replaceState as the visitor scrolls, so the URL always names what is on screen.
  useEffect(() => {
    if (!group) return
    const onScroll = () => {
      // The URL names the object whose section actually holds the middle of the screen. While the
      // middle is still in the group's header or panel, nothing has been scrolled past yet and the
      // page is still the group.
      const mid = innerHeight / 2
      let href = `/g/${group.slug}`
      for (const [acc, el] of registry.current) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.top <= mid && r.bottom >= mid) {
          href = `/o/${acc}`
          break
        }
      }
      if (location.pathname !== href) history.replaceState(null, '', href)
    }
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => removeEventListener('scroll', onScroll)
  }, [group])

  if (!group) return <Missing go={go} />

  const panel = storyData.panels[group.slug]
  const prev = GROUPS[group.order - 2]
  const next = GROUPS[group.order]

  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← Collection
      </a>
      <h1 className="group-title">{group.title}</h1>
      <p className="group-cost">
        {group.size} models. About {READING.get(group.slug).minutes} minutes.
        {READING.get(group.slug).written < group.size && (
          <span className="cost-caveat">
            {' '}
            Costed as if every object were written; {group.size - READING.get(group.slug).written} of {group.size} are
            still placeholders.
          </span>
        )}
      </p>
      {panel && <p className="group-panel">{panel.panel}</p>}

      {group.accessions.map((acc) => (
        <ObjectSection key={acc} object={OBJECTS.get(acc)} arrived={acc === route.arrivedAt} registry={registry} />
      ))}

      {panel && <p className="group-ending">{panel.ending}</p>}

      <nav className="group-nav">
        {prev ? (
          <a href={`/g/${prev.slug}`} onClick={go(`/g/${prev.slug}`)}>
            ← {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a href={`/g/${next.slug}`} onClick={go(`/g/${next.slug}`)}>
            {next.title} →
          </a>
        )}
      </nav>
    </main>
  )
}

// ------------------------------------------------------------------ missing

function Missing({ route, go }) {
  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← Collection
      </a>
      <h1 className="group-title">Not found</h1>
      <p className="stub-note">
        {route?.accession
          ? `${route.accession} is not an accession number in this collection.`
          : 'That address does not exist.'}
      </p>
    </main>
  )
}

// ------------------------------------------------------------------ app

export default function App() {
  const [route, go] = useRoute()
  if (route.view === 'home') return <Home go={go} />
  if (route.view === 'group') return <GroupPage route={route} go={go} />
  return <Missing route={route} go={go} />
}
