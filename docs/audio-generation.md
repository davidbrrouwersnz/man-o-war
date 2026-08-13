# Can we generate the audio with AI?

An exploration, not a build. §13 of the spec says every object gets two audio tracks in every
shipped language. This asks what it would actually take to make a machine produce them.

Numbers below are reproducible: `node scripts/audio-scale.mjs`.

## The short answer

Yes for eight of the thirteen languages, no for four of them, and the four are exactly the four
we would least like to drop. Money is not the obstacle — the whole collection, both tracks, every
language, costs about **$36 to synthesise**. The obstacles are that four languages have no
synthetic voice in existence, and that one of the two tracks §13 asks for has not been written yet.

## What §13 demands of a machine

Four rules in §13 are the ones that decide which tools are usable. They are not stylistic
preferences; each one rules something out.

**1. "The spoken words are the printed words. Word for word, with no exceptions."**
The narration script is the story text, unchanged. Nothing rewrites it to sound better.

**2. "Pronunciation is metadata, never different words."**
When a voice says *zooids* wrong, we may not respell it as "zoh-oyds" in the text — that would
change what a sighted reader sees. We have to hand the machine a separate pronunciation note.
This means the tool must accept a **pronunciation lexicon**: a side file saying "when you meet this
word, say it this way," leaving the text untouched. §13 calls getting this wrong "the failure this
rule exists to prevent."

**3. "WebVTT cues map one-to-one onto the printed segments," generated at production time.**
The highlight that follows the narration has to be built when the audio is made, not guessed later.
So the tool must tell us **where each word falls in time**.

**4. Two tracks, not one.** An audio description track — form, scale, colour, how it is mounted —
plays first and is on by default for everyone. Then the interpretation track, which is the story.

Rules 2 and 3 together eliminate most of the popular AI voice tools.

## Which tools can actually do it

| | NZ English voice | Pronunciation lexicon | Word timings |
|---|---|---|---|
| **Azure Speech** | yes — Molly, Mitchell | yes, and as a reusable file | yes |
| **Amazon Polly** | yes — Aria | yes | yes, but only on the older voice tier |
| **Google Cloud** | no | partial | partial |
| **ElevenLabs** | no NZ accent | English only, mostly | character-level |
| **OpenAI TTS** | no | **no** | **no** |

OpenAI's voices are the most natural-sounding of the lot and they are unusable here: no
pronunciation control and no timings means rules 2 and 3 both fail. You would be reduced to
respelling words in the text to fix the voice — the exact thing §13 forbids.

Polly has a catch worth knowing: Aria, the New Zealand voice, sounds best on Amazon's newest tier,
and that tier does not emit word timings. Choosing Aria at her best costs you the highlighting.

**Azure is the only tool that satisfies all four rules.** It has two New Zealand voices, it takes a
pronunciation lexicon as a separate file we can keep in the repo alongside the stories, and it
reports the exact millisecond each word begins.

## The wall: four languages have no voice at all

This is the finding that matters most, and it is not a technical detail.

| | voice available? |
|---|---|
| English, Chinese, Japanese, Korean, German, French, Spanish, Arabic | yes, from everyone |
| Somali | only ElevenLabs, and only on their newest model |
| Dari | only an Iranian Persian voice — a different accent, read to an Afghan audience |
| **Samoan, Tongan, Tigrinya** | **nothing, from anybody** |

Every language with no voice is one of the five §7 singled out as low-resource. The tooling fails
precisely where the spec said the effort would be needed. That is not a coincidence — commercial
voice models get built for large markets, and these communities are not one.

So the shape of the thing is: **AI can voice the languages that were always going to be easy, and
cannot voice the ones the accessibility case rests on.** If we generate audio for the eight and
leave the rest silent, we have built a feature that works for German tourists and not for the
Samoan and Tongan communities in Christchurch. §13 anticipated a version of this — it says that
where a phone has no voice for a language, we pre-render it on the server instead. That escape
hatch assumes a server voice exists. For these four, none does.

That leaves three honest options, and it is a museum decision rather than a technical one:

- **Record humans** for Samoan, Tongan, Tigrinya and Dari. This is what te reo Māori already gets
  under §13, for sovereignty reasons rather than availability ones. About 100 minutes per language.
- **Ship audio only where it is genuinely good**, and say plainly in each language that audio is not
  yet available — the same visible-fallback principle §7 already applies to text.
- **Use the near-miss voices** for Dari and Somali and accept a wrong accent. I would not: §7 exists
  to stop exactly this kind of near-enough, and an Iranian voice reading to Afghan visitors is
  noticeable to them and invisible to us.

## The track that does not exist yet

§13 asks for two tracks. We have written one.

The interpretation track is the 128 object stories, already drafted and approved. The **audio
description track — form, scale, colour, mount — has never been written**. It is not a translation
or a reformatting of the stories; it is different content answering a different question ("what
does this look like?" rather than "what is this?"), and it is the one that plays by default.

No AI generates this from the story text, and it should not try. Describing a glass model you have
not examined is how you get confident, wrong sentences about colour. It needs a person with the
photographs, and it needs the curator's eye. That is roughly 128 short descriptions to write before
any of the audio-description half of §13 can be built at all.

## Scale and cost

| | |
|---|---|
| English text that §13 puts in scope | 76,769 characters, about **100 minutes** of speech |
| All 13 languages, if fully translated | ~1.1 million characters |
| Audio files, English, both tracks | 564 |
| Audio files, all languages, both tracks | 7,332 |
| **Cost to synthesise everything, twice over** | **~$36** |

The cost is a rounding error — you could regenerate the entire collection ten times for $357. This
is worth stating plainly because it inverts the usual instinct: there is no reason to be careful or
incremental about synthesis. Re-running the lot after fixing one pronunciation is free.

What is *not* free is storage and download. 7,332 files is a lot of audio to serve, and the whole
prototype is built around a visitor on a slow museum connection. Audio would have to load only when
someone presses play — never as part of the page.

## What I would build

A build-time step, in the same shape as the existing harvest:

1. Read the same story JSON the app reads, so the audio can never drift from the text.
2. Send each segment to Azure with a **pronunciation lexicon file** checked into the repo — one
   entry per troublesome word (*zooids*, *Physalia*, *nudibranch*, *man o' war*, *Blaschka*, each
   accession number). This is where the man o' war doc's pronunciation notes live.
3. Keep the word timings Azure returns, and turn them into the WebVTT cue file §13 requires.
4. Assert, before anything ships, that **the spoken text and the printed text are byte-identical**.
   This is the guard for rule 1. If a future change ever edits the script to fix a pronunciation,
   the build fails.
5. Cache by a hash of the text, so unchanged stories are never re-synthesised.

That is a day or two of work for the English interpretation track, and it would be genuinely good.

## What I need from you

1. **Voice.** Azure's Molly or Mitchell (New Zealand), or a British voice? The man o' war doc asked
   for NZ or British; NZ is available and I would use it.
2. **The four unvoiced languages.** Human recordings, or an honest "not yet available" notice?
3. **The audio description track.** Should I draft the 128 descriptions from the photographs for a
   curator to correct, or is that a museum job from the start?
4. **Scope for a first cut.** English interpretation only would prove the whole pipeline — text
   integrity, lexicon, timings, highlighting — for about $1.23 and no new writing.
