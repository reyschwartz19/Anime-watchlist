---
target: isolated populated Discover mockup
total_score: 31
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 0
target_identity: "file:/home/rey/Projects/Anime-watchlist/docs/design/discover-mockup.html"
target_fingerprint: "sha256:cde80a36edaaccf0cda22c0599624c00b1143255bcdd325fc339ccab6b144a4e"
target_path: /home/rey/Projects/Anime-watchlist/docs/design/discover-mockup.html
timestamp: 2026-11-04T22-36-17Z
slug: docs-design-discover-mockup-html
---
# Discover mockup review

Method: dual-agent (A: `/root/critique_design` · B: `/root/critique_detector`). Independent Vercel interaction audit: `/root/repo_audit`. Reviewed 2026-11-04.

Target: `docs/design/discover-mockup.html`, its CSS/JavaScript, and original poster study. Scope: one-title ephemeral prototype, not the live application. The original assessments were independent; A completed before the parent read B. The same isolation was preserved for the final source review and detector scan.

## Final rendered mockup

| View | Screenshot |
| --- | --- |
| Desktop 1440×1000, light | [Open](evidence/discover-mockup-desktop.png) |
| Phone 390×844, light | [Open](evidence/discover-mockup-phone.png) |
| Desktop 1440×1000, dark | [Open](evidence/discover-mockup-dark.png) |
| Phone 390×844, dark | [Open](evidence/discover-mockup-dark-phone.png) |
| Saved title and selected feedback | [Open](evidence/discover-mockup-saved.png) |

These are viewport screenshots of the final source, not composites. Source hashes before and after capture match; see [capture metadata](workflow/vercel-screenshots.json). Earlier `critique-design-*` and `critique-detector-*` captures document the initial revision and are historical evidence.

## Design health

**31/36 — Good (86.1%).** A subjective Impeccable critique score for this prototype, not a production-readiness or accessibility certification.

| # | Heuristic | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 4 | Saved state, count, feedback selection and live messages are explicit |
| 2 | Match to the real world | 4 | Plan to watch, Fits my taste and Not for me name the implemented actions |
| 3 | User control and freedom | 4 | Reversible choices, Close/Escape, focus entry and return |
| 4 | Consistency and standards | 3 | My List is a study disclosure beside Discover navigation; eventual route behavior remains open |
| 5 | Error prevention | 3 | Sample/reset disclosure precedes saving; collection and feedback are separate |
| 6 | Recognition rather than recall | 4 | Phone identity, reason and Save share a clear reading path |
| 7 | Flexibility and efficiency | 3 | Direct actions, native keyboard controls and a useful skip target |
| 8 | Aesthetic and minimalist design | 3 | Restrained hierarchy; desktop framing and single-item counter could be smaller |
| 9 | Error recognition and recovery | n/a | No validation or service request can fail in this fixture |
| 10 | Help and documentation | 3 | Contextual feedback, sample and undo guidance |
| **Total** | | **31/36** | **Nine applicable heuristics** |

The initial assessment's unchanged row scores total **25/36**, corrected from an addition error in the initial draft. The final total is 4+4+4+3+3+4+3+3+3 = 31. Both assess the same applicable heuristic set.

## Specificity and overall impression

The specific recommendation reason is this product's strongest design element: a viewer can judge taste fit separately from plot. Mushi-Shi's title, original forest-toned poster study and example Natsume preference make the study concrete. The restrained composition remains transferable to other media products, which is acceptable for this task-oriented surface but leaves production identity open.

The phone now presents the compact poster beside title and metadata, then synopsis, reason and Save. At 390×844, Save occupies y=729.5–777.5 and is fully visible. Feedback follows below through normal scrolling. No reference visual fidelity is claimed: all three reference pages' actual rendered content remained blocked.

## What works

1. Synopsis and recommendation reason answer different questions: what the show is about and why this viewer might like it.
2. Explicit saving, undo, count and independent feedback make collection state easy to understand.
3. The compact phone composition preserves the original poster without making it a detour before the decision.

## Priority issues and resolution

**No substantive remaining prototype Priority Issues.** The initial P1 phone hierarchy issue and P2 feedback/reset-copy issues were fixed, then inspected again. Vercel's Escape/focus, theme-color and missing hover-state findings were also fixed.

| Initial issue | Final change | Evidence |
| --- | --- | --- |
| Phone title began near y806; Save near y1137 | Compact poster/title row, smaller page introduction | Final phone screenshot; Save entirely within first viewport |
| More like this could promise another title | Fits my taste within an explicit feedback group | Final HTML and saved/feedback capture |
| Reload-reset disclosure followed the action | Reset note immediately before saving | Final desktop and phone screenshots |
| Escape failed immediately after opening My List | Focus Close on entry; document Escape guard; return focus | Native keyboard assertions |
| Dark theme-color stayed light | Media-specific light/dark metadata | Browser-emulated theme checks |
| My List and Close lacked hover feedback | Added deliberate hover styling | Final CSS review |

Remaining workflow boundary: obtain actual reference screenshots, review the provisional direction with the user, and only then restyle the app. Production loading/error/retry, account persistence, full collection browsing and licensed catalog media are later work, not completed by this mockup.

## Cognitive load, emotional journey and personas

Low cognitive load: **0/8 checklist failures** in the final scoped assessment. Each decision group has at most four options. The reason establishes personal relevance; Save provides an immediate next step; honest reset copy precedes commitment.

- **Casey, phone viewer:** Can see title, reason and complete Save in the first viewport. Feedback below the fold remains reachable normally.
- **Jordan, first-time viewer:** Fits my taste accurately describes selection, and the sample/reset boundary appears before saving.
- **Sam, keyboard/low-vision viewer:** Native controls, focus indication, skip link, focus return and Escape passed the browser audit. No actual screen-reader test was performed.

## Detector result

Final scoped Impeccable detector: **1 warning**, `overused-font` for Arial; **0 quality findings**. This is an acknowledged taste heuristic for the intentionally dependency-free prototype font stack, not a functional failure. Production font selection awaits reference review. The earlier tiny-text and undersized-label findings are absent after increasing small UI type to at least 12px.

See [final detector JSON](workflow/impeccable-detect-final.json), [final B report](workflow/critique-assessment-b-final.md), and [final A report](workflow/critique-assessment-a-final.md). The earlier browser overlay executed and was captured in headless Chrome; it is historical, and no user-visible overlay tab remains open.

## Vercel interaction audit and verification

**34/34 assertions passed** against stable final source bytes. Verified save/undo, mutually exclusive reversible feedback, independence of feedback and collection, My List opening/closing, focus entry/return, immediate Escape, Enter/Space/Tab, `?panel=list`, browser Back, 320/390/1440px overflow, 44px button target heights, light/dark metadata and colors, visible focus and reduced motion.

Source syntax check (`node --check`) and the existing app build (`npm run build`) passed. The app build retains its existing large-bundle advisory; no app files or dependencies were changed. The standalone mockup was rendered and tested separately, since it is not an application build entry point.

See [Vercel audit](workflow/vercel-interaction-audit.md) and [raw browser assertions](workflow/vercel-browser-checks.json). Physical phone browsers, screen-reader behavior, account persistence, catalog destination availability, and recommender quality were not verified.

## Minor observations

The desktop Discover heading and 01 / 01 count can be reduced if later review calls for more density. The compact poster's detailed typography is small by design; adjacent live text supplies the useful title/metadata. All visual choices remain explicitly original and provisional in the [reference ledger](references.md).

Questions skipped: 0 remaining prototype Priority Issues; user review of missing reference evidence is already required before app restyling.
