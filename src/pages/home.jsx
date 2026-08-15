// The collection page: the eleven category tiles, then all 128 objects, then the two reading
// essays beside them.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BY_CODE, dirOf } from '../i18n.js'
import { langAttrs, useLang, useT } from '../lang.jsx'
import { Spoken, blocksOf, hasAudio } from '../audio.jsx'
import { GROUPS, index, loadChunk } from '../collection.js'
import { Listen, Translated } from '../components/reading.jsx'
import { Tools } from '../components/tools.jsx'

// 1884.137.33, the Portuguese man o' war. One object of the 128 is on display; this is it.
const ON_DISPLAY = '1884.137.33'

// ------------------------------------------------------------------ home

// Everything the audio needs to know about one essay, resolved once. Shared by the essay's own
// Listen control and by the collection page's, so that playing the whole page plays exactly what
// each essay would have played on its own — the same files, the same order, the same highlighting.
// Same arrangement as objectAudio() on the group page, and for the same reason: the tour is built
// out of the parts rather than beside them, so the two can never drift.
//
// `english` is the gate. The narration exists in English only, and offering it beside translated
// words would break the rule the pipeline is built on: that the spoken words ARE the printed words.
function essayAudio(slug, layer, meta, tr) {
  const titleR = tr(`layerTitles.${slug}`, null, meta.title)
  const standfirstR = tr(`layers.${slug}.standfirst`, null, layer.standfirst)
  // Keyed on the segment's own id, never its position — see the note in group.jsx. Array form
  // rather than a dot-string for the same reason it is used there: a path segment that carries an
  // authored identifier should never be interpolated into something that will later be split on a
  // dot, whatever that identifier happens to look like today.
  const parts = layer.segments.map((s) => ({
    s,
    heading: tr(['layers', slug, 'segments', s.id, 'heading'], null, s.heading),
    body: tr(['layers', slug, 'segments', s.id, 'text'], null, s.text),
  }))

  // Per-item language, as on the group page: a block plays in the language it is printed in, so a
  // partly-translated essay plays partly-translated narration rather than nothing at all.
  const items = [
    {
      id: `layers/${slug}/00-standfirst`,
      lang: titleR.lang === standfirstR.lang ? standfirstR.lang : 'en',
      label: titleR.text,
      blocks: [titleR.text, standfirstR.text],
    },
    ...parts.map((p) => ({
      id: `layers/${slug}/${p.s.id}`,
      lang: p.heading.lang === p.body.lang ? p.body.lang : 'en',
      label: p.heading.text,
      blocks: blocksOf(p.heading.text, p.body.text),
    })),
  ]

  const available = items.every((i) => hasAudio(i.lang))

  return { titleR, standfirstR, parts, available, items }
}

// One of the two reading essays. It was a page of its own until the content moved onto the
// collection page; what it keeps is its own heading, its sources and its own Listen control, for
// anyone who wants just this essay rather than the whole page.
//
// Heading levels shift with the move: on its own page the title was an h1, but here the collection
// title holds that, so the essay is an h2 and its sections are h3. A page with two h1s reads to a
// screen reader as two documents stapled together.
function Essay({ slug, layer, meta, code, langName }) {
  const [t, tr] = useT()
  const { titleR, standfirstR, parts, available, items } = essayAudio(slug, layer, meta, tr)

  const queue = { key: `l:${slug}`, title: titleR.text, items }

  return (
    <section className="essay" id={slug}>
      {/* The control sits beside the heading it plays, after it — not inside it. A button inside a
          heading contributes its own label to the heading's accessible name, so this essay would
          have been announced as "How it was made, Listen — How it was made". */}
      <div className="heading-row">
        <h2 className="essay-title" {...langAttrs(titleR)}>
          <Spoken text={titleR.text} itemId={`layers/${slug}/00-standfirst`} block={0} />
        </h2>
        <Listen queue={queue} available={available} compact />
      </div>
      <Translated className="group-panel" r={standfirstR} itemId={`layers/${slug}/00-standfirst`} block={1} />

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
  const [all, setAll] = useState(null)
  const allRef = useRef(null)

  useLayoutEffect(() => {
    document.title = `${t('ui.collectionTitle')} — Canterbury Museum`
    if (!route?.at) scrollTo(0, 0)
  }, [t, route?.at])

  // 62KB of tiles for 128 objects, and now nothing gates it behind a press. Fetched when the
  // second grid comes within a couple of screens instead — the same treatment the object
  // photographs get — so the front page still paints on the eleven category tiles alone and §2's
  // visitor on a museum connection does not pay for 128 of them before seeing anything.
  //
  // An arrival on /all skips the wait: the chunk is what that URL is asking for.
  useEffect(() => {
    if (all) return
    if (route?.at === 'all-objects') {
      loadChunk('all')?.then(setAll)
      return
    }
    const el = allRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        loadChunk('all')?.then(setAll)
      },
      { rootMargin: '200% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [all, route?.at])

  // The essays are a chunk, fetched after the page is up rather than compiled into the bundle. The
  // front page is the one every visitor loads first and §2's visitor is on a museum connection —
  // the tiles must not wait on eleven thousand words of background reading.
  useEffect(() => {
    loadChunk('layers')?.then(setLayers)
  }, [])

  // An arrival on /all or on an old /how-it-was-made link cannot scroll until whichever chunk it
  // points at has rendered, so this runs again as each one lands.
  useLayoutEffect(() => {
    if (!route?.at) return
    const el = document.getElementById(route.at)
    if (el) scrollTo({ top: el.offsetTop - 8, behavior: 'instant' })
  }, [route?.at, layers, all])

  const intro = tr('ui.collectionIntro')
  const title = t('ui.collectionTitle')
  // The one object of the 128 that is out of storage and in the gallery — the thing the QR code
  // beside it points at, and the reason this app exists.
  const onDisplay = t('ui.collectionIntroOnDisplay')
  const onDisplayAt = intro.text.indexOf(onDisplay)

  // The whole page as one sitting: the standfirst, then both essays in the order they are printed.
  // It plays exactly what each essay's own control plays, because both are built from the same
  // essayAudio() — the group pages work this way and this is the collection page's equivalent.
  //
  // Built from `layers`, so it cannot be complete until that chunk lands: a queue assembled before
  // the essays arrive would be the intro alone, and a visitor who pressed Listen in that first
  // moment would get a tour that stopped after one paragraph. So the control holds its place and
  // sits disabled until the essays are here, rather than appearing late and shoving the tabs and
  // the whole grid down the page. The essays are fetched on mount, so the wait is short and it is
  // the same wait the reading column is already going through.
  const essayAudios = layers
    ? index.layers.map((meta) => (layers.layers[meta.slug] ? essayAudio(meta.slug, layers.layers[meta.slug], meta, tr) : null)).filter(Boolean)
    : []
  // Decidable from the intro alone, before the chunk arrives — every language pack that translates
  // the intro translates the essays too — so the button's presence never changes once the essays
  // land, only whether it can be pressed.
  const introLang = intro.lang
  const homeAvailable = hasAudio(introLang) && essayAudios.every((a) => a.available)
  const homeQueue = {
    key: 'home',
    title,
    items: [
      { id: 'home/00-intro', lang: introLang, label: title, blocks: [title, intro.text] },
      ...essayAudios.flatMap((a) => a.items),
    ],
  }
  return (
    <main className="home" id="main" tabIndex={-1}>
      <header className="home-head">
        <Tools
          listen={
            <Listen
              queue={homeQueue}
              available={homeAvailable}
              pending={!layers}
              note={code !== 'en' ? t('ui.audioEnglishOnly') : null}
            />
          }
        />
        <h1>
          <Spoken text={title} itemId="home/00-intro" block={0} />
        </h1>
        {/* "One is on display" is the one sentence on this page that points at a real object, so it
            links to it. The phrase is a per-language key rather than a match on English, and it is
            looked up as a substring of the intro the visitor is actually reading — if a translation
            ever stops containing it, the paragraph renders unlinked instead of breaking.

            Split into three runs so the link can sit inside the sentence; each run carries its own
            offset into the block, which is what keeps the read-along highlight landing on the right
            word (see Spoken in audio.jsx). */}
        <p lang={intro.lang} dir={dirOf(intro.lang)}>
          {onDisplayAt < 0 ? (
            <Spoken text={intro.text} itemId="home/00-intro" block={1} />
          ) : (
            <>
              <Spoken text={intro.text.slice(0, onDisplayAt)} itemId="home/00-intro" block={1} />
              <a className="intro-link" href={`/o/${ON_DISPLAY}`} onClick={go(`/o/${ON_DISPLAY}`)}>
                <Spoken text={onDisplay} itemId="home/00-intro" block={1} offset={onDisplayAt} />
              </a>
              <Spoken
                text={intro.text.slice(onDisplayAt + onDisplay.length)}
                itemId="home/00-intro"
                block={1}
                offset={onDisplayAt + onDisplay.length}
              />
            </>
          )}
        </p>
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
        {/* Both grids, one after the other, rather than two tabs over one slot. Each is a section
            with its own heading, which is what makes them addressable — #all-objects is where /all
            now lands — and what lets a screen reader list them. h2 because the collection title
            above is the h1; the essays in the reading column are h2 as well. */}
        <section className="browse" aria-labelledby="categories-title">
          <h2 className="browse-title" id="categories-title">
            {t('ui.categories')}
          </h2>
          <ol className="grid">
            {GROUPS.map((g) => (
              <li key={g.slug} className="tile">
                <a href={`/g/${g.slug}`} onClick={go(`/g/${g.slug}`)}>
                  <div className="tile-well">
                    <img className="tile-blur" src={g.representative.placeholder} alt="" aria-hidden="true" />
                    <img className="tile-img" src={g.representative.url} alt="" loading="lazy" decoding="async" />
                  </div>
                  <div className="tile-text">
                    <h3 {...langAttrs(tr(`groups.${g.slug}`, null, g.title))}>{tr(`groups.${g.slug}`, null, g.title).text}</h3>
                    <p>
                      {g.size} {t('ui.models')}. {t('ui.aboutMinutes', { m: g.minutes })}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="browse" id="all-objects" aria-labelledby="all-objects-title" ref={allRef}>
          <h2 className="browse-title" id="all-objects-title">
            {t('ui.allObjects')}
          </h2>
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
                      <h3 className="tile-small">{o.name}</h3>
                    </div>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="loading loading-dark">{t('ui.loading')}</p>
          )}
        </section>
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
