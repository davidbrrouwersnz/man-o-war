import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import index from './data/chunks/index.json'
import englishPack from './data/i18n/en.json'
import { BY_CODE, LANGUAGES, detect, dirOf, remember, resolve } from './i18n.js'
import { AudioBar, AudioProvider, Spoken, blocksOf, useAudio } from './audio.jsx'

// One chunk per group, fetched only when that page is visited. The manifest used to be a single
// file compiled into the bundle, so every visitor downloaded all 128 objects — and 113KB of base64
// placeholders — to read a page of eight. What stays in the main bundle is this index: eleven
// titles, eleven representative images, the reading times, and the accession-to-group map that
// /o/{accession} needs in order to route at all.
const CHUNKS = import.meta.glob(['./data/chunks/*.json', '!./data/chunks/index.json'])
const loadChunk = (slug) => CHUNKS[`./data/chunks/${slug}.json`]?.().then((m) => m.default ?? m)

const GROUPS = index.groups
const BY_SLUG = new Map(GROUPS.map((g) => [g.slug, g]))
const SUPPORTED = LANGUAGES.filter((l) => l.code === 'en' || index.languages.includes(l.code))

// ------------------------------------------------------------------ language
// §7. English is compiled in because it is the terminal fallback and must be present before any
// resolution runs. Every other pack is a chunk fetched when its language is selected.

const Lang = createContext({ code: 'en', pack: englishPack, setCode: () => {} })
const useLang = () => useContext(Lang)

// t() returns the string. tr() returns the string AND the language it is actually in, for the
// places that must carry lang/dir on the element itself.
function useT() {
  const { pack } = useLang()
  // englishOverride is for content that lives in a data chunk rather than in en.json — a group
  // panel, say. The English is already loaded; only the translation needs resolving.
  const tr = (path, vars, englishOverride) => {
    // path may be a dot-string ("ui.language") or an array of keys — arrays are required wherever
    // a key can itself contain a dot, which every accession number does (i18n.js explains why).
    const keys = Array.isArray(path) ? path : path.split('.')
    const fromEn = keys.reduce((o, k) => (o == null ? undefined : o[k]), englishPack)
    const r = resolve(pack, keys, englishOverride ?? fromEn ?? keys.join('.'))
    const text = vars ? r.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`) : r.text
    return { ...r, text }
  }
  return [(path, vars) => tr(path, vars).text, tr]
}

// §7: lang and dir follow what is actually rendered. These two put that on the element itself,
// so an English fallback inside an Arabic page is an LTR block carrying lang="en".
const langAttrs = (r) => ({ lang: r.lang, dir: dirOf(r.lang) })

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

// §7: the fallback must be visible, never silent. A Somali speaker who gets an English story with
// no explanation reasonably concludes the app has no Somali in it — when the orientation around
// them is Somali. One quiet line, and the block carries lang="en" so a screen reader does not read
// English words with Somali phonetics.
function Fallback({ children, lang, className }) {
  const { code } = useLang()
  const [t] = useT()
  const fellBack = lang === 'en' && code !== 'en'
  if (!fellBack) return <div className={className}>{children}</div>
  return (
    <div className={className}>
      <p className="fallback-notice">{t('ui.fallbackNotice', { language: BY_CODE.get(code)?.endonym ?? code })}</p>
      <div lang="en" dir="ltr">
        {children}
      </div>
    </div>
  )
}

function LanguagePicker() {
  const { code, setCode } = useLang()
  const [t] = useT()
  return (
    <label className="lang-picker">
      <span className="lang-label">{t('ui.language')}</span>
      <select value={code} onChange={(e) => setCode(e.target.value)}>
        {SUPPORTED.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.endonym}
          </option>
        ))}
      </select>
    </label>
  )
}

// ------------------------------------------------------------------ routing
// /                  the eleven group tiles
// /g/{slug}          a group page — rendering only
// /o/{accession}     canonical. Resolves to the group page, scrolled to that object.
// A fragment URL of the form /g/{slug}#{accession} is never produced.

function parse(pathname) {
  const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { view: 'home' }
  if (path === '/all') return { view: 'all' }
  if (path === '/search') return { view: 'search' }
  // The two reading essays used to be pages of their own. They now sit on the collection page, but
  // the old paths still resolve — a printed QR code or a shared link lands on the section rather
  // than on a dead end.
  const layer = index.layers.find((l) => path === `/${l.slug}`)
  if (layer) return { view: 'home', at: layer.slug }
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

// One of the two reading essays. It was a page of its own until the content moved onto the
// collection page; what it keeps is its own heading, its sources and its own Listen control,
// because each essay is a separate sitting rather than part of one continuous tour.
//
// Heading levels shift with the move: on its own page the title was an h1, but here the collection
// title holds that, so the essay is an h2 and its sections are h3. A page with two h1s reads to a
// screen reader as two documents stapled together.
function Essay({ slug, layer, meta, code, langName }) {
  const [t, tr] = useT()
  const titleR = tr(`layerTitles.${slug}`, null, meta.title)
  const standfirstR = tr(`layers.${slug}.standfirst`, null, layer.standfirst)
  const parts = layer.segments.map((s, si) => ({
    s,
    si,
    heading: tr(`layers.${slug}.segments.${si}.heading`, null, s.heading),
    body: tr(`layers.${slug}.segments.${si}.text`, null, s.text),
  }))

  const available =
    titleR.lang === 'en' &&
    standfirstR.lang === 'en' &&
    parts.every((p) => p.heading.lang === 'en' && p.body.lang === 'en')

  const queue = {
    key: `l:${slug}`,
    title: titleR.text,
    items: [
      { id: `layers/${slug}/00-standfirst`, label: titleR.text, blocks: [titleR.text, standfirstR.text] },
      ...parts.map((p) => ({
        id: `layers/${slug}/${p.s.id}`,
        label: p.heading.text,
        blocks: blocksOf(p.heading.text, p.body.text),
      })),
    ],
  }

  return (
    <section className="essay" id={slug}>
      <h2 className="essay-title" {...langAttrs(titleR)}>
        <Spoken text={titleR.text} itemId={`layers/${slug}/00-standfirst`} block={0} />
      </h2>
      <Translated className="group-panel" r={standfirstR} itemId={`layers/${slug}/00-standfirst`} block={1} />
      <Listen queue={queue} available={available} note={code !== 'en' ? t('ui.audioEnglishOnly') : null} />

      {parts.map(({ s, heading, body }) => {
        const itemId = `layers/${slug}/${s.id}`
        const blocks = blocksOf(heading.text, body.text)
        return (
          <section key={s.id} className="layer-section">
            <h3 {...langAttrs(heading)}>
              <Spoken text={heading.text} itemId={itemId} block={0} />
            </h3>
            <div {...langAttrs(body)}>
              {body.fellBack && code !== 'en' && (
                <p className="fallback-notice">{t('ui.fallbackNotice', { language: langName })}</p>
              )}
              {body.text.split('\n\n').map((p, i) => (
                <p key={i}>
                  <Spoken text={p} itemId={itemId} block={blocks.indexOf(p.trim())} />
                </p>
              ))}
            </div>
          </section>
        )
      })}

      <div className="layer-sources">
        <h3>{t('ui.sources')}</h3>
        <ul>
          {layer.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Home({ go, route }) {
  const [t, tr] = useT()
  const { code } = useLang()
  const langName = BY_CODE.get(code)?.endonym ?? 'English'
  const [layers, setLayers] = useState(null)

  useLayoutEffect(() => {
    document.title = `${t('ui.collectionTitle')} — Canterbury Museum`
    if (!route?.at) scrollTo(0, 0)
  }, [t, route?.at])

  // The essays are a chunk, fetched after the page is up rather than compiled into the bundle. The
  // front page is the one every visitor loads first and §2's visitor is on a museum connection —
  // the tiles must not wait on eleven thousand words of background reading.
  useEffect(() => {
    loadChunk('layers')?.then(setLayers)
  }, [])

  // An arrival on an old /how-it-was-made link cannot scroll until the chunk it points at exists.
  useLayoutEffect(() => {
    if (!route?.at || !layers) return
    const el = document.getElementById(route.at)
    if (el) scrollTo({ top: el.offsetTop - 8, behavior: 'instant' })
  }, [route?.at, layers])

  const intro = tr('ui.collectionIntro')
  const title = t('ui.collectionTitle')
  const homeQueue = {
    key: 'home',
    title,
    items: [{ id: 'home/00-intro', label: title, blocks: [title, intro.text] }],
  }
  return (
    <main className="home">
      <header className="home-head">
        <LanguagePicker />
        <h1>
          <Spoken text={title} itemId="home/00-intro" block={0} />
        </h1>
        <p lang={intro.lang} dir={dirOf(intro.lang)}>
          <Spoken text={intro.text} itemId="home/00-intro" block={1} />
        </p>
        <Listen queue={homeQueue} available={intro.lang === 'en'} />
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
                <h2 {...langAttrs(tr(`groups.${g.slug}`, null, g.title))}>{tr(`groups.${g.slug}`, null, g.title).text}</h2>
                <p>
                  {g.size} {t('ui.models')}. {t('ui.aboutMinutes', { m: g.minutes })}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ol>
      {/* The background reading, on the collection page rather than on pages of its own. It sits
          below the grid because the collection is what a visitor came for; this is what they read
          once something has caught them. Light on dark: the grid is a dark well because 79 of the
          128 images are objects on black, and long-form text does not belong on that ground. */}
      {layers && (
        <div className="home-essays">
          {index.layers.map((meta) => {
            const l = layers.layers[meta.slug]
            if (!l) return null
            return <Essay key={meta.slug} slug={meta.slug} layer={l} meta={meta} code={code} langName={langName} />
          })}
        </div>
      )}

      <nav className="home-secondary">
        <a href="/all" onClick={go('/all')}>
          {t('ui.everyObject')} →
        </a>
        <a href="/search" onClick={go('/search')}>
          {t('ui.search')} →
        </a>
      </nav>
    </main>
  )
}

// ------------------------------------------------------------------ group page

// Everything the audio needs to know about one object, resolved once. Shared by the object's own
// Listen control and by the group page's, so that playing a whole group plays exactly what each
// object would have played on its own — the same files, the same order, the same highlighting.
//
// `english` is the gate. The narration exists in English only, and offering it beside translated
// words would break the rule the pipeline is built on: that the spoken words ARE the printed ones.
// A visitor reading an untranslated object inside a Samoan session still gets it, because what
// they are looking at IS the English.
function objectAudio(object, tr, t) {
  const story = object.story
  // Array form, not a dot-string: the accession itself contains dots ("1884.137.33"), which a
  // naive split('.') would shred into bogus path segments — see src/i18n.js.
  const base = ['stories', object.accession]
  const headlineR = tr([...base, 'headline'], null, story?.headline ?? object.name ?? object.title)
  const catalogueR = tr([...base, 'catalogueName'], null, object.catalogueName)
  const identificationR = story?.identification ? tr([...base, 'identification'], null, story.identification) : null

  // §10 wants a plain-English headline with the catalogue string demoted beneath it. Where no name
  // exists the headline falls back to the catalogue's own name, and the demoted line would then
  // repeat it word for word — so it is dropped rather than printed twice.
  const showCatalogue = headlineR.text !== object.title && headlineR.text !== catalogueR.text

  const parts = (story?.segments ?? []).map((s, si) => ({
    s,
    si,
    heading: tr([...base, 'segments', si, 'heading'], null, s.heading),
    body: tr([...base, 'segments', si, 'text'], null, s.text),
  }))

  const english =
    headlineR.lang === 'en' &&
    (!identificationR || identificationR.lang === 'en') &&
    parts.every((p) => p.heading.lang === 'en' && p.body.lang === 'en')

  const items = [
    {
      id: `${object.accession}/00-title`,
      label: headlineR.text,
      blocks: showCatalogue ? [headlineR.text, catalogueR.text] : [headlineR.text],
    },
    // No entry for the accession/size/rights line. It is printed right there on the page, so a
    // screen reader reads it on request — narrating it adds nothing for the visitor who wants it
    // and is noise for everyone else. See the note in scripts/audio.mjs.
    ...parts.map((p) => ({
      id: `${object.accession}/${p.s.id}`,
      label: p.heading.text,
      blocks: blocksOf(p.heading.text, p.body.text),
    })),
    ...(identificationR
      ? [{ id: `${object.accession}/99-identification`, label: t('ui.audioIdentification'), blocks: [identificationR.text] }]
      : []),
  ]

  return { headlineR, catalogueR, identificationR, showCatalogue, parts, english, items }
}

function ObjectSection({ object, arrived, registry }) {
  const ref = useRef(null)
  const [t, tr] = useT()
  const { code } = useLang()
  const langName = BY_CODE.get(code)?.endonym ?? 'English'
  // Layout effect, not passive: child layout effects run before the parent's, so the registry is
  // populated by the time GroupPage tries to scroll to the arrived-at object.
  useLayoutEffect(() => {
    registry.current.set(object.accession, ref.current)
    return () => registry.current.delete(object.accession)
  }, [object.accession, registry])

  const { story } = object
  const size = object.measurements[0]?.replace(/^Dimensions \(LxWxH\):\s*/i, '').trim()

  const { headlineR, catalogueR, identificationR, showCatalogue, parts, english, items } = objectAudio(object, tr, t)
  const rights = object.rights ? object.rights : t('ui.rightsUnstated')
  const metaLine = [object.accession, size, rights].filter(Boolean).join(' · ')
  const queue = { key: `o:${object.accession}`, title: headlineR.text, items }

  return (
    <article className={`object${arrived ? ' is-arrived' : ''}`} ref={ref} id={`obj-${object.accession}`}>
      {arrived && <p className="arrived-flag">{t('ui.scanned')}</p>}
      {/* §7: lang and dir follow what is actually rendered, on the element itself. An untranslated
          headline is English inside whatever page language is active; a translated one carries its
          own language. The binomial inside object.catalogueName is marked in CSS via .binomial
          where authored, so a screen reader does not read Latin with the surrounding phonetics. */}
      <h2 className="object-name" {...langAttrs(headlineR)}>
        <Spoken text={headlineR.text} itemId={`${object.accession}/00-title`} block={0} />
      </h2>
      {showCatalogue && (
        <p className="object-catalogue" {...langAttrs(catalogueR)}>
          <Spoken text={catalogueR.text} itemId={`${object.accession}/00-title`} block={1} />
        </p>
      )}

      <Media object={object} priority={arrived} />

      <p className="object-meta">{metaLine}</p>

      <Listen queue={queue} available={english} note={code !== 'en' ? t('ui.audioEnglishOnly') : null} />

      {story ? (
        <div className="story">
          {parts.map(({ s, si, heading, body }) => {
            const itemId = `${object.accession}/${s.id}`
            const blocks = blocksOf(heading.text, body.text)
            return (
              <section key={s.id}>
                <h3 {...langAttrs(heading)}>
                  <Spoken text={heading.text} itemId={itemId} block={0} />
                </h3>
                <div {...langAttrs(body)}>
                  {body.fellBack && code !== 'en' && (
                    <p className="fallback-notice">{t('ui.fallbackNotice', { language: langName })}</p>
                  )}
                  {body.text.split('\n\n').map((p, i) => (
                    // block 0 is the heading, so the paragraphs start at 1 - the same order
                    // scripts/audio.mjs used when it generated the cues.
                    <p key={i}>
                      <Spoken text={p} itemId={itemId} block={blocks.indexOf(p.trim())} />
                    </p>
                  ))}
                </div>
              </section>
            )
          })}
          {identificationR && (
            <p className="identification" {...langAttrs(identificationR)}>
              <Spoken text={identificationR.text} itemId={`${object.accession}/99-identification`} block={0} />
            </p>
          )}
        </div>
      ) : (
        <div className="story is-placeholder">
          <p className="placeholder-flag">{t('ui.noStory')}</p>
          <p className="catalogue-words" lang="en" dir="ltr">
            {object.description}
          </p>
        </div>
      )}
    </article>
  )
}

function GroupPage({ route, go }) {
  const [t, tr] = useT()
  const { code } = useLang()
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
  const title = tr(`groups.${group.slug}`, null, group.title)
  const panelR = tr(`panels.${group.slug}.panel`, null, data?.panel ?? '')
  const endingR = tr(`panels.${group.slug}.ending`, null, data?.ending ?? '')

  // Built from the objects themselves rather than from a separate list, so the tour can never
  // drift out of step with what is on the page.
  const objectAudios = (data?.objects ?? []).map((o) => objectAudio(o, tr, t))
  const tourAvailable =
    !!data && title.lang === 'en' && panelR.lang === 'en' && objectAudios.every((a) => a.english)
  const tourQueue = {
    key: `g:${group.slug}`,
    title: title.text,
    items: [
      ...(data?.panel ? [{ id: `groups/${group.slug}/00-panel`, label: title.text, blocks: [title.text, panelR.text] }] : []),
      ...objectAudios.flatMap((a) => a.items),
      ...(data?.ending
        ? [{ id: `groups/${group.slug}/99-ending`, label: firstWords(endingR.text), blocks: [endingR.text] }]
        : []),
    ],
  }

  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← {t('ui.backToCollection')}
      </a>
      <h1 className="group-title" {...langAttrs(title)}>
        <Spoken text={title.text} itemId={`groups/${group.slug}/00-panel`} block={0} />
      </h1>
      <p className="group-cost">
        {group.size} {t('ui.models')}. {t('ui.aboutMinutes', { m: group.minutes })}
      </p>

      {data ? (
        <>
          {data.panel && (
            <Translated
              className="group-panel"
              r={panelR}
              itemId={`groups/${group.slug}/00-panel`}
              block={1}
            />
          )}

          {/* The whole page as one sitting: the panel, then every object in order, then the
              closing line. It plays exactly what each object's own control plays, so a visitor can
              start the tour and stop caring about the interface — which is the point of an audio
              guide in a gallery. Individual objects keep their own control for anyone who wants
              just the thing in front of them. */}
          <Listen queue={tourQueue} available={tourAvailable} note={code !== 'en' ? t('ui.audioEnglishOnly') : null} />

          {data.objects.map((o) => (
            <ObjectSection key={o.accession} object={o} arrived={o.accession === route.arrivedAt} registry={registry} />
          ))}

          {data.ending && (
            <Translated className="group-ending" r={endingR} itemId={`groups/${group.slug}/99-ending`} />
          )}

          {/* §10: the reading essays are reached from the end of a group page, as named
              continuations — not repeated under every object, and never a generic "more". They now
              live on the collection page, so these links land there scrolled to the essay. The
              paths are unchanged, which is why nothing printed or shared has to be reissued. */}
          <nav className="continuations">
            {index.layers.map((l) => (
              <a key={l.slug} href={`/${l.slug}`} onClick={go(`/${l.slug}`)}>
                {tr(`layerTitles.${l.slug}`, null, l.title).text}
              </a>
            ))}
          </nav>
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

// ------------------------------------------------------------------ everything, and finding things

// §9 keeps the full grid as a secondary route rather than the front door: it rescues browsing by eye
// and the completionist, and it costs one page. Its chunk is only fetched when someone asks for it.
function AllPage({ go }) {
  const [t] = useT()
  const [data, setData] = useState(null)
  useEffect(() => {
    document.title = 'Every object — the Blaschka collection'
    scrollTo(0, 0)
    loadChunk('all')?.then(setData)
  }, [])

  return (
    <main className="home">
      <header className="home-head">
        <a className="back back-dark" href="/" onClick={go('/')}>
          ← {t('ui.backToCollection')}
        </a>
        <h1>Every object</h1>
        <p>
          All {data ? data.objects.length : ''} models, in reading order. This is the view the eleven pages replaced —
          kept because nothing else lets you choose by eye.
        </p>
      </header>
      {data ? (
        <ol className="grid grid-dense">
          {data.objects.map((o) => (
            <li key={o.accession} className="tile">
              <a href={`/o/${o.accession}`} onClick={go(`/o/${o.accession}`)}>
                <div className="tile-well">
                  <img className="tile-blur" src={o.placeholder} alt="" aria-hidden="true" />
                  <img className="tile-img" src={o.url} alt="" loading="lazy" decoding="async" />
                </div>
                <div className="tile-text">
                  <h2 className="tile-small">{o.name}</h2>
                  <p>{o.accession}</p>
                </div>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="loading loading-dark">Loading every object…</p>
      )}
    </main>
  )
}

// §6: grouping by appearance spreads Cnidaria across four pages and Mollusca across three, so there
// is no page for "all the jellyfish-type things". The spec says that has to be bought back with
// search that works across pages, and budgeted as part of accepting the grouping.
function SearchPage({ go }) {
  const [t] = useT()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    document.title = 'Search — the Blaschka collection'
    scrollTo(0, 0)
    loadChunk('search')?.then(setData)
  }, [])

  const term = q.trim().toLowerCase()
  const hits = !term
    ? []
    : (data?.objects ?? []).filter(
        (o) =>
          o.accession.toLowerCase().includes(term) ||
          (o.name && o.name.toLowerCase().includes(term)) ||
          o.title.toLowerCase().includes(term) ||
          o.group.toLowerCase().includes(term)
      )

  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← {t('ui.backToCollection')}
      </a>
      <h1 className="group-title">Search</h1>
      <p className="group-cost">
        Across all eleven pages. Try a name, a scientific name, or an accession number.
      </p>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="jellyfish, Physalia, 1884.137.33"
        autoFocus
        aria-label="Search the collection"
      />
      {term && (
        <p className="search-count">
          {hits.length === 0 ? 'Nothing matches that.' : `${hits.length} of ${data.objects.length}`}
        </p>
      )}
      <ol className="search-results">
        {hits.map((o) => (
          <li key={o.accession}>
            <a href={`/o/${o.accession}`} onClick={go(`/o/${o.accession}`)}>
              <strong>{o.name ?? o.title}</strong>
              {o.name && <span className="search-latin">{o.title}</span>}
              <span className="search-where">
                {o.accession} · {o.group}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </main>
  )
}

// ------------------------------------------------------------------ missing

function Missing({ route, go }) {
  const [t] = useT()
  return (
    <main className="reading">
      <a className="back" href="/" onClick={go('/')}>
        ← {t('ui.backToCollection')}
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
      {/* §13: the narration plays across navigation, so the player sits above the router. Moving
          it inside a page would unmount and silence it every time someone opened another object. */}
      <AudioProvider>
        <Routes />
        <AudioBar />
      </AudioProvider>
    </Lang.Provider>
  )
}

function Routes() {
  const [route, go] = useRoute()
  if (route.view === 'home') return <Home go={go} route={route} />
  if (route.view === 'group') return <GroupPage route={route} go={go} />
  if (route.view === 'all') return <AllPage go={go} />
  if (route.view === 'search') return <SearchPage go={go} />
  return <Missing route={route} go={go} />
}
