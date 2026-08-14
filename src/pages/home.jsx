// The collection page: eleven group tiles, every object as a second tab, and the two reading
// essays below them.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BY_CODE, dirOf } from '../i18n.js'
import { langAttrs, useLang, useT } from '../lang.jsx'
import { Spoken, blocksOf } from '../audio.jsx'
import { GROUPS, index, loadChunk } from '../collection.js'
import { Listen, Translated } from '../components/reading.jsx'
import { Tools } from '../components/tools.jsx'

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
  const [tab, setTab] = useState(route?.tab === 'all' ? 'all' : 'groups')
  const [all, setAll] = useState(null)
  const tabsRef = useRef(null)

  useLayoutEffect(() => {
    document.title = `${t('ui.collectionTitle')} — Canterbury Museum`
    if (!route?.at) scrollTo(0, 0)
  }, [t, route?.at])

  // 62KB of tiles for 128 objects, fetched only if that tab is opened. It is by far the largest
  // chunk in the app and most visitors never ask for it.
  useEffect(() => {
    if (tab === 'all' && !all) loadChunk('all')?.then(setAll)
  }, [tab, all])

  // The visible tab is in the URL so the view can be linked and shared, but with replaceState —
  // flicking between two tabs is not navigation and should not fill up the back button.
  useEffect(() => {
    const href = tab === 'all' ? '/all' : '/'
    if (location.pathname !== href) history.replaceState(null, '', href)
  }, [tab])

  // Arrow keys move between tabs, which is what a tablist is expected to do and what a keyboard
  // user will try. Without it the only way across is Tab, Tab, and hope.
  const onTabKey = (e) => {
    const order = ['groups', 'all']
    const i = order.indexOf(tab)
    let next = null
    if (e.key === 'ArrowRight') next = order[(i + 1) % order.length]
    if (e.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length]
    if (e.key === 'Home') next = order[0]
    if (e.key === 'End') next = order[order.length - 1]
    if (!next) return
    e.preventDefault()
    setTab(next)
    tabsRef.current?.querySelector(`#tab-${next}`)?.focus()
  }

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
    <main className="home" id="main" tabIndex={-1}>
      <header className="home-head">
        <Tools />
        <h1>
          <Spoken text={title} itemId="home/00-intro" block={0} />
        </h1>
        <p lang={intro.lang} dir={dirOf(intro.lang)}>
          <Spoken text={intro.text} itemId="home/00-intro" block={1} />
        </p>
        <Listen queue={homeQueue} available={intro.lang === 'en'} />
      </header>
      {/* Two wrappers, and they exist for the desktop layout: browsing on the left, reading on the
          right. `home-head` deliberately stays outside both, first in the DOM, because that is what
          keeps the phone order intact — head, tabs, tiles, essays — while the desktop grid moves
          the head into the right-hand column. Same technique as the object page. */}
      <div className="home-browse">
        {/* Two ways into the same 128 objects. §9 kept the full grid as a secondary route rather
            than the front door — it rescues browsing by eye and the completionist — and a tab does
            that job better than a page: it is visible from the front rather than found, and it
            costs nothing until it is opened. */}
        <div className="tabs" role="tablist" aria-label={t('ui.collectionTitle')} ref={tabsRef} onKeyDown={onTabKey}>
          <button
            type="button"
            role="tab"
            id="tab-groups"
            aria-selected={tab === 'groups'}
            aria-controls="panel-groups"
            tabIndex={tab === 'groups' ? 0 : -1}
            className={tab === 'groups' ? 'is-current' : ''}
            onClick={() => setTab('groups')}
          >
            {t('ui.byGroup')}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-all"
            aria-selected={tab === 'all'}
            aria-controls="panel-all"
            tabIndex={tab === 'all' ? 0 : -1}
            className={tab === 'all' ? 'is-current' : ''}
            onClick={() => setTab('all')}
          >
            {t('ui.everyObject')}
          </button>
        </div>

        {tab === 'groups' ? (
          <div role="tabpanel" id="panel-groups" aria-labelledby="tab-groups">
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
          </div>
        ) : (
          <div role="tabpanel" id="panel-all" aria-labelledby="tab-all">
            {all ? (
              <ol className="grid grid-dense">
                {all.objects.map((o) => (
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
              <p className="loading loading-dark">{t('ui.loading')}</p>
            )}
          </div>
        )}
      </div>

      {/* The background reading. On a phone it sits below the grid, because the collection is what
          a visitor came for and this is what they read once something has caught them. At desktop
          it becomes the right-hand column beside the tiles. Light on dark either way: the grid is
          a dark field because 79 of the 128 photographs are objects on black, and long-form text
          does not belong on that ground. */}
      <div className="home-read">
        {layers && (
          <div className="home-essays">
            {index.layers.map((meta) => {
              const l = layers.layers[meta.slug]
              if (!l) return null
              return <Essay key={meta.slug} slug={meta.slug} layer={l} meta={meta} code={code} langName={langName} />
            })}
          </div>
        )}
      </div>
    </main>
  )
}

export { Home }
