import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import index from './data/chunks/index.json'

// One chunk per group, fetched only when that page is visited. The manifest used to be a single
// file compiled into the bundle, so every visitor downloaded all 128 objects — and 113KB of base64
// placeholders — to read a page of eight. What stays in the main bundle is this index: eleven
// titles, eleven representative images, the reading times, and the accession-to-group map that
// /o/{accession} needs in order to route at all.
const CHUNKS = import.meta.glob(['./data/chunks/*.json', '!./data/chunks/index.json'])
const loadChunk = (slug) => CHUNKS[`./data/chunks/${slug}.json`]?.().then((m) => m.default ?? m)

const GROUPS = index.groups
const BY_SLUG = new Map(GROUPS.map((g) => [g.slug, g]))

// ------------------------------------------------------------------ routing
// /                  the eleven group tiles
// /g/{slug}          a group page — rendering only
// /o/{accession}     canonical. Resolves to the group page, scrolled to that object.
// A fragment URL of the form /g/{slug}#{accession} is never produced.

function parse(pathname) {
  const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { view: 'home' }
  const g = path.match(/^\/g\/([^/]+)$/)
  if (g) return BY_SLUG.has(g[1]) ? { view: 'group', slug: g[1] } : { view: 'missing' }
  const o = path.match(/^\/o\/([^/]+)$/)
  if (o) {
    const slug = index.groupOf[o[1]]
    return slug ? { view: 'group', slug, arrivedAt: o[1] } : { view: 'missing', accession: o[1] }
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
        {GROUPS.map((g) => (
          <li key={g.slug} className="tile">
            <a href={`/g/${g.slug}`} onClick={go(`/g/${g.slug}`)}>
              <div className="tile-well">
                <img className="tile-blur" src={g.representative.placeholder} alt="" aria-hidden="true" />
                <img className="tile-img" src={g.representative.url} alt="" loading="lazy" decoding="async" />
              </div>
              <div className="tile-text">
                <h2>{g.title}</h2>
                <p>
                  {g.size} models. About {g.minutes} minutes.
                </p>
              </div>
            </a>
          </li>
        ))}
      </ol>
      <p className="foot">
        Prototype. Object count is what the collection record holds, not a published total — the published figures
        disagree. Times are computed at build time from the writing, at 150 words a minute, and are not asserted. Most
        object entries are drafts written from general natural history and are marked as such where they appear.
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

  const { story } = object
  const size = object.measurements[0]?.replace(/^Dimensions \(LxWxH\):\s*/i, '').trim()

  // §10 wants a plain-English headline with the catalogue string demoted beneath it. Where no
  // English name exists the headline falls back to the catalogue's own name, and the demoted line
  // would then repeat it word for word — so it is dropped rather than printed twice.
  const headline = story?.headline ?? object.name ?? object.title
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
          {story.drafted && (
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
  const [data, setData] = useState(null)

  useEffect(() => {
    let live = true
    setData(null)
    loadChunk(route.slug)?.then((d) => {
      if (live) setData(d)
    })
    return () => {
      live = false
    }
  }, [route.slug])

  // The scroll has to wait for the chunk: until the objects render there is nothing to scroll to.
  useLayoutEffect(() => {
    if (!group) return
    document.title = `${group.title} — the Blaschka collection`
    if (!data) return
    if (route.arrivedAt) {
      const el = registry.current.get(route.arrivedAt)
      if (el) scrollTo({ top: el.offsetTop - 8, behavior: 'instant' })
    } else {
      scrollTo(0, 0)
    }
  }, [group, data, route.arrivedAt, route.slug])

  // replaceState as the visitor scrolls, so the URL always names what is on screen.
  useEffect(() => {
    if (!group || !data) return
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
  }, [group, data])

  if (!group) return <Missing go={go} />

  const prev = GROUPS[group.order - 2]
  const next = GROUPS[group.order]

  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← Collection
      </a>
      <h1 className="group-title">{group.title}</h1>
      <p className="group-cost">
        {group.size} models. About {group.minutes} minutes.
      </p>

      {data ? (
        <>
          {data.panel && <p className="group-panel">{data.panel}</p>}

          {data.objects.map((o) => (
            <ObjectSection key={o.accession} object={o} arrived={o.accession === route.arrivedAt} registry={registry} />
          ))}

          {data.ending && <p className="group-ending">{data.ending}</p>}
        </>
      ) : (
        <p className="loading">Loading the objects…</p>
      )}

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
