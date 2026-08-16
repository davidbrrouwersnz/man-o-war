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
non-empty story on all 128 (§20). All eleven group pages. `/o/{accession}` for all 128, resolving to
the group page and scrolling to the object. Eight languages with RTL, complete: every interface string,
every group panel, both essays, all 128 object stories and all 30 further-reading annotations in
each. A 438-file audio guide with
word-level read-along, a scrubber and lock-screen controls. Lazy media, a dark grid, and a reading
area that follows `prefers-color-scheme`.

**The collection page answers the whole question, in one read.** `/` runs: what this collection is,
the one object a visitor can actually see, why it is made of glass, how it reached Christchurch —
and then the other 127, as eleven group tiles and a grid of all 128.

The four are consecutive on purpose. A visitor holding this page is standing in front of exactly
one object, 1884.137.33, and their question is not *what is in this collection* — they can see what
is in front of them — but *what am I looking at, what is it made of, and why is it here?* That used
to be answered in three places: the story was a tap away on the group page, and the two essays sat
below 139 tiles. Nothing was written for the change; the object is the same component the group
page renders, reading the same story, and the essays are untouched. What changed is the order.

**The cost is stated rather than hidden.** The reading now comes before the browsing, so on a phone
the collection begins 6.7 screen-heights down: **12 screen-heights became 13.7**, and 36KB of that
is the man o' war photograph, which is now the page's own LCP element. That is the right trade for
the visitor in the gallery and the wrong one for a visitor who came to browse. At 80rem it stops
being a trade — the reading is one column, the grid is the other, and both are on screen at once.

**A desktop layout.** §10's media-beside-text, at 64rem and above. It roughly halves every group
page: sea anemones runs 22.8 screen-heights in one column and 14.5 in two.

**Text size and high contrast** (§18), persisted, reachable from every route alongside the language
picker — which matters most on the QR route, where a visitor lands on a group page rather than here.

**Further reading, at three scales** (§6's external sources). The collection page ends with the
other Blaschka world — Cornell's 570 models, Corning's exhibition, Harvard's Glass Flowers. Each
group page ends with the Te Ara article on those animals in New Zealand. Each object carries a
closed disclosure holding whatever can be verified for it: a Te Ara or MarLIN page where one
exists, and its taxonomic record either way.

**Every link says how close it actually is to the object** — *the same species*, or *a related
animal, not the species in the glass*, or *the group, not this object*. That is the same discipline
§6 applies to GBIF photographs, and it is why the curation is hand-authored: a Te Ara photograph of
a New Zealand spoon worm beside a Blaschka model of a Mediterranean one is worth linking and is not
the same animal.

**Our words translate; the citations do not.** The sentence explaining why a source is worth reading
is a fourth translation tier (`src/data/i18n/elsewhere/`), complete in all eight languages. The
title of somebody else's article and the name of the institution that published it stay in English
and are marked `lang="en" dir="ltr"` — a citation is quoted as printed, and translating "Fragile
Legacy" would tell a German reader it leads somewhere German. It does not.

**The taxonomy is resolved once, at build time, and refuses more often than it answers.** `npm run
taxa` resolves all 128 against WoRMS and GBIF: **104 resolve, 60 of those to a name that has since
been superseded** — which is §6's ~57% measured independently. The other 24 are refusals with
reasons: fourteen misspellings that only match fuzzily, two homonyms where the catalogue name points
at two different accepted species, and the objects with no animal to look up. **None of them is
published on a guess**, and the interface says so rather than rendering an empty link. `npm run
taxa:verify` re-checks every URL the app can hand a visitor.

**Not built, deliberately.** Trails, the quiz, video, sign video, offline support, NFC, the
seen-set, and deep zoom — §12 defers that last one until the Museum can export larger derivatives.

**All 128 stories are written**, 95 words median. The depth cliff the prototype was built to test —
one long entry beside 127 placeholders — no longer exists, and `scripts/split.mjs` now fails the
build if a story is ever emptied.

---

## The translation and narration pipeline

Change an English story and push it, and the translations and the narration derived from it update
themselves — touching only what changed. `.github/workflows/translate.yml` is triggered by the
English sources alone, so the job's own output can never re-trigger it.

It is incremental for a reason that is not the money. Retranslating every word into every language
costs about six dollars. What it destroys is human review: §7 makes verification the cost that
scales with languages, and `src/data/translation-index.json` records a `reviewStatus` per unit that
resets only when that unit's English actually changes. Changing one sentence retranslates one
sentence and leaves the other 750 units' review standing.

Three guards run before anything is written. §7's carve-outs refuse to send quotations or anything
touching taonga or mana whenua. Names with a right answer are supplied to the engine from
`src/data/glossary.json` rather than left to it, and the run fails if the agreed name does not come
back. And a back-translation sweep flags meaning that did not survive the round trip — it is how
"Ribbon worm" was caught coming back as "Tapeworm", a different phylum stated confidently.

### The engine, and what the free tier costs

This runs on Azure's **neural machine translation**, and it is the weakest part of the system.

Azure also offers **LLM translation**, which needs an Azure AI Foundry resource with a model
deployed in it; the classic Translator resource answers 404 to the API version it requires. The
scripts already choose the engine from what the endpoint can actually reach and record which one
produced each unit, so moving is an endpoint and a deployment name in `.env.local`.

**It is worth more than everything else in this pipeline put together.** NMT rendered "It is a
float" into French as *C'est une flotte* — a fleet of ships — in the sentence explaining the
animal's anatomy. It called a living man o' war *un hombre de guerra*, a man of war. It wrote
*la vraie médusse*, a misspelling it invented. It used *vous* and *tu* in the same object, against
a writing standard (§6) built on a consistent voice. The glossary catches names; nothing here
catches prose, and §7 says as much: automated checks find errors well and are close to blind to
whether the writing is any good.

The fair comparison is not this against a careful human — it is this against Azure's LLM mode,
which is the same class of model that drafted the English. **The whole backfill into seven
languages cost about four dollars. The paid tier that would have made it good costs less than the
difference is worth.** Recorded as **Q12** in `BUILD-SPEC-v2.md` §22.

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
- **Every non-English word is machine translation, and none of it has been reviewed by a person.**
  Azure neural machine translation, except the German, which predates the pipeline and was drafted
  by a language model. The language picker tells the reader this in their own language, and
  `src/data/translation-index.json` records the engine and date for every unit, so the claim is
  auditable rather than a promise. §7 asks for a paid standing reviewer per language community; that
  has not happened, and until it does the disclosure is the honest part of the offer rather than a
  formality.
- **The names are looked up, not translated.** Vernacular names come from GBIF and Wikidata, and the
  translator is given the answer rather than allowed to guess — because it guessed *portugiesisches
  Kriegsschiff*, a warship, for the animal this app is named after. Where the two authorities
  disagreed the choice is an editorial one, recorded with its reasoning and the candidates it was
  chosen from, in `src/data/glossary.json`.
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
