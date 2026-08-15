# Build spec v2 — the Blaschka collection

A companion for Canterbury Museum's **Blaschka glass collection** — 127 nineteenth-century glass
models of invertebrates, made by Leopold and Rudolf Blaschka in Dresden and acquired by the
Museum in 1883.

Not "marine invertebrates", though the collection is usually described that way: **ten of the 127
are land or freshwater animals** — five land slugs, two Roman snails, a pond ramshorn, a
freshwater leech and a freshwater flatworm — and **one is not a model at all** but a fragment of
an unknown one **[V]**. A curator will correct that sentence first, so do not write it.

v1 was one object. v2 is the collection, explored in layers.

---

## 1. What this is, and what it is not

**Purpose.** A pitch to Canterbury Museum, and an answer to two questions: how would this scale,
and what would you change. It is a designed proposal, not a commissioned build.

**Audience.** The in-gallery visitor. Someone standing in the Museum with a phone. The at-home
browser is served by the same product but is not who it is designed around.

**Relationship to built-in AV.** Not every collection will get an audiovisual experience. This is
one answer for the collections that will not. Where a collection *does* have AV, this
**complements** it — it goes deeper than a wall screen can, it travels home with the visitor, and
it costs nothing to update. **It is not a substitute for built-in AV and must never be pitched as
one.** Exhibition designers are the people whose support this needs.

**Today.** One object — the Portuguese man o' war, **1884.137.33** — is on display at the
Canterbury Museum Pop-Up, on its own. Everything else is understood to be in storage at Hornby
**[A]** — the collection record has no display-status field, so nobody outside the Museum can
confirm which objects are out (**Q4**). That asymmetry is the product:

> Here is the one you can see. Here are the other 126 you can't.

---

## 2. Evidence tags

This document mixes measured fact with reasoning, and they should not carry equal weight.
Convention borrowed from the Museum programme's own accessibility documentation plan:

| Tag | Meaning |
|---|---|
| **[V]** | Verified against a primary source or measured directly |
| **[C]** | Community or expert position |
| **[J]** | Our judgment — reasoned, not sourced |
| **[A]** | Assumption in use, pending verification |

Anything **[A]** that is load-bearing appears in §22.

---

## 3. What changed from v1

| v1 | v2 | Why |
|---|---|---|
| One object | 127 | The scaling question |
| Full-bleed canvas, chrome floating over | Scrolling page: media, then story beneath | Floating chrome does not survive a browse model **[J]** |
| Three canvas modes incl. 3D | Image and video | §12 |
| Image pan/zoom to 2.5× | None in this build | §12, §22 |
| Story hidden in a sheet | Story inline beneath the media | Every tap between a visitor and the writing is where most of them stop **[J]** |
| Live API call per session | Build-time manifest | §5 |
| Audio script authored separately | Text is the source; audio derived from it | §13 |
| English only | Multilingual by design | §7 |
| Dark everywhere | Dark media; reading area follows the device | §15 |

**Out entirely: the 3D model.** Heaviest asset (30MB **[V]**), riskiest dependency, the only
thing needing a "not a scan" disclaimer, and the one feature that could never reach 127 objects
honestly — 248 images across 127 objects, 60 of which have exactly one photograph **[V]**.
Generating 3D from a single catalogue photo invents anatomy nobody observed. Cutting it is the
opening move of the scaling argument.

---

## 4. Stack

- **Vite + React.** Route, collection scroll position, seen-set, media state, audio across
  navigation, language, sheet, quiz.
- **A router.** New requirement — §8.
- **A service worker**, for the offline floor — §18.
- No UI framework, no component library, no state library.
- `<model-viewer>` and `@panzoom/panzoom` both **removed**.
- Content is served from a **headless store, per-object × per-language × per-track**, referencing
  collection object IDs. The collection CMS is the authority for object records; it is not a
  multilingual interpretation store **[C]**.

---

## 5. Data — a build-time manifest

v1 fetched live every session. v2 cannot **[V]**:

- The API caps at `limit=100`, so 127 records need two requests.
- `view=detail` is served **uncompressed** — ~1MB for the full set.
- It is not CDN-cached (`X-Cache: Error from cloudfront`).
- 5.15s TTFB at `limit=100`; about **8 seconds of server time before a single thumbnail can begin
  loading**.

So: **harvest once at build time.** The live API remains the source of truth and the harvest is
re-run on demand; it is not a runtime dependency. Say this plainly in the README — v1's pitch was
"the live fetch is real, every session," and this changes that story.

### Harvest query — do NOT harvest on `collection`

```
/api/v3/opacobjects?query=maker_name%3A%22Leopold%20Blaschka%22&limit=100&view=detail
/api/v3/opacobjects?query=maker_name%3A%22Leopold%20Blaschka%22&limit=100&offset=100&view=detail
```

**The obvious query is wrong, and finding out why is the best thing in this pitch.**

`collection:"Blaschka Glass"` returns **127**. `maker_name:"Leopold Blaschka"` returns **128**
**[V]**, verified live. The difference is a real model:

> **1884.137.110 — "Glass model Invertebrate: *Terebella conchilega*, developmental stages"**
> Six photographs. Documented in Shaw et al. 2017. **Its `collection` field is an empty string**,
> so the Museum's own collection query cannot find it.

Three consequences, and they run in opposite directions:

- **It breaks a build assertion.** Its title carries a **fourth** prefix spelling — `Glass model
  Invertebrate:`, lowercase *model*, capital *Invertebrate*. §5's title-strip asserts three.
- **Every `[V]` count in this document was measured on the 127** — image coverage, `brief_desc`
  distinctness, the nine blank rights records, the binomial counts. **Re-run them on 128 before
  any of these numbers goes in front of a curator [A].**
- **It is the strongest opening line available.** *"Your database holds a Blaschka model your own
  collection query cannot return, and here is its accession number"* is a better first sentence to
  a museum than anything else in this proposal. Report it as a data-quality finding; do not
  quietly absorb it.

**Never print a total in visitor-facing copy.** The Museum's website and Shaw et al. both say 133;
the API says 127 or 128 depending on the query; the illustrated catalogue documents 122 **[V]**.
The disagreement is layer-5 content, not a headline (§6).

### Harvest rules — each is a measured trap **[V]**

- **Only `offset` paginates.** `start`, `page`, `from`, `skip` are silently ignored and return
  page one again.
- **Terminate on `opacObjects` being absent or empty — never on `totalObjects`.** Past the end,
  `totalObjects` returned `298606` at offset==total and `0` beyond.
- **`limit=101` is HTTP 400.** `limit=0` returns an empty body `{}`.
- **Quote multi-word phrases inside the query value**, then URL-encode the whole thing. Unquoted
  terms are OR: `Portuguese Man-o-war` returns 43,989 results; the quoted phrase returns 1.
- **A wrong field name is indistinguishable from no results** — both give HTTP 200,
  `{"totalObjects":0}`, no `opacObjects`.
- Always pass `view=detail`. Omitting `view` returns id-only stubs.

### Per-object manifest record

| Field | Source | Notes |
|---|---|---|
| `accession` | `accession_no` | The key. Unique on all 127 **[V]**. Route on this. |
| `title` | `name`, prefix stripped | See below |
| `binomial` | parsed from `name` | 125/127 carry one; 112 distinct genera **[V]** |
| `description` | `brief_desc` | Present and **distinct on all 127** **[V]**. Median 213 chars. |
| `measurements` | `measurements` | 126/127 **[V]**. Layer 1 promises a size; this is where it comes from. Multi-valued on 112 records — parse, do not concatenate. |
| `image` | `imagesCollection.images[0]` | MEDIUM/LARGE/XLARGE urls, `width`, `height` |
| `aspect` | derived | Needed at build time — the grid cannot reflow on load |
| `placeholder` | derived | ~32px base64, baked in |
| `rights` | `current_rights_code` | **9 of 127 are blank, and 1884.137.33 is one of them** **[V]**. See §14. |
| `taxon` | hand-checked at build time | `{ catalogueName, currentName, status, reason, authority, aphiaId, source, checkedOn }`. Status is one of accepted / superseded / no-current-name. See §6. |

### Per-object content record — the headless store, not the API

The manifest above carries catalogue facts. **None of the interpretive content is in it**, and the
sections that follow assume all of the below exists. Without this table the commitment in §6 has
no data contract and "graceful absence" in §12 has nothing to test.

| Field | Notes |
|---|---|
| `story` | **Required on every object.** Layers 1–2, authored as an **ordered array of segments**, not a blob: `{ id, heading?, text }`. `id` is stable and is the audio chapter boundary, the WebVTT cue boundary and the skip/back target (§13). There is no audio-only field and no print-only field — **the segment text is both** (§13). The commitment in §6 is a build assertion, not a hope: the build fails if any object has none. `brief_desc` is not a story. |
| `pronunciation` | Per-object lexicon entries — `{ token, ipa or respelling }` — for names the voice will mangle: *Blaschka*, *Dohrn*, *Haast*, *zooids*, binomials. **Pronunciation is fixed here, never by changing the words** (§13). |
| `sourceMedium` | `text` (default) or `archival-audio`. Where it is `archival-audio`, the recording is the source and `story` is its transcript; TTS never runs on it (§13). |
| `group` | Which of the eleven groups (`groups.json` is the authority). **Required** — it determines which page an object lives on (§8, §10), so an object without one has nowhere to render. |
| `groupOrder` | Position within the group. The page is a sequence, so the order is authored, not incidental. |
| `groupPanel` | ~50 words at group level, not per object. Eleven of them; English drafts in `docs/group-panels.md` (Q2b). |
| `groupEnding` | One or two sentences closing the page — what you just saw (§10). Eleven of them. |
| `audio` | `{ description, interpretation }` — two tracks (§13), each with text, rendered audio, and WebVTT cues |
| `video` | url **or null**. Null is the graceful-absence signal (§12) — never an empty string, never a placeholder file |
| `nzslVideo` | url or null. Per §7 this is filmed, not generated |
| `language` | Every record above exists per language. See §7 for which content reaches which tier |
| `quiz` | **At least one item per object** (§17): `{ q, options[4], correct, why }`. `why` is one line shown on reveal and links back to the object. Per language. |
| `reviewStatus` | Per language: human-reviewed, machine-translated-and-reviewed, or unreviewed. Feeds the disclosure line in §7 |

**No `blaschkaNo` field.** `catalogue_no` holds an internal F.I.-series number — verified as
`F.I. 3078.0` on 1884.137.33 **[V]** — not the Ward 1878/1888 Blaschka number that Shaw et al.
and the Museum website lead with. **The Blaschka number is not in the API at all.** A route key
on it requires a hand-authored crosswalk the Museum must own. Name it as an ask; do not imply the
data provides it.

**Manifest size:** a record with these fields serialises to roughly **750 bytes**, plus a
base64 placeholder of 400–800 bytes. Budget **~150KB for 127**, not the 40KB an earlier draft of
this spec claimed **[V]**.

**Title stripping.** 125 of 127 names begin `Glass Model Invertebrate: `. Left alone the grid is a
wall of identical boilerplate. **Three spellings exist** — the standard one, lowercase on
1884.137.83, and word-swapped `Glass Invertebrate Model:` on 1884.137.15 **[V]**. Strip all three
case-insensitively and assert the count at build time.

**Do not use `cssColors`.** Present on all 127 primary images and a trap: the dominant chromatic
value is tan on 53 objects, then peru, sienna, burlywood — the cream mount board, not the glass.
29 have no chromatic colour; there is exactly one blue **[V]**. Sorting by it would present the
Museum's photographic backdrop as curatorial structure.

### Fields that look useful and are not **[V]**

`maker_name`, `production_place`, `production_role` and `collection` are **byte-identical on all
127**. `subject_class` and eleven `assoc_*` fields are **empty on all 127**. `production_date` is
populated on 48 with two distinct values. There are therefore **no facets, no filters and no
timeline**. Do not design any.

`slug` is **not unique** — 125 distinct slugs for 127 records. `slug` and `opacObjectId` are not
queryable. Route on accession number.

`relationshipsCollection` contains exactly one relationship on every record: the two Blaschkas.
**No object-to-object links.** Any relatedness is editorial.

---

## 6. Content model — five layers

Depth runs outward from the object in front of you.

| | Layer | Contains | Written |
|---|---|---|---|
| 1 | **The object** | Photograph, name, size, form, mount | Per object |
| 2 | **The animal** | What it depicts, alive | Per object |
| 3 | **The making** | Why glass. Flameworking, eggshell-thin layers, three ways to add colour | **Once** |
| 4 | **The collection** | Dresden, Haast's 1882 order, October 1883, the Technological Room, and since | **Once** |
| 5 | **The evidence** | The catalogue record, the publications, the taxonomy, the disagreements | **Once** |

Layers 1–4 are v1's eight sections, sorted; nothing was bent to fit. **Layer 5 is new, and it
reverses a v1 position.** v1 §12 held that the visitor is never told which claims came from the
database and which from the publications. v2 makes that an optional destination rather than a
hidden property. That is a deliberate change, not an oversight — flag it if you disagree.

**Layers 3–5 are never duplicated onto object pages.** Written once, reached *from* any object at
the point they become relevant.

### The commitment

**All 127 objects get a real written story.** Depth is uneven by nature — a well-documented
anemone will run longer than an unidentified fragment — but **no object ships with the catalogue
description standing in for a story.** `brief_desc` is a cataloguer's physical description; it is
material for layer 1, not a substitute for writing.

For scale: v1's man o' war narrative is **499 words** of prose across eight sections — 526
counting the headings **[V]**. That is the benchmark for a deep entry. Not 1,400, which counts the
source file's tables and notes; and not the 537 an earlier draft of this spec printed, which
counted the title block and the markdown characters — the same error, one order smaller.

### Voice — two of them, and the seam is labelled rather than hidden

**The guide speaks the group panels, the object stories and the page endings.** Direct address is
allowed and wanted — *look at the top section*, *you can count them*. This is not a new decision;
it is what v1's story and audio guide already do, and changing register now would break continuity
with content that exists.

**The catalogue speaks its own description, visibly as the record's words** — not restyled into
ours. It is a cataloguer's physical description and it reads like one; presenting it as the
guide's prose makes us the author of a sentence we did not write.

**We do not write in the Museum's voice.** This is an unsolicited proposal. Adopting the
institutional register of a gallery section panel would claim an authority nobody granted — the
same overclaim the project already refuses when it labels its 3D model "not a scan" and declines
to cite a newspaper it read second-hand.

The consequence is a visible seam between the guide's prose and the catalogue's. **That is
correct.** The seam is what tells a visitor which sentences the Museum recorded and which we
wrote, and it does for free what layer 5 exists to do. Do not sand it out; label it.

### One text, read and heard — the writing standard

Every story is written once and must work **both** as something read on screen and as an audio
guide, because §13 requires the spoken words to be the printed words. This is not a compromise
between two registers; it is a third thing, and it is harder to write than either.

**Write for the ear, then verify on the page.** That order matters — the ear is the tighter
constraint. A sentence that survives being heard once will always read; a sentence that reads
beautifully may be unfollowable aloud.

**The rules, all testable:**

1. **No line may refer to its own medium.** v1's *"Look at the tentacles again as you hear that"*
   fails — cut the last four words and it works everywhere. Equally banned: *as shown below*,
   *pictured*, *scroll down*, *listen*.
2. **Direct address stays; it is the thing that survives both.** *"You can count them."* *"Look at
   the top section."* Those work read and heard.
3. **Never assume the object is in front of the reader.** One object is on display, on a lease
   ending mid-2028, and the other 127 are in storage **[V]** — so physical presence is the rare
   case, not the normal one. *"Take a moment to look at it"* and *"everything you can see is
   glass"* both fail: they are wrong for almost every object almost all of the time, and they age
   badly the moment a display changes. Write facts about the object — *"the whole thing is glass"*
   — which hold in a case, on a sofa, and in 2031.
   **Look cues survive this test if they work on a photograph**: you can count tentacles and find
   the top section in an image as well as in a vitrine.
   §11 still wants the eye sent back to the real thing. That belongs in **a separate one-line
   nudge the app shows only on a gallery arrival** — it knows, from the placement parameter on the
   scanned code (§8) — and never in the story text, which stays single and presence-neutral.
4. **One idea per sentence, and no structure that needs re-reading.** No nested clauses, no
   parentheticals, no asides inside dashes. Flatten them into separate sentences.
5. **Attribution before quotation, always** — quotation marks are inaudible (§13).
6. **No visual-only structure inside a story segment.** No bullet lists, no tables, no "the
   following three". If it needs layout to parse, it is not a story segment.
7. **Numerals follow ordinary print style.** The rule is never to change a word *for* the audio —
   pronunciation is fixed in the lexicon (§5). So *ten metres* stays words and *28 centimetres*
   stays a numeral, because that is what print style wants in each case.
8. **It ships only after someone has read it aloud and read it silently.** If either feels wrong,
   rewrite the sentence — do not split the text.

**This reinforces the translatability rule rather than competing with it.** §7 asks for controlled
terminology, explicit referents and no idiom, on the grounds that it is the highest-leverage
zero-cost intervention and unrecoverable once the stories exist. Writing for the ear pushes in the
same direction: short, plain, explicit, one idea at a time. **Prose that survives being heard is
also the prose that survives being translated twelve times.**

**The man o' war is the worked example and the first task.** v1 holds two texts for the same
object — a 499-word story and a 574-word audio script, deliberately different registers. They
merge into one. That merge is the template for the other 127, and until it exists there is no
standard for anyone else to write to.

**The eleven group panels and endings are held to the same standard** — they are spoken too, and
their current drafts are idiom-dense (*"less a creature than a crew"*, *"That is the sea"*), which
§7 warns against for translation and which the ear test will also catch.

**Design the object section for the shortest story, not the longest.** If the template only looks
considered at 537 words, 126 pages will read as something that failed to load.

### Group panels — PROPOSED, not agreed **[J]**

Roughly 50 words of curator text at the group level, above the objects in that group — as an
exhibition uses a section panel above object labels. It is how an object with two lines and an
object with nine sections sit near each other without the short one reading as neglect.

### The eleven groups

Membership for all 127 is in [`src/data/groups.json`](src/data/groups.json). **This is
hand-authored — the data does not contain it.** Every binomial was resolved through WoRMS to its
accepted name first, because grouping on the catalogue's 1880s names puts animals in the wrong
phylum. It is ours, not the Museum's, and should be labelled that way until a curator reviews it
(**Q2c**).

**Eleven, not seven.** An earlier pass was forced to seven and both independent proposals reported
that seven was one to two pages short of natural, which produced a six-phylum page held together
by habitat and by the *absence* of features. Released from the constraint, two proposals starting
from opposite ends — one from the taxonomy, one from appearance — independently landed on ten and
eleven. Seven was compressing the collection by about a third.

| | Page | Objects |
|---|---|---|
| 1 | **Jellyfish, large and small** | 13 |
| 2 | **Floating colonies** | 8 |
| 3 | **Comb jellies and sea butterflies — the see-through swimmers** | 9 |
| 4 | **Sea squirts and salps** | 10 |
| 5 | **Squid, cuttlefish and the paper nautilus** | 7 |
| 6 | **Sea slugs** | 14 |
| 7 | **Sea anemones** | 19 |
| 8 | **Corals, sea fans and hydroids — animals that grow like plants** | 15 |
| 9 | **Sea cucumbers, feather stars and brittle stars** | 8 |
| 10 | **Worms of the seabed** | 14 |
| 11 | **Never went to sea** | 10 |

**Reading order is the table order, and it is a descent followed by a departure:** the sunlit
surface (1–2), down into open mid-water (3–4), the hunters that patrol it (5), onto the rock
(6–8), onto and then into the sediment (9–10), and finally out of the water entirely (11). A
journey, not an alphabet — which is what gives the grid a reason to be in the order it is in.

**It opens on jellyfish, not on the namesake.** Page 1 is the only page where a visitor recognises
every object on sight, so it earns their trust before the app asks anything of them. Putting the
man o' war second makes it land harder, not softer: page 1 spends thirteen objects teaching what a
jellyfish is, and page 2 opens by taking the most famous "jellyfish" of all away — it is not one,
and it is not even one animal. Opening there would spend that reveal on a cold audience.

**Page 4 is the hinge**, the only page with a foot in both worlds. Ordered internally
drifters-first, anchored-second: the visitor enters it still floating with the salp chains and
leaves it on a rock with the sea squirts. No other page can perform that transition.

**Page sizes now run 7–19 rather than 16–22.** That matters beyond tidiness: each object carries a
media block at ~70% of viewport (§10), so a 22-object page was a scroll nobody would finish. The
finer split fixes a payload and stamina problem at the same time as the taxonomic one.

**Weakest page, stated rather than buried:** page 9. A leathery sausage, a thin-armed brittle star
and a stalked feather star share nothing a visitor can see without being coached — five-fold
symmetry and tube feet are invisible at thumbnail size — and the familiar anchor for the group, a
starfish or an urchin, is absent from the collection entirely. Both proposals independently
produced these same eight objects *and* independently named this page their own worst, which is
strong evidence of a real structural problem rather than a taste call. It survives because the
eight have nowhere else honest to go. **Its panel carries more weight than any other in the
scheme, and it is the first page to rebuild after a real read-through.**

**Order within a page is load-bearing, not incidental.** The anemone page walks flower to stone;
the seabed page walks worm-shaped to sac-shaped; the garden page walks land to pond. Re-sorting any
grid alphabetically or by accession leaves membership identical and destroys three of these
arguments.

**The price of this scheme, and it must be paid:** grouping by appearance and mode of life spreads
Cnidaria across four pages and Mollusca across three. **There is no page a visitor can go to for
"all the jellyfish-type things."** That has to be bought back with search that works across pages —
budget it as part of accepting this grouping, not as a later nicety.

### Named judgment calls a curator could dispute

Raise these rather than be caught by them. Page numbers below are the eleven-group scheme in
[`src/data/groups.json`](src/data/groups.json), which is the authority — **not this prose.**

| Call | Where it lands | Why it is arguable |
|---|---|---|
| **Comb jellies split from the jellyfish** (.52, .53, .127) | page 3 | A separate phylum with no stinging cells. A page titled "Jellyfish and comb jellies" would need immediate qualifying, and a title that has to be qualified has failed |
| **Pteropods and *Carinaria* moved off the mollusc page** (six objects) | page 3 | Strictly gastropods, so kinship says page 6. A transparent winged swimmer and a crawling nudibranch share ancestry and nothing a visitor can see |
| **The salps stayed with the sessile sea squirts** | page 4 | This cuts the *opposite* way to the pteropod call, and that inconsistency is on the record deliberately: salps share a visible barrel-with-two-siphons body with sea squirts; pteropods share nothing visible with sea slugs |
| **The hydroids sit with the corals, not the man o' war** (.63, .126, .109) | page 8 | "Colony" does not discriminate — corals are colonies too. *Floating* does |
| **The freshwater leech and flatworm are on the habitat page** (.35, .128) | page 11 | The leech is an annelid and on kinship belongs with the worms. Among marine ragworms it reads as an error; among pond animals it reads as obvious |
| **The unattributed fragment .92** | page 8, last | **The weakest claim in the scheme** — argued from shape, not evidence. It is not a model of an animal, so no biological group is truly correct. Needs a curator's yes |
| **The vernacular-only .136 ("soft coral polyp")** | page 8 | Placement inferred from two English words on an old label. Safe in practice, but the caption must say the identification is the label's, not ours |
| **The tube anemone .64 and zoanthid .70** | page 7 | Neither is an Actiniarian. Both read as anemones on sight; the label is coarser than the science and not wrong, but a curator will spot them |
| **The three tube-dwelling worms** (.15, .22, .98) | page 10 | They look like flowers. Moving them to the anemones would be actively misleading and would gut the worm page of its three best objects |
| **Cephalopods left at 7 objects**, below the target band | page 5 | Deliberate. Every available merge pads it — the only candidate produces a 21-object page whose one true sentence is "these are all molluscs", a phylum claim this scheme promised not to make |

**Two name choices, not placements, that need a decision before copy is written:** .128 is
*Bothrioplana semperi* in WoRMS but *Dendrocoelum lacteum* in nineteenth-century usage, which is
far likelier to be what a Blaschka modelled; and .89 is *Nudibranchus exiguus* in WoRMS but
*Eubranchus exiguus* in GBIF and all popular literature. Where the app shows a "known today as"
line, showing the WoRMS form on .89 will fail the one visitor who checks it.

**Two ambiguous names resolve within a page and force nothing:** .113 and .12 each have two
readings, and both readings land on the same page. The object card must present both rather than
pick (§6, taxonomy).

### Quotations are a distinct content type **[C]**

Fields: original text, original language code, translation, translator credit, source citation,
approval status.

**Quotations never enter an automated translation pipeline.** A machine-refined quote is a
fabricated statement attributed to a real person. This bites immediately: the Press's 1883 line —
*"resembles nature so closely as to be deceptive"* — is a real quotation from a named publication,
already carrying v1's second-hand attribution.

*Cautionary precedent:* at the Opium War Museum the English wall texts and audio guide are
back-translations from Chinese rather than the original English — a real politician's words,
presented as authentic, round-tripped through another language.

Every quote carries a citation. Every quote left in its original language carries span-level
`lang` in **every** language version.

### Taxonomy — the permissive position, and why we left it

**The designer's position was permissive:** small differences in naming do not matter *so long as
the link works*. It is recorded here because what follows is a departure, not a correction.

**What changed it.** Measured against WoRMS across all 127: roughly **a third of the catalogue's
species names are still the accepted name; around 57% have been superseded**; six resolve nowhere
**[V]**. It is not drift on three objects — it lands on the majority of the collection, and on the
man o' war the app is named for. The record says *Physalia pelagica*; the Museum's own website says
*Physalia physalis*.

**And the finding that makes it safe to publish.** The published revision of the Blaschka 1888
catalogue reports **35.3% name retention across the corpus**; Canterbury's is about **37.6%**
**[V]**. Canterbury is not an outlier — it is average, and the drift is an already-published
property of every Blaschka collection in the world. Surfaced with reasons and dates attached, this
is contributing to known scholarship, not confessing an error.

**Where the permissive position still holds, and should:** **route and link on the accession
number only** (§8). The link always works. Nothing about naming ever reaches a URL.

**What the interface does:**

| State | Show | Roughly |
|---|---|---|
| **Accepted** | The name, linked. No caveat | 1 in 3 |
| **Superseded** | Both names, plus the *reason*, authority and date | Most |
| **No current name exists** | The catalogue name, and that no valid name has been established | 3 objects |

The third state is real — *Serpula contortuplicata* and *Actinia mesembrianthemum* are *nomina
dubia*, *Renilla violacea* uncertain; WoRMS marks them not accepted and supplies no replacement.
Without this state the UI renders an empty link.

**Never silently replace a catalogue name with a modern one.** Show both. The record's own words
stay; the current name sits beside them in layer 5.

**WoRMS is the spine** — free, keyless, CC BY with a per-record citation string; a batch endpoint
resolved all 127 in five calls **[V]**. Critically it returns the *reason* — *junior subjective
synonym*, *genus transfer*, *superseded combination* — with the original authority and date. That
is what turns a correction into a story: *this is the name Lamarck gave it in 1801, and here is
what happened since.*

**Resolution happens once, at build time, hand-checked**, stored with AphiaID, status, reason,
authority and **the date of the lookup**. Never at runtime: the ambiguities below need human
adjudication, and a visitor's page must not depend on a third party being up. WoRMS opinions are
revised continuously, so an undated cached answer implies a timeless truth.

**Traps, all measured [V]:**

- **Ten objects are not marine.** The Blaschkas modelled land slugs and snails — *Helix pomatia*
  (×2), three *Limax*, *Arion empiricorum* (×2), the freshwater *Planorbis corneus*, two
  flatworms. `marine_only=true` reports all ten as unfound, wrongly.
- **Twelve misspellings across fourteen objects** resolve only by fuzzy match (WoRMS `near_2`,
  GBIF 84–85 confidence). **Not a threshold to auto-publish on.**
- **Homonyms make first-hit selection a coin flip presented as fact.** *Oceania phosphorica*
  returns two records resolving to two species; *Tethys leporina* three, resolving to two species
  plus one invalid. Never take `hits[0]`.
- **WoRMS and GBIF disagree on nine names.** Whatever is shown names its source.
- **Subgenus formatting produces false positives** — *Holothuria (Holothuria) tubulosa* is status
  "alternative representation"; a naive string compare reads it as changed.
- **Six titles carry a variety** and only one exists in WoRMS. Keep it in the displayed name even
  when unresolvable — stripping it discards a distinction the Blaschkas recorded on purpose.
- **Fourteen titles carry qualifiers** to strip before querying; one ends in a full stop; three
  prefix spellings exist; two are hyphenated compounds. Each is a place a regex mangles a name into
  a *wrong* match rather than no match.
- **Three objects cannot participate at all** — 1884.137.92, 1884.137.136 ("soft coral polyp") and
  1884.137.59 (*Porpita*, genus only). Degrade to no panel, not an empty one.
- **125 named objects share 115 distinct names.** *Velella spirans* and *Vellela spirans* are the
  same animal on two objects and must never render as two species.

### External sources — layers 2 and 5

Decision 9 was layers *with links to external factual sources*. v1 shipped three live source
badges; v2 keeps them and adds two destinations.

**Carried from v1**, in layer 5: the collection record, Le Grice's Blaschka page, and Shaw et al.
2017. Live links, as in v1 §8a.

**GBIF — the living animal.** The biggest gap in the current experience is that a visitor never
sees the animal the model depicts. Measured across 3,471 individual images: **78 of 117 names
(67%) have a CC0, CC BY or CC BY-SA photograph**; CC BY-NC lifts it to 87%; nine names have none
**[V]**.

- **Read the licence per image, never the occurrence-level field.** They disagree — an occurrence
  stamped CC BY was verified to contain two CC BY-NC photographs **[V]**. Filtering on the
  occurrence field makes the app assert a licence it does not have.
- **CC BY-NC is permitted** (Q3, answered), taking coverage to **87% of species**. Still prefer
  CC0/CC BY where one exists; never all-rights-reserved; exclude ND variants anywhere the image is
  cropped or overlaid. Show creator and licence on every photograph.
- **A photograph is not the modelled animal.** GBIF returns some individual of the *currently
  accepted* species, photographed anywhere. Where the name was superseded, that may not be what the
  Blaschkas modelled. Caption it *a photograph of the species as currently accepted* — the same
  discipline as "not a scan".

**Biodiversity Heritage Library — curated only, never automated.** The deepest layer available:
the nineteenth-century hand-coloured plates of the kind the Blaschkas worked from. Gosse's
*Actinologia Britannica* (1860) is on Internet Archive with full page images, public domain and
embeddable **[V]**. **Never generate a source plate from a species name** — the published Blaschka
revision found Haeckel and Gosse were *incorrectly credited* as sources for a wide range of models
**[V]**. Match object-by-object with evidence, or frame it as "the kind of illustration they
worked from". A curated dozen, not a pipeline.

### Does it live here? — the occurrence layer

**36 of the 127 objects depict an animal that occurs in Aotearoa; 26 of those are solidly
evidenced** (GBIF occurrence records plus the New Zealand Inventory of Biodiversity). 35 species
are definitely absent, 42 have only a same-genus relative here, and 8 could not be resolved
**[V]**.

The collection is what it always was: **North Atlantic and Mediterranean animals, modelled in
Dresden, for a European market.** Saying so is better content than implying otherwise.

Build the layer anyway, for the 26 — it needs nobody's permission, it is the same category of open
biodiversity data as the GBIF photographs, and it answers the question a visitor in Christchurch
actually has. Show the record count and dates; do not round them into "common here".

**Three caveats to carry, not smooth over [V]:**

- Five of the 36 are **introduced or not marine** — a garden slug, a freshwater ramshorn snail, and
  three marine organisms that arrived as fouling or biosecurity incursions after 2008.
- Four are **cryptic species complexes** where the New Zealand animal may not be this species at
  all — including the bluebottle. A 2025 population-genomics study split *Physalia* into at least
  four species, with *P. minuta* newly described from waters near New Zealand and Australia, while
  the glass model resolves to *P. physalis*, the Atlantic animal.
- Five rest on a checklist listing with **zero occurrence records**. Exclude them.

**Two pieces of content this produced, both worth having:**

- **The Lyttelton fanworm** (1884.137.98, *Sabella spallanzanii*). A glass model of a Mediterranean
  fanworm has sat in a Christchurch museum since 1883. The living animal reached **Lyttelton
  Harbour in March 2008**, triggering a $3.5m elimination programme; it is now a notifiable
  organism under the Biosecurity Act and considered non-eradicable **[V]**. A Canterbury story with
  a date on it, and it belongs to biosecurity rather than to anyone's knowledge system.
  *Clavelina lepadiformis* (1884.137.119) is the same shape.
- **The stranding trio** — *Physalia*, *Velella velella* (1884.137.111 and .54) and *Porpita*
  (1884.137.59): the three blue drift animals that wash up together on New Zealand beaches, with
  1,003 / 728 / 158 records **[V]**. Three objects that belong on one screen.

### Te reo Māori names — the answer is no, and the blank is content

**Scoped and answered (Q7). There are zero defensible species-level te reo names for anything in
this collection [V].**

Across every reachable published source — Te Aka, Te Ara, Te Papa, DOC, NIWA — about 21 name
entries were recovered for marine invertebrates. Five are genuinely species-level, and **every one
names a New Zealand animal that is not in this collection.** The single word that reaches an object
is *ihumoana* (with *katiaho*) for the bluebottle — and that names a close relative of what the
glass actually depicts, from a dictionary carrying no dialect marker, for an animal whose species
identity was reopened by a study published last year. No Kāi Tahu-authored source on invertebrate
names could be reached at all.

**So the app carries no te reo names for these species, and says so.** One visible line where a
name would otherwise sit: the knowledge sits with mana whenua, and that conversation has not
happened yet. English text about a gap is not Māori data, and a stated absence is the same move as
declining to cite a newspaper read second-hand — applied to a much higher-stakes case.

**Do not, whatever the source:**

- Print a dictionary-sourced name beside an object. In prose, a citation and an assertion are
  distinguishable; **in a label they are not** — a visitor cannot tell a dictionary entry from a
  name given by mana whenua, and after a year neither can the build.
- Convert a northern form to a southern one by swapping *ng* → *k*. Those forms are attested
  nowhere; printing one is fabrication wearing local authority.
- Use anything known only from a search snippet.
- Touch the associated traditions this scan surfaced — they sit outside the line regardless of
  who published a paragraph about them, and one falls inside Ngāi Tahu takiwā.

**Do, and it costs nothing:** get the ordinary reo right. Ōtautahi, Aotearoa, Te Waipounamu,
macrons everywhere, correct pronunciation of the few words used. Getting the unambiguous things
right is evidence of good faith; fumbling macrons while attempting the hard things is fatal.

**The cost asymmetry is what settles it.** Leaving a name out costs a visitor one word today.
Putting a wrong or misplaced one in teaches an error at scale, from something read as carrying
museum authority — and corrections arrive years late. This Museum's own dioramas took seventeen
years to remove after its own advisory group objected **[V]**.

### The ask — one email, to the Museum

**Go to the Museum, not to the rūnanga directly [C].** Mana whenua have already gifted the
institution a Cultural Narrative for the redevelopment, and Araiteuru — an atrium and gallery named
by mana whenua — is being built as a space where papatipu rūnanga tell their own stories. An
independent app publishing te reo content alongside the collection would be running *beside* that
process. Ask to sit inside it.

Ask whether the Museum would take the question to **Ōhākī o Ngā Tīpuna**, its own Māori advisory
committee, whose remit is guidance on tikanga and kaitiakitanga of Māori taonga. Mana whenua for
Ōtautahi are **Te Ngāi Tūāhuriri Rūnanga** — not Te Rūnanga o Ngāi Tahu, which is the statutory
iwi authority and not the voice for a specific place. An unbacked cold approach sits low in a very
full queue; the Museum route gives the ask institutional backing. That is triage, not a slight.

**Publishing first changes the eventual conversation** from *please tell us what is right* to
*please review what we already did*. People notice which one they are handed.

**Everything above ships while waiting, and ships unchanged if the answer is no or never comes.**

---

## 7. Languages

Derived from the Museum programme's own multilingual research; the QA pipeline detail lives there
and is not restated here.

### Tier by verification burden, not by language count **[C]**

Generation is effectively free — TTS runs single-digit dollars per language for a guide this size,
and LLM translation reaches 85–90% of professional quality at 5–10% of cost. **Verification has
not moved, and it still scales linearly with languages.**

| Content | Languages | Applies here to |
|---|---|---|
| Safety, wayfinding, welcome, orientation | **30+** | The app's entry, language picker, and any instructional text |
| Core object interpretation | **12–15** | Layers 1–2 — the object stories |
| Deep reading layer | **6–8** | Layers 3–5 |
| English, te reo Māori, NZSL | — | **Outside this framework entirely.** Human, iwi-partnered, Deaf-led |

Short high-stakes content goes widest because it is cheapest to verify and has the highest equity
return. Deep interpretive content goes narrowest because review cost dominates. **Disclose where
a layer is unreviewed.**

### Language selection and fallback

The tiering guarantees gaps: a visitor can be reading orientation content in a language that has
no object stories in it. This is what happens.

**Default to the device language. Allow override.** No language interstitial on arrival — a
visitor who scans a code in a gallery has about five seconds (§11) and must not spend them
choosing from a list.

**Resolution order, per piece of content:** selected language → device language → English.

Two consequences follow, and both are requirements:

- **English becomes load-bearing.** It is the terminal fallback, so **English must be complete for
  all 127 objects at every layer** or the chain dead-ends on a blank. This is a content
  commitment, not just a code path.
- **The fallback must be visible, never silent.** A Samoan speaker who gets an English story with
  no explanation reasonably concludes the app has no Samoan in it — when in fact the orientation
  layer around them is Samoan. One quiet line: *this object's story isn't available in Samoan yet
  — showing English.* Silent degradation reads as a broken app; a stated one reads as an honest
  one, and it also tells the Museum which languages to fund next.

**Match on language, not on string.** `navigator.language` returns tags like `en-NZ` and
`zh-Hant-TW`. Use BCP 47 lookup so `zh-Hant-TW` finds Traditional Chinese and `en-NZ` finds
English. An exact-string comparison fails for most real devices.

**`lang` and `dir` follow what is actually rendered, not what was selected.** When an English
story falls back into a Samoan session, that block carries `lang="en"` — otherwise a screen reader
speaks English text with Samoan phonetics, which is the same failure §7 already guards against for
binomials. The same applies to direction: an English fallback inside an Arabic session is an LTR
block inside an RTL page, so `dir` is per element, not only on the root.

### The resource-level inversion — design against it **[C]**

| | Cost to do well | Who it serves at Canterbury |
|---|---|---|
| High-resource (zh, ja, ko, de, fr, es) | Very low | International visitors |
| Low-resource (sm, to, mi, prs, ti, so) | Still high | Resident and refugee communities |

Naive expansion delivers a markedly better experience to German tourists than to Christchurch's
Samoan community. **Budget Pacific and refugee-language work as human or community-produced,
funded by the savings on high-resource languages.** Christchurch is a designated
refugee-resettlement city.

### Ratified, and not — read this before treating anything below as settled

The accessibility documentation plan draws a hard line between **Inventory A** ("settled in
discussion") and **Inventory B** ("analysed and argued for, but you have not explicitly agreed
these — each needs an accept/reject decision"). **That line must survive into this spec, and an
earlier draft flattened it.**

Several positions below come from Inventory B: phone-first BYOD as the primary accessible path,
the standalone (unsynced) phone experience, NFC over QR, NZSL-only, filmed translators over
avatars, te reo → NZSL routed directly, separate description and interpretation tracks, text as
the source of truth, navigable audio structure, and no hardware handsets. The plan is explicit
that these were "reasoned by a team without the relevant lived experience" and should be seen by
Deaf Aotearoa and blind and low-vision advisors **before** they become decisions.

**They are written here as the recommended position, not as ratified fact.** Tagged **[C]** where
they reflect an established community stance, **[J]** where they are the source document's own
reasoning.

**Build on them (Q9, answered) — the advisory relationship is the next step, not a gate.** Keeping
them marked as recommended is what lets an advisor overturn one later without this document having
claimed something it had not earned.

### Recommended positions

- **Ngāi Tūāhuriri orthographic house style agreed before any content is written**, and encoded
  in the glossary and do-not-translate list. Ngāi Tahu convention uses the 'k' form for names of
  people, places, flora and fauna — `taoka`, `Ōtākou`. Without it in the DNT list a model will
  helpfully "correct" mana whenua's own spelling of their own words across every language **[C]**.
- **NZSL, not ASL/BSL/Auslan.** Filmed Deaf translators, **never AI signing avatars** — the
  content here is fixed, finite and reviewable, so the avatar advantage does not apply **[C]**.
  Full-frame, never picture-in-picture; ~25–30fps with the signer framed to keep face and hands in
  a high-quality region.
- **Route te reo Māori → NZSL directly**, not via English **[C]**.
- **Span-level `lang` on every foreign-language span**, in every language version. This is not
  hypothetical here: **every object carries a Latin binomial**. `Physalia physalis` sitting inside
  Chinese text without `lang` markup is read phonetically as Chinese and is unintelligible.
- **Pre-render audio server-side wherever a device voice is absent** (§13).
- **Disclosure** — a quiet line in the language picker where content is machine-translated and
  human-reviewed. A museum trades on authority; this is the difference between being trusted and
  being caught.
- **Provenance** — store the original translation, applied error annotations and final text with a
  diff. "The pipeline produced it" is not an answer to a curator in 2032.
- **`lang` on the root element, and `dir="rtl"`** for Arabic, Farsi/Dari and Urdu **[C]**. The
  tier-2 set commits to right-to-left languages and every layout statement in this document is
  left-to-right by construction — including the previous/next control, whose arrows encode
  direction. Mirror the layout; do not mirror the media.
- **Write the English for translatability** — controlled terminology, no idiom, explicit
  referents — **before it is written, not after** **[C]**. The source research calls this the
  highest-leverage, zero-cost intervention, and it is unrecoverable once 127 stories exist. It
  gates §6's commitment, not the other way round.

### The post-launch loop is a requirement, not analytics **[C]**

Unreviewed translation has no error signal. A visitor reading slightly-off German concludes the
museum is amateurish and tells nobody. The Museum has the one asset the translation industry
lacks — thousands of real readers per language — and the source research names this a day-one
requirement, on the grounds that retrofitting it is expensive and building it in is nearly free.

- **Per-language completion and abandonment.** Systematically earlier abandonment in one language
  is a signal even when every automated check passed.
- **"Report a translation problem", in every language.**
- **Paid standing community reviewers**, one per significant language community, reachable through
  Christchurch Resettlement Services and the Canterbury Refugee Resettlement and Resources Centre.

This is measurement of the content, not of the visitor, and it is scoped to that (§21).

### One limitation to carry, not just the favourable half **[V]**

The cost findings above — LLM translation at 85–90% of professional quality, TTS at single-digit
dollars per language — come with a documented blind spot, which both source documents call the
single most important limitation in them: **automated quality assessment finds errors excellently
and is close to blind on whether the writing is any good**, preferring professional human
translation over top machine systems in only ~9.6% of cases. The failure is specific to stylistic
and creative fidelity — **which is precisely the category museum interpretation belongs to**.

So: the pipeline catches errors. It cannot tell you the prose is good. Any plan reading "the
pipeline handles quality" has misunderstood it, and the human review proportion does not go to
zero.

### Hard carve-outs from any automated pipeline **[C]**

Quotations · anything touching taonga, Ngāi Tahu or mana whenua · anything with legal effect ·
safety content. Enforce in code, not policy.

**Note on this collection specifically:** the Blaschka models are European decorative arts, made
in Dresden. The mana whenua governance carve-out does not bite on the *objects*. But the animals
they depict live in New Zealand waters — the man o' war is the bluebottle here — so **layer 2 may
have te reo names and mātauranga Māori attached to it**, and that content does sit inside the
carve-out. Treat it as an opportunity requiring partnership, not a translation task (§22).

---

## 8. Routing

**Eleven pages, not 127.** Objects are sections within their group's page, not destinations of
their own. This is the bounded version of the "one long scroll" idea: finite, and each page ends.

Non-negotiable, because a printed code must never break.

```
/                     the collection — eleven group tiles
/all                  the full 127-tile grid — secondary, not the front door (§9)
/g/{group}            a group page — its objects, in order, inline
/o/{accession}        resolves to the group page, scrolled to that object
/o/{accession}?t=…    the same, within a trail
```

- **The canonical, printed, shareable URL is still `/o/{accession}`.** It no longer has a page of
  its own, but it keeps its identity — it resolves to the right place. **This is the whole reason
  routing was put on the accession number**: grouping is an editorial judgment that will change,
  and a code printed on a label in 2027 must survive being re-grouped in 2029.
- **Never print or share `/g/{group}#{accession}`.** A fragment encodes the grouping into the URL
  and breaks the moment a curator moves an object. `/o/` is the identity; `/g/` is the rendering.
- **Arriving at `/o/{accession}` scrolls to that object without animation**, and the object is
  visually marked as the one you came for. A visitor who scans a code must not land mid-page
  wondering whether they got the right thing (§11's five-second budget).
- **`replaceState` as the visitor scrolls past objects**, so the URL always names what is on
  screen and is worth sharing at any moment. **`pushState` only on deliberate jumps** — a tile
  tap, a group jump, entering a trail.
- Consequence: **Back means "leave this group," never "previous object."** Scrolling is not
  history. The stack stays two or three deep however far someone reads.
- Every physical placement of a code gets its **own query parameter**, so the Museum learns which
  surface works instead of arguing about it.
- Language is a user preference, not a route segment, so a printed code is language-neutral.

---

## 9. The collection view

**Eleven tiles, one per group**, each carrying a single representative object and the group's
title. Not 127.

**Dark is decided by the photography, not by taste [V]:** 79 of 127 primary images are the object
on pure black (median 77% of frame); the rest are on cream board inside the same black surround.
On a light ground every tile becomes a hard black rectangle.

### This overturns an earlier finding. Read why before changing it back.

Fifteen navigation concepts were critiqued and **every one that removed the visual overview was
rated fatal or weak**, always for the same reason: appearance is the only thing distinguishing
these objects, and appearance can only be used to choose when several are on screen at once
**[V]**.

That finding was produced when the alternative was 127 *object pages* with no group structure —
where deleting the grid left a visitor with nothing to choose between but unlabelled names. It
does not straightforwardly transfer. With eleven group pages the overview has moved rather than
vanished: the choice at the top level is now between eleven **titled** things, which a thumbnail
grid could never express — no image can say *these are colonies, and not one of them could survive
alone* — and the objects themselves are all still seen, in sequence, once inside a page.

**What is genuinely lost, and should be said plainly [J]:**

- **Browsing by eye across the whole collection.** Nobody can scan 127 and go *that one*.
- **Progress as terrain.** The seen-set painted back onto the collection does not work on eleven
  tiles. It survives only as a per-group cue.
- **The completionist's overview.** There is no single screen that is the collection.

**What is gained:** first load drops from ~3.4MB to roughly 300KB **[V]**, which on gallery wifi
is the difference between about 26 seconds and about 2; and the top-level choice becomes legible
instead of a wall of near-identical dark thumbnails at ~110px, which was the one thing the
prototype was meant to test and might well have failed.

**Mitigation, and it is cheap:** keep an "everything" view — the full 127-tile masonry grid — as a
*secondary* route, not the front door. It costs one page, it rescues the browsing case and the
completionist, and it means this decision can be reversed by promotion rather than by rebuilding.

### The eleven tiles

- **Choosing the representative image is now a design decision, not a default.** Eleven images
  carry the entire first impression of the collection. Pick for legibility at tile size and for
  distinctness from the other ten — not for rarity or curatorial interest. Record the choice in
  `groups.json`; do not derive it from "first accession in the group".
- **1884.137.92 can never be a representative** — "a glass spike from an unknown model", a
  fragment in a large black frame that reads as a rendering fault **[V]**.
- **Aspect ratios run 0.62 to 1.72 [V]**, so eleven tiles still need masonry or `contain` on a
  black tile. Aspect comes from the manifest.
- **Use the MEDIUM (400px) derivative** — or LARGE, now that there are only eleven. Every
  derivative carries an identical ~18.7KB uncompressed metadata block, so a smaller size saves
  almost nothing **[V]**; at eleven images, spend the bytes.
- **Order is the reading order** (§6), not accession order — `sort=accession_no` is lexicographic,
  so 1884.137.2 lands after 1884.137.100 **[V]**.
- **Show the size of each group** — "8 models, about 6 minutes" — so the visitor knows the cost
  before committing (§10).
- **No filters.** There is nothing to filter by. Do not fake it.
- **Per-group progress, no denominator.** A group the visitor has finished is marked as such.
  "You've seen 84 objects" never "84 of 127" — published sources give 122, 127, 132 and 133
  **[V]**, and a completionist is exactly the person who will find the other three.

---

## 10. The group page

Eleven of these. Each carries its objects inline, in order, and **ends**.

```
┌─────────────────────────────┐
│ ← Collection                │
│                             │
│ Floating colonies           │   group title — /g/floating-colonies
│ 8 models. About 9 minutes.  │   stated cost, computed at 150 wpm
│                             │
│ [~50 words of group panel]  │   drafted — docs/group-panels.md
│ ─────────────────────────── │
│ Portuguese man o' war       │   the label's words
│ Glass Model Invertebrate:   │   the catalogue string, demoted
│   Physalia pelagica         │
│ ┌─────────────────────────┐ │
│ │     media  ~70vh        │ │
│ └─────────────────────────┘ │
│ 1884.137.33 · Canterbury    │   rights not stated on this record
│   Museum                    │
│ The story, inline           │
│ ─────────────────────────── │
│ Physophora magnifica        │   the next object, same shape
│ …                           │
│ ─────────────────────────── │
│ [ending, in words]          │   what you just saw
│ ← Jellyfish   Comb jellies →│   the next group, not the next object
└─────────────────────────────┘
```

- **The headline echoes the label.** The Pop-Up label leads with a plain-English name **[A]** —
  reported as roughly "Portuguese man o' war in glass"; exact wording unconfirmed. A visitor who
  scans a code and sees "Glass Model Invertebrate: Physalia pelagica" will assume they scanned the
  wrong object. The catalogue string stays, demoted — the honest identifier, not the greeting.
- **Media at ~70% of viewport height per object**, down from 78% on a dedicated page. Objects are
  now adjacent, so the fold logic applies *between* them: the next object's name should peek as
  you finish the last one, or the page reads as a series of dead ends **[J]**.
- **Story inline. Never behind a tap.**
- **The page ends, in words.** One or two sentences naming what you just saw, then the neighbouring
  groups. Museums end; websites only stop. Eleven finite endings beat one unreachable one.
- **State the cost at the top** — "nine models, about twelve minutes", computed at build time from
  word counts, never asserted.
- **Desktop:** media holds position while its object's text scrolls beside it, releasing at the
  section boundary.

**Two things this architecture makes worse, and they need answers here:**

- **The depth cliff gets sharper, not softer.** On separate pages a two-line entry and a
  five-hundred-word one never met. Stacked in one scroll they are neighbours. **This makes the
  group panel (Q2b) load-bearing rather than optional** — it is the thing that says *interpretation
  lives at this level*, so a short entry reads as a label rather than as neglect. Deferring the
  panels is now a real cost, not a free saving.
- **Payload.** Nine to twenty objects × a ~70vh image is several megabytes per page — far past the
  ~26s-for-127-thumbnails figure that already worried us. **Only media near the viewport loads**;
  everything else is a placeholder until approached. Video and NZSL never preload at all. Test
  this at full group size on a throttled connection, not with three objects on office wifi.

**Entry points — v2 deleted v1's floating chrome and must replace what it carried.** v1's tab rail
and three-button cluster were the way into the story sheet and the quiz. Removing them leaves
three things with no way in. Each needs an affordance in this layout:

| Reaches | Where |
|---|---|
| Layers 3–5 | At the **end of the group page**, as named continuations — "How it was made", "How it got here", "How we know". Not repeated under every object on the page, and not a generic "more" |
| The quiz | One control, collection-level, reachable from any group page and from the grid |
| Trails containing an object | One quiet line under that object's story: *also on: Made twice* |
| Audio | Persistent, since it plays across navigation (§13, §19) |

---

## 11. Getting there from the gallery

**Today:** one object, on its own. A code beside its label goes to `/o/1884.137.33`, which lands
on `/g/floating-colonies` scrolled to the man o' war and visually marked as the object you
came for. No picker, no disambiguation. Build the simple thing.

**Landing mid-page is the risk this architecture introduces.** A visitor who scans a code and sees
a scroll position rather than a page has to be told, instantly and without reading, that they got
the right thing. Mark the arrived-at object; do not animate the scroll; do not let the group panel
above it be the first thing they see (§11's five-second budget, §10).

**Later**, for a case of a dozen lookalikes: **one code per case**, landing on a photographic
picker laid out to match the physical arrangement.

### Three ways in, not one

| | Mechanism | For |
|---|---|---|
| **NFC** | NDEF single https URL record, NTAG213/215/216. Background read on iPhone XS+ and Android with NFC on **[V]** | The accessible route — no camera, no aiming. **Placement must be consistent and tactile-locatable** so a blind visitor can find it by touch **[C]** |
| **QR** | Same URL | Broad reach; works on any camera phone |
| **A one- or two-digit number** | Typed, scoped to the case | No camera, no light, no aiming, no permission. British Museum evaluations found 55–70% of audio-guide users used the keypad, the most-used feature of the guide **[V]** |

**Never the accession number as the typed code.** Nobody types 1884.137.33 standing up.

### What the placement evidence actually says **[V]**

The Whitney's tracked QR scans by placement: tickets 4,169 · printed guides 4,110 · lobby
stanchions 2,289 · elevator wall labels 745 · tour stanchions 562. **The trial contained no
object-level condition**, so it cannot rank object codes. What it shows is that the two
placements on things the visitor is already holding — tickets and printed guides — together drew
about **twice** the scans of the three mounted on the building: 8,279 against 3,596. **Do not derive a
tidier ratio than that;** the placements are not equivalent in exposure, and the argument does not
need one. That is the case against per-object labels, and it is weaker than "worst performing" —
say the weaker thing.

The stronger arguments against per-object codes are practical: 127 new labels through an
exhibitions team that does not report to whoever commissions this, and case-space competition —
1884.137.33 measures 70 × 60 × 280mm **[V]**, and the range across the other 126 has not been
looked at **[A]**.

### Expectations to put in the pitch before the Museum finds them **[V]**

- **Expect roughly 2–3% of gallery visitors to open this.** Nubart's survey of 175 museum
  audio-guide apps averages 2.47% downloads; Brooklyn Museum reports ~2% across its digital
  offerings; the British Museum's guide runs about 3%. Cleveland's ARTLENS reaches ~36%, but it is
  a physical room in the visitor's path, not something you install — which is the argument for a
  web app with no install step, and against quoting Cleveland as a target.
- **Median dwell at a single object is about 21 seconds.** Scan to content in under five.
- **Send the eye back to the real object.** An app offering a better photograph of the thing the
  visitor is standing in front of has argued itself out of the room.

---

## 12. Media

### Image

The XLARGE derivative, fitted to the frame. **No pan or zoom in this build** — the source caps at
~1000–1200px on the long edge **[V]**, which will not survive close inspection.

**The honest route to deep zoom is a larger derivative.** Every image the API serves carries
~18.7KB of Photoshop, EXIF and XMP metadata copied unchanged from a master file **[V]** — proof
that archival originals exist. Deep zoom is the highest-value thing the Museum could unlock and it
needs nothing but a bigger export of files they already hold. **Put it in the pitch as an ask.**

**No upscaling, AI or otherwise** (Q1, answered). The photograph is the documentary record and
stays that way — it is the one asset in this app that is evidence rather than interpretation, and
a super-resolution model invents glass nobody photographed. v1 said this outright and v2 keeps it.
The route to deep zoom is a larger export from the Museum, or nothing.

### Assembly video

Per object. AI-generated. Shows the model being built up in glass.

The best-founded generated media in the project **[J]**: the form is known because the object
exists, and the technique is documented — flameworking at low temperatures, three ways to add
colour. It depicts a documented process producing a known outcome, a far smaller claim than the
3D model made.

- Label it **a reconstruction of the technique**, not a record of that model being made.
- **Graceful absence.** Objects without a video show the photograph and no video affordance at
  all. Never a disabled control — a dead button reads as broken, not honest.
- **Never preloaded from the grid.**
- Muted, `playsinline`, looping.
- **Respect `prefers-reduced-motion`:** poster frame and a play control, no autoplay.

### Sign video

§7 specifies NZSL as filmed Deaf translators. That is a production standard; this is where it
lands in the product, because a requirement with no home in the interface is not a requirement.

- **A second video well, not the same one as the assembly video.** They can be wanted at the same
  time, and one is media *of* the object while the other is media *about* it.
- **Full-frame, never picture-in-picture** **[C]**. This collides with §15's dark ground: sign
  video is a lit human against a plain backdrop, so it cannot inherit the black media well — give
  it its own treatment rather than letting the object's palette drive it.
- ~25–30fps, signer framed to keep face and hands in a high-quality region **[V]**.
- **Cache it with everything else.** Sign video compresses well; an earlier assumption that it was
  too heavy to cache offline was wrong **[C]**.
- **Graceful absence**, exactly as for the assembly video: `nzslVideo` null means no affordance,
  never a disabled control. Coverage will be partial for a long time, and §7's priority is
  coverage and Deaf-led tours over hardware.

---

## 13. Audio

### Text is the source of truth; audio is derived from it **[C]**

The most consequential decision in this section, and an inversion of v1. It is what makes
transcripts, structure, corrections, translation and screen-reader rendering fall out of one
artefact instead of five.

**The spoken words are the printed words. Word for word, with no exceptions [V — tested].**

This is stronger than "same source" and it replaces an earlier draft of this section. That draft
allowed audio-only lines — a `lookCue` spoken but not printed, plus `audioOnly` renderings for
spelled-out numerals and re-ordered quote attribution. **Testing killed it: when the narration
diverged from the text on screen, following along became hard.** A visitor reading while listening
is doing one thing, not two, and any divergence breaks it.

This overturns an Inventory B recommendation on evidence, which is exactly what Inventory B is
for (§7). v1's audio guide and v1's story were deliberately two registers, and its own source file
argued that the audio-only lines "are what makes this an audio guide rather than a label read
aloud." That argument loses to a read-along test.

**What follows from the rule:**

- **`lookCue` and `audioOnly` are deleted.** No line exists in one rendering and not the other.
- **Look cues survive, printed and spoken.** *"You can count them."* *"Look at the tentacles again
  as you hear that."* They are now in the text as well, which **fixes a real gap rather than
  costing anything**: previously they were audible only, so the majority of visitors — who never
  press play — received not one instruction to look at the real object, in an app whose §11 rests
  on sending the eye back to the case.
- **Pronunciation is metadata, never different words.** Years stay as `1878` in the text and are
  spoken correctly via a pronunciation lexicon or SSML — the same mechanism that handles
  *Blaschka*, *Dohrn*, *Haast* and *zooids*, which v1's audio doc already had to list. **Changing
  the words to fix the voice is the failure this rule exists to prevent.**
- **Quote attribution goes first in both.** v1 moved it ahead of the quotation for audio, because
  quotation marks are inaudible. Now the printed text carries the same order — *"The Press reviewed
  the shipment that month. Of this one, the reviewer wrote that it resembles nature so closely as
  to be deceptive."* That reads correctly in print, so nothing is lost.
- **WebVTT cues map one-to-one onto the printed segments**, so read-along highlighting is exact
  rather than approximate. This is the payoff, and it is also the accessibility win: a low-literacy
  or non-native reader following text with audio gets a stable, honest correspondence.
- **Anything that cannot be said aloud must not be written**, and anything that cannot be printed
  must not be spoken. If a line only works in one medium, it is the wrong line.

**Exception — archival audio is a distinct content type.** Where a real recording exists, the
audio *is* the source and the text is its transcript. Without modelling this separately the system
will eventually generate a synthetic voice reading a transcript of a real person — a fidelity
problem, and for a living or recently deceased speaker an ethical one.

### Two tracks, sequential

| Track | Contains | Default |
|---|---|---|
| **Audio description** | What the object physically is — form, scale, colour, mount | On, first, skippable |
| **Interpretation** | Layers 1–2 | Follows description |

Description first and **default-on for every visitor**, not routed to blind users. These objects
are entirely visual, the description is interesting to everyone, and a sighted-user default is
what keeps it produced to the same standard as everything else **[C]**.

### Which layers get audio

**Layers 1–2 get audio. Layers 3–5 are text-only**, translated, no recorded audio.

That split holds only under four conditions, all requirements here **[C]**: `lang` markup correct
per element; the reading layer authored to the same accessibility standard as everything else;
**large-text and high-contrast rendering treated as the primary vision provision for it**, not
screen-reader access; and the audio layer complete enough to stand alone, so the deep layer never
holds the substance.

**A fifth condition, which the source document does not state and this collection forces.**
"Text-only" quietly assumes the reader's device can speak the text. **For te reo Māori it cannot —
there is no first-party voice on either platform [V]** — and probably cannot for Samoan, Tongan and
most refugee-community languages. Left as written, the deep layer becomes unreadable to a blind
reader in exactly the languages the equity case is about (§7). So: **where no device voice exists
for a shipped language, the reading layer is pre-rendered server-side too.** It stops being
"text-only" in those languages, and that cost belongs in the budget rather than in a surprise.

### Structure and control

- **Explicit navigable structure — skip, interrupt, back** — authored once, rendered twice.
  Skimming is the main failure of self-voicing systems **[C]**.
- Variable speed via `playbackRate` with `preservesPitch`; usable range ≈0.5×–2× **[V]**.
- Synchronised transcript via WebVTT, cues generated at production time.
- Plays across navigation.

### A third track: the collection guide

Layers 3–5 are text-only **per object**. That does not forbid a single collection-level audio
guide, and one is worth having — but it is a **third track, played from the collection view, not
from an object**, and the earlier rule stands: no per-object audio for layers 3–5.

v1's existing guide is most of it already. It splits at its own bridging line — *"So what do you
do when a part of the natural world is difficult to preserve?"* — and the material after that is
largely layers 3–4.

**But not all of it, and this matters.** At least two passages after the bridge are specific to
1884.137.33: *"Look at the tentacles again as you hear that"*, and the Press's review of **this**
model. Lift the post-bridge audio wholesale and the shared track plays a nineteenth-century
newspaper review of the man o' war over all 127 objects. **Those passages move back to the object
track. The "about 60%" figure is an estimate before that surgery, not after [A].**

### Voices

**Pre-render server-side wherever a device voice is absent** **[V]**. iOS VoiceOver and Android
TalkBack require *downloading* voices for less-common languages — a Settings task a visitor cannot
complete mid-visit. **Te reo Māori has no first-party voice on either platform.** Samoan, Tongan
and most refugee-community languages also lack reliable built-in voices.

**For te reo Māori, human narration is the primary path — not TTS [C].** The source research names
it the longest-lead, highest-risk item in the programme and says to commission it, with Papa Reo
under a Kaitiakitanga licence as the technical route beside it, not instead of it. Pre-rendered
synthesis is the fallback for scale, not the plan.

Te reo TTS is **sovereignty-governed**. Te Hiku Media's Papa Reo operates under a Kaitiakitanga
licence. Commercial "Māori TTS" products with no iwi involvement are not substitutes **[C]**.
Follow the partnership structure, not a procurement model.

---

## 14. Attribution and rights

```
Photograph   Canterbury Museum {accession}{ · rights, where stated}
Video        Generated video, from Canterbury Museum photographs · a reconstruction of the technique
```

**9 of 127 records carry no rights statement, and 1884.137.33 is one of them** **[V]**. The object
the QR code points at is the object with no licence, so **the fallback wording is the default
screen, not an edge case**. Decide it deliberately.

Where a rights code exists it reads `CC-BY-NC` with **no version number** **[V]** — confirm with
the Museum before printing "4.0".

Make the badge live: link the licence to the deed and the accession number to the collection
record.

---

## 15. Visual language

- **Grid and media wells are always dark** (§9).
- **The reading area follows the device** — `prefers-color-scheme`.
- Chrome over media is light-on-dark regardless of theme. Care at the boundary.
- Body type follows the Museum's object pages: `"Helvetica Neue", Helvetica, Arial`, 16px / 24px
  **[V]**.
- **Large text and high contrast are first-class**, not an accessibility afterthought — they are
  the primary vision provision for the reading layer (§13).
- Fix v1's control borders: ~1.75:1 over black against the 3:1 floor for UI component boundaries
  **[V]**.

**Caveat to test in the Pop-Up [A]:** galleries are dim and phone screens are bright. Device dark
mode helps but does not guarantee it. If a light reading area proves hostile in situ, a dimmed
gallery mode is the fallback — do not build it speculatively.

---

## 16. Trails

Three or four authored sequences on top of the grid. Each is a title, a sentence, and an ordered
list of accession numbers.

- **State the cost before commitment:** "seven objects, about four minutes." Compute duration at
  build time from word counts. Never assert it — a promise caught being wrong once discredits
  every later promise.
- **A trail ends, in words.** One or two sentences naming what you just saw, then back to the
  grid. Museums end; websites only stop.
- `?t={trail}` only. Canonical URL stays the accession number.
- **Write only the trails the objects visibly earn.** Anything needing conservation records or
  display history nobody has seen is not writable.

Trails are additive and gate nothing. Ship two, add two later.

**In the pitch, be honest that trails are the part needing an owner.** We can write them; the
Museum has to keep them true in year three.

---

## 17. Quiz

**Every object carries at least one quiz item. The quiz asks five, drawn from the objects this
visitor has actually looked at.** It tests what you read, not what you might have.

This replaces the earlier "collection-level" quiz, which was unbuildable: all three of v1's
questions are about 1884.137.33, and a quiz reachable from the anemone page cannot ask them.
Per-object items fix that completely — the question is always about something on the screen the
visitor just left.

### Selection

| Objects seen | What the quiz asks |
|---|---|
| **5 or more** | Five, drawn from the seen set. Spread across as many different groups as the set allows, so a visitor who read one page is not asked five questions about anemones **[J]** |
| **Fewer than 5** | Every seen object contributes one, then top up to five from unseen objects — **preferring the group the visitor was last in**, so the top-ups are about things they nearly saw **[J]** |
| **None** | Five chosen by us. A fixed, hand-picked opening set, not random — it is the only quiz a visitor who arrived cold will ever take |

- **Re-take reshuffles.** A second attempt draws a different five where the pool allows, and says
  so — otherwise "Try again" means "answer the same five again".
- **Never ask about an object whose story the visitor has not seen in their resolved language**
  (§7). Falling back to English for a story is honest; asking a question about a story they could
  not read is not.

### This makes `seenSet` load-bearing, so it must be defined

`seenSet` (§19) previously only drove a progress cue. It now decides content, so a vague
definition produces a quiz about objects the visitor scrolled past at speed.

> **An object enters `seenSet` when its media block has been at least 50% in the viewport for two
> continuous seconds, or when its audio has played to completion [J].** Two seconds is long enough
> to exclude a fast scroll and short enough not to demand reading. Both thresholds are named here
> so they are testable and so two implementations agree.

### Mechanics, carried from v1 with the review's fixes

- **"Question 1 of 5"** above the question. Without a counter, visitors cannot tell whether they
  are committing to five questions or fifty.
- A visible **Next** rather than a forced 1800ms advance — the timer took control away exactly
  when someone had got one wrong and wanted to dwell.
- **Try again** beside Close on the results screen.
- Correctness must never be carried by colour alone. Wrap the reveal in `aria-live`.
- Each result links back to the object it came from, at `/o/{accession}` — a wrong answer becomes
  a reason to go and look, which is the only thing a quiz in a museum is genuinely for.

### The cost, stated plainly

**This is 128 more pieces of writing**, on top of 128 stories, and each needs a correct answer and
three distractors that are wrong without being silly. At the tier-2 language commitment (§7) it is
also 128 items × 12–15 languages.

v1's three questions took real care — the distractors were written "to sit in specific
relationships to each other" and stinging was deliberately excluded because the Museum's own entry
never mentions it. That standard across 128 objects is a substantial editorial commitment and
belongs in the effort accounting, not in a build step described as "pure state logic".

---

## 18. Accessibility

Not a pass at the end. Several of these are requirements, not enhancements.

### Structural

- **Build the flat, keyboard-navigable list of all 127 first**, and treat the grid as enhancement
  over it. Windowing removes 120-odd objects from the accessibility tree, so the boring version
  ships regardless — build it first rather than retrofitting it as an escape hatch.
- **No meaning carried by a custom gesture.** Android claims both screen edges, iOS the left edge
  and low band, screen readers all four swipe directions **[V]**.
- `prefers-reduced-motion` on every transition and on video autoplay.
- The sheet must implement the modal behaviour it declares — focus moved in, Tab trapped, focus
  restored on close, background inert. v1 declared `role="dialog"` and implemented none of it.
- Real names on dialogs, not `"quiz"`.

### There is no compliance target, and that is deliberate

**Do what is right, not what is legally required.** The designer's position, and it is the right
one for this project — but it needs one clarification to survive contact with a build, because
"do what's right" is not testable and an untestable requirement is one that quietly does not get
met.

**So: WCAG 2.2 AA is used here as a measuring instrument, not as a target.** It is what the
automated checks run against and what a reviewer can point at. It is the floor of the room, not
the ceiling, and this spec already goes past it in five places on purpose:

| Where we exceed it | Why |
|---|---|
| **Signed content** | WCAG puts sign language at AAA. Provided anyway (§7, §12) |
| **Easy Read** | Not in WCAG at all. A separate tier, procured from People First NZ (§18) |
| **Loan devices and a wifi floor** | Not a web standard. An equity requirement, because BYOD excludes the people the Museum most wants to reach |
| **Pre-rendered audio for languages with no device voice** | WCAG assumes the platform speaks the language. For te reo Māori it does not (§13) |
| **Audio description default-on for everyone** | WCAG would accept it as an alternative track. Making it the default is a content decision, not a compliance one |

**Do not report a conformance percentage.** A number invites treating the remainder as acceptable.
Report what works, what does not, and for whom — the accessibility plan's principle of *declared
variation over uniform mediocrity*.

For the record, the legal frame here is the Human Rights Act 1993, NZS 4121, UNCRPD and the NZSL
Act 2006 — **not** ADA or Section 508, which do not apply in Aotearoa and which an earlier version
of the source analysis wrongly assumed **[C]**. We are choosing not to build to a legal minimum;
that is different from not knowing what it is.

### Provision

- **Large text and high contrast are the primary vision provision** for the reading layer, ahead
  of screen-reader support **[C]**.
- **An Easy Read tier** within the layered model. People First NZ's *Make It Easy* is the
  established NZ service — a Disabled People's Organisation with trained translators and mandatory
  member review. Real costs and lead times; **procure early** **[C]**.
- **NZSL** per §7 — filmed Deaf translators, full-frame, never avatars.
- **Captioning standard for all AV**, including the assembly videos.

### Equity — these are requirements, not extras **[C]**

- **BYOD alone systematically excludes the groups the Museum most wants to reach.** NZ
  digital-divide research finds Māori, Pasifika, social-housing residents, unemployed, disabled
  and older people less likely to have internet access — Māori and Pasifika disabled people least
  of all. **A loan-device fleet and museum wifi as a guaranteed floor are requirements.**
- **Data cost is an equity issue.** Content over HTTPS with aggressive service-worker caching;
  the app must work on museum wifi alone.
- **Engineer for the iOS storage reality [V]:** WebKit caps the Cache API at **50 MiB per
  partition** and Safari evicts script-writable storage after seven days of non-interaction —
  except for PWAs added to the Home Screen. Treat 50 MiB as a design floor. Partition caches per
  language. Sign video compresses well; cache it with everything else.

---

## 19. State model

```
route            /  |  /g/{group}  |  /o/{accession} → resolves to a group page
objectInView     accession of the object currently on screen      drives replaceState (§8)
arrivedAt        accession scanned or linked to, if any            marks the object; cleared on scroll
language         { device, selected, resolved }                   selected persists; resolved is
                                                                  computed per content block, so a
                                                                  fallback can be shown as such
depthAvailable   which layers exist in the resolved language      derived from content record
trailContext     null | trail id                                  query param only
gridScroll       restored natively
groupScroll      per group, restored on return
seenSet          Set<accession>                                   localStorage, keyed on accession
audio            { track, chapter, position, playing, rate }      survives navigation
signVideo        null | playing                                   NZSL, when present (§12)
a11yPrefs        { textScale, highContrast, easyRead }            persisted — §18 makes these
                                                                  first-class, which means controls,
                                                                  which means state
sheet            null | 'quiz'
quiz             { drawn[5], index, answers, complete }   drawn is resolved once per
                                                        attempt from seenSet (§17) and
                                                        held, so the set cannot shift
                                                        mid-quiz as the visitor scrolls
```

Media position does not persist across objects.

---

## 20. Build order

| | | Why here |
|---|---|---|
| 0 | Harvest the manifest; assert 127 records, 127 images, title-strip count | Everything downstream is a lie if this is wrong |
| 1 | **Language and content shape** — `lang` on the root, `dir`, the per-language content record, the picker | Every step below decides how content is fetched and how audio is produced. Deciding this at step 7 means changing all of them. The source research puts it before anything is authored |
| 2 | **The flat, keyboard-navigable list of all 127** | §18 says build this first and treat the grid as enhancement. An earlier draft put it at step 4, contradicting §18 in the same document |
| 3 | The dark grid, all 127, real images, throttled | **The prototype that settles the design — see below** |
| 4 | One group page end to end: objects inline, media lazy-loaded, an ending in words | The architecture's real test is a long page on a slow connection, not a short one |
| 5 | Routing, deep links, scroll-to-object, back-button semantics | Before any code is printed |
| 6 | Layers 3–5, reached from the end of a group page | |
| 7 | Audio: description + interpretation tracks, transcripts, look cues | |
| 8 | Assembly video with graceful absence; NZSL where filmed | |
| 9 | Per-language completion/abandonment and report-a-problem (§7) | Day-one requirement, not analytics — retrofitting is expensive |
| 10 | Trails | Additive |
| 11 | Quiz | **Not pure state logic** — the selection rule depends on `seenSet` being defined (§17) and on 128 authored items existing |

**Before launch, not before step 3:** assert a non-empty `story` on all 127. The commitment in §6
is a build assertion or it is a wish.

### Step 1 settles the design

All 127 real photographs, masonry, on black, with the man o' war's real **537-word** story on one
object and short entries on its neighbours so the depth cliff is visible. Throttle to ~130KB/s.
Then hold it in one hand, standing up, **in the Pop-Up**.

Watch, in priority order:

1. **Tile legibility.** At ~110px on a phone under gallery lighting, can you tell a jellyfish from
   a squid from a sea slug? The whole premise rests on silhouettes reading small. If not, go
   larger and fewer. If never, the grid is the wrong answer.
2. **Does anyone use Next?** If people always return to the grid, "back 127 times" was overstated.
3. **The depth cliff.** Does a short entry beside a 537-word one read as a catalogue entry or as
   neglect? If neglect, the group panels are needed before launch — which changes the editorial
   ask.
4. **Time to useful** on throttle.
5. **What people ask for.** Every "is there a way to find…" tells you what to build second.

---

## 21. Out of scope, deliberately

- Filters, facets and any timeline. The data does not support them (§5).
- Colour-based navigation. The extracted palette is the mount board (§5).
- A maker biography or person-pivot. Every person and place endpoint tested returned 500 or 503
  **[V]**.
- Generated 3D, for any object (§3).
- Kiosk software, and any phone-to-kiosk pairing. Phone experience is **standalone** — syncing
  manufactures latency, infrastructure and session-hijack surface for little gain **[C]**.
- Hardware audio-guide handsets. They lock the content pipeline and have poor screen-reader
  support **[C]**.
- Accounts and sharing.
- Visitor analytics beyond placement attribution. **This does not exclude the content
  instrumentation in §7** — per-language completion, abandonment and report-a-problem are
  measurement of the translation, not of the visitor, and both source documents call them a
  day-one requirement. An earlier draft excluded them here and reused their justification
  elsewhere, which made the omission read as coverage.

---

## 22. Open questions

Genuinely undecided. Do not build either way until they are resolved.

### Still open

| # | Question | Who answers |
|---|---|---|
| **Q2c** | **Does a curator check the grouping before it ships?** The rollup is a hand-authored judgment the data does not contain, and it will be read as the Museum's own taxonomy. A short review is a cheap ask and a good thing to raise in the pitch. Not a blocker — ship the grouping, mark it as ours. | Museum, eventually |
| **Q7b** | **Will the Museum take the te reo question to Ōhākī o Ngā Tīpuna?** One email (§6). Everything in the spec ships while waiting, and ships unchanged if the answer is no. Only the Museum can open this door. | Museum → its Māori advisory committee |

### Answered

| # | Answer |
|---|---|
| Q1 | **No zoom, no upscaling.** The source is already stretched ~2.5× just to fill a modern phone (681 × 1000px against ~2,530 device pixels of height), so there is no headroom to spend. Asking the Museum for a larger derivative stays in the pitch (§12) — the masters demonstrably exist. |
| Q2 | **Group the objects, into eleven groups. Eleven pages instead of 127** — objects are sections within their group's page, not destinations of their own (§8, §10). An earlier pass was forced to seven; §6 records why eleven replaced it. |
| Q3 | **CC BY-NC is acceptable.** Living-animal coverage rises from 67% to **87% of species** **[V]**. Still prefer CC0/CC BY where one exists; never all-rights-reserved; show creator and licence per image (§6). |
| Q4 | **The man o' war alone, for now.** Build the single-object entry (§11); the case picker is a later problem. |
| Q5 | **Assume more of the collection goes on display when the new gallery opens [A].** Not Museum-confirmed. The case picker is designed for, not built now. |
| Q6 | **Proceed with the researched language set.** Validate against the Museum's own audience data if it becomes available; do not block on it. |
| Q8 | **Assume the Blaschka-number crosswalk exists [A].** Route on accession number regardless (§8) — the crosswalk is a redirect, not a dependency. |
| Q9 | **Proceed.** The advisory relationship is the next step, not a gate. The Inventory B positions stay marked as recommended rather than ratified, so an advisor can overturn one without this document having lied. |
| Q10 | **No compliance target. Do what is right, not what is legally required.** WCAG 2.2 AA is retained as a measuring instrument only, and the spec exceeds it in five named places (§18). |
| Q11 | **Device language by default, override allowed, fall back selected → device → English, and say so on screen** (§7). Consequence: English must be complete for all 127 at every layer. |
| Q7 | **No te reo names for these species, and the blank is stated on screen.** Zero defensible species-level names exist for anything in the collection **[V]**. What the research did produce is better: an occurrence layer for 36 objects (26 solidly evidenced), the Lyttelton fanworm story, and the stranding trio (§6). |
| Q2b | **The designer and the assistant write the eleven panels and endings together.** Drafted — `docs/group-panels.md`. Not deferred to a curator, which removes the dependency that made deferring costly. A curator review remains desirable but is not a blocker (Q2c). |

---

## 23. Assumptions — flag if wrong

- **The Pop-Up display outlasts the build.** The Pop-Up opened 14 July 2023 on a five-year lease,
  expiring around **mid-2028**; the new Museum targets **mid-2029** and 2030 is already flagged as
  at risk **[V]**. There is a window of at least a year in which the app's one visible object —
  and the only physical site to test in — may not exist. **This is the largest unmanaged risk in
  the document.**
- **2029 is a planning date, not a commitment.** The project is roughly $80m short, costs are up
  27% since 2023, delay costs $7.2m a year, funding currently runs out at a weathertight building
  in early 2028, and the Museum has stated it may pause before stage 5 (fit-out) and stage 6
  (installing displays) **[V]**. Exhibition installation is the least secure stage in the
  programme.
- The exact Pop-Up label wording is unconfirmed (§10).
- 127 is the working count. Published sources say 122, 127, 132 and 133 **[V]**. We build for what
  the API returns and treat the disagreement as content in layer 5.
- The quiz is collection-level, not per object.
- Assembly videos exist for some objects and not others, indefinitely.
- Object dimensions beyond 1884.137.33 have not been examined (§11).
