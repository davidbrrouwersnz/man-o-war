// A group page: the panel, every object in the group inline, and an ending in words (§10).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { BY_CODE } from '../i18n.js'
import { langAttrs, useLang, useT } from '../lang.jsx'
import { Spoken, blocksOf, hasAudio } from '../audio.jsx'
import { BY_SLUG, GROUPS, PUBLISHERS, loadChunk } from '../collection.js'
import { Elsewhere, Listen, Media, Translated } from '../components/reading.jsx'
import { Tools } from '../components/tools.jsx'
import { useTier } from '../tier.jsx'
import { Missing } from './missing.jsx'

// ------------------------------------------------------------------ group page

// Everything the audio needs to know about one object, resolved once. Shared by the object's own
// Listen control and by the group page's, so that playing a whole group plays exactly what each
// object would have played on its own — the same files, the same order, the same highlighting.
//
// Voiced-in-this-language is the gate, asked per segment. Each item plays in the language its own
// text resolved to (§13: the spoken words ARE the printed ones), so each is offered only if THAT
// language voices THAT segment — which is what lets German's one-object pilot play without
// offering the 127 German objects that have no files. A visitor reading an untranslated object
// inside a Samoan session still gets it, because what they are looking at IS the English.
// `tier` is the story tier the visitor asked for. 'short' swaps in the object's short telling
// (src/data/stories-short.json, shipped on the object as `short`) wherever one has been written;
// where none has, the full story renders silently — every object now has a short telling, and
// the inline fallback disclaimer was removed on request (2026-08-17). Everything downstream —
// parts, items, availability — is the same code operating on whichever segment array won, which
// is what keeps the two tiers from drifting.
function objectAudio(object, tr, t, tier = 'full') {
  const story = object.story
  const shortMode = tier === 'short' && Array.isArray(object.short) && object.short.length > 0
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
  // Short segment ids live in the same pack path as the full ones (their ids are namespaced
  // `short*` — see scripts/units.mjs), so the same lookup serves both tiers.
  const segs = shortMode ? object.short : story?.segments ?? []
  const parts = segs.map((s) => ({
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
      // The heading is no longer printed or spoken — it survives only as this item's label, the
      // chapter name in the audio bar. The narration is the body alone, so the item's language is
      // the body's resolved language.
      lang: p.body.lang,
      label: p.heading.text,
      blocks: blocksOf(null, p.body.text),
    })),
  ]

  const available = items.every((i) => hasAudio(i.lang, i.id))

  return { headlineR, catalogueR, showCatalogue, parts, available, items, shortMode }
}

// The photograph and its credit line, on their own. Split out of ObjectSection so the collection
// page can place the man o' war's picture in its own section of the browsing column while its name
// and story stay in the reading column — the same figure and caption either way, computed once.
// `named` prepends the object's plain-English headline to the caption. Off by default: on a group
// page the photograph sits directly under the object's own h2, and repeating the name one line
// apart reads as a stutter. The collection page turns it on — there the photograph is a section of
// its own, columns away from the story that names it.
function ObjectMedia({ object, priority, named = false }) {
  const [t, tr] = useT()
  // The record reads "Dimensions (LxWxH): whole: 70 x 60 x 280mm" — field prefix, then a part
  // label, then the numbers. The caption wants only the numbers: everything after the last colon,
  // with the separators set properly. All 128 records follow this shape (three field-prefix
  // variants, three part-label families), so slicing at the last colon is data-driven, not tuned
  // to one object.
  const size = object.measurements[0]
    ?.slice(object.measurements[0].lastIndexOf(':') + 1)
    .trim()
    .replace(/(\d)\s*x\s*(?=\d)/gi, '$1 × ')
    .replace(/(\d)\s*mm\b/i, '$1 mm')
  const rights = object.rights ? object.rights : t('ui.rightsUnstated')
  const headline = named
    ? tr(['stories', object.accession, 'headline'], null, object.story?.headline ?? object.name)
    : null
  const metaLine = [headline?.text, object.accession, size, rights].filter(Boolean).join(' · ')
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
// Further reading is always open now and renders only where links exist — see Elsewhere in
// reading.jsx — so the old per-caller collapsed flag is gone.
function ObjectSection({ object, arrived, registry, priority = arrived, media = true }) {
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

  const { tier } = useTier()
  const { headlineR, catalogueR, showCatalogue, parts, available, items, shortMode } = objectAudio(object, tr, t, tier)
  // The key carries the tier when the short telling is rendered, for the same reason a queue stops
  // on a tier switch: the two tiers are different words, and a key that named only the object
  // would let a restarted queue toggle a stale one.
  const queue = { key: shortMode ? `o:${object.accession}:short` : `o:${object.accession}`, title: headlineR.text, items }

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
          {/* No printed section headings. They used to be h3 eyebrows here; removed on request so
              a story reads as continuous guide prose under the object's name. The heading text
              lives on as the audio bar's chapter label (see objectAudio) — it is no longer printed
              OR spoken, which is what keeps §13's word-for-word rule intact. */}
          {parts.map(({ s, body }) => {
            const itemId = `${object.accession}/${s.id}`
            const blocks = blocksOf(null, body.text)
            return (
              <section key={s.id}>
                <div {...langAttrs(body)}>
                  {body.fellBack && code !== 'en' && (
                    <p className="fallback-notice">{t('ui.fallbackNotice', { language: langName })}</p>
                  )}
                  {body.text.split('\n\n').map((p, i) => (
                    // The paragraphs are the blocks now — the same order scripts/audio.mjs uses
                    // when it generates the cues.
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
      <Elsewhere links={object.elsewhere} taxon={object.taxon} publishers={PUBLISHERS} variant="object" />
      </div>
    </article>
  )
}

function GroupPage({ route, go }) {
  const [t, tr] = useT()
  const { code } = useLang()
  const { tier } = useTier()
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
  // The short tier's panel, where one has been written (shipped on the chunk as `panelShort`).
  // Every panel has a short telling from the tier's first wave, so on a loaded page this only
  // falls to the full panel when the tier is 'full' — but the guard keeps a future group honest.
  const shortPanel = tier === 'short' && !!data?.panelShort
  const panelText = shortPanel ? data.panelShort : data?.panel
  const panelR = shortPanel
    ? tr(['panels', group.slug, 'short'], null, data.panelShort)
    : tr(`panels.${group.slug}.panel`, null, data?.panel ?? '')
  const panelId = shortPanel ? `groups/${group.slug}/00-panel-short` : `groups/${group.slug}/00-panel`

  // Built from the objects themselves rather than from a separate list, so the tour can never
  // drift out of step with what is on the page. Tier-resolved per object, so a partly-covered
  // group tours as a mix — the short telling where it exists, the full story where it does not —
  // which is honest, because the spoken words are always the printed ones.
  const objectAudios = (data?.objects ?? []).map((o) => objectAudio(o, tr, t, tier))
  // The panel is one file carrying the group title and the panel text, so it is only voiced in the
  // translation when both are translated.
  const panelLang = title.lang === panelR.lang ? panelR.lang : 'en'
  const tourAvailable = !!data && hasAudio(panelLang, panelId) && objectAudios.every((a) => a.available)
  const tourQueue = {
    // Tier on the key whenever the short tier is active — the queue's words differ even where
    // some objects fell back, because the panel and any covered object did not.
    key: tier === 'short' ? `g:${group.slug}:short` : `g:${group.slug}`,
    title: title.text,
    items: [
      ...(panelText ? [{ id: panelId, lang: panelLang, label: title.text, blocks: [title.text, panelR.text] }] : []),
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
            // The note warns a reader whose page is not in English that pressing play will speak
            // English. Asked of the queue, not the session: German is voiced now, so a German tour
            // plays German and must not carry the warning — but a not-yet-translated story falling
            // back to English text plays English narration inside any session, and then it is true.
            <Listen
              queue={tourQueue}
              available={tourAvailable}
              note={code !== 'en' && tourQueue.items.length > 0 && tourQueue.items.every((i) => i.lang === 'en') ? t('ui.audioEnglishOnly') : null}
            />
          }
        />
      </div>
      <h1 className="group-title" {...langAttrs(title)}>
        <Spoken text={title.text} itemId={panelId} block={0} />
      </h1>
      <p className="group-cost">
        {/* The cost follows the toggle: each figure is measured from the narration that tier
            would actually play (see tourSegmentsShort in scripts/split.mjs). ?? guards a stale
            chunk from before minutesShort existed. */}
        {group.size} {t('ui.models')}. {t('ui.aboutMinutes', { m: tier === 'short' ? group.minutesShort ?? group.minutes : group.minutes })}
      </p>

      {data ? (
        <>
          {panelText && (
            <Translated
              className="group-panel"
              r={panelR}
              itemId={panelId}
              block={1}
            />
          )}

          {/* The group's own further reading, with the intro rather than at the page's foot — it
              used to sit after the last object, where a reader who had scrolled eight objects met
              it as an orphan with no group context left on screen. Here it reads as part of the
              orientation: what this page is, and where else to read about it. */}
          <Elsewhere links={data.elsewhere} publishers={PUBLISHERS} variant="group" />

          {/* The whole page as one sitting: the panel, then every object in order. It plays
              exactly what each object's own control plays, so a visitor can start the tour and
              stop caring about the interface — which is the point of an audio guide in a gallery.
              Individual objects keep their own control for anyone who wants just the thing in
              front of them. */}
          {data.objects.map((o) => (
            <ObjectSection key={o.accession} object={o} arrived={o.accession === route.arrivedAt} registry={registry} />
          ))}
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
