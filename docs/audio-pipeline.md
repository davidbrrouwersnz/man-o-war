# The audio pipeline

English narration, Azure, Molly (New Zealand English). Built to §13 of the spec.
Everything below is done and tested except the part that needs an Azure key.

    npm run audio:check     build and verify every narration script, call nothing (works today)
    npm run pronunciation   the pronunciation list, for a human to correct
    npm run audio           generate the audio (needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION)

## What gets voiced

**552 audio files**, one per block of text on the page, in the order the page shows it:

| | |
|---|---|
| the name | plain-English headline, then the catalogue's scientific name |
| the details | accession number, size, rights |
| the story | one file per section — 261 of them |
| the identification note | where the Museum's page and its own record disagree |

Plus the 21 group panel and ending texts. That is 100 minutes of speech.

Nothing here is newly written. Every file is a block already printed on the screen, which is what
"only voice the text that is displayed" means in practice.

**The audio description track from §13 is not being built.** §13 wanted a second track describing
form, scale, colour and mount, on by default, because a blind visitor cannot see the photograph the
story assumes you are looking at. That was cut by decision. One consequence is worth naming: the
details line is now the *only* place the object's physical size is spoken, which is why it is
voiced at all despite being ugly to listen to.

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

**17 entries need a human answer** and `npm run pronunciation` lists them first. All 17 are named
after people — *Tealia* after Thomas Teale, *Sieboldii* after Philipp von Siebold — and a person's
name follows the person, not Latin. No amount of rule-following gets you there. The Blaschka family
name is on that list too: it is on every object and on the front of the app, and a German family's
own pronunciation is the Museum's to confirm, not mine to infer.

The other ~75 species names are ordinary Latin adjectives (*vulgaris*, *borealis*, *marina*) left
deliberately unmarked. Marking up everything makes narration worse and buries the entries that
matter. They need a listening pass, not a lexicon entry.

## The guard that matters

Every narration script is stripped back to plain text and compared against the source, character by
character. **If they differ at all, the build stops.** That is the mechanical enforcement of §13's
first rule — the spoken words are the printed words — and there is no flag to skip it.

It runs on all 552 segments today and passes.

The one deliberate exception is the details line, where `109 x 142 x 33mm` is spoken as "109 by 142
by 33 millimetres" and the accession number is read out digit by digit. Those are symbols and
notation, not words; expanding them is what a screen reader does. It is confined to that one line,
and the guard still holds because the printed text is untouched.

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

**One unknown remains.** Azure publishes its phonetic alphabet for British, Irish and Australian
English but not for New Zealand English. Molly is not flagged as lacking phoneme support, so this is
very likely just a documentation gap — but "very likely" is not "tested". The pipeline therefore
sends a single test word before doing anything else, and if New Zealand English rejects it, falls
back automatically to the plain respellings and says so. Either way it produces correct audio; we
just find out which path on the first run rather than after 552 files.

## Cost

About **$1.50** for the English narration. Azure's free tier covers 500,000 characters a month and
this is 90,000, so in practice it is likely free. Re-running after a fix costs nothing — unchanged
text is never re-synthesised, because each file is cached against a hash of its own script.

## The player

Built and tested. `npm run audio:smoke` drives a real browser through it — 13 checks covering
playback, highlighting, skipping, navigation and teardown.

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

- Listen to it. Nothing here substitutes for hearing Molly read a story end to end.
- The 17 eponyms — `npm run dev`, then `/pronunciation-qa.html`.
- The player's own labels ("Listen", "Details") are English-only. They are only ever shown beside
  English text, so nothing is currently mismatched, but they are not translated.
- No group-level "play the whole page". Each object is its own queue.
