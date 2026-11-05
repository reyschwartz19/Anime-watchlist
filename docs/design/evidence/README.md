# Reference capture evidence

Captured 2026-11-04 with Chrome 154 using isolated browser state, device scale factor 1. Desktop viewport: 1440 × 1000 CSS pixels. Phone viewport: 390 × 844 CSS pixels. Phone Letterboxd capture includes mobile user agent and touch emulation. These are viewport screenshots, not full-page captures.

## Rendered access results

| Reference URL | Desktop capture | Phone capture | Result |
| --- | --- | --- | --- |
| https://www.criterion.com/current/top-10-lists | [PNG](criterion-index-desktop.png), [DOM](criterion-index-desktop.json) | [PNG](criterion-index-phone.png), [DOM](criterion-index-phone.json) | Cloudflare security verification; actual index not visible. |
| https://www.criterion.com/current/top-10-lists/1022-julie-klausner-s-top-10 | [PNG](criterion-contributor-desktop.png), [DOM](criterion-contributor-desktop.json) | [PNG](criterion-contributor-phone.png), [DOM](criterion-contributor-phone.json) | Cloudflare security verification; actual contributor list not visible. |
| https://letterboxd.com/films/popular/ | [PNG](letterboxd-popular-desktop.png), [DOM](letterboxd-popular-desktop.json) | [PNG](letterboxd-popular-phone.png), [DOM](letterboxd-popular-phone.json) | Human verification modal obscures and blurs the browsing shell. No populated film grid or collection interaction was observable. |

No challenge was bypassed. DOM exports contain hidden interface markup and are not proof those controls were visible or operable.

## Text-only evidence

The web text extractor accessed the requested public URLs. The following observations concern information structure only; they do not establish visual layout, colors, typography, breakpoints, hover behavior, or interactive outcomes.

- [Criterion index](https://www.criterion.com/current/top-10-lists): contributor list links, short editorial descriptions, dates, a result count, and a Load More button.
- [Julie Klausner’s list](https://www.criterion.com/current/top-10-lists/1022-julie-klausner-s-top-10): contributor biography and date precede numbered film selections. Entries identify director and title and include personal commentary; many have Quick Shop links. Related contributor lists follow.
- [Letterboxd browser](https://letterboxd.com/films/popular/): Small/Large links; visibility, sort, service, genre, and decade controls appear in extracted markup. Extracted account filters include watched, liked, rated, and watchlist states. Successful filter application, poster interaction, and collection mutations were not observed.

## Screenshots needed from the user

1. Criterion index at desktop and phone widths, showing the heading and first few contributor entries.
2. Julie Klausner’s individual list at desktop and phone widths, showing contributor introduction and at least the first film entry/commentary.
3. Letterboxd popular browser at desktop and phone widths, showing a populated grid and its toolbar.
4. Letterboxd with one sort/filter menu open and with a poster’s hover/focus/tap collection controls exposed. If signed in, also show saved versus unsaved/watchlist state.

User-provided screenshots should be stored here with viewport dimensions, source URL, capture date, and state. Keep this access record when adding successful evidence.
