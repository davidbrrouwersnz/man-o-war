# The audio pipeline

English narration, Azure, Molly (New Zealand English). Built to §13 of the spec.
Generated, wired into every page that carries writing, tested in a real browser, and deployed.

    npm run audio:check     build and verify every narration script, call nothing (works today)
    npm run pronunciation   the pronunciation list, for a human to correct
    npm run audio           generate the audio (needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION)

## What gets voiced

**438 audio files**, one per block of text on the page, in the order the page shows it — every
page that carries writing, not just the objects:

| page | what is voiced |
|---|---|
| front page | the collection title and introduction |
| each of the 11 groups | the group's title and panel, and its closing line |
| each of the 128 objects | the name and catalogue line, each story section, the identification note |
| the 2 reading essays | the title and standfirst, then every section |

That is 118 minutes of speech.

Navigation is not voiced: the eleven tiles, the "13 models, about 12 minutes" lines, and the source
lists at the foot of the essays. Reading signposts aloud is how an audio guide becomes a chore.

**A group page plays as one continuous tour** — the panel, then all its objects in order, then the
closing line. Jellyfish is 43 sections end to end. Each object keeps its own control for anyone who
only wants the thing in front of them, and both play exactly the same files.

The essays now sit on the collection page rather than on pages of their own, each with its own
Listen control. Their old paths still resolve there, scrolled to the section, so nothing printed or
shared has to be reissued.

§13 puts the reading essays outside the audio scope, with one exception: where no device voice
exists for a shipped language, the reading layer is pre-rendered too. We ship one voice and one
language, so that exception covers everything we ship — and those essays are the deepest writing in
the collection, so stopping the guide at their doorstep would end it exactly where the material
gets good.

Nothing here is newly written. Every file is a block already printed on the screen, which is what
"only voice the text that is displayed" means in practice.

**The accession/size/rights line is deliberately not voiced.** It is printed on the page, so a
screen reader reads it on request — narrating it as well adds nothing for the visitor who wants it
and is noise for everyone else. There is also no way to know which visitor is which: browsers do
not expose whether a screen reader is running, deliberately, and inferring it from behaviour would
be both unreliable and othering. So the audio does not try to guess an audience.

**The audio description track from §13 is not being built.** §13 wanted a second track describing
form, scale, colour and mount, on by default, because a blind visitor cannot see the photograph the
story assumes you are looking at. That was cut by decision, and it is the real gap here: reading
`1 - model: 200 x 90 x 90mm` aloud was never a description, and dropping it does not make the gap
worse — it just stops pretending it was filled.

## Skipping between sections

**One audio file per section**, rather than one long file per object with markers inside it.

Skipping to the next section is then just playing the next file — no scrubbing, no seeking, no
chapter metadata to keep in sync. It also means editing one paragraph re-generates one paragraph.

The alternative — a single file per object with SSML `<bookmark>` tags at each section — was
rejected for a specific reason beyond simplicity: Azure has a known bug where a bookmark's reported
time drifts when a pause precedes it, which is exactly where section markers sit. Chapter positions
that are quietly a second or two out are worse than no chapters, because nobody notices they are
wrong. Separate files cannot drift.

Each file ships with a **WebVTT file listing every word and the millisecond it is spoken**, so the
page can highlight the narration as it plays. Those times come from Azure at production time — §13
is explicit that cues are generated, never estimated at runtime.

## How pronunciation is handled

§13: *"Pronunciation is metadata, never different words."* So no word on the page is ever respelled
to make the voice behave. Instead each awkward word is *wrapped* in a tag that tells Molly how to
say it, leaving the printed word untouched.

`src/data/pronunciation.json` holds **161 entries** — 108 genus names, 30 species names, 18
biological terms, 5 people and places. Each has phonetics for the machine and a plain respelling
for a human, e.g.

> **Eunice** → *YOO-nih-see*, not "YOO-niss". It is a bristle worm, not a woman.
> **Psolus** → *SOH-luss*. The p is silent, as in *psychology*.
> **Physalia** → *fy-SAY-lee-uh*. The man o' war, and the most-spoken name on the site.

**All 161 were reviewed and approved on 14 August 2026.** Seventeen of them were judgement rather
than derivation — every one named after a person, *Tealia* after Thomas Teale, *sieboldii* after
Philipp von Siebold — where the sound follows the person and no Latin rule gets you there. Those
are still marked as such in the data, because that is what a future reviewer needs in order to
disagree with one.

`npm run pronunciation:qa` regenerates `/pronunciation-qa.html`, which plays any entry at the exact
second it is spoken. It is now a record rather than a request, and worth keeping for that.

One thing still worth an institutional answer, though nothing is blocked on it: **Blaschka** is a
German family name printed on every object and on the front of the app, and the family's own
pronunciation is the kind of thing a museum can simply ask about.

The other ~75 species names are ordinary Latin adjectives (*vulgaris*, *borealis*, *marina*) left
deliberately unmarked. Marking up everything makes narration worse and buries the entries that
matter. They need a listening pass, not a lexicon entry.

## The guard that matters

Every narration script is stripped back to plain text and compared against the source, character by
character. **If they differ at all, the build stops.** That is the mechanical enforcement of §13's
first rule — the spoken words are the printed words — and there is no flag to skip it.

It runs on all 438 segments today and passes, with no exceptions and nothing exempted. The one
place notation used to be expanded — the details line, where `109 x 142 x 33mm` was spoken as "109
by 142 by 33 millimetres" — is no longer voiced at all, so that machinery is gone too.

It cannot catch everything, and it is worth knowing what it misses. It proves the narration matches
the string it was handed; it has no way to know that string is what the page actually renders. That
gap is how nine objects were once narrated with a different rights wording than the page printed.
The fix was not a better check but removing the duplication — the generator now reads the app's own
strings rather than restating them.

## What Molly can and cannot do

Researched against Azure's docs, because several widely-recommended SSML features do nothing here:

| | |
|---|---|
| phonetic pronunciation | **yes** — the mechanism the whole approach rests on |
| pronunciation as a separate file | yes, but needs a public URL and caches for 15 minutes, so inline tags are used instead |
| number, date and unit handling | yes |
| pauses, paragraphs, rate, pitch | yes |
| **word-level emphasis** | **no** — works on three US voices only, silently ignored for Molly |
| **speaking styles** (cheerful, calm) | **no** — Molly has none |

Speaking rate is deliberately left at natural. The app already offers 0.5×–2× playback, so baking a
rate into the audio would fight the control the visitor already has.

**This turned out fine.** Azure publishes its phonetic alphabet for British, Irish and Australian
English but not for New Zealand English. Molly is not flagged as lacking phoneme support, so this is
very likely just a documentation gap — but "very likely" is not "tested", so the pipeline sends a
single test word before doing anything else and falls back to plain respellings if it is rejected.
On the real run Molly accepted the phonemes, so the good path is what ships. The probe stays: we
just find out which path on the first run rather than after 438 files.

## Cost

About **$1.60** for the English narration. Azure's free tier covers 500,000 characters a month and
this is roughly 100,000, so in practice it has cost nothing. Re-running after a fix costs nothing — unchanged
text is never re-synthesised, because each file is cached against a hash of its own script.

## The player

Built and tested. `npm run audio:smoke` drives a real browser through it — 21 checks covering
playback, highlighting, skipping, navigation and teardown, on every page that carries audio.

A **Listen** button on each object queues that object's blocks in page order. A bar at the bottom
names what is playing and which section it is on, and carries previous / play / next, a speed
control (0.5×–2×, pitch preserved) and a stop.

**The word being spoken is highlighted as it is read.** The cues are matched to the rendered text at
runtime by walking forwards through it — never searching from the start, because a paragraph with
three "the"s in it would otherwise light up the first one every time. If a cue cannot be placed the
highlighting stops rather than marking the wrong words, and the audio keeps playing.

**The narration survives navigation**, per §13 — the player lives above the router, so opening
another object does not cut it off.

**Audio is offered only when every word on screen is English**, since that is the only language it
exists in. Offering it beside translated text would break the rule the whole pipeline rests on. A
visitor reading an untranslated object inside a Samoan session still gets it, because what they are
looking at *is* the English.

## Still to do

- **The audio description track.** The one real gap. §13 wanted form, scale, colour and mount
  described for a visitor who cannot see the photograph — "a clear glass bell about the width of a
  saucer" rather than `200 x 90 x 90mm`. It is the only part of §13's audio model still missing.
- **English only.** The other seven languages have no narration. Samoan, Tongan, Tigrinya and Dari
  have since been withdrawn from the app entirely — they were four of the five §7 called low
  resource, and the four with no synthetic voice in existence from any provider. Somali has since
  gone too, as the one target Azure's LLM translation does not cover, so every language §7 named as
  low resource is now out. See `docs/audio-generation.md`; for those languages it was always a
  human-recording question, not a technical one.
- The player's own labels ("Listen", "Stop listening") are English-only. They are only ever shown
  beside English text, so nothing is currently mismatched, but they are not translated.
- Ask the Museum how the family says **Blaschka**.
