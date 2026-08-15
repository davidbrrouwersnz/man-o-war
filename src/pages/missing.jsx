// The not-found page. Its own module since search was removed — it used to share a file with the
// search page, and two other modules import it.

import { ArrowLeftIcon } from 'lucide-react'
import { useT } from '../lang.jsx'
import { Tools } from '../components/tools.jsx'

function Missing({ route, go }) {
  const [t] = useT()
  return (
    <main className="reading" id="main" tabIndex={-1}>
      <div className="page-top">
        <a className="back" href="/" onClick={go('/')}>
          <ArrowLeftIcon aria-hidden="true" focusable="false" /> {t('ui.backToCollection')}
        </a>
        <Tools />
      </div>
      <h1 className="group-title">{t('ui.notFound')}</h1>
      <p className="stub-note">
        {route?.accession ? t('ui.notFoundAccession', { accession: route.accession }) : t('ui.notFoundBody')}
      </p>
    </main>
  )
}

export { Missing }
