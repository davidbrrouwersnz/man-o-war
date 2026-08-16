// The collection page. In order: what this collection is, the one object a visitor can actually
// see, why it is made of glass, how it reached Christchurch — and then the other 127.
//
// THE ORDER IS THE ARGUMENT, so it is worth writing down why it is this one.
//
// A visitor holding this page is standing in front of exactly one object: 1884.137.33, the
// Portuguese man o' war, the single model out of 128 that is out of storage. Their question is not
// "what is in this collection" — they can see what is in front of them. It is "what am I looking
// at, what is it made of, and why is it in Christchurch?"
//
// This page used to answer that question in three places. The name and the story were a tap away
// on the group page; the two essays that answer the other two halves sat below 139 tiles. So the
// one visitor the app is built for had to navigate to assemble an answer that the app already had
// in full.
//
// Now the reading runs straight through: the collection, the object, how it was made, how it got
// here. Nothing new was written for it — the object is the same component the group page renders,
// reading the same story, and the essays are unchanged. What changed is that they are consecutive.
//
// The grids follow rather than lead, and that is the cost of this arrangement rather than a bonus:
// on a phone the collection now begins below the reading. It is the right trade for the visitor in
// the gallery and the wrong one for a visitor who came to browse, and at desktop it stops being a
// trade at all — the reading is one column and the grid is the other, both visible at once.

import { useEffect, useLayoutEffect, useState } from 'react'
import { BY_CODE, dirOf } from '../i18n.js'
import { langAttrs, useLang, useT } from '../lang.jsx'
import { Spoken, blocksOf, hasAudio } from '../audio.jsx'
import { GROUPS, PUBLISHERS, index, loadChunk } from '../collection.js'
import { ExternalLink, Listen, Translated } from '../components/reading.jsx'
import { ObjectSection, ObjectMedia, objectAudio } from './group.jsx'
import { Tools } from '../components/tools.jsx'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx'

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
    <section className="essay home-col" id={slug}>
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

    </section>
  )
}

// The essays' citations and the collection's own further reading — Cornell's collection, the
// Corning exhibition, Harvard's glass flowers — merged into one list under one heading, once, after
// both essays. They used to be two sections: "Sources" for the citations, then "Read more
// elsewhere" (the shared Elsewhere component, variant="collection") for everything else, right
// below it — one line of prose each, under two headings, with nothing on the page saying why a
// citation could not sit in the same list as an external link.
//
// Not built on Elsewhere itself: a citation has no publisher, no claim, no "why it's worth reading"
// — it is a URL and a line of already-formatted text, quoted as printed (§7) — so it renders as its
// own kind of paragraph rather than being forced through ExternalLink's shape. The collection's own
// further-reading links still go through ExternalLink below it, so they keep its tooltip and the
// shared .elsewhere-link underline; both kinds land on the same <p>-per-link shape.
//
// Citations are deduplicated on URL and kept in the order the essays declare them, so nothing is
// dropped: every source either essay cites is still cited, once.
function FurtherReading({ layers }) {
  const [, tr] = useT()
  const seen = new Set()
  const sources = []
  for (const meta of index.layers) {
    for (const s of layers.layers[meta.slug]?.sources ?? []) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      sources.push(s)
    }
  }
  const links = layers.elsewhere ?? []
  if (!sources.length && !links.length) return null
  const heading = tr('ui.elsewhere')
  return (
    <section className="elsewhere is-collection home-col">
      <h3 className="elsewhere-head" {...langAttrs(heading)}>
        {heading.text}
      </h3>
      {sources.map((s) => (
        <p key={s.url} className="elsewhere-title record-line" lang="en" dir="ltr">
          <a href={s.url} target="_blank" rel="noreferrer" className="elsewhere-link">
            {s.text}
          </a>
        </p>
      ))}
      {links.map((l) => (
        <ExternalLink key={l.url} link={l} publishers={PUBLISHERS} variant="collection" />
      ))}
    </section>
  )
}

function Home({ go, route }) {
  const [t, tr] = useT()
  const { code } = useLang()
  const langName = BY_CODE.get(code)?.endonym ?? 'English'
  const [layers, setLayers] = useState(null)
  const [all, setAll] = useState(null)
  const [display, setDisplay] = useState(null)
  // Which of the two grids is showing. Categories by default; an arrival on /all opens straight
  // onto the other one, which is what that URL is asking for.
  const [tab, setTab] = useState(() => (route?.at === 'all-objects' ? 'all' : 'categories'))

  // The document title follows whatever language is active, so it has no dependency list at all —
  // it is one assignment and it is correct on every render.
  useLayoutEffect(() => {
    document.title = `${t('ui.collectionTitle')} — Canterbury Museum`
  })

  // Scrolling to the top belongs to ARRIVING at this route, not to rendering it.
  //
  // These were one effect keyed on [t, route?.at], and `t` is rebuilt by useT() on every render, so
  // the list changed every time and the scroll ran every time. Every chunk that lands — the essays,
  // the object on display, the 128-tile grid — re-renders this page, so a visitor who started
  // reading in the first second was thrown back to the title, twice. Adding the object made it
  // three times and is how it was noticed.
  useLayoutEffect(() => {
    if (!route?.at) scrollTo(0, 0)
  }, [route?.at])

  // 62KB of tiles for 128 objects, and now nothing gates it behind a press except the tab itself:
  // fetched the moment that tab is open, whether that is a click or an arrival on /all — the same
  // treatment the object photographs get, so the front page still paints on the eleven category
  // tiles alone and §2's visitor on a museum connection does not pay for 128 of them unopened.
  useEffect(() => {
    if (tab !== 'all' || all) return
    loadChunk('all')?.then(setAll)
  }, [tab, all])

  // Back/forward can land route.at on 'all-objects' without remounting Home — both '/' and '/all'
  // are the same view — so the tab the URL asks for has to be re-applied on every arrival, not just
  // read once into the initial state above.
  useEffect(() => {
    if (route?.at === 'all-objects') setTab('all')
  }, [route?.at])

  // The essays are a chunk, fetched after the page is up rather than compiled into the bundle. The
  // front page is the one every visitor loads first and §2's visitor is on a museum connection —
  // the tiles must not wait on eleven thousand words of background reading.
  useEffect(() => {
    loadChunk('layers')?.then(setLayers)
  }, [])

  // The object on display. Its own 2KB chunk rather than the 10KB group it belongs to, and fetched
  // on mount rather than on scroll: it is the second thing on the page and the reason most visitors
  // opened it. See the note in scripts/split.mjs.
  useEffect(() => {
    loadChunk('on-display')?.then(setDisplay)
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
  // The object's narration is built by the group page's own objectAudio(), so pressing Listen here
  // plays exactly what pressing Listen on the object plays — the same files, the same order, the
  // same highlighting. §13 requires the spoken words to be the printed words, and the printed words
  // on this page are now that object's.
  const displayAudio = display ? objectAudio(display.object, tr, t) : null
  // Decidable from the intro alone, before the chunks arrive — every language pack that translates
  // the intro translates the essays too — so the button's presence never changes once the rest
  // lands, only whether it can be pressed.
  const introLang = intro.lang
  const homeAvailable = hasAudio(introLang) && (!displayAudio || displayAudio.available) && essayAudios.every((a) => a.available)
  const homeQueue = {
    key: 'home',
    title,
    // In printed order: the standfirst, the object, then both essays. The tour follows the page
    // rather than being listed beside it, so re-ordering the page re-orders the narration.
    items: [
      { id: 'home/00-intro', lang: introLang, label: title, blocks: [title, intro.text] },
      ...(displayAudio?.items ?? []),
      ...essayAudios.flatMap((a) => a.items),
    ],
  }
  return (
    <main className="home" id="main" tabIndex={-1}>
      <header className="home-head home-col">
        <Tools
          listen={
            <Listen
              queue={homeQueue}
              available={homeAvailable}
              pending={!layers || !display}
              note={code !== 'en' ? t('ui.audioEnglishOnly') : null}
            />
          }
        />
        <h1>
          <Spoken text={title} itemId="home/00-intro" block={0} />
        </h1>
        {/* "One is on display" used to link to the object below it, as an in-page anchor. Removed
            on request; the sentence is plain text now, in one run rather than three, since nothing
            inside it needs its own offset any more. */}
        <p lang={intro.lang} dir={dirOf(intro.lang)}>
          <Spoken text={intro.text} itemId="home/00-intro" block={1} />
        </p>
      </header>
      {/* THE READING COLUMN COMES FIRST IN THE DOM, and that is the change. It used to sit after
          the grids, which on a phone put 139 tiles between the collection's own standfirst and the
          only object a visitor can actually look at.

          The desktop layout is unaffected: both wrappers are placed by named grid areas, so which
          one is written first here decides the phone order and nothing else. `home-head` stays
          outside both, first, because the desktop grid moves it into the right-hand column with
          the reading. Same technique as the object page. */}
      <div className="home-read">
        {/* The object on display, rendered by the group page's own ObjectSection — the same words,
            translations, narration, further reading and catalogue record it has inside Floating
            colonies, because it is the same component reading the same data.

            `arrived` is false: nothing was scanned to get here. The highlighted border it would add
            belongs to the QR route, which still lands on the group page. `media` is false: the
            photograph itself is in its own section of the browsing column now, not here — see
            .browse-object below.
            `elsewhereCollapsed` is false: the group page collapses an object's further reading
            because there can be nineteen of them on one page; this page has exactly one, same as
            the collection's own further-reading block a few screens down, so it gets the same open
            treatment rather than the many-objects rule — see the note on ObjectSection. */}
        {display && (
          <div className="home-object home-col">
            <ObjectSection object={display.object} arrived={false} priority media={false} elsewhereCollapsed={false} />
          </div>
        )}

        {layers && (
          <div className="home-essays">
            {index.layers.map((meta) => {
              const l = layers.layers[meta.slug]
              if (!l) return null
              return <Essay key={meta.slug} slug={meta.slug} layer={l} meta={meta} code={code} langName={langName} />
            })}

            {/* What the reading is built on, and §6's external sources at the widest scale — not
                this animal or this group, but this collection: the other Blaschka collections, the
                scholarship on these objects, and what the two men did after they stopped making sea
                creatures. One list now, after both essays, because that is where a reader who has
                finished them is. */}
            <FurtherReading layers={layers} />
          </div>
        )}
      </div>

      <div className="home-browse">
        {/* The man o' war's photograph, on its own at the top of the browsing column — the first
            thing this column shows, above the categories it lets a visitor browse by eye. Its name
            and story stay in the reading column opposite; this is the same picture, not a second
            one, rendered by the group page's own ObjectMedia. */}
        {display && (
          <section className="browse browse-object" aria-labelledby="on-display-title">
            <h2 className="browse-title" id="on-display-title">
              {t('ui.onDisplay')}
            </h2>
            <div className="browse-object-media">
              <ObjectMedia object={display.object} priority />
            </div>
          </section>
        )}

        {/* Two ways into the same 128 objects. §9 kept the full grid as a secondary route rather
            than the front door — it rescues browsing by eye and the completionist — and a tab does
            that job better than a page: it is visible from the front rather than found, costs
            nothing until it is opened, and does not put 128 more tiles between a visitor and the
            eleven they are actually choosing between.

            id="all-objects" sits on the whole control rather than on either panel, because that is
            the one part of it that exists whichever tab is open — #all-objects is where /all lands,
            and that arrival also drives `tab` to 'all' above. */}
        <Tabs className="browse-tabs" id="all-objects" value={tab} onValueChange={setTab}>
          {/* The padding that used to sit on .browse-title lives on this plain wrapper instead of
              on TabsList itself — TabsList already carries its own Tailwind utilities for size and
              layout, in the same cascade layer as anything styles.css could set on it, so a rule
              written here would lose to those rather than add to them. */}
          <div className="browse-tablist">
            <TabsList
              variant="line"
              className="h-11 w-full justify-start gap-6 group-data-horizontal/tabs:h-11"
              aria-label={t('ui.browse')}
            >
              <TabsTrigger value="categories" className="h-[calc(100%-1px)] flex-none px-1 text-[length:var(--step-0)]">
                {t('ui.categories')}
              </TabsTrigger>
              <TabsTrigger value="all" className="h-[calc(100%-1px)] flex-none px-1 text-[length:var(--step-0)]">
                {t('ui.allObjects')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="categories" className="browse-panel">
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
          </TabsContent>

          <TabsContent value="all" className="browse-panel">
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
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

export { Home }
