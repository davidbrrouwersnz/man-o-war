# Build spec — Portuguese man o' war

A single-object companion app for Canterbury Museum **1884.137.33**, the Blaschka glass
model of a Portuguese man o' war.

The object fills the screen in three forms. Everything else floats over it. Two sheets
carry the story and a short quiz. Built in two hours, demoed on a phone and a laptop on
office wifi.

---

## 1. Stack

- **Vite + React.** State is small but genuinely stateful — canvas mode, three kinds of
  persisted canvas position, audio, sheet, quiz progress. React earns its place here.
  Vanilla is viable if preferred; nothing below depends on React.
- **`<model-viewer>`** for the GLB. One script tag, orbit + pan + pinch handled on touch
  and mouse. Do not hand-roll three.js orbit controls — that is the single most likely
  way to lose forty minutes.
- **Pan/zoom:** `@panzoom/panzoom` handles wheel and pinch in one small dependency.
  Verify pinch behaviour on a real phone early; if it fights you, fall back to a manual
  pointer-event transform, which is about thirty lines.
- No UI framework, no component library, no state library.

**Assets** in `/public`:

```
/public/man-o-war.mp4      ~10MB, silent
/public/man-o-war.glb      ~10MB
/public/audio-guide.mp3    574 words, ~3.8 min
```

---

## 2. The CORS proxy — do this first

The collection API sends `Access-Control-Allow-Origin: https://apidocs.browser.vernonsystems.com`.
A single hardcoded origin, the vendor's own docs browser. Every other origin is refused,
and no client-side option changes that. All JSON must go through a server-side hop.

**Dev** — `vite.config.js`:

```js
const proxy = {
  '/api': { target: 'https://collection.canterburymuseum.com', changeOrigin: true }
}
export default { server: { proxy }, preview: { proxy } }
```

**Deployed** — Vercel `vercel.json`:

```json
{ "rewrites": [{ "source": "/api/:path*", "destination": "https://collection.canterburymuseum.com/api/:path*" }] }
```

Netlify: the same as a redirect with `status = 200`.

Both expose `/api`, so app code is identical in dev and production. Nothing to swap.

**Phone demo:** `vite --host`, then hit the laptop's LAN address from the phone. The
proxy runs on the laptop.

**Images do not need the proxy.** CORS only bites on `fetch`. An `<img>` loads from the
Museum directly, and CSS-transform pan/zoom never touches pixel data. Canvas mode 1
works even if the JSON call fails.

---

## 3. Data — one call per session

Fired once on mount. Not per render, not per mode switch, not hardcoded.

```
/api/v3/opacobjects?query=accession_no%3A%221884.137.33%22&limit=1&view=detail
```

### Response shape

`opacObjectFieldSets` is an array of `{ identifier, opacObjectFields }`, so a helper is
needed rather than direct property access:

```js
const field = (rec, id) =>
  rec.opacObjectFieldSets.find(f => f.identifier === id)
     ?.opacObjectFields?.[0]?.value ?? null
```

### Mapping

| Screen | Path |
|---|---|
| Title | `field(rec, 'name')` |
| Description | `field(rec, 'brief_desc')` — collapse the double space after "of" |
| Canvas image | `rec.imagesCollection.images[0].imageDerivatives`, find `identifier === 'XLARGE'`, take `.url` |
| Natural size | same object, `.width` / `.height` — currently 681 × 1000 |
| Palette | `rec.imagesCollection.images[0].cssColors` |

Expected values today: title is `Glass Model Invertebrate: Physalia pelagica`;
`brief_desc` is three plain sentences ending "…between 1863 and 1882."

**`images[0]` is the rule.** First image in the array, no scoring, no heuristics. Only
one image is used; the second is not displayed anywhere.

### Fallback fixture

Commit the captured response as `src/data/fallback.json`. On fetch failure, fall back to
it and `console.warn`. Office wifi dying mid-demo is a bad moment and this is five lines.
Note it in the readme — the live fetch is real and attempted every session; the fixture
is insurance, not a stand-in.

---

## 4. Layout

```
┌─────────────────────────────────────────────┐
│  Title                        [♪] [Aa] [?]  │
│  Description (desktop only)                 │
│                                             │
│ ┌─┐                                         │
│ │▣│            CANVAS                       │
│ │▶│         (full bleed)                    │
│ │◆│                                         │
│ └─┘                                         │
│                                             │
│  Attribution badge                          │
└─────────────────────────────────────────────┘
```

Responsive means the same layout reflowed. Nothing rearranges.

- **Tab rail** — left edge, vertically centred, three icons, 44px minimum targets.
  Watch for collision with the title and badge at short viewport heights.
- **Top right** — three buttons, in this order: audio, text, quiz. Any order the visitor
  likes; the order is only a default reading path.
- Inline SVG icons. No icon dependency.

---

## 5. Canvas — three modes

**All three stay mounted at all times.** Toggle visibility, never conditionally render.
This is what makes state persistence free rather than a feature you have to build.

### Mode 1 — Image

XLARGE from the API. Pan and zoom, touch and mouse.

**Cap max zoom at 2.5×.** The source is 681 × 1000, and the object is a tall narrow
thing in a portrait frame, so real pixels on the glass are fewer than the dimensions
suggest. A deliberate limit reads as respect for the source; an uncapped zoom that
degrades into mush reads as a bug. No upscaling, AI or otherwise — mode 1 is the
documentary record and stays that way.

Portrait image on a landscape canvas: fill-crop and let the tentacles run off the bottom.
Letterboxing a full-bleed canvas defeats the point.

### Mode 2 — Video

Local mp4, silent, `muted` + `playsinline` + `loop`. Both attributes are required for
autoplay to work at all on iOS and Safari.

Loops. Autoplays on every entry to the mode. Resumes position — `currentTime` persists
because the element is never unmounted. On mode exit call `pause()`, or it plays on
under the other canvases.

Tap toggles play/pause.

### Mode 3 — 3D

```html
<model-viewer src="/man-o-war.glb" camera-controls touch-action="none"></model-viewer>
```

Rotate, zoom, pan. Camera position persists for the same reason.

### Eager fetch

After the canvas image fires `onload`, start fetching the video and GLB. Two 10MB files
on office wifi — the visitor should never wait at a mode switch.

---

## 6. Audio

Local mp3, played from the top-right button. Play/pause toggle only, no scrubber, no
timeline.

Plays across all three canvas modes and continues while a sheet is open. The video is
silent by design, so the guide keeps running underneath it.

Button shows play; switches to pause while playing.

---

## 7. Attribution badge

Bottom left. Bound to the current canvas mode. Sheets cover it.

```
Mode 1   Canterbury Museum 1884.137.33 · CC BY-NC 4.0
Mode 2   Generated video, from Canterbury Museum photographs
Mode 3   Generated 3D model, from Canterbury Museum photographs · not a scan
```

The "not a scan" rider is on mode 3 only. That is where people assume photogrammetry and
assume they are looking at measured reality. Mode 2 does not carry the same risk.

---

## 8. Sheets

Side panel at every breakpoint, sliding from the right. Up to full width on phone.
Overlaps all other content including the badge. Closable at any time — close button,
Escape, and backdrop tap where a backdrop is visible.

Only one sheet open at a time. Opening one closes the other.

### 8a. Text sheet

The eight narrative sections of `man-o-war-object-story.md`, headings kept:

1. Look closely
2. Not one animal
3. A float, and a sail
4. Why glass?
5. A father and son
6. How it was made
7. Arriving in Christchurch
8. Where it's been since

Nothing else from that file. No object table, no API notes, no open questions.

**One amendment to the copy.** In "Arriving in Christchurch", attribute the chain
in-line, because the Press was never consulted directly:

> The Press reviewed the shipment that month, and singled this one out. The man o' war,
> it wrote, "resembles nature so closely as to be deceptive". *(Quoted in Le Grice.)*

**Source badges** at the foot. Three, all links, all live:

| Label | Destination |
|---|---|
| Collection record 1884.137.33 | `https://collection.canterburymuseum.com/objects/glass-model-invertebrate-physalia-pelagica` |
| Le Grice, *The Blaschka Collection* | `https://www.canterburymuseum.com/explore/collections/the-blaschka-collection` |
| Shaw et al. 2017, *Records of the Canterbury Museum* 31 | `https://cms.canterburymuseum.com/assets/Canterbury-Museum-Records-2017.pdf` |

A badge is a destination. No fourth badge for the Press — it has no destination of its
own, and a badge in a further-reading row would claim a source that was not read.

### 8b. Quiz sheet

One question at a time, options below. No timer — self-paced.

```js
const quiz = [
  { q: "A Portuguese man o' war looks like a single animal. What is it really?",
    a: ["One very large jellyfish",
        "A kind of floating seaweed",
        "A colony of many small animals living as one",   // correct
        "A young octopus"], correct: 2 },

  { q: "Why couldn't the Museum display a real man o' war?",
    a: ["They are too rare to catch",
        "They are too big for a display case",
        "Preserving one strips away almost all its colour", // correct
        "They were protected by law in the 1800s"], correct: 2 },

  { q: "Every man o' war is either left-handed or right-handed. What decides which?",
    a: ["The way its sail curves",                          // correct
        "Which tentacle grew first",
        "The ocean it was born in",
        "Which way it spins in the water"], correct: 0 }
]
```

Answers display in source order. **Do not shuffle** — the distractors were written to
sit in specific relationships to each other.

**On selection:** lock all options. Mark the chosen one right or wrong, and highlight the
correct one at the same moment. Hold ~1800ms, then advance. Tune the hold on a real
read-through; it must be long enough to take in a four-option list, short enough not to
feel like a punishment.

A wrong answer is stated plainly and moved on from. No penalty language, no sound, no
shake.

**Results:** score as `2 of 3`, and a close button. Nothing else.

**Progress rules:**

- Close mid-quiz → reopen resumes the same question with the same score.
- Close from the results screen → resets. Next open starts at question 1.

---

## 9. Visual language

**Type and colour follow the Museum's object detail pages.** Open
`https://collection.canterburymuseum.com/objects/192938/glass-model-invertebrate-physalia-pelagica`,
inspect the body copy, and copy the font stack, sizes, line height and text colour into
tokens. Ten minutes, and it is the difference between "looks like a museum" and "is
consistent with the museum". This applies to the **text sheet** primarily.

**The canvas overlay palette comes from the API**, extracted from the photograph itself:

| Token | Hex | Note |
|---|---|---|
| `--ink` | `#000000` | 92% presence in the image — the photographic ground |
| `--light` | `#b0c4de` | light steel blue, the specimen itself |
| `--accent` | `#4682b4` | steel blue |

Light type on near-black, steel blue accent. Hardcode these as defaults regardless —
`cssColors` is empty on some images, so the fallback is needed anyway.

Overlay chrome stays quiet. The object is the hero and the only hero; every piece of
furniture on the canvas is a label or a control, and none of it competes.

---

## 10. State model

```
canvasMode      1 | 2 | 3                    default 1
imageTransform  { x, y, scale }              persists
videoTime       number                       persists (via the element)
cameraOrbit     model-viewer internal        persists (via the element)
audioPlaying    bool
sheet           null | 'text' | 'quiz'
quizIndex       number
quizAnswers     array
quizComplete    bool
```

Persistence comes from keeping the three canvases mounted. Do not try to serialise and
restore transforms — hide the element, don't destroy it.

---

## 11. Build order

Skeleton first because everything hangs off it. Then the riskiest mode immediately, so
if the 3D viewer is going to fight, it fights at minute twenty rather than minute
ninety. The quiz is last because it is pure state logic with no unknowns — the only
piece that cannot surprise you late.

| | | Minutes |
|---|---|---|
| 0 | Proxy + one API call rendering the title | 15 |
| 1 | Shell: canvas, rail, buttons, badge, empty sheet | 15 |
| 2 | Mode 3, GLB | 15 |
| 3 | Mode 1, image pan/zoom | 20 |
| 4 | Mode 2, video | 10 |
| 5 | Text sheet + source badges | 15 |
| 6 | Quiz | 20 |
| 7 | Responsive pass, phone check | 10 |

120 minutes with no slack. If something has to go, cut the responsive pass and demo on
one device — everything above it is load-bearing.

---

## 12. Out of scope, deliberately

- **The visitor is never told which claims came from the database and which from the
  publications.** That is the point. It lives in the interview and in the source, not in
  the interface.
- The *Physalia pelagica* / *physalis* discrepancy between Museum sources. Not solved,
  not surfaced.
- The second image. Dropped.
- Any gesture toward the wider Blaschka collection.
- Image selection at collection scale. Readme material.
- Audio scrubbing, quiz timers, sharing, analytics, offline.

---

## 13. Assumptions — flag if wrong

- Default canvas mode on load is the image.
- Section headings are shown in the text sheet.
- The quiz has no timer, despite the Kahoot source specifying 30 seconds per question.
- Audio keeps playing while a sheet is open.
- Tab rail sits at the left edge, vertically centred.
