# Assessment B — detector and browser evidence

Target: `docs/design/discover-mockup.html`  
URL: `http://127.0.0.1:4173/docs/design/discover-mockup.html`  
Resolved slug: `docs-design-discover-mockup-html`

This assessment was conducted independently from Assessment A. No A report or findings were read. Only the target HTML, linked CSS/JS, detector output, and independently captured browser evidence were inspected. The root agent ran context once; it was not rerun here.

## Scoped CLI scan

Command, run exactly once:

```sh
.agents/skills/impeccable/scripts/impeccable detect --json docs/design/discover-mockup.html > docs/design/workflow/impeccable-detect.json
```

Exit status **2**: findings. The saved JSON is complete: **4 warning records, 3 distinct rule names**. Category totals: **3 quality**, **1 slop**. No errors were returned. `.impeccable/critique/ignore.md` does not exist; nothing was suppressed.

All four records identify the absolute target HTML path and report `line: 0`. These are runtime-derived findings, so the following source locations are manually resolved and must not be represented as detector-supplied line numbers.

| Rule | Count | Detector snippet | Resolved source evidence |
| --- | ---: | --- | --- |
| `tiny-text` — Tiny body text | 1 | `10px body text` | Mobile CSS in `docs/design/discover-mockup.css:6` makes the study banner and poster figcaption 10px. HTML banner is `docs/design/discover-mockup.html:14`; figcaption is `:36`. |
| `undersized-ui-text` — Undersized functional text | 2 | `10px functional text "Sample taste profile"`; `10px functional text "Original poster study · No official artw"` | HTML `:14` and `:36`, CSS `:6`. |
| `overused-font` — Overused font | 1 | `Primary font: arial` | `docs/design/discover-mockup.css:2`: `font-family:Arial,Helvetica,sans-serif`. |

## Interpretation and false positives

- **The two 10px measurements are real.** A separate fresh phone tab at 390×844 reports computed `fontSize: "10px"` for the banner, its “Sample taste profile” span, and the figcaption. The 10px values are conditional on the <=760px breakpoint.
- **Do not count the generic `tiny-text` record as a third independent text problem.** It aggregates the same small banner/caption already named by the two `undersized-ui-text` records. Calling these “body text” obscures their actual context; synopsis is 16px on phone and the main recommendation explanation is 14px.
- **The caption warning has lower functional impact.** It is a provenance/legal-style note (“No official artwork reproduced”), not an action label. The detector describes a softer floor for noninteractive legal small print, so treating that record as a firm functional-text failure may be a contextual false positive. Increasing it remains a reasonable legibility refinement.
- **The font warning is a taste heuristic, not proof of poor usability or an authoredness score.** Arial is correctly identified. A system font may be appropriate for this operational surface; evaluate its execution in A before requiring a replacement. The detector alone does not justify changing typography.
- The scanner did not identify primary action text or the synopsis as undersized. That absence is not a complete accessibility audit.

## Browser evidence and overlay

No native browser automation tool was exposed in the available tool catalog. The fallback was direct Chrome CDP, using fresh tabs throughout. The first available Chrome endpoint on 9223 accepted a successful mutable preflight: the document title changed to `[Human] Discover study · Anime Watchlist`, an inline `<script>` was appended, and its marker executed. That Chrome endpoint later disappeared during the shared browser lifecycle; an injection attempt returned an unsettled top-level await and the next connection returned `ECONNREFUSED 127.0.0.1:9223`.

To finish without affecting A’s tabs, a separate temporary headless Chrome profile on local CDP **9225** was started and all remaining checks ran in the same supervising process. It was terminated by that process afterward. An intermediate owned Chrome attempt on 9224 also exited; its exact PID was checked as absent before cleanup. No global process kill was used.

In the isolated 9225 browser:

1. A fresh target tab loaded the mockup. Mutable title/script execution preflight succeeded again.
2. The bundled live server started on **8400** (PID 41736).
3. The tab was labeled `[Human]`, brought to front using CDP, scrolled to the top, and injected with `http://localhost:8400/detect.js`.
4. Script `onload` returned **true**. After 3.5 seconds, the page contained an `.impeccable-overlay.impeccable-banner`, and the console logged **`[impeccable] 1 anti-pattern found`**, followed by **`overused-font Primary font: arial (100% of text)`**. Thus the detector executed in the page; injection did not merely append a tag.
5. The overlay screenshot captured the yellow “OVERUSED FONT” banner. This browser viewport was 780×493, above the 760px mobile breakpoint, so the 10px mobile warnings were absent from that console scan. This difference explains the CLI count of four versus the desktop overlay count of one.
6. The temporary server was stopped with `live-server stop --keep-inject`, exit 0: **“Stopped live server on port 8400.”** This avoids any source-tag cleanup mutation.

**Visibility limit:** this was headless Chrome. There was no native browser visibility/presentation API, and no persistent user-visible `[Human]` tab remains after owned Chrome cleanup. Say the overlay executed and was captured; do not tell the user overlays are now visible in their browser. No HTML source injection was performed.

The only additional console error captured was an incidental `favicon.ico` 404 from the static server. No runtime exception from the mockup was captured during the overlay inspection. The controls’ full end-to-end behavior was outside this detector-specific pass.

## Independent viewport observations

- A fresh **1440×1000** preflight capture shows the recommendation copy beside the poster and the save action in the first viewport.
- A separate fresh **390×844** phone tab has `scrollWidth: 390` and `scrollHeight: 1600`: no horizontal overflow was measured.
- Phone vertical order is intro, poster, genre/title, explanation, actions. The poster occupies y=327–744; the title starts at **y=798**; “Plan to watch” starts at **y=1136**; feedback starts at **y=1209**. Thus the recommendation name barely enters the first viewport and the primary action requires scrolling. These are measurements for A’s hierarchy judgment, not an automatic defect classification.
- Measured phone targets: “Plan to watch” 174×50, “Anime details” approximately 94×44, “More like this” approximately 109×44, “Not for me” approximately 93×44, and “My List” approximately 70×44. The wordmark link is only about 131×21. The hidden “Close” control returns a zero rectangle because its parent list is hidden; this is expected, not a failed target size.
- Phone computed type: synopsis 16px in source, recommendation explanation 14px in source; measured genre 12px, metadata 13px, sample label 11px, status 12px, footer 11px. Banner and caption are 10px as reported above.

## Retained evidence

- `docs/design/workflow/impeccable-detect.json` — original scoped CLI result.
- `docs/design/evidence/critique-detector-preflight.json` — successful mutation proof.
- `docs/design/evidence/critique-detector-preflight.png` — 1440×1000 page capture.
- `docs/design/evidence/critique-detector-overlay.json` — script load result, detected DOM banner, captured console events.
- `docs/design/evidence/critique-detector-inject.png` — rendered overlay, 780×493.
- `docs/design/evidence/critique-detector-phone.json` — phone computed text sizes, page dimensions, target rectangles.
- `docs/design/evidence/critique-detector-phone.png` — 390×844 first viewport.
- `docs/design/evidence/critique-detector-run.json` — commands, exit statuses, live-server stop proof, owned Chrome exit.

## Cleanup status

The critique-only live server was stopped with `--keep-inject`; the final isolated browser exited 0. Temporary browser scripts, tab metadata, Chrome log, and isolated Chrome profile directories under `/tmp/critique-detector-*` were removed. Evidence files are intentionally retained. The root-owned static server on 4173 was left running. No hooks were enabled, no global packages were installed, and app/mockup source files were not edited.
