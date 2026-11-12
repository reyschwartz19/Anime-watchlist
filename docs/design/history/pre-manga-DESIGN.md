# Anime Watchlist design workflow

Status: **provisional Discover study; live-app restyling has not started**. Visual reference validation awaits user screenshots. See [reference evidence and decision provenance](docs/design/references.md).

## Product and scope

Help anime viewers choose what to watch and manage their collection. Discover should explain a recommendation; My List should make collection state easy to scan and change. Existing data has `watching`, `completed`, `plan_to_watch`, and `dropped` states. Keep those semantics when implementation reaches the live app.

The current deliverable is [one isolated Discover mockup](docs/design/discover-mockup.html). Its preferences, recommendation reason, and collection are sample data. It imports no application code and writes no account data. The existing purple app is not a visual source.

## Reference contract

1. Inspect the actual Criterion index **and** a contributor list for Discover; inspect actual Letterboxd browsing **and** collection controls for My List.
2. Inspect rendered desktop and phone views. Record URL, viewport, state, screenshot, and observations in `docs/design/references.md`. Text extraction proves content structure only.
3. If blocked, capture the block and request the exact missing screenshots. Never promote extracted labels into claims about visible layout, hover, touch, responsiveness, or persistence.
4. Connect each major choice to a reference page and observed element. Mark every unsourced choice **Original**. Treat unverified visual choices as provisional.
5. Show reference evidence and the populated isolated mockup before changing live app styling. Incorporate the user's review before proceeding.
6. After live implementation, run Impeccable critique on the changed surface and Vercel's interaction audit on its code. Fix material issues and verify the complete saved-state flow. The mockup has its own review in `docs/design/review.md`.

This review boundary comes from the user's explicit request to see the mockup and evidence before app restyling.

## Decision register

| ID | Reference page and element | Application | Authority |
| --- | --- | --- | --- |
| D1 | Criterion Top 10 index: contributor-titled entries with descriptive introductions, from text extraction | Discover provides a considered introduction, rather than an unexplained wall of titles | Content structure only; rendered layout blocked |
| D2 | Julie Klausner's individual Criterion list: numbered film titles with personal commentary, from text extraction | Put a specific reason beside the recommendation; separate the reason from the anime synopsis | Content structure only; commentary is not copied |
| D3 | Letterboxd popular films: Small/Large, genre/decade/sort labels and watchlist visibility choices, from text extraction | Future My List should support browsing and collection filters; map to the app's four real status values | Proposal pending rendered and interaction evidence; not implemented in this mockup |
| D4 | **Original**; no reference visual observed | Pale neutral canvas, charcoal text, forest accent, restrained rules and plain text branding | Provisional; never extracted from the purple app |
| D5 | **Original**; Criterion commentary gives content intent, not visual measurements | Large poster beside the reading column on desktop; compact poster/title row above full-width reason and actions on phone | Provisional; render and test independently |
| D6 | **Original**; Letterboxd collection control behavior could not be inspected | Explicit “Plan to watch”, reversible save, count, and inline sample collection; two independent feedback choices | Prototype behavior, not a claim about Letterboxd |
| D7 | **Original** | Geometric typographic Mushi-Shi poster, visibly labeled as an original study | No logos, reference artwork, or official anime artwork copied |
| D8 | **Original** accessibility requirements; audit with installed Vercel skill | Semantic controls, 44px action targets, visible keyboard focus, announced results, reduced motion, automatic dark theme | Required for implementation; not claimed as reference observations |

## Provisional visual system

Use the mockup's CSS custom properties as the single source of values for this study, not as approved production tokens.

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | `#f6f7f3` | `#171e19` |
| Text | `#202821` | `#e8ede5` |
| Secondary text | `#596158` | `#adb8a9` |
| Accent | `#234d39` | `#bad2ae` |
| Rule | `#c7cec1` | `#4b594b` |
| Subtle surface | `#e9ede4` | `#28352b` |

Original layout: maximum content width 1184px, desktop 40px outer margins, phone 20px; 760px study breakpoint. Type is a dependency-free sans stack for the isolated prototype. A production font decision remains open. Keep functional body text readable and related controls grouped. No purple gradients, glowing surfaces, or ornamental icon tiles.

Design read: editorial anime discovery within a task-oriented app. `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 4`. These are original study choices. Impeccable surface mode: **Operate**.

## Interaction contract

- Saving maps to `plan_to_watch`; saving again undoes it. The prototype changes only memory and resets on reload, as stated on screen.
- “Fits my taste” and “Not for me” are mutually exclusive and reversible. In the prototype they demonstrate feedback selection; they do not train a recommender.
- My List opens an inline sample list, moves focus to Close, and synchronizes `?panel=list` for direct links. Close and Escape restore focus to its toggle. Filter, view-density, and account persistence behavior await reference evidence and later implementation.
- Production saving must report pending, success, and failure, preserve the previous state on failure, and offer recovery. Keep feedback selection separate from collection state.
- Production Discover needs loading, empty, error/retry, saved, and feedback states. Verify with real fixtures and service failures before release; the single populated mockup is not evidence of those flows.
- Keep the existing route paths, authentication, data model, and user data during visual implementation. Navigation labels shown in the study are proposals, not changes to live routes.

## Assets

The anime is real: Mushi-Shi, first series, 2005, 26 episodes, MAL ID 457. The recommendation copy and Natsume preference are illustrative. The poster is an original vector study and is explicitly not official artwork. Reference screenshots are research evidence only; do not use them as product assets or trace their logos. Use licensed or properly sourced catalog media only after an explicit production media decision.

## Installed tools and repeatable checks

See [installation provenance](docs/design/workflow/installation.md) and [machine-readable versions](docs/design/workflow/installed-skills.json). Both tools are installed at project scope, with hooks disabled:

- `.agents/skills/impeccable/SKILL.md`: read this and the requested playbook, run its context command once per session, then follow its critique workflow on the actual surface. Current launcher: `.agents/skills/impeccable/scripts/impeccable`.
- `.agents/skills/web-design-guidelines/SKILL.md`: fetch its current rules URL before each review, audit changed markup/styles/behavior, and record findings with file and line.

Reload/restart Codex to refresh discovery of the newly installed skills. Their files can be read directly in the current session. Never enable hooks or install global copies as a side effect.

For local review without app credentials:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# Open http://127.0.0.1:4173/docs/design/discover-mockup.html
```

Stop the server with Ctrl-C. Check at 1440×1000, 390×844, a narrow 320px viewport, keyboard-only, and both color schemes. A successful app build does not prove that this standalone HTML file was inspected. Never claim a blocked reference or unavailable authenticated flow passed.
