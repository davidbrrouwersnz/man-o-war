// A group page: the panel, every object in the group inline, and an ending in words (§10).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { BY_CODE } from '../i18n.js'
import { langAttrs, useLang, useT } from '../lang.jsx'
import { Spoken, blocksOf, hasAudio } from '../audio.jsx'
import { BY_SLUG, GROUPS, PUBLISHERS, loadChunk } from '../collection.js'
import { Elsewhere, Listen, Media, Translated } from '../components/reading.jsx'
import { Tools } from '../components/tools.jsx'
import { Missing } from './missing.jsx'

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

  // The identification note is no longer shown or spoken. It sat under fourteen objects and read as
  // a hedge — "The Museum's page gives this as Physalia physalis. The collection record says
  // Physalia pelagica." The text is still in src/data/stories*.json; scripts/split.mjs strips it out
  // of the chunks so the payload does not carry words nobody reads.
  //
  // Removed from the audio in the same change, deliberately. §13's rule is that the spoken words
  // ARE the printed words, word for word — so a narration segment whose text is not on the page is
  // the one thing that pipeline exists to prevent.

  // §10 wants a plain-English headline with the catalogue string demoted beneath it. Where no name
  // exists the headline falls back to the catalogue's own name, and the demoted line would then
  // repeat it word for word — so it is dropped rather than printed twice.
  const showCatalogue = headlineR.text !== object.title && headlineR.text !== catalogueR.text

  // Keyed on the segment's own id, never its position. A translated pack is a map of overrides onto
  // the English, so a language that has three of an object's five segments gets those three and
  // falls back for the rest — and re-ordering or inserting an English segment can never silently
  // pair one language's heading with another's body.
  const parts = (story?.segments ?? []).map((s) => ({
    s,
    heading: tr([...base, 'segments', s.id, 'heading'], null, s.heading),
    body: tr([...base, 'segments', s.id, 'text'], null, s.text),
  }))

  // Each item is voiced in the language its own text resolved to, not the one the visitor picked.
  // A German page whose third segment fell back to English plays the English file there, which is
  // right: §13 requires the spoken words to be the printed words, and the printed words are English
  // at that point. `available` then asks the only question that matters — is there narration for
  // every language this page actually ended up rendering in?
  const items = [
    {
      id: `${object.accession}/00-title`,
      lang: headlineR.lang,
      label: headlineR.text,
      blocks: showCatalogue ? [headlineR.text, catalogueR.text] : [headlineR.text],
    },
    // No entry for the accession/size/rights line. It is printed right there on the page, so a
    // screen reader reads it on request — narrating it adds nothing for the visitor who wants it
    // and is noise for everyone else. See the note in scripts/audio.mjs.
    ...parts.map((p) => ({
      id: `${object.accession}/${p.s.id}`,
      // Heading and body are one file, so a segment is only voiced in the translation when both
      // halves are translated — the same rule scripts/audio.mjs applies when deciding what to make.
      lang: p.heading.lang === p.body.lang ? p.body.lang : 'en',
      label: p.heading.text,
      blocks: blocksOf(p.heading.text, p.body.text),
    })),
  ]

  const available = items.every((i) => hasAudio(i.lang))

  return { headlineR, catalogueR, showCatalogue, parts, available, items }
}

// The photograph and its credit line, on their own. Split out of ObjectSection so the collection
// page can place the man o' war's picture in its own section of the browsing column while its name
// and story stay in the reading column — the same figure and caption either way, computed once.
function ObjectMedia({ object, priority }) {
  const [t] = useT()
  const size = object.measurements[0]?.replace(/^Dimensions \(LxWxH\):\s*/i, '').trim()
  const rights = object.rights ? object.rights : t('ui.rightsUnstated')
  const metaLine = [object.accession, size, rights].filter(Boolean).join(' · ')
  return (
    <figure className="object-media">
      <Media object={object} priority={priority} />
      <figcaption className="object-meta">{metaLine}</figcaption>
    </figure>
  )
}

// One object, rendered whole: name, photograph, story, further reading and the catalogue record.
//
// Exported because the collection page renders the object on display with it. That is the point of
// sharing the component rather than writing a second one — the man o' war on the front page is the
// same words, the same translations, the same narration and the same further reading as the man o'
// war inside Floating colonies, because it IS the same component reading the same data. A copy
// would have started identical and drifted the first time either was edited.
//
// `registry` is the group page's scroll map and is optional: the collection page has one object and
// nothing to scroll to.
// `priority` defaults to `arrived`, which is the group page's rule: the object someone scanned a
// code to see is the LCP element on that route and everything else stays lazy. The collection page
// overrides it — nothing was scanned there, but the object is the first photograph on the page and
// is above the fold on a phone, so it is that page's LCP element instead.
// `media` is false when the caller is placing the photograph elsewhere itself (the collection page,
// in its own section of the browsing column) — everything else about the object still renders here.
// `elsewhereCollapsed` defaults to true, which is the group page's rule: many objects on one page,
// so each one's further reading starts closed (see the note on Elsewhere in reading.jsx). The
// collection page's on-display object is the one place there is exactly one object on the whole
// page, same as the group and collection further-reading blocks that are already open by default —
// so it passes false and gets the same open treatment they get, instead of the many-objects rule.
function ObjectSection({ object, arrived, registry, priority = arrived, media = true, elsewhereCollapsed = true }) {
  const ref = useRef(null)
  const [t, tr] = useT()
  const { code } = useLang()
  const langName = BY_CODE.get(code)?.endonym ?? 'English'
  // Layout effect, not passive: child layout effects run before the parent's, so the registry is
  // populated by the time GroupPage tries to scroll to the arrived-at object.
  useLayoutEffect(() => {
    if (!registry) return
    registry.current.set(object.accession, ref.current)
    return () => registry.current.delete(object.accession)
  }, [object.accession, registry])

  const { story } = object

  const { headlineR, catalogueR, showCatalogue, parts, available, items } = objectAudio(object, tr, t)
  const queue = { key: `o:${object.accession}`, title: headlineR.text, items }

  return (
    <article className={`object${arrived ? ' is-arrived' : ''}`} ref={ref} id={`obj-${object.accession}`}>
      {/* Three wrappers, and they exist for the desktop layout in §10 — media holding position
          while its text scrolls beside it. Grid areas do the moving, so the DOM keeps the order a
          phone needs: name, then the photograph, then the story. That order is load-bearing on the
          QR route, where the point is to see the name and the object within a few seconds. */}
      <div className="object-head">
        <div className="heading-row">
        {/* §7: lang and dir follow what is actually rendered, on the element itself. An
            untranslated headline is English inside whatever page language is active; a translated
            one carries its own language. The binomial inside object.catalogueName is marked in CSS
            via .binomial where authored, so a screen reader does not read Latin with the
            surrounding phonetics. */}
          <h2 className="object-name" {...langAttrs(headlineR)}>
            <Spoken text={headlineR.text} itemId={`${object.accession}/00-title`} block={0} />
          </h2>
          <Listen queue={queue} available={available} compact />
        </div>
        {showCatalogue && (
          <p className="object-catalogue" {...langAttrs(catalogueR)}>
            <Spoken text={catalogueR.text} itemId={`${object.accession}/00-title`} block={1} />
          </p>
        )}
      </div>

      {/* A photograph and the line that credits it are a figure and its caption — see ObjectMedia
          above. Omitted when the caller is rendering it elsewhere. */}
      {media && <ObjectMedia object={object} priority={priority} />}

      <div className="object-body">
      {story ? (
        <div className="story">
          {parts.map(({ s, heading, body }) => {
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
        </div>
      ) : (
        <div className="story is-placeholder">
          <p className="placeholder-flag">{t('ui.noStory')}</p>
          <p className="catalogue-words" lang="en" dir="ltr">
            {object.description}
          </p>
        </div>
      )}
      {/* §6's external sources, at the object scale: where to read about this animal, and the
          taxonomic record behind the name at the top of this section. Not narrated — §13 requires
          the spoken words to be the printed words, and none of this is in the audio index. */}
      <Elsewhere links={object.elsewhere} taxon={object.taxon} publishers={PUBLISHERS} variant="object" collapsed={elsewhereCollapsed} />
      </div>
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

  // Built from the objects themselves rather than from a separate list, so the tour can never
  // drift out of step with what is on the page.
  const objectAudios = (data?.objects ?? []).map((o) => objectAudio(o, tr, t))
  // The panel is one file carrying the group title and the panel text, so it is only voiced in the
  // translation when both are translated.
  const panelLang = title.lang === panelR.lang ? panelR.lang : 'en'
  const tourAvailable = !!data && hasAudio(panelLang) && objectAudios.every((a) => a.available)
  const tourQueue = {
    key: `g:${group.slug}`,
    title: title.text,
    items: [
      ...(data?.panel ? [{ id: `groups/${group.slug}/00-panel`, lang: panelLang, label: title.text, blocks: [title.text, panelR.text] }] : []),
      ...objectAudios.flatMap((a) => a.items),
    ],
  }

  return (
    <main className="reading" id="main" tabIndex={-1}>
      <div className="page-top">
        <a className="back" href="/" onClick={go('/')}>
          <ArrowLeftIcon aria-hidden="true" focusable="false" /> {t('ui.backToCollection')}
        </a>
        <Tools
          listen={
            <Listen queue={tourQueue} available={tourAvailable} note={code !== 'en' ? t('ui.audioEnglishOnly') : null} />
          }
        />
      </div>
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
          {data.objects.map((o) => (
            <ObjectSection key={o.accession} object={o} arrived={o.accession === route.arrivedAt} registry={registry} />
          ))}

          {/* The group's own further reading, after every object and before the page turns. Open
              rather than behind a disclosure: there is one of these per page, not one per object. */}
          <Elsewhere links={data.elsewhere} publishers={PUBLISHERS} variant="group" />
        </>
      ) : (
        <p className="loading">Loading the objects…</p>
      )}

      <nav className="group-nav">
        {prev ? (
          <a href={`/g/${prev.slug}`} onClick={go(`/g/${prev.slug}`)}>
            <ArrowLeftIcon aria-hidden="true" focusable="false" /> {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a href={`/g/${next.slug}`} onClick={go(`/g/${next.slug}`)}>
            {next.title} <ArrowRightIcon aria-hidden="true" focusable="false" />
          </a>
        )}
      </nav>
    </main>
  )
}

export { GroupPage, ObjectSection, ObjectMedia, objectAudio }
