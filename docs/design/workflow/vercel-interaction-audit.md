# Vercel interaction audit

Reviewed 2026-11-04 using the installed `.agents/skills/web-design-guidelines/SKILL.md` (1.0.0). Fetched the [current Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) through the GitHub connector immediately before this review. Reviewed only `docs/design/discover-mockup.html`, `.css`, and `.js`, plus the isolated rendered mockup. This review did not consult Impeccable assessment output.

## Final findings

No blocking or material interaction findings remain in this fixture after the fixes and verification below.

- `docs/design/discover-mockup.html:6` — Pass: light and dark media-specific `theme-color` now match the page background.
- `docs/design/discover-mockup.css:561` — Pass: My List and Close now have deliberate hover feedback; native keyboard focus remains visible.
- `docs/design/discover-mockup.js:36` — Pass: opening My List focuses Close; document-level Escape closes the panel and restores opener focus. Opening/closing also synchronizes `?panel=list`.

The first review reproduced two browser failures (Escape immediately after opening and dark browser-chrome color), plus the source-level hover omission. Those findings are resolved in the final sources.

## Browser verification

Fresh independent Chrome tab; native CDP pointer and keyboard events; final local audit URL `http://127.0.0.1:4174/docs/design/discover-mockup.html`. A temporary static server and Chrome ran together and were stopped after capture. Structured evidence: [vercel-browser-checks.json](vercel-browser-checks.json).

Final pass: **34 of 34 assertions passed**. Source SHA-256 values were recorded before and after the entire audit/capture sequence and were unchanged. The evidence JSON records those hashes. The final source includes the “Fits my taste” feedback label, recommendation-target skip link, and compact phone layout.

Verified:

- Initial list count is zero; save changes pressed state, label, list count, panel content, and live status message. Undo returns the count and collection to empty.
- Positive and negative feedback switch each other off; each can be toggled off. Saving and undoing do not change feedback; feedback does not change the saved collection.
- My List exposes `aria-expanded`, opens its linked panel, focuses Close, and closes with Close. Close returns focus to its opener. Escape immediately after opening and from inside the panel closes and restores focus.
- Native Enter activates save and opens My List; native Space activates undo and Close. Tab moves from focused Close to the next visible action; Shift+Tab returns to Close.
- Direct `?panel=list` links show the collection; a plain link hides it. Opening/closing updates the URL. Actual browser Back restores the collection deep link and visible panel.
- At 320px, 390px, and 1440px, document and body widths do not exceed the viewport. Every visible button has at least a 44px target height.
- At 390×844, the save button occupies document y=729.5–777.5px, entirely inside the first viewport. Feedback follows below and remains reachable by normal scrolling.
- Light and dark CSS colors respond to the emulated scheme; keyboard focus uses a visible 3px outline in each. Reduced-motion preference disables the button transition.
- Source uses native buttons and links, meaningful image alt text and dimensions, a skip link, semantic headings, a polite live region, pressed/expanded state, intentional touch behavior, local assets, and no remote runtime dependency.

## Final screenshots

Captured from the final stable source bytes; viewport captures, not full-page composites. The light desktop, light phone, and dark phone captures were also visually inspected. Capture metadata and UI states: [vercel-screenshots.json](vercel-screenshots.json).

| View | Artifact |
| --- | --- |
| Desktop, 1440×1000, light | [discover-mockup-desktop.png](../evidence/discover-mockup-desktop.png) |
| Phone, 390×844, light | [discover-mockup-phone.png](../evidence/discover-mockup-phone.png) |
| Desktop, 1440×1000, dark | [discover-mockup-dark.png](../evidence/discover-mockup-dark.png) |
| Phone, 390×844, dark | [discover-mockup-dark-phone.png](../evidence/discover-mockup-dark-phone.png) |
| Desktop, saved + “Fits my taste” selected | [discover-mockup-saved.png](../evidence/discover-mockup-saved.png) |

## Limits

Desktop Chrome emulation covers layout widths and media preferences, not physical phone browsers or a screen reader. This is a fixture-only study: collection/feedback reset on reload as disclosed, no account services are connected, and no backend persistence or recommendation quality was audited. The MyAnimeList destination was checked in source, not opened. No forms, drag behavior, large lists, media playback, or server hydration are present, so their guideline categories do not apply.
