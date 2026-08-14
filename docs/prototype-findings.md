# Prototype findings

Built from `BUILD-SPEC-v2.md` §1–§5, §8–§11 and `docs/build-prompt.md`. Branch
`worktree-blaschka-prototype`. The deployed v1 at `manowar.vercel.app` is untouched.

Everything below was measured on this build unless it says otherwise. Headless Chrome over CDP,
viewport 390×844 at 3× DPR, network throttled to **130KB/s down, 150ms RTT**, cache disabled on
every run. Reproduce with `node scripts/measure.mjs http://127.0.0.1:4174` against `npm run
preview`. The 150ms latency is an assumption, not a measurement — it is the one number here that
was chosen rather than observed.

---

## The four questions

### 1. Do the eleven group tiles read?

**Partly. Eight of eleven do; three do not, and the reason is measurable.**

§9 decides the grid is dark because "79 of 127 primary images are the object on pure black". That
is true of the collection and **not true of the eleven images actually chosen**. Median luminance
of each representative, sampled from the baked placeholder:

| Group | Median luminance (0–255) | % pixels > 110 |
|---|---|---|
| Sea squirts and salps `.66` | **112** | 50% |
| Squid, cuttlefish, paper nautilus `.10` | 79 | 42% |
| Corals and sea fans `.21` | 29 | 40% |
| Comb jellies `.127` | 3 | 33% |
| Worms of the seabed `.98` | 5 | 24% |
| the other six | 2–12 | 0–19% |

`.66` is a pale object on a cream mount board and reads as a **bright card in a dark grid**, not as
an object on black. `.10`, `.21` and `.127` are half-bright. The dark-grid premise survives for
eight tiles and is contradicted by one.

Separately, **`.98` (the Lyttelton fanworm) is the wrong representative for the worms page**. Its
`representativeRationale` calls it "the best object and the best story", which is true, but the
photograph is a small dark specimen on a large cream board — at tile size it is a nearly empty
rectangle. `.127` (Venus girdle) has the same problem: a flat pale ribbon that says nothing about
"see-through swimmers". The rationale field in `groups.json` already admits these were chosen
"WITHOUT viewing the images"; that pass is still owed and it is cheap.

**The titles carry the tiles, not the images.** Where a tile reads, it reads because the title says
what is behind it. That is an argument *for* §9's eleven-titled-things decision and against the
image-first reading of it.

#### Update — representatives now chosen by blackest ground

Reselected mechanically: for each group, the photograph with the highest proportion of near-black
frame wins (`scripts/representatives.mjs`, `1884.137.92` excluded by rule). **Ten of eleven
changed.** The mount-board problem is gone — the grid is now uniformly dark and looks like one
system rather than eleven unrelated photographs.

**It bought that consistency at a cost, and the cost is on the same question.** Maximum blackness
selects for *the object occupying least of the frame*, which is the other way a tile fails to read:

| | Subject fills | Consequence |
|---|---|---|
| `.136` corals | **3%** | A tiny pale star in an empty field. Also the object whose identification is a vernacular reading of an old label — §6 says its caption must say so, which makes it a poor face for the page. |
| `.90` worms | **3%** | Legible, but only just. |
| `.53`, `.94`, `.84` | 5–6% | Small; readable as "something pale" rather than as the group. |

**And it removed the man o' war from its own page.** Group 2 is titled *The man o' war and other
floating colonies*; its tile is now `1884.137.114`. `1884.137.33` is the one object on display, the
only object with a written story, the target of the only QR code, and the thing the app is named
for. A purely photometric rule cannot know that.

#### Update — a fill floor, and the first two tiles chosen by eye

Two changes, and together they settle question 1 as far as a build can.

**A minimum subject fill of 8%.** No photograph is eligible unless the lit object fills at least
that much of the frame. The 3% tiles are gone; every formula pick now fills 9–19%.

**Groups 1 and 2 are chosen by hand and pinned**, using `scripts/contact-sheet.mjs`, which renders
every photograph in a group at real tile size so the choice can be made by looking rather than by
arithmetic. What the contact sheet showed:

- **Jellyfish → `1884.137.32`, the moon jelly.** The one bell a visitor recognises on sight, filling
  the frame on pure black. **Nine of the thirteen alternatives are a small specimen photographed
  with its wooden mount and printed label card in shot** — at tile size the label is legible clutter
  and the animal is tiny. The formula had picked one of them.
- **Floating colonies → `1884.137.33`, the man o' war.** Not the prettiest photograph in the group —
  `1884.137.59`, the blue button, is plainly the best image in the collection so far. But this is
  the page named after the man o' war, the one object on display, the only object with a written
  story, and the target of the only QR code. **A tile has to show the thing it promises.**

**The general finding, which is the useful part.** A photometric rule is a good default and a bad
judge. It reliably removes mount board and empty frames — worth having across 128 objects nobody
will review individually. It cannot see a printed label card, and it does not know which object a
page is *about*. **Both failures land on the same eleven images that carry the entire first
impression**, so those eleven are exactly where hand-selection is worth the time and the other 117
are exactly where it is not.

### 2. Is a group page finishable?

**Measured, at 390×844:**

| | Page height | Screen-heights |
|---|---|---|
| floating-colonies **as built** (1 written story + 7 catalogue stubs) | 9,898px | **11.7** |
| a written object section | 1,658–1,696px | 2.0 |
| a stub section | 1,021px avg | 1.2 |
| the same 8 objects **if all were written** | ~14,360px | **17.0** |
| **a 19-object page, all written** | — | **38.4** |

The build prompt's estimate of ~43 screen-heights for 19 objects is close — **38.4 measured against
43 predicted, 11% optimistic in the spec's favour**. The prototype reads shorter than that only
because seven of its eight entries are stubs at 60% the height of a written one. **The scroll
problem is real and the spec did not overstate it.**

#### Measured, not extrapolated — the 19-object page now exists

All eleven group pages render, so the anemone page can be measured directly instead of predicted:

| | Predicted | **Measured** |
|---|---|---|
| Sea anemones, 19 objects | 38.4–43 screen-heights | **30.4** |
| The man o' war page, 8 objects | 17.0 | **14.5** |

**Both predictions were 25–30% too tall**, for the same reason the reading time was too long: they
assumed a 231-word entry, and a real one is nearer 101. The spec's ~43 was never wrong about the
shape of the problem, only about its size.

**Thirty screen-heights is still thirty screen-heights.** It is about three and a half minutes of
continuous scrolling before the ending, and no one has yet done it in a gallery.

**And this is where lazy media earns its place**, measured on the worst page in the collection:

| Sea anemones, 19 objects | Transferred |
|---|---|
| On arrival | **296KB**, 2 of 19 images mounted |
| Scrolled to the very end | **1,373KB**, all 19 |

**Loading the page eagerly would cost 1.08MB more** — about eight seconds of extra wait at 130KB/s,
paid up front, by every visitor, most of whom will never reach object nineteen.

**Reading time, and a spec contradiction — see finding 2 below.** At 150wpm the page as built is
4.4 minutes. With all eight written to the man o' war's 231-word benchmark it is **12.8 minutes**,
not the "About 9 minutes" §10's own diagram prints for this exact page.

**Does a short entry beside a real one read as neglect?** On the evidence of the screenshots: no,
but only because the stub is *labelled*. The placeholder banner and the left rule make the short
entry read as unfinished rather than as thin. Remove the label and the same block reads as a page
where someone gave up after the first object. **This is direct support for §10's claim that the
group panel is load-bearing** — but it suggests the panel is not sufficient on its own, and that
the honest move is to say a story is missing rather than to let brief_desc quietly stand in.

### 3. Does a QR arrival work?

**Yes, and it is the best screen in the build.** `/o/1884.137.33`:

- The arrival marker sits at **y=8px** — the object is at the top of the screen, the group panel is
  above the fold line and is not the first thing seen, as §11 requires.
- The URL **stays** `/o/1884.137.33`. No fragment URL is ever produced.
- No scroll animation.
- **LCP 2,428ms** — *faster* than arriving at the group page normally (4,212ms), because the
  arrived-at object's image bypasses the lazy-load gate.
- 234KB transferred, 13 requests.

Within five seconds a visitor sees "THE OBJECT YOU SCANNED", the plain-English name, and the
photograph. That answers the question the spec asks.

**Two caveats.** The five-second claim is mine from the numbers, not from a user test — nobody has
stood in a gallery with this. And it works this well partly because `1884.137.33` is the *first*
object on its page; an arrival at object 14 of 19 has more page above it and has not been tested.

### 4. How long until the screen is worth looking at?

At 130KB/s, cold cache:

| Route | First contentful paint | Largest contentful paint | Transferred | Requests |
|---|---|---|---|---|
| `/` — eleven tiles | **1,460ms** | 3,832ms | 419KB | 21 |
| `/g/floating-colonies` | **1,444ms** | 4,212ms | 173KB | 12 |
| `/o/1884.137.33` | **1,460ms** | **2,428ms** | 234KB | 13 |
| `/g/floating-colonies` scrolled to the end | — | 7,956ms | **552KB** | 19 |

**Re-measured against the live deployment** at `https://manowar.vercel.app`, over real TLS and a
real CDN rather than localhost. The numbers hold:

| Route | FCP | LCP | Transferred |
|---|---|---|---|
| `/` — eleven tiles | 2,084ms | 3,864ms | 362KB |
| `/g/floating-colonies` | 1,556ms | 4,324ms | **175KB** |
| `/o/1884.137.33` | 1,660ms | **2,676ms** | 236KB |
| scrolled to the end | — | — | 559KB |

First paint is 100–600ms slower in the wild than on localhost, which is the TLS handshake and the
CDN hop. Everything else is within noise of the local figures, and the lazy-media saving is
identical: **175KB up front against 559KB for the whole page.**

**Text at ~1.45s, the photograph at 2.4–4.2s.** Lazy media works: the group page mounts **1 of 8**
image elements up front and transfers 38KB of image, against 416KB if it loaded all eight. Nothing
reflows when an image lands, because the well is a fixed 70dvh and the aspect is in the manifest.

**The 1.45s floor is almost entirely one blocking resource: 133KB of gzipped JavaScript.** At
130KB/s that is 1.05 seconds during which the screen is blank, because this is a client-rendered
SPA and the manifest for all 128 objects is compiled into the bundle. See finding 4.

---

## What the spec got wrong, or did not say

Ordered by how much it would cost to discover late.

### 1. §10's object header does not work for 127 of the 128 objects

§10 specifies two lines: a plain-English headline that "echoes the label", and the catalogue string
demoted beneath it. **That plain-English name does not exist anywhere in the data.** It exists for
`1884.137.33` only, because v1 wrote it.

So for every other object the header renders as the same words twice:

> **Physophora magnifica**
> Glass Model Invertebrate: Physophora magnifica

The demoted line adds only the boilerplate that was just stripped off. This is visible in
`tmp/stub.jpg` and it is the single most obvious flaw in the build.

`brief_desc` frequently *leads* with a vernacular name — "One blue glass model of Portuguese
Man-o-war colonial hydrozoan…" — so a name is often extractable. **I did not extract one**, because
a regex over a cataloguer's prose will produce a confident wrong name on the objects where it
matters, and §6 forbids the catalogue's words being restyled as ours.

**This is a content commitment the spec does not name.** §5's manifest table has no vernacular-name
field and §6's content table has no `headline`. It should be in the §5 content record next to
`story`.

#### Resolved — names written, awaiting curator review

`src/data/names.json` now carries a plain-English name for **106 of the 128 objects**, and names the
other 22 as deliberately unnamed. Four build assertions keep it honest: every entry must exist in
the manifest, nothing may be both named and unnamed, every object must be covered by one or the
other, and the stated counts must match reality.

**Every name records where it came from, because that is what a reviewer needs to check:**

| `source` | Count | What it means |
|---|---|---|
| `catalogue` | 44 | The word appears in the Museum's own `brief_desc`. We are quoting them. |
| `common` | 56 | A well-established English name we supplied. **This is where errors will be.** |
| `descriptor` | 6 | No vernacular name exists; a plain phrase from the catalogue's own wording. |
| *(unnamed)* | 22 | Nothing defensible. The heading falls back to the scientific name and the duplicate catalogue line is suppressed. |

**The `common` names carry a hidden claim a curator must test.** Roughly 57% of the catalogue's
binomials are superseded, so the English name of the *currently accepted* species is a statement
about identification, not only about language. *Actinia mesembrianthemum* → beadlet anemone,
*Sagartia bellis* → daisy anemone and *Bunodes gemmacea* → gem anemone each depend on a synonymy
holding. Those are flagged individually in the file.

**Nothing was invented.** Where no English name exists the object shows its scientific name alone —
21 of the 22 are nudibranchs, anemones and siphonophores whose only vernacular word is the group
name itself, which would have printed "Sea slug" nine times down one page and told a visitor
nothing. Those are the first entries a curator could improve.

### 1b. There is Museum writing for 12 objects, and none for the other 116

Asked directly whether the sources exist to write 128 stories. They do not. Measured:

| Source | Per-object interpretive writing |
|---|---|
| Museum's Blaschka page (Le Grice) | **12 objects**, 90–150 words each, with accession and Blaschka number |
| Shaw et al. 2017, *Ideas made glass* (80pp) | **0 objects.** ~9,200 words of collection history, plus a plate appendix |
| Collection record `brief_desc` | 128 objects, median 37 words — a cataloguer's physical description, which §6 forbids as a story |

**So 9% of the collection has a story that can be written from Museum copy, and 91% does not.**

#### All 128 are now written, in two provenances that never blur

Instructed to write the remaining 116 from third-party natural history, and to write in the Museum's
register — an explicit override of §6's "we do not write in the Museum's voice", recorded here
because it reverses a settled point.

The two bodies of writing live in **two files**, not one, so provenance is structural rather than a
field somebody can forget to check:

| File | Objects | Provenance |
|---|---|---|
| `stories.json` | 12 | Paraphrased from the Museum's own published writing |
| `stories-drafted.json` | 116 | Written from general natural history. **Unverified.** |

Every drafted entry carries a visible line in the interface saying it is a draft that no curator has
reviewed. **The seam §6 asks for is between our writing and the Museum's, and this keeps it.**

Each story is two segments. **The first describes the object and is drawn from the collection
record's own physical description**, so it is checkable against the manifest without any outside
source. The second is natural history, and that is the half that needs review.

Five build assertions now bind the writing to the data: every story maps to a real object, no object
is written twice, **every object has a story** (§6's commitment, enforced), every segment is
complete, and the counts are true. **Eighteen assertions pass.**

#### The realistic length of a story is ~100 words, not 231

Written to what the sources actually support, with no padding:

| | Words |
|---|---|
| Shortest | 84 |
| **Median** | **101** |
| Longest (the man o' war) | 191 |
| Whole collection | **13,244 — 88 minutes** |

**§6's 231-word benchmark is 2.3× what the evidence sustains**, and it was set from a sample of one.
The anemone page is now 13 minutes rather than the 30 the benchmark projected, and the whole
collection is an hour and a half rather than three and a half.

That is the difference between a number derived from one atypical object and a number derived from
128 real ones. **It also removes the stamina problem question 2 was built to expose** — but only
because these entries are short, and a curator may well decide several deserve to be longer. The
honest reading is that the depth cliff moved, not that it went away.

**Shaw et al. is the wrong shape for object stories and the right shape for layers 3–5.** It is
about Haast's order, Dohrn and the Naples station, Haeckel, and the teaching of evolution — written
once, never duplicated onto object pages. That is exactly §6's layers 3 and 4, already researched.

**What the twelve cost, and what that says about the benchmark.** Written from the Museum's own
material without padding, they run **92–191 words, averaging 127** — well under the 231-word
benchmark §6 takes from the man o' war. The man o' war is the outlier, because it is the one object
with two v1 texts merged into it. If 127 is the realistic length, the collection is nearer 110
minutes than 200. **The benchmark is set from a sample of one and should be reset once a dozen real
entries exist.** It is now possible to do that.

### 1c. The Blaschka number crosswalk already exists in print

§5 says the Blaschka number "is not in the API at all" and that a route key on it "requires a
hand-authored crosswalk the Museum must own… do not imply the data provides it."

The first half is right. The second is wrong in a useful direction: **the Museum has already
published the crosswalk**, in the plate captions of Shaw et al. 2017. Extracted mechanically to
`src/data/blaschka-numbers.json` — **117 of 128 objects**, each with its model number and the
1880s name the paper prints. Eleven have none.

**Every accession in the paper is in the manifest and none is stray**, which independently validates
the harvest against a published source rather than against itself. The ask in §5 should change from
*please build us a crosswalk* to *please confirm the one you published*.

### 2. §10's own worked example contradicts §6's word-count benchmark

§10 prints "8 models. About 9 minutes." for the floating-colonies page, computed at 150wpm. §6
establishes the man o' war's 231 words as the layer-1–2 benchmark for a written entry.

8 × 231 + the panel and ending = **1,923 words = 12.8 minutes**, not 9. To reach 9 minutes an
average object story must be ~160 words, which is 30% under the template. Extended to the anemone
page: 19 objects is **29.9 minutes**, not the ~24 the build prompt quotes.

One of the two numbers is wrong and it matters, because §9 requires the cost to be stated to the
visitor before they commit. **A page that says 9 minutes and takes 13 is worse than one that says
nothing.**

#### Resolved — the figure is computed, and the bug was in what it counted

Settled in favour of the arithmetic: the label says 13, not 9. But fixing it surfaced a worse
problem than the contradiction.

**The estimate was counting the placeholders.** It summed whatever text would actually render, which
for ten of eleven groups is a catalogue description of about 37 words per object rather than a story
of 231. So the collection view was **understating every group by four to six times** — the anemone
page advertised five minutes for a page that will take thirty. That is the exact number §9 says a
visitor uses to decide whether to commit, and it was wrong in the direction that loses their trust.

An object with no story is now costed at the §6 benchmark, because §6 commits every object to a real
story and the figure exists to describe the finished page. Nothing is asserted; adding a story moves
the number automatically. The group page states its own basis rather than hiding it — *"8 models.
About 13 minutes. Costed as if every object were written; 7 of 8 are still placeholders."*

| Page | Was | Now |
|---|---|---|
| Jellyfish (13) | 4 min | **20 min** |
| The man o' war and other floating colonies (8) | 4 min | **13 min** |
| Sea slugs (14) | 3 min | **22 min** |
| Sea anemones (19) | 5 min | **30 min** |
| Worms of the seabed (15) | 4 min | **23 min** |

**The whole collection comes to 30,041 words — 200 minutes, about 3 hours 20 minutes of reading.**
That number did not exist before
and it is the strongest argument in the scaling case — for the writing budget, and for the claim
that eleven finite pages beat one unreachable scroll.

**It also sharpens question 2 rather than settling it.** Thirty minutes is not a gallery visit; it
is an evening at home. Either the anemone page splits, or the app has to be honest that its biggest
pages are for the sofa rather than the vitrine.

### 3. Four prefix spellings, confirmed — and §5 still says three

`BUILD-SPEC-v2.md` §5 asserts three and instructs the build to assert three. The build prompt
corrects this to four. **Four is right**, verified at build time:

```
Glass Model Invertebrate:    Glass model invertebrate:
Glass model Invertebrate:    Glass Invertebrate Model:
```

§5's text needs the same correction the build prompt already carries, or the next person to
implement the assertion will write it against the wrong number and it will fail on `.110`.

### 4. The manifest is 73% over budget, and it is on the critical path

§5 budgets "~150KB for 127". Measured for 128:

| | Raw | Gzipped |
|---|---|---|
| whole manifest | **260KB** | 81KB |
| base64 placeholders | 113KB | **59KB** |
| everything else | 146KB | 22KB |

The placeholders are **73% of the compressed manifest** and are the whole reason the JS bundle is
133KB gzipped rather than ~75KB. Because the manifest is bundled into the SPA, **every visitor
downloads all 128 objects' placeholders to see one page of eight.**

The spec never says the manifest must be one file, and nothing in §8's routing needs it to be.

#### Resolved — split per group, and it halved first paint

`scripts/split.mjs` runs as a prebuild step and turns the harvest output into one chunk per group
plus a small index. §5's argument is untouched: the harvest still happens once, at build time, and
the live API is still never called at runtime. Only the packaging changed.

**What stays in the main bundle** is the index — eleven titles, eleven representative images, the
build-time reading times, and the accession-to-group map that `/o/{accession}` needs in order to
route at all. **6KB gzipped.** Everything else arrives when its page is asked for.

| | Before | After |
|---|---|---|
| Main bundle | 445KB / **141KB gz** | 169KB / **56KB gz** |
| Group chunk, on demand | — | 8–19KB gz |

Measured at 390×844, throttled to 130KB/s, cold cache:

| Route | First paint before | **after** | Transferred before | **after** |
|---|---|---|---|---|
| `/` eleven tiles | 1,728ms | **876ms** | 404KB | **295KB** |
| `/g/floating-colonies` | 1,664ms | **824ms** | 204KB | **105KB** |
| `/o/1884.137.33` | 1,652ms | **820ms** | 265KB | **166KB** |
| `/g/sea-anemones` | 1,732ms | **820ms** | 296KB | **206KB** |

**First paint halved — 1.66s to 0.82s — on every route.** The estimate was 0.6s; the measured saving
is 0.84s, because the split removes the data from the parse and execute path as well as the wire.

The QR arrival's largest paint dropped from 2,636ms to **2,068ms**, and the anemone page's from
1,732ms to **1,140ms**.

**§5's ~150KB budget is now the wrong question.** No visitor loads the manifest. The number that
matters is what a single page costs, and that is 56KB of bundle plus one 8–19KB chunk.

### 5. The ~18.7KB metadata block is far worse on the small derivatives than §12 implies

§12 records that every derivative carries ~18.7KB of Photoshop/EXIF/XMP metadata and concludes that
"a smaller size saves almost nothing". True — and the consequence for §5's baked placeholders is
not drawn anywhere:

**128 NANO derivatives (24×35px) total 2,412KB. The pixels are 83KB. Metadata is ~96.5% of it.**

Baking NANO straight into the manifest gives a **3.2MB** manifest. The harvest strips every APPn and
COM segment — no re-encode, pixels untouched — and lands at ~660 bytes per placeholder, inside §5's
stated 400–800 byte expectation. **Without that step §5's own byte budget is unreachable**, and the
spec does not mention it. Anyone implementing from §5 alone will hit this.

### 6. `groups.json` and the spec prose disagree, in three places

`groups.json` is the authority and the prose is stale:

- **Worms of the seabed is 15 objects, not 14.** §6's table and `docs/group-panels.md`'s heading
  both say 14. `.110` is the difference.
- **Totals are 128, not 127**, everywhere in §6, §9 and §12 — and §5 says so explicitly, then the
  rest of the document keeps the 127.
- Group 11's `panelSeed` says "Ten of these 127".

Confirmed on 128 rather than 127, per §5's own instruction to re-run every `[V]`:

| Claim | On 128 |
|---|---|
| 9 blank `current_rights_code` | **9** — `.36 .55 .56 .61 .80 .98 .103 .23 .33`. Unchanged. `.33` is one. |
| aspect ratios 0.62–1.72 | **0.62–1.72**. Unchanged. |
| every object has an image | **true**, 128/128 |
| accession numbers unique | **true** |
| three prefix spellings | **four** |

### 7. §8's `replaceState` rule is ambiguous where it matters most

"The URL always names what is on screen" is underdetermined at exactly two points: the top of a
group page, where the panel *and* the first object are both on screen; and the moment of a QR
arrival, before the visitor has moved.

Implemented naively, both go wrong. Naming the nearest object at scroll-top means **`/g/{slug}` can
never appear in the address bar** — the group page becomes unshareable. Correcting that by waiting
for the panel to leave the screen then **destroys the arrival URL** on `/o/{accession}`, rewriting
it to `/g/` before the visitor touches anything. I hit both.

The rule I settled on, which the spec should state: **the URL names the object whose section
contains the vertical centre of the viewport; if no section does, it names the group.** That is
stable at scroll-top, stable on arrival, and needs no "has the user scrolled yet" flag.

### 8. The `measurements` field needs prefix stripping the spec does not mention

§5 says measurements are multi-valued and must be parsed, not concatenated. It does not say the
values carry their own internal labels:

```
Dimensions (LxWxH): whole: 70 x 60 x 280mm
1 - Model: 165 x 95 x 95mm
```

Rendered raw, the second reads as `1884.137.61 · 1 - Model: 165 x 95 x 95mm`. §6 promises layer 1
"promises a size"; delivering `1 - Model:` is not that. I strip only the `Dimensions (LxWxH):`
prefix; the per-part labels survive and look like noise. Needs a rule.

### 9. The stray-artefact premise in the build prompt is already handled

The build prompt says ~62MB of audio-generation artefacts "end up in any build". They are **already
in `.gitignore` and `.vercelignore`** — untracked, and excluded from Vercel uploads. They can only
reach a build via a local `vite build` in your own checkout, and they never reached the deployed
v1. Nothing needed doing.

**Removed beyond the list, on request:** `public/audio-guide.mp3` (5MB) and `public/man-o-war.mp4`
(1.9MB) — v1's own assets. `public/` is now empty. §12 keeps assembly video in the *product*, but
that will be per-object generated media, not this file; and §13 inverts v1 by deriving audio from
the text, so v1's separately-authored recording is superseded rather than pending. Both are
recoverable from git history if a future build wants them.

`dist/` is now **three files, 425KB**, down from ~7.4MB.

**Also dead, and removed:** `vite.config.js` still carried the `/api` CORS proxy for dev and
preview. v1 needed a server-side hop because the collection API only allows the vendor's own docs
origin; v2 harvests at build time and makes no runtime call, so the proxy was doing nothing in
either config. Same category as the `vercel.json` rewrite in finding 10 — both would have sat there
looking load-bearing.

**Deliberately left**, because it is authored or reference material rather than shipped code:
`src/data/fallback.json` (the captured API record — unimported, so it costs nothing in the build,
and it is the response-shape reference for anyone touching the harvest), `BUILD-SPEC.md`,
`docs/man-o-war-{audio-guide,object-story,quiz}.md` (v1's two texts are the inputs to §6's merge),
and `docs/screenshot.png`.

**One thing left that is now wrong: `README.md`.** It describes v1 — a single object, three canvas
modes including 3D, a video, a quiz, and "the live fetch is real, every session". Every one of those
is false in v2, and §5 explicitly says the README has to be rewritten because "v1's pitch was 'the
live fetch is real, every session,' and this changes that story". The house rules for this build say
no readme, so I did not touch it. **It needs a rewrite before this is shown to anyone**, and that is
a writing task, not a cleanup one.

### 10. `vercel.json`'s API proxy is now dead, and the rewrite it needs instead is different

v1's `vercel.json` proxied `/api/*` to the Museum to get around CORS. **There is no runtime API
call in v2**, so that rewrite is dead. It has to be replaced by an SPA catch-all anyway, or
`/o/1884.137.33` — the one URL that gets printed on a label — returns 404 on a cold load. I
replaced it. Flagging because it is a deploy-config change the spec does not mention and it is the
kind of thing that only fails in production.

---

## What is built, and what is not

**Built:** the harvest with its assertions; `/` with all eleven tiles and every object as a second
tab; all eleven group pages; `/o/{accession}` for all 128 accessions; search; the two reading
essays; lazy media; `replaceState` on scroll and `pushState` on jumps; dark grid and dark wells
with a `prefers-color-scheme` reading area; **all 128 stories**; nine languages with RTL; the
audio guide; the desktop layout; text-size and high-contrast controls.

**Not built, per scope:** trails, quiz, video, NZSL, service worker, NFC, the seen-set, deep zoom.

> **This section is superseded from here down.** Everything below was measured against the build as
> it stood when only one story existed and the media well was a fixed 70dvh. Two of its findings
> have since been overtaken:
>
> - **The depth cliff is gone.** All 128 stories are written, 95 words median, minimum 78. The
>   question "does a short entry beside a real one read as neglect" no longer has a subject, and
>   `scripts/split.mjs` fails the build if a story is emptied.
> - **The page heights are smaller.** The well now takes its aspect from the manifest rather than
>   being a fixed 70dvh — 89 of the 128 photographs are landscape, so the old well was on average
>   49% empty black. Sea anemones went 29.9 → 23.2 screen-heights on a phone, and 22.8 → 14.5 on a
>   1440px screen once the two-column desktop layout arrived. Reproduce with
>   `node scripts/heights.mjs http://127.0.0.1:4174 390x844`.
>
> The judgment calls below still stand: nobody has held any version of this in a gallery.

**Confirmed on a real phone.** Deployed as a Vercel preview and opened on a physical device: the
three routes load and the app functions. That retires the "never left the emulator" caveat.

**Still not established, and the distinction matters.** *It works* is not *it works well*. Every
number in this document is still emulated Chrome, and the four questions are judgment calls that a
functioning build does not answer:

- whether a visitor can tell what is behind each tile **before tapping it** (question 1)
- whether anyone actually **reaches the bottom** of 11.7 screen-heights (question 2)
- whether the QR arrival reads as *the right thing* **within five seconds** to someone who did not
  build it (question 3) — that claim is still an inference from a 2.4s LCP, not an observation of a
  person
- what any of it feels like **standing up, in a gallery**, at 2–3% of visitors' attention

Those need someone other than the author, and question 4's numbers need a real throttled connection
rather than an emulated one.

**Operational note.** The preview is deployed into the existing `manowar` Vercel project, so this
worktree is linked to the project that serves live v1. A `vercel --prod` run from this directory
would replace the job-application build. Deploy previews only, or move to a separate project before
that becomes a habit.

## After the UI rework — remeasured

Same harness, same conditions: `node scripts/measure.mjs http://127.0.0.1:4174`, throttled to
130KB/s with 150ms latency, viewport 390×844, cache disabled.

| Route | FCP | LCP | Transferred |
|---|---|---|---|
| `/` — eleven tiles | 1,460 → **996ms** | 3,832 → **2,896ms** | 419 → **266KB** |
| `/g/floating-colonies` | 1,444 → **960ms** | 4,212 → 4,212ms | 173 → **122KB** |
| `/o/1884.137.33` | 1,460 → **952ms** | 2,428 → **2,200ms** | 234 → **183KB** |
| `/g/floating-colonies`, scrolled to the end | — | 7,956 → **4,216ms** | 552 → **501KB** |
| `/g/sea-anemones` | — | **1,288ms** | 296 → **223KB** |
| `/g/sea-anemones`, scrolled to the end | — | — | 1,373 → **1,300KB** |

**First paint is a third faster on every route and no route got heavier.** The lazy-media saving
still holds: the worst page in the collection is 223KB on arrival against 1,300KB scrolled to the
bottom, so the ~1MB is still only paid by someone who actually reaches object nineteen.

Page heights, `node scripts/heights.mjs http://127.0.0.1:4174 390x844`:

| | before | phone, aspect-driven wells | desktop, two columns |
|---|---|---|---|
| sea anemones, 19 objects | 29.9 | **23.2** | **14.5** |
| worms, 15 | 24.4 | 18.6 | 11.3 |
| jellyfish, 13 | 21.8 | 19.6 | 12.4 |
| floating colonies, 8 | 14.4 | 12.9 | 8.0 |
| **all eleven** | **210.4** | **166.5** | **102.6** |

**Thirty screen-heights is now twenty-three, and fourteen on a laptop.** It is still a long page.
Nobody has yet scrolled any version of it in a gallery, and that remains question 2's real answer.

Verified alongside: 34 contrast pairs across four palettes; the skip link is first in the tab order
and lands focus in `<main>`; the display dialog moves focus in, traps it, marks `#root` inert and
restores focus to its trigger on Escape; 200% text produces no horizontal overflow on a 390px
phone; Arabic mirrors the layout without flipping the photographs; and the narration plays with the
spoken word highlighted and kept on screen.

## Scripts

| | |
|---|---|
| `node scripts/harvest.mjs` | Re-harvests 128 records, rebuilds `src/data/manifest.json`, runs the assertions. ~9s of Museum server time. |
| `node scripts/budget.mjs` | Manifest size breakdown and reading-time arithmetic. |
| `node scripts/measure.mjs <origin>` | The throttled measurements in this document. Needs `npm run preview` running. |
| `node scripts/contrast.mjs` | Asserts every rendered colour pair against its WCAG floor, across all four palettes. Reads the values out of `src/styles.css`, so they cannot drift. Runs in `prebuild`. |
| `node scripts/heights.mjs <origin> [WxH]` | Page height for all eleven group pages, in screen-heights. The number question 2 argues about, at any viewport. |
| `node scripts/shot.mjs <origin> <out> [path] [WxH] [light\|dark] [fold\|full] [scrollPx]` | A faithful screenshot, plus horizontal-overflow and console reporting. `SEED=` pre-seeds localStorage (text size, contrast, language); `CLICK=` presses a selector first, for anything behind a button. **Not** `grid-shot.mjs` — that one forces the grid to two columns so eleven tiles fit one frame, which makes it a contact sheet rather than a rendering. |
