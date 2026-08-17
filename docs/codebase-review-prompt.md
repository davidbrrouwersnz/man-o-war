# Codebase review and refactor prompt

Two prompts, run separately — a review that is adversarial, then a refactor that is deliberately
not. Paste each into a **fresh session** in `C:\Users\david\dev\manowar`. Do not combine them:
a reviewer hunting for faults and a refactorer preserving behaviour are opposite postures, and one
session doing both does each badly.

**Run order:** Prompt 0 (once, to repair the safety net) → Prompt 1 per lens (five runs) → human
triage of findings → Prompt 2 per accepted finding.

---

## PROMPT 0 — repair the safety net first

```
Before any review or refactor of this codebase, make its own checks trustworthy.

1. Run `npm run build`. It must pass: it asserts story coverage on all 128 objects, i18n pack
   integrity, and 34 contrast pairs. If it fails, stop and report — nothing else is valid.
2. Run `npm run audio:check` (the §13 spoken-equals-printed guard over all narration units).
3. Repair scripts/smoke.mjs: it loads every route in a real browser and asserts one marker
   element per route, but at least one assertion is stale — `.arrived-flag` on the /o/ routes
   refers to an element removed with the "object you scanned" badge. Update every route's marker
   to an element that exists today (check src/pages/*.jsx for current class names), run it against
   `vite preview`, and make all routes pass. Do not weaken an assertion to nothing; each route
   must still prove it rendered its real content.
4. Report the three results. This smoke script plus the build gates are the ONLY automated net
   this codebase has — there are no unit or component tests — so they must be green before any
   refactoring starts.
```

---

## PROMPT 1 — adversarial review (one lens per run, five runs)

Paste this preamble above every lens:

```
You are reviewing a working, deployed codebase adversarially. Your default assumption is that it
is wrong somewhere and your job is to find where. FINDINGS ONLY: report file, line, what is
wrong, how you verified it is real (run the code, probe the DOM, trace the data), and what it
would break for a visitor. Do not fix anything. Do not propose rewrites. A finding you could not
verify is labelled a suspicion, separately.

THE PROJECT: a Vite + React companion app for Canterbury Museum's Blaschka glass collection —
one collection page, eleven group pages holding 128 objects inline, an audio guide whose spoken
words must equal the printed words verbatim (§13 — this is load-bearing and build-asserted), nine
languages, and a build pipeline (scripts/*.mjs) that harvests, translates, voices and asserts.

RULES OF EVIDENCE:
- The comments are decision records, not clutter. A comment saying "on request" or citing a
  measurement or a spec section documents a decision already made. Flagging code as wrong when
  its comment explains why it is that way is a false positive unless you can show the comment's
  reasoning no longer holds.
- Verify against the running app (npm run dev, probe the DOM at 375px, 1100px and 1600px), not
  against what the code looks like it does.
- The audio/text coupling is the highest-stakes invariant: blocksOf() in src/audio.jsx, the
  Spoken block indices, the VTT cue text-matching in alignCues(), and scripts/audio.mjs must all
  agree. Any finding here outranks everything else.
```

Then one lens per run:

1. **Correctness.** Routing (accession deep links, replaceState-on-scroll, back semantics),
   state, the seen/arrived logic, i18n fallback chains (`resolved` vs `selected` vs device),
   RTL, the audio queue building in group.jsx/home.jsx.
2. **Accessibility.** Heading outline per page, focus order vs visual order at both layout
   arrangements (useWide in home.jsx swaps DOM trees), names on controls, aria-live regions,
   200% text, keyboard-only walk of every route.
3. **Duplication and dead weight.** Unused CSS rules and tokens, dead i18n keys, unused exports,
   two code paths where one would do — with proof they are dead (grep is not proof for CSS;
   check the rendered DOM).
4. **Pipeline integrity.** scripts/*.mjs: does split.mjs assert what it claims, can audio-index
   staleness miss a change, does the translate ledger handle a deleted unit, is any assertion
   weaker than its comment says.
5. **Performance.** Chunk sizes against what each route loads, lazy-loading of media
   (IntersectionObserver margins), the 128-tile grid, LCP on / and on a group page, anything
   fetched that the route never shows.

---

## PROMPT 2 — conservative refactor (per accepted finding)

```
You are applying ONE accepted change to a working codebase: [PASTE THE FINDING].

Rules, in priority order:
1. Behaviour-preserving unless the finding itself names the behaviour change. "Better" code that
   renders one pixel differently is a failure here.
2. Small steps, each verified: after every coherent edit run `npm run build` (its assertions are
   the contract) and `node scripts/smoke.mjs` against a preview build. For anything touching
   text, audio, or blocks: `npm run audio:check` must stay green — the spoken words ARE the
   printed words, and no refactor outranks that.
3. Preserve the comments' knowledge. Comments here record measurements, spec sections and "on
   request" decisions. Move them with the code they explain; update them when the code changes;
   delete one only when the decision it records is the thing being removed. Match their prose
   style — they explain WHY, never narrate WHAT.
4. Do not relitigate settled decisions: anything a comment marks "on request" or "deliberate",
   the §13 word-for-word rule, routing on accession numbers, the dark media / cream reading
   grounds, the eleven groups. If your refactor wants one of these changed, stop and ask.
5. No new dependencies, no new abstractions for single-use code, no framework idioms this
   codebase does not already use. It deliberately has no state library and no UI kit beyond the
   few shadcn primitives present.
6. If a change touches en.json or any authored data file, say so prominently: pushing it to main
   triggers the translate-and-voice workflow, which spends money and re-renders narration.
Report what changed, what you verified, and anything you saw but did not touch.
```

---

## What the safety net does and does not cover (read before trusting a green run)

| Covered automatically | Not covered by anything automated |
|---|---|
| Story on all 128 objects; pack keys ⊆ en.json; title-strip counts (split.mjs, every build) | Component behaviour and interaction (tabs, audio bar, settings dialog) |
| 34 contrast pairs, light/dark/HC (contrast.mjs, every build) | Read-along highlight sync (cue ↔ block alignment at runtime) |
| Spoken text ≡ printed text over all narration units (audio.mjs --dry-run) | Focus order, keyboard walks, screen-reader outline |
| Translation carve-outs and meaning drift (CI, on English changes) | Layout regressions at any width; the two home arrangements |
| Route-renders-content per route (smoke.mjs — MANUAL, currently stale, fix via Prompt 0) | Scroll behaviour: arrival positioning, replaceState, group return |

The right long-term fix for the uncovered column is a small Playwright suite (smoke.mjs already
drives a real browser over CDP, so the machinery is half-built), but that is its own decision
with its own maintenance bill — not something a refactor session should adopt on its own
authority.
