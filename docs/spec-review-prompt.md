# Adversarial review prompt — BUILD-SPEC-v2.md

Run this in a **fresh session with no prior context**. That is the point: this spec was written
across a long conversation, and the failure mode is that it reads as complete to anyone who was
there and as full of holes to anyone who wasn't. The reviewer must be the second kind of reader.

Run it **once per lens** rather than all at once — a single reviewer asked for everything produces
shallow findings on each. Five separate runs, five separate reports.

---

## Paste this above every lens

```
You are reviewing a build specification adversarially. Your default assumption is that it is
wrong somewhere and your job is to find where, before anyone builds from it.

THE PROJECT
A companion web app for Canterbury Museum's Blaschka glass collection — 127 nineteenth-century
glass models of invertebrates, made by Leopold and Rudolf Blaschka in Dresden, acquired 1883. It
is being developed as an unsolicited pitch to the museum, which is currently closed for
redevelopment and due to reopen mid-2029. One object is on display at an interim venue; the rest
are in storage. The app is eleven "group pages" — objects are sections within a group's page, not
destinations of their own.

FILES
- The spec:            BUILD-SPEC-v2.md
- The v1 spec:         BUILD-SPEC.md          (the previous, single-object version)
- Narrative source:    docs/man-o-war-object-story.md
- Audio guide source:  docs/man-o-war-audio-guide.md
- Group panel drafts:  docs/group-panels.md
- The grouping:        src/data/groups.json   (all 127 objects assigned)
- Captured API record: src/data/fallback.json (the full record for object 1884.137.33)

RULES — these matter, they are where previous reviews went wrong.

1. READ THE FILES. Do not reason from memory or from the summary above.
2. DISTINGUISH "I CANNOT VERIFY THIS" FROM "THIS IS WRONG." Two findings in an earlier review
   were reported as factual errors when the claims were correct and merely absent from the
   reviewer's brief. Mark every finding as VERIFIED, LIKELY, or UNVERIFIED. Never assert an error
   you have not established.
3. DO NOT INVENT PROBLEMS in sections that are fine. A short honest review beats a padded one.
   If a lens turns up little, say so.
4. Rank findings most severe first: CRITICAL (will produce a broken or dishonest product),
   MAJOR (will cost real rework), MINOR (worth fixing, not urgent).
5. Give concrete suggested wording for every fix, not just an objection.
6. Do not modify any files.
```

---

## Lens 1 — Buildability

```
LENS: BUILDABILITY. Read the spec as a developer with no access to the conversation behind it,
who has been handed this document and told to build from it.

Find:
- Internal contradictions — anything specified one way in one section and another way elsewhere.
- Gaps where you would have to guess, and say what you would guess.
- Requirements stated but never made concrete enough to implement or test.
- State that is described somewhere but missing from the state model.
- Data the interface assumes exists but the manifest and content record do not define.
- Ordering problems in the build order — anything that must exist before the step that builds it.
- Anything simply not buildable as described.

Pay particular attention to §5 (data), §8 (routing), §9 (the collection view), §10 (the group
page) and §19 (state), and to whether they agree with each other. The collection view was
recently changed from 127 tiles to eleven group tiles — check that change propagated everywhere
it needed to.
```

## Lens 2 — Internal honesty

```
LENS: HONESTY. This project's whole credibility rests on not overclaiming. It labels its
AI-generated video as a reconstruction, it refused to cite a newspaper it had only read
second-hand, and it declines to publish te reo Māori names it cannot source properly.

Audit the spec against its own standard. Find:
- Anywhere the app would assert something to a visitor that the project does not actually know.
- Generated or derived content that is not labelled as such.
- Claims presented with more confidence than their evidence carries.
- Places where a judgment has been dressed as a finding, or an assumption as a fact.
- The evidence tags: [V] verified, [C] community/expert position, [J] our judgment,
  [A] assumption. Check they are applied honestly — a [V] on something that is really judgment is
  worse than no tag at all, and a [C] on an unratified recommendation borrows authority.
- Anywhere the spec is less honest than the v1 spec was about its own limitations.

The spec is a pitch document as well as a build document. Flag anything a museum professional
would read as the app claiming to be, or to know, more than it does.
```

## Lens 3 — The visitor

```
LENS: THE VISITOR. Read this as someone who studies how people actually use things in galleries.

The intended user is standing in a museum with a phone, has 60-90 seconds of attention, is
holding a bag, is possibly with someone else, and did not come to look at a screen. Sector
evidence says 2-3% of gallery visitors open something like this at all, and the median visitor
looks at a single object for about 21 seconds.

Find where this design fails that person. Specifically:
- Where would they get lost, stuck, or bored?
- What does the app assume they will do that they will not do?
- Is anything discoverable only by knowing it is there?
- What happens on the very first screen, and does it earn the next ten seconds?
- The app is eleven scrolling pages of 7-19 objects each, with a large image per object. Is that
  a reasonable thing to hand someone standing up? Where does it break?
- Does anything compete with looking at the real object in the case?

Then the same questions for a visitor who is not fluent in English, is using a screen reader, has
low vision in a dim gallery, or has limited hand mobility.
```

## Lens 4 — The museum's reading

```
LENS: THE MUSEUM. Read this as a Canterbury Museum staff member it has been sent to — a curator
who has published on this collection, or a digital lead deciding whether it is worth a meeting.

Find:
- Anything that would embarrass the museum if published as described.
- Anything factually wrong about the collection, the objects, or the institution.
- Anything that oversteps — claims the museum's voice, implies endorsement, or presents work as
  theirs when it is not.
- Anything that would create work or obligation for the museum without saying so.
- Cultural risk. The spec deliberately carries no te reo Māori names for the species and states
  the blank on screen; check that position is handled well, and that the reasoning is sound
  rather than merely cautious.
- The grouping in src/data/groups.json is hand-authored, not the museum's. Check the spec is
  clear about that everywhere it appears, and spot-check a few assignments for anything a
  specialist would object to.

Also: is this actually persuasive? What would you ask for that the document does not answer?
```

## Lens 5 — What is missing

```
LENS: OMISSION. Everything above looks for faults in what is written. This lens looks for what
is not there at all.

Read the spec end to end, then ask:
- What would a competent team building this discover in week three that the spec never mentions?
- Which decisions have been made implicitly, by nobody, and will be made by whoever writes the
  code first?
- What is the largest piece of work the document does not acknowledge as work?
- What fails silently? Enumerate the failure states — no network, missing media, an object with
  no story, an unresolvable species name, a language with no content at that depth — and check
  each has a defined behaviour rather than an assumption.
- What has been decided once and never revisited, even though a later decision invalidated it?
- What is the single most likely reason this project does not get built, and does the spec
  address it?

Be specific. "Consider testing" is not a finding; "there is no defined behaviour when an object
has no story in the selected language, and the fallback chain in §7 does not cover it" is.
```

---

## After the runs

Reviews disagree, and some findings will be wrong. Before acting:

- **Verify anything marked LIKELY or UNVERIFIED yourself** against the file. Two of five findings
  in an earlier round were false alarms caused by an incomplete brief.
- **Findings that appear in two lenses independently are the real ones.** Start there.
- **A finding that only makes the spec longer is usually not worth taking.** The document is
  already long; the test is whether a builder would have got it wrong without the fix.
