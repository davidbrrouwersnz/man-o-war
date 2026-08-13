# Adversarial review — the i18n build

Paste everything below the line into a **fresh session** in `C:\Users\david\dev\manowar` (or a new
worktree off branch `worktree-blaschka-prototype`). Do not carry over context from the session that
built this — that session is the one being reviewed, and its blind spots would come with it.

---

## THE TASK

Adversarially review the multilingual build on branch `worktree-blaschka-prototype` of this repo
(`https://github.com/davidbrrouwersnz/man-o-war.git`). Twelve languages were built against
`BUILD-SPEC-v2.md` §7 in several passes. Two real bugs were already found and fixed by the building
session itself, by accident, while adding content — not by anyone looking for them. That is the
whole reason this review exists: nothing here has been checked by anyone who wasn't also the author.

You are not translating anything. You are trying to break what's there, find what's wrong with it,
and report findings. If you want to fix something small and obvious (a JSON typo, a missing key),
fine — but the point of this pass is findings, not more content.

## WHAT YOU'RE REVIEWING

**Read `BUILD-SPEC-v2.md` §7 first** — it's the spec every decision below claims to satisfy.

**Architecture**, in `src/i18n.js` and `src/App.jsx`:

- `src/data/i18n/en.json` — the English source. Terminal fallback, compiled into the main bundle.
- `src/data/i18n/{code}.json` — one pack per language: 23 UI strings, 11 group titles, 3 layer
  titles, 11 group panels+endings. All twelve exist and claim 100% coverage at this tier.
- `src/data/i18n/layers/{code}.json` — the three layer essays (How it was made / got here / we
  know), 17 segments each. All twelve exist and claim 100% coverage.
- `src/data/i18n/stories/{code}.json` — the 128 object stories, keyed by accession. **Only
  `de.json` exists.** The other eleven languages have zero story coverage and fall back to English.
- `scripts/split.mjs` is the build step that assembles all of this into `src/data/chunks/`. Run
  `node scripts/split.mjs` to see per-language coverage counts printed to the console.
- Resolution order everywhere: selected language → English, per string, per segment — never per
  page. `Fallback`/`Translated` components in `App.jsx` are supposed to mark what fell back.

**Tools already in the repo** — use them, don't rebuild them:

- `node scripts/harvest.mjs` — 18 build assertions over the data layer (not i18n-specific, but a
  broken i18n change can break these too).
- `node scripts/split.mjs` — rebuilds `src/data/chunks/`, prints per-language coverage.
- `node scripts/smoke.mjs <origin>` — loads 12 routes in headless Chrome, checks what rendered.
- `node scripts/i18n-check.mjs <origin>` — the 12 mechanism checks (BCP 47 lookup, RTL mirroring
  without mirrored media, fallback visibility). Needs `npm run preview` running first.

## THE TWO BUGS ALREADY FOUND — VERIFY THE FIX, THEN LOOK FOR THE SAME SHAPE ELSEWHERE

**1. Dot-splitting on accession numbers.** `resolve()` in `src/i18n.js` used to split every lookup
path on `.`. Accession numbers contain dots (`1884.137.33`), so `stories.1884.137.33.headline`
shredded into five bogus keys and no translated story could ever be found — it silently rendered
the English fallback and *looked* correct. Fixed by accepting an array of keys wherever a segment
might itself contain a dot.

**Don't just trust that fix. Check:**
- Is there anywhere else in `App.jsx` that builds a lookup path with a template string containing a
  value that could itself contain a dot? Accession numbers are the known case; are there others
  (URLs, version strings, anything user- or data-derived)?
- Does the array-path form actually get used consistently, or did the fix only patch the two call
  sites that were caught by inspection? Grep for every `tr(` call and check each one by hand.

**2. Headlines silently left in English.** After fixing bug #1, 126 of 128 German story headlines
turned out to still be the English source text — the building session had copied object keys out of
a reference dump without re-translating them, and nothing caught it until it was checked headline by
headline against the English source.

**This is the important one.** It means **content can be technically present, valid JSON, correctly
wired through the resolver, and still be untranslated** — coverage counts and build assertions will
report it as done. Run the equivalent check yourself, systematically, not by spot-checking:

```
node -e "
const de=require('./src/data/i18n/stories/de.json');
const m=require('./src/data/stories.json'), d=require('./src/data/stories-drafted.json');
const en={...d.stories,...m.stories};
for (const [acc,s] of Object.entries(de.stories)) {
  if (s.headline === en[acc].headline) console.log(acc, ':', s.headline);
}
"
```
(Some matches are legitimate — Latin binomials with no German common name. Judge each one; don't
just count them.)

**Then generalise this check to every other content field, in every language:**
- Do the same identical-to-English check on every `panels.{slug}.panel`, `panels.{slug}.ending`,
  every `layers.{slug}.segments[].heading` and `.text`, in all twelve UI/layer packs.
- If any story translations get added for other languages before you review, run it against those
  too.
- A string can also be *partially* untranslated — an English sentence pasted into an otherwise
  translated paragraph. Identical-string matching won't catch that; you'll need to actually read a
  meaningful sample in each language, or use a second model call to flag suspiciously-English
  substrings inside non-Latin-script text.

## THINGS NOBODY HAS CHECKED AT ALL

**Segment-count alignment.** Stories and layer essays are resolved *by index*
(`segments.${si}.heading`), not by an ID. If a translated story has a different number of segments,
or reorders them relative to English, the resolver will pair the wrong heading with the wrong body
text — silently, because both sides will "resolve" successfully to *something*. Write a script that
compares `segments.length` between every translated story/layer and its English source, for every
language that has one. Also check paragraph counts within a segment's `text` (split on `\n\n`) —
translated prose that merges or splits paragraphs relative to English will look fine on its own but
break the printed structure.

**Numeric and factual fidelity.** Every translated segment should preserve the English source's
numbers, dates, and proper nouns exactly: measurements (28 centimetres, 45 centimetres, 150
centimetres...), dates (1878, 1882, 1883, 1895, 2008), counts (630 models, 700+, 32 tentacles, 128
objects), accession numbers, and place names (Naples, Lyttelton, Dresden). Pull every number out of
`stories.json` + `stories-drafted.json` + `layers.json` and grep for it in `stories/de.json` —
flag any English-source number that doesn't appear somewhere in the German text. This is a
mechanical check you can actually run, not a vibe check.

**Fabrication.** The instruction throughout was translate, not re-author. Read a sample of German
stories side by side with English and check nothing was added, softened, or embellished beyond what
translation requires. Pay particular attention to the `identification` field — these are evidentiary
caveats about disputed taxonomy ("the Museum's page says X, the collection record says Y"), and a
mistranslation here could invert or blur a caveat that exists specifically so the app doesn't assert
something it can't support.

**The disclosure requirement §7 asks for is not wired up.** `en.json`'s `ui.translationNotice` key
("Machine translated and not yet reviewed by a person") and every low-resource pack's
`qualityWarning` field exist in the JSON but **are not referenced anywhere in `App.jsx`** — confirmed
by `grep -n "translationNotice\|qualityWarning" src/App.jsx` returning nothing. §7 explicitly asks
for "a quiet line in the language picker where content is machine-translated and human-reviewed."
Right now a visitor selecting Tigrinya gets no signal that it's a different confidence tier from
German. Decide whether this is a finding to report or a fix to make; either way it should not be
silently assumed fixed.

**RTL correctness beyond the mechanism.** `i18n-check.mjs` verifies the *mechanism* — root `dir`,
media not mirrored. It does not verify that the Arabic and Dari *content itself* reads correctly:
numerals, punctuation placement, and any accidentally-embedded Latin text (accession numbers,
binomials) should be checked for correct bidi behavior inline, not just at the block level.

**Tigrinya specifically.** It's flagged in its own file as "the weakest pack in the set." Read a
sample against the English source, or against the other packs' quality, and confirm that assessment
is still fair rather than just repeated.

**Quantify what "12 languages" actually means right now**, and report it plainly: how many of the
~30 tier-1 orientation strings, ~13,000 tier-2 story words, and ~2,500 tier-3 layer words are
actually translated, per language, as a table. The console output of `node scripts/split.mjs`
gives you the raw counts; turn it into something a non-technical reader could act on.

## HOW TO REPORT

Findings, not fixes, unless the fix is a one-line correction to something checked above. For each
finding: what's wrong, which file/accession/language, how you'd verify it's real (not just asserted
by you), and severity — does it silently mis-render content, or is it a completeness gap that's
already disclosed as such.

If you're using `/code-review`, `high` or `ultra` effort is appropriate here — the two bugs already
found were both invisible to a normal pass and only surfaced by mechanical, exhaustive checking.
