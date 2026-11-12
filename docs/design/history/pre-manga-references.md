# Reference evidence

Inspection date: **2026-11-04** (Africa/Douala). Desktop: **1440×1000**; phone: **390×844**, touch emulation. Native Chrome was driven through local DevTools. The textual extraction service could read content that the rendered browser could not. These are different evidence levels.

## Rendered access matrix

| Intended reference | Desktop evidence | Phone evidence | Result |
| --- | --- | --- | --- |
| [Criterion Top 10 index](https://www.criterion.com/current/top-10-lists) | [Screenshot](evidence/criterion-index-desktop.png), [DOM record](evidence/criterion-index-desktop.json) | [Screenshot](evidence/criterion-index-phone.png), [DOM record](evidence/criterion-index-phone.json) | Cloudflare verification screen; index layout unobserved |
| [Julie Klausner's individual list](https://www.criterion.com/current/top-10-lists/1022-julie-klausner-s-top-10) | [Screenshot](evidence/criterion-contributor-desktop.png), [DOM record](evidence/criterion-contributor-desktop.json) | [Screenshot](evidence/criterion-contributor-phone.png), [DOM record](evidence/criterion-contributor-phone.json) | Cloudflare verification screen; contributor layout unobserved |
| [Letterboxd popular films](https://letterboxd.com/films/popular/) | [Screenshot](evidence/letterboxd-popular-desktop.png), [DOM record](evidence/letterboxd-popular-desktop.json) | [Screenshot](evidence/letterboxd-popular-phone.png), [DOM record](evidence/letterboxd-popular-phone.json) | Security-check modal obscures the page; browsing and collection interactions unobserved |

These six screenshots show access failures, not usable design references. No verification challenge was solved or bypassed. A blurred shell behind a security modal is insufficient evidence for typography, layout, posters, or controls.

## What the text extraction establishes

This section describes extracted content and labels, **not visual observations**. No spacing, color, font, grid, responsive behavior, hover behavior, or interaction result can be inferred from it.

### Discover: Criterion index

Page: https://www.criterion.com/current/top-10-lists

Extracted elements: a Top 10 Lists heading, a result count, contributor-named list links, descriptive introductions, dates, and a Load More control. The chosen contributor is linked from the index.

Application, decision **D1**: introduce recommendations with a comprehensible curatorial premise. The index's content supports presenting context before selection; it does not establish any card dimensions or grid. Contributor attribution must be real if introduced later; do not invent a human curator for AI recommendations.

### Discover: one contributor's list

Page: https://www.criterion.com/current/top-10-lists/1022-julie-klausner-s-top-10

Extracted elements: contributor heading, biographical introduction, date, numbered film selections, director/title links, personal commentary, and Quick Shop links for several entries.

Application, decision **D2**: pair the selected anime with a specific recommendation reason, distinct from its synopsis. The mockup's original example relates Mushi-Shi to a sample preference for Natsume's Book of Friends. No Criterion prose, contributor photograph, cover art, logo, or shop UI is copied.

### My List: Letterboxd browsing and collection

Page: https://letterboxd.com/films/popular/

Extracted elements: Small/Large view labels, sorting options, service/genre/decade categories, visibility options, and account-filter labels for films in a watchlist. Extraction also includes form/modal text that may be hidden or account dependent.

Application, decision **D3**: investigate compact collection browsing, status filters, and explicit saved state for My List. This remains a proposal. Hidden extracted text does not prove that a modal or control is visible, available while signed out, keyboard accessible, or functional. Poster hover, filter opening, collection editing, confirmation, and persistence were **not observed**. The prototype's save/feedback behavior is original (**D6**).

## Missing views requested from the user

Please provide screenshots of the actual content after ordinary access succeeds:

1. Criterion index at desktop and phone widths, including the heading and first entries.
2. Julie Klausner's individual list at desktop and phone widths: introduction plus at least one numbered film and its commentary. A second capture lower on the page helps verify repeated entries.
3. Letterboxd popular films at desktop and phone widths: grid plus browsing toolbar; an open filter/sort menu; desktop poster hover controls and their phone equivalent.
4. If accessible while signed in, the collection action open and its saved/unsaved confirmation state. Screenshots cannot establish persistence by themselves; describe what changed after saving or undoing. Account details can be cropped out.

Until these arrive, no reference visual measurement or behavior is approved. Keep the mockup visibly provisional and leave the live app's styling in place.

## Original study decisions

The following are explicitly **Original**, with no observed reference-screen basis. They are not derived from the purple app.

| ID | Original decision | Reason and application |
| --- | --- | --- |
| D4 | Neutral canvas, charcoal type, forest accent, plain text brand, minimal rules | Keep the anime title and recommendation reason prominent; all values are provisional |
| D5 | Poster and reading column on desktop; compact poster/title row, then full-width reason and actions on phone | Make the requested single recommendation concrete and reviewable; corrected after rendered critique |
| D6 | Labeled reversible save and two feedback buttons; inline sample list | Demonstrate collection state and preference feedback without an account or irreversible action |
| D7 | Original geometric typographic Mushi-Shi poster | Populate the mockup without reproducing logos or proprietary artwork |
| D8 | Semantic controls, visible focus, announced updates, reduced motion, dark theme | Establish testable interaction quality; verify using Vercel's installed skill |

See the [root design contract](../../DESIGN.md) for tokens, interaction requirements, review boundary, and future implementation workflow.

## Anime fixture and media provenance

Mushi-Shi is an actual anime; this fixture refers to the first 26-episode series that began in 2005. Catalog link: https://myanimelist.net/anime/457/Mushishi . Episode cross-check: https://en.wikipedia.org/wiki/List_of_Mushishi_episodes . Jikan and catalog browser access were unavailable in this session; this is not a claim that their pages were visually inspected.

The poster at [assets/mushishi-poster-study.svg](assets/mushishi-poster-study.svg) is original geometry and typography made for this study. It is visibly identified as unofficial. The recommendation reason, taste profile, and feedback state are illustrative. No ratings, popularity numbers, or claims about the user's actual watch history are invented.

## Mockup and review evidence

Source: [discover-mockup.html](discover-mockup.html), [CSS](discover-mockup.css), [JavaScript](discover-mockup.js). It is isolated from the React application, authentication, APIs, storage, and global styles. Reload resets its state.

Rendered mockup captures and audit outcomes are recorded in [review.md](review.md). Installation READMEs, help output, exact commands, versions, upstream commits, and verified hashes are recorded in [workflow/installation.md](workflow/installation.md).
