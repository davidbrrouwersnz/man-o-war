# The Blaschka collection — a museum companion

Canterbury Museum holds 128 nineteenth-century glass models of invertebrates, made by Leopold and
Rudolf Blaschka in Dresden and acquired in 1883. **One is on display. The rest are in storage.**
That asymmetry is the product:

> Here is the one you can see. Here are the other 127 you can't.

This is **v2, and it is a prototype rather than the product** — deliberately so. It exists to answer
four questions that no amount of further specification could settle, and it is built only as far as
answering them requires.

**▶ Live: <https://manowar.vercel.app>**

![The prototype on a phone: the Portuguese man o' war photographed on black, filling most of the screen, under the heading "Portuguese man o' war" with the catalogue string demoted beneath it, and a flag reading "The object you scanned".](docs/screenshot.png)

---

## What changed from v1, and why it matters

v1 was **one object**, explored three ways — a photograph you could pan, a short video, and a 3D
model you could orbit — with the story behind a tap and a quiz at the end.

v2 is **the collection**. That is a different problem, and most of v1's answers do not survive it:

| v1 | v2 | Why |
|---|---|---|
| One object | 128 | The scaling question |
| Three canvas modes including 3D | Photograph only, in this build | 30MB for one object never reaches 128 honestly |
| Story behind a tap | Story inline, beneath the media | Every tap between a visitor and the writing is where most of them stop |
| Floating chrome over a full-bleed canvas | A page that scrolls, and ends | Floating chrome does not survive a browse model |
| A live API call every session | **A build-time harvest** | See below |
| Dark everywhere | Dark media; the reading area follows your device | 79 of the primary photographs are the object on pure black |

**The 3D model is gone, and cutting it is the opening move of the scaling argument.** It was the
heaviest asset, the riskiest dependency, the only thing needing a "not a scan" disclaimer, and the
one feature that could never reach 128 objects honestly — 60 of them have exactly one photograph,
and generating 3D from a single catalogue photo invents anatomy nobody observed.

### The live fetch is gone, and v1's pitch went with it

**v1's pitch was "the live fetch is real, every session." That is no longer true, and it should not
be glossed over.** The collection API caps at 100 records per request, serves `view=detail`
uncompressed, is not CDN-cached, and takes about **8 seconds of server time** before a single
thumbnail could begin loading. A visitor standing in a gallery has about five seconds.

So the harvest runs **once, at build time**, into a local manifest. The live API remains the source
of truth and the harvest is re-run on demand — it is simply not a runtime dependency any more.

**The harvest also found a data-quality issue worth reporting to the Museum.** Querying on
`collection:"Blaschka Glass"` returns 127 records. Querying on `maker_name:"Leopold Blaschka"`
returns **128**. The difference is a real, documented model — **1884.137.110**, *Terebella
conchilega*, six photographs, published in Shaw et al. 2017 — whose `collection` field is an empty
string, so the Museum's own collection query cannot return it.

---

## What this prototype is for

Four questions, and the measured answers. Full working in
**[`docs/prototype-findings.md`](docs/prototype-findings.md)**, which is the more useful document —
it is where the things the spec got wrong are written down.

Measured in headless Chrome at 390×844, throttled to **130KB/s** with a cold cache.

**1. Do the eleven group tiles read?** Partly. Eight of eleven. The grid is dark because the
photography is dark — but the eleven images actually chosen were picked without looking at them, and
measuring their luminance showed several that read as bright mount board rather than object-on-black.

**2. Is a group page finishable?** Eight objects is **11.7 screen-heights** as built, and **17.0**
once every object has a real story. A 19-object page would be **38.4**. The scroll problem is real
and the spec did not overstate it.

**3. Does a QR arrival work?** Yes — it is the best screen in the build. `/o/1884.137.33` lands with
the object at the top of the screen, marked *the object you scanned*, with the URL intact and no
scroll animation. Largest paint at **2.4s** — faster than arriving at the page any other way.

**4. How long until the screen is worth looking at?** Text at **1.45s**, photograph at 2.4–4.2s. A
group page sends **173KB** up front rather than the 552KB it would cost to load all eight
photographs, because only media near the viewport loads.

---

## What is built, and what is not

**Built.** The harvest, with assertions that fail the build if the data shifts — including a
non-empty story on all 128 (§20). All eleven group pages. `/` — the eleven group tiles, with every
object as a second tab. `/o/{accession}` for all 128, resolving to the group page and scrolling to
the object. Search across the collection. The two reading essays. Nine languages with RTL. A
552-file audio guide with word-level read-along, a scrubber and lock-screen controls. Lazy media, a
dark grid, and a reading area that follows `prefers-color-scheme`.

**A desktop layout.** §10's media-beside-text, at 64rem and above. It roughly halves every group
page: sea anemones runs 22.8 screen-heights in one column and 14.5 in two.

**Text size and high contrast** (§18), persisted, reachable from every route alongside the language
picker — which matters most on the QR route, where a visitor lands on a group page rather than here.

**Not built, deliberately.** Trails, the quiz, video, sign video, offline support, NFC, the
seen-set, and deep zoom — §12 defers that last one until the Museum can export larger derivatives.

**All 128 stories are written**, 95 words median. The depth cliff the prototype was built to test —
one long entry beside 127 placeholders — no longer exists, and `scripts/split.mjs` now fails the
build if a story is ever emptied.

---

## Run it

```bash
npm install
npm run dev
```

No API key, no proxy, no configuration — the data is already in `src/data/manifest.json`.

To re-harvest from the Museum (about 9 seconds of their server time):

```bash
node scripts/harvest.mjs
```

Other scripts: `budget.mjs` prints the manifest size breakdown and reading-time arithmetic;
`measure.mjs` reproduces the throttled numbers above against `npm run preview`;
`representatives.mjs` ranks each group's photographs by how much of the frame is black.

---

## AI assistance

Stated in full, as the original brief asked.

- **Development.** Built with **Claude (Anthropic)** working as an agentic coding assistant,
  directed from a written specification and reviewed step by step. For v2 the assistant also ran the
  measurements: it drove a headless browser over the Chrome DevTools Protocol to throttle the
  connection, count transferred bytes and capture paint timings, rather than estimating them.
- **Generated media.** v1's video, 3D model and spoken audio guide were produced with generative-AI
  tools from the Museum's photographs and the written narrative. **None of them appear in v2** — the
  3D model was cut on the reasoning above, and audio is now derived from the written text rather than
  authored separately.
- **The photographs are not generated and never will be.** They are the Museum's own documentary
  record. No upscaling, AI or otherwise: it is the one asset here that is evidence rather than
  interpretation, and a super-resolution model invents glass nobody photographed.

## Sources

- Collection record — Canterbury Museum **1884.137.33**
  <https://collection.canterburymuseum.com/objects/glass-model-invertebrate-physalia-pelagica>
- Le Grice R., *The Blaschka Collection*
  <https://www.canterburymuseum.com/explore/collections/the-blaschka-collection>
- Shaw MD et al. (2017), *Ideas made glass: Blaschka glass models at Canterbury Museum*,
  **Records of the Canterbury Museum 31**
  <https://cms.canterburymuseum.com/assets/Canterbury-Museum-Records-2017.pdf>
