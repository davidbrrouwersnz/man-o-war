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

**The rule needs one clause and one exception**, both cheap: require the subject to fill at least
~8% of the frame before a photograph is eligible, and pin `1884.137.33` as group 2's
representative. That keeps the dark grid and gives back the two tiles it cost.

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
field and §6's content table has no `headline`. 128 plain-English names have to be written and
checked by someone, or §10's header collapses to one line. It should be in the §5 content record
next to `story`.

### 2. §10's own worked example contradicts §6's word-count benchmark

§10 prints "8 models. About 9 minutes." for the floating-colonies page, computed at 150wpm. §6
establishes the man o' war's 231 words as the layer-1–2 benchmark for a written entry.

8 × 231 + the panel and ending = **1,923 words = 12.8 minutes**, not 9. To reach 9 minutes an
average object story must be ~160 words, which is 30% under the template. Extended to the anemone
page: 19 objects is **29.9 minutes**, not the ~24 the build prompt quotes.

One of the two numbers is wrong and it matters, because §9 requires the cost to be stated to the
visitor before they commit. **A page that says 9 minutes and takes 13 is worse than one that says
nothing.**

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

The spec never says the manifest must be one file, and nothing in §8's routing needs it to be. A
per-group split would take the group page's blocking payload from 133KB to roughly 55KB — around
0.6s off first paint at 130KB/s. **I did not build it**, because it is not in scope and the spec's
single-manifest framing is load-bearing for §5's "harvest once" argument. It is the highest-value
change available and should be a decision, not an oversight.

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

**Built:** the harvest with ten assertions; `/` with all eleven tiles; `/g/floating-colonies` in
full; `/o/{accession}` for all 128 accessions; lazy media; `replaceState` on scroll and `pushState`
on jumps; dark grid and dark wells with a `prefers-color-scheme` reading area; the one real story;
127 labelled placeholders.

**Not built, per scope:** the other ten group pages (they render a stub page naming the one that is
built), `/all`, search, layers 3–5, trails, quiz, audio, video, NZSL, languages, service worker,
NFC, the seen-set, desktop's sticky-media behaviour.

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

## Scripts

| | |
|---|---|
| `node scripts/harvest.mjs` | Re-harvests 128 records, rebuilds `src/data/manifest.json`, runs the assertions. ~9s of Museum server time. |
| `node scripts/budget.mjs` | Manifest size breakdown and reading-time arithmetic. |
| `node scripts/measure.mjs <origin>` | The throttled measurements in this document. Needs `npm run preview` running. |
