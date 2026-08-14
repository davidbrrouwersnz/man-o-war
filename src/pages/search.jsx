// Search, and the not-found page. §6: grouping by appearance spreads Cnidaria across four pages,
// so there is no page for "all the jellyfish-type things" and search has to buy that back.

import { useEffect, useState } from 'react'
import { useT } from '../lang.jsx'
import { loadChunk } from '../collection.js'
import { Tools } from '../components/tools.jsx'

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
    <main className="reading" id="main" tabIndex={-1}>
      <div className="page-top">
        <a className="back" href="/" onClick={go('/')}>
          ← {t('ui.backToCollection')}
        </a>
        <Tools />
      </div>
      {/* These five strings were hardcoded English while translations for every one of them sat
          unused in all nine packs. */}
      <h1 className="group-title">{t('ui.search')}</h1>
      <p className="group-cost">{t('ui.searchHelp')}</p>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('ui.searchPlaceholder')}
        aria-label={t('ui.search')}
        // Kept. On a route whose only purpose is typing a query, the keyboard appearing is what
        // the visitor came for; this is the case autofocus is actually for.
        autoFocus
      />
      {term && (
        <p className="search-count" aria-live="polite">
          {hits.length === 0 ? t('ui.searchNothing') : `${hits.length} of ${data.objects.length}`}
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
    <main className="reading" id="main" tabIndex={-1}>
      <div className="page-top">
        <a className="back" href="/" onClick={go('/')}>
          ← {t('ui.backToCollection')}
        </a>
        <Tools />
      </div>
      <h1 className="group-title">{t('ui.notFound')}</h1>
      <p className="stub-note">
        {route?.accession
          ? t('ui.notFoundAccession', { accession: route.accession })
          : t('ui.notFoundBody')}
      </p>
    </main>
  )
}

export { SearchPage, Missing }
