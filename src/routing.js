// Hand-rolled routing. There is no router dependency and there does not need to be: four routes,
// pushState on deliberate jumps, replaceState while scrolling.

import { useEffect, useState } from 'react'
import { BY_SLUG, index } from './collection.js'

// ------------------------------------------------------------------ routing
// /                  the eleven group tiles
// /g/{slug}          a group page — rendering only
// /o/{accession}     canonical. Resolves to the group page, scrolled to that object.
// A fragment URL of the form /g/{slug}#{accession} is never produced.

function parse(pathname) {
  const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { view: 'home' }
  // Both grids are on the collection page now, one after the other. The path survives so that
  // anything already pointing at it lands on the right part of that page rather than a dead end —
  // as an anchor, which is the same mechanism the old essay paths use.
  if (path === '/all') return { view: 'home', at: 'all-objects' }
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

export { parse, useRoute }
