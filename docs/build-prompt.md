# Build prompt — the prototype

Paste everything below the line into a **fresh session** in `C:\Users\david\dev\manowar`.

It scopes a prototype, not the product. The spec describes a build that is roughly 90% writing;
this asks for the ~10% that can be built now, in order to answer four questions that no amount of
further specification will settle.

---

## THE TASK

Build a prototype of the Blaschka collection companion app, from `BUILD-SPEC-v2.md`.

**This is not the full build.** It exists to answer four questions on a real phone, standing up,
on a throttled connection:

1. **Do the eleven group tiles read?** Can someone tell what is behind each one before tapping it?
2. **Is a group page finishable?** Eight objects, each with an image at ~70% of viewport. Does
   anyone reach the bottom? (The spec's own arithmetic says a 19-object page is ~43 screen-heights
   and ~24 minutes. Eight is the smallest real test of the same problem.)
3. **Does a QR arrival work?** Landing at `/o/1884.137.33` mid-page — does the visitor know within
   five seconds they got the right thing?
4. **How long until the screen is worth looking at** on ~130KB/s?

Build the smallest thing that answers those honestly. Nothing else.

## READ FIRST, IN THIS ORDER

| File | Why |
|---|---|
| `BUILD-SPEC-v2.md` §1–§5, §8–§11 | The product, the data contract, routing, the two screens |
| `src/data/groups.json` | The grouping. 11 groups, 128 objects, slugs, representative images |
| `docs/story-man-o-war.md` | The one story that exists, and the writing standard it demonstrates |
| `docs/group-panels.md` | 11 panels and endings, drafted |
| `src/data/fallback.json` | A captured API record — the real response shape |

Do not read the whole spec before starting. §6, §7, §13, §16–§18 describe content, languages,
audio, trails and accessibility provision that this prototype deliberately does not build.

## WHAT ALREADY EXISTS

- **The grouping is settled.** `groups.json` is the authority for membership, order, slug and
  representative. Order within a group is deliberate — **never re-sort it**.
- **Eleven panels and endings** are drafted in `docs/group-panels.md`.
- **One story** exists, `1884.137.33`, in `docs/story-man-o-war.md`. It is layers 1–2 only,
  231 words, three segments.

## WHAT DOES NOT EXIST — STUB IT VISIBLY

- **127 of the 128 stories.** For the prototype, generate short placeholder text from each
  object's `brief_desc` and **mark it visibly as placeholder in the UI**. The spec forbids
  `brief_desc` standing in for a story in the product; in the prototype it must be obviously
  temporary, because question 2 above is partly about whether a short entry beside a real one
  reads as neglect.
- **All audio, all video, all sign video, all translations, the quiz.** Out of scope.

## THE TRAPS — ALL MEASURED. DO NOT REDISCOVER THESE.

**Harvest**

- **Harvest on `maker_name:"Leopold Blaschka"`, NOT on `collection:"Blaschka Glass"`.** The
  collection query returns 127 and silently drops `1884.137.110`, whose `collection` field is an
  empty string. `maker_name` returns 128. This matters and is a finding to keep.
- `limit` caps at 100 — two requests, paginate with `offset` only. `start`/`page`/`from`/`skip`
  are silently ignored and return page one again.
- **Terminate on `opacObjects` being absent or empty, never on `totalObjects`** — past the end,
  `totalObjects` is unreliable.
- Always pass `view=detail`. Omitting `view` returns id-only stubs.
- **Harvest at build time into a local manifest. Never call this API at runtime** — it is
  uncached, uncompressed, and ~8 seconds of server time for the full set.
- Images load directly from the Museum's CDN and need no proxy. Only JSON is CORS-blocked, and
  the harvest runs server-side where that does not apply.

**Response shape — verify against `src/data/fallback.json` before writing a parser**

- `opacObjectFieldSets` is an **array** of `{ identifier, opacObjectFields: [{value}] }`. Look
  fields up by identifier; there is no direct property access.
- Images are at `imagesCollection.images[0].imageDerivatives` — an **array** of six
  `{identifier, url, width, height}`. Find by identifier. **`width` and `height` are strings** —
  coerce them before deriving an aspect ratio or you will silently get `NaN`.
- `current_rights_code` is an **empty string** on 9 records, not an absent key. Test for a
  non-empty value. **`1884.137.33` is one of the 9** — the object the QR code points at is the one
  with no licence, so the fallback wording is the default screen, not an edge case.
- **Four** title prefix spellings exist, not three: the standard one, a lowercase variant on
  `1884.137.83`, a word-swapped one on `1884.137.15`, and `Glass model Invertebrate:` on
  `1884.137.110`. Assert the strip count at build time.
- **Do not use `cssColors`.** It encodes the mount board, not the glass.
- `slug` on the API record is **not unique** and is not the group slug. Ignore it.

**Build**

- **Route on the accession number.** `/o/{accession}` is canonical and resolves to the group page
  scrolled to that object. `/g/{slug}` is rendering only. **Never** produce a URL of the form
  `/g/{slug}#{accession}` — it bakes the grouping into the link.
- Group slugs are **hand-authored** in `groups.json`. Never derive one from a title.
- `1884.137.92` may **never** be a representative image — it is an unidentified fragment that
  reads as a rendering fault.
- **Only media near the viewport loads.** Eight objects at ~70vh is several megabytes; a page that
  loads it all up front cannot answer question 4.
- Bake tiny base64 placeholders into the manifest so the page paints immediately.
- The reading area follows `prefers-color-scheme`. The grid and media wells are always dark — 79
  of the primary images are the object on pure black.

## SCOPE

**In:**
- Build-time harvest → local manifest (128 objects)
- `/` — eleven group tiles, representative image, title, object count
- `/g/floating-colonies` — the 8-object page: panel, objects inline, ending
- `/o/{accession}` — resolves to the group page, scrolls to the object, marks it as the one you
  came for
- Lazy media, dark grid, device-theme reading area

**Out:** every other group page, `/all`, search, the flat accessible list, layers 3–5, trails,
quiz, audio, video, languages, service worker, NFC.

**First, clean up v1.** The repo still contains `<model-viewer>` in `index.html`, `@panzoom/panzoom`
in `package.json`, both used in `src/App.jsx`, a 30MB `man-o-war.glb` and ~62MB of stray
audio-generation artefacts in `public/`. v2 removes all of it. Vite copies `public/` verbatim, so
the strays end up in any build.

**Do not replace the deployed v1 app.** It is public, live at `manowar.vercel.app`, and attached to
a job application. Work on a branch and deploy separately, or ask.

## DONE LOOKS LIKE

- The harvest asserts: 128 records, every one with at least one image, four prefix spellings
  handled, every accession in `groups.json` present in the manifest and vice versa.
- `/`, `/g/floating-colonies` and `/o/1884.137.33` all work, on a phone, throttled to ~130KB/s.
- A short written answer to each of the four questions at the top, **with the numbers** — page
  height in screen-heights, bytes transferred, time to first useful paint.
- An honest list of anything in the spec that turned out to be wrong, unbuildable, or
  underspecified. **That list is more valuable than the prototype.** Two adversarial review rounds
  have already been run against this spec; a third set of findings from someone who actually built
  it is worth more than either.

## HOUSE RULES

- The spec is settled. If something in it looks wrong, **say so and stop** — do not silently
  improve it.
- Anything not in the spec is not in scope.
- No tests, no readme, no refactoring passes, no abstractions for things that happen once.
- Report what actually works, with evidence. If something is untested, say it is untested.
