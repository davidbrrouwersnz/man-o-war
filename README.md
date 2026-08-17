# The Blaschka collection — a museum companion

Canterbury Museum holds 128 nineteenth-century glass models of marine invertebrates, made by
Leopold and Rudolf Blaschka in Dresden and acquired in 1883. **One is on display. The other 127
are in storage.** This is a companion web app for the visitor standing in front of that one
object: it answers *what am I looking at, what is it made of, and why is it here* — and then
opens the rest of the collection they cannot see.

**▶ Live: <https://manowar.vercel.app>**

![A phone showing the QR arrival: the heading "Portuguese man o' war" with a play button beside it, the catalogue name demoted beneath, the glass model photographed on black, its accession and dimensions, and the story beginning directly below.](docs/screenshot.png)

---

## Five minutes with it

- **Start at the front page.** It reads top to bottom: what this collection is, the one object on
  display, why it is made of glass, how it reached Christchurch — then the other 127, as eleven
  groups and a grid of all 128. The reading comes before the browsing on purpose: the visitor
  holding this page is standing in a gallery, not shopping a catalogue.
- **Scan the case.** `/o/1884.137.33` is what a QR code beside the display case would open. It
  lands with that object at the top of the screen, highlighted, URL intact — no navigation to
  learn. Every one of the 128 objects has such an address.
- **Press Listen.** The audio guide highlights the printed words as they are spoken and keeps them
  on screen, with per-section skip, variable speed, and lock-screen controls — the phone can go
  back in the pocket. Sections are one file each, so "skip this section" can never drift out of
  sync with the page.
- **Switch language and press it again.** The full guide exists in all eight languages —
  Anhören in German, 聆聽 in Traditional Chinese, استمع in Arabic.
- **Open a group.** Eleven group pages — jellyfish, sea anemones, cephalopods — each a panel, its
  objects inline with their stories, and further reading that says how close each link actually is
  to the object in the glass.
- **Display settings.** Text size and high contrast, persisted, reachable from every route — which
  matters most on the QR route, where a visitor never sees the front page.

## How it is built

A static site: Vite and React, no backend of its own. **All collection data comes from the
Museum's collection API** — every record, name, measurement, photograph and rights line in the
app is loaded from it. What the prototype changed is *when* that loading
happens: v1 called the API live in every visitor's session; v2 calls the same API at build time,
so a visitor on gallery wifi gets a screen worth looking at in seconds and the Museum's systems
carry no per-visitor load at all. The live API remains the source of truth — a re-harvest is one
command, taking about nine seconds of its time, run whenever the catalogue changes. Translations
and narration are likewise generated ahead of time and shipped as files: at runtime the app
serves nothing but static files.

Hosting is Vercel; every push to `main` deploys production automatically. The build carries its
own assertions — data integrity across all 128 records, WCAG contrast on every text/background
pair in every theme, and the audio rule below — so a build that would ship something broken fails
instead.

Built phone-first and measured on a throttled connection with a cold cache: text is readable in
about 1.5 seconds, the first photograph between roughly 2.5 and 4, and a page sends only the
media near the viewport. The numbers and method are in the findings document.

## Eight languages

Interface, all eleven group panels, both essays, all 128 object stories and every further-reading
annotation exist in English, German, French, Spanish, Japanese, Korean, Traditional Chinese and
Arabic — the last fully right-to-left. Three honesty rules hold throughout:

- **The provenance is recorded.** Every non-English word is machine translation, so far
  unreviewed by a person. A ledger records the engine, date and review status of every unit, so
  the claim is auditable — and review by a native speaker moves a counter, not a checkbox.
- **Names are looked up, not translated.** Vernacular animal names come from GBIF and Wikidata via
  a hand-checked glossary; the engine is given the answer rather than allowed to guess.
- **Citations are quoted as printed.** The title of somebody else's article stays in its own
  language and is marked as such; only our sentence explaining why it is worth reading translates.

## The audio guide

All eight languages are voiced — 414 sections each, roughly eleven hours of narration in all —
with word-level read-along throughout: the highlight follows the spoken word in Latin script, in
unspaced Japanese and Chinese, and right-to-left in Arabic. English reads in an Aotearoa voice
(en-NZ); each other language has its own Azure Neural voice, chosen with the reasoning recorded.

The rule the whole pipeline enforces: **the spoken words are the printed words, word for word.**
Narration is synthesised from exactly the text on the page, the build fails if they differ by one
character, and pronunciation is applied as metadata wrapping a word rather than by changing it.
Word timings are generated at production time, never guessed in the browser. And availability is
asked per section, against files that exist — a section whose words are ahead of its narration
shows no Listen control rather than a broken promise.

## What it costs to run and change

- **Hosting:** static files on Vercel; no servers, no databases, no keys in the shipped app.
- **Editing:** change an English sentence and push — a GitHub Action retranslates that sentence
  into seven languages and re-voices its narration, touching nothing else. The incrementality is
  what protects human review: verified translations stand until their English actually changes.
- **Scale of the bills:** retranslating the entire corpus into all seven languages costs roughly
  six dollars; voicing a whole language is a deliberate one-command run costing a few dollars and
  about 40MB of audio. Both are decisions a person makes, not side effects — the automation is
  built so a one-word edit can never quietly spend either.

## The path from prototype to product

Deliberately not built, so the built parts could be measured honestly: trails, the quiz, video,
sign-language video, offline support, NFC, and deep zoom (which waits on larger image derivatives
than the collection system currently exports).

What needs people rather than software:

- **A reviewer per language community.** The specification prices verification, not translation,
  as the cost that scales with languages. The review ledger and the in-app disclosure are ready
  for them; the people have not been engaged.
- **Pronunciation lexicons for the translated languages.** Only English has one; elsewhere the
  scientific names are read with each voice's own letter-to-sound rules.
  `src/data/pronunciation/{code}.json` is where a reviewer's corrections go.
- **Editorial ownership.** Naming choices, the hand-curated further reading, and the carve-outs —
  quotations and anything touching taonga or mana whenua are never machine-translated — are
  recorded with their reasoning, ready to be handed over rather than rediscovered.

What the Museum would own: the repository, the Azure Speech and Translator resources, the Vercel
project, and every word.

## AI assistance, stated plainly

- Built with Claude (Anthropic) as an agentic coding assistant, directed from the written
  specification and reviewed step by step; it also ran the measurements, driving a headless
  browser rather than estimating.
- All non-English text is machine translation, recorded per unit in the translation ledger as
  above. The narration is synthesised speech (Azure Neural voices) derived from the printed text.
- **The photographs are the Museum's own documentary record — never generated, never upscaled.**
  They are the one asset here that is evidence rather than interpretation.

## Run it locally

```bash
npm install
npm run dev
```

No keys and no configuration — the data ships in the repository. Azure keys (see
[`.env.example`](.env.example)) are needed only to regenerate translations or narration.

## The paper trail

- [`BUILD-SPEC-v2.md`](BUILD-SPEC-v2.md) — the specification this was built to, including its
  open questions and the decisions taken against them.
- [`docs/prototype-findings.md`](docs/prototype-findings.md) — the measured findings: what worked,
  what the spec got wrong, and what the prototype learned about the delivery constraints and the
  collection data along the way.
- [`docs/audio-pipeline.md`](docs/audio-pipeline.md) and
  [`docs/audio-generation.md`](docs/audio-generation.md) — how the narration is produced and
  checked.

## Sources

- Collection record — Canterbury Museum **1884.137.33**
  <https://collection.canterburymuseum.com/objects/glass-model-invertebrate-physalia-pelagica>
- Le Grice R., *The Blaschka Collection*
  <https://www.canterburymuseum.com/explore/collections/the-blaschka-collection>
- Shaw MD et al. (2017), *Ideas made glass: Blaschka glass models at Canterbury Museum*,
  **Records of the Canterbury Museum 31**
  <https://cms.canterburymuseum.com/assets/Canterbury-Museum-Records-2017.pdf>
