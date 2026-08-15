// The collection index and the per-group chunk loader.
//
// Split out of App.jsx so that a page can import the two or three things it needs rather than the
// whole application module. The comment below is the reason any of this exists.

import index from './data/chunks/index.json'
import { LANGUAGES } from './i18n.js'

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

// §7's disclosure data, counted from the translation ledger at build time by scripts/split.mjs:
// { total, reviewed, engines } per language. English is absent because it is the source, not a
// translation of anything. Empty object rather than undefined on a checkout whose ledger has not
// been written, so the picker degrades to saying nothing rather than to throwing.
const REVIEW = index.review ?? {}

// Who publishes each external source, by the key its links carry (§6). Written once in
// src/data/elsewhere.json and shipped once here rather than repeated on every link — Te Ara alone
// is named on fourteen of them. Empty object rather than undefined so a link whose publisher key
// was removed renders without its attribution instead of throwing on a page that is otherwise fine.
const PUBLISHERS = index.publishers ?? {}

export { index, CHUNKS, loadChunk, GROUPS, BY_SLUG, SUPPORTED, REVIEW, PUBLISHERS }
