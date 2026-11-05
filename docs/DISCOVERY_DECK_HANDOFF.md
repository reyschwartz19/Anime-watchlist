# Discovery deck and viewing notes — 2026-11-05

Discover now opens with personalized **Watch next** and up to five illustrated picks. Opening the deck is local. Swipe left to pass for the session or right to save; explicit buttons and Undo provide the same actions. The next card advances while the previous write completes. Failed writes return their card. Permanent dismissals remain separate and reversible in Profile.

## Viewing notes and recommendations

Watching, Completed and Dropped detail pages have private notes: liked aspects, disliked aspects, animation/art style, a general comment, and optional rating. My List searches titles and these notes. Quick-rating changes preserve existing comments; clearing a rating keeps notes. Undo cannot erase a newer note, including an edit within the same timestamp millisecond.

Retrieval combines genre/popularity sources with recommendation-graph neighbors of liked, favorite or completed titles. Local inverse-document-frequency weighting, cosine similarity and maximal marginal relevance rank a varied pool before expensive hydration. See the [original MMR paper](https://www.cs.cmu.edu/afs/cs/Web/People/jgc/publication/MMR_DiversityBased_Reranking_SIGIR_1998.pdf). Explicit notes outweigh the weak completion signal; Dropped is never automatically a dislike. Whole-library exclusions, permanent dismissals, constraints and known prequel prerequisites are checked outside the model.

Groq `openai/gpt-oss-120b` compares the bounded verified metadata, recent explicit notes, mood, favorites and status-balanced history. The prompt includes episodes, studios, source and synopses, distinguishes positive and negative observations, and prohibits inventing style from a studio name. This is a lexical/content and catalog-neighbor hybrid with semantic model ranking; no image-vision analysis, learned collaborative model or guaranteed taste accuracy is claimed. More detailed viewing notes improve the available evidence.

Strict structured output requests five distinct candidate choices, or all available candidates when fewer than five exist. The server validates IDs/reasons, deduplicates and rechecks current eligibility. A live fixed-input smoke returned five validated IDs in one call.

## Retry and latency behavior

| Operation | Current behavior |
| --- | --- |
| Pass/save/open deck | No model call; cards advance locally |
| Watch next reload | Owner/taste/history/six-hour key reuses the saved batch; fresh eligibility still applies |
| New uncached deck | Default 12/minute/user; actual shared provider budgets still apply |
| Cached deck read | Separate 60/minute/user read allowance |
| Existing generation busy | Three-second retry hint, released on completion |
| Provider concurrency busy | One-second retry hint |
| Crash recovery | Generation lease remains 240s, beyond the 180s route ceiling; not presented as an ordinary cooldown |
| Model call | One attempt, 25-second timeout, no automatic ambiguous replay |
| Catalog hydration | Two workers, metadata reuse, stop at ten eligible; scheduling stops after 25s, or 12s once five exist |

The previous byte-as-token reservation was overly restrictive. Pinned `js-tiktoken` now counts the full serialized request using o200k base, with framing allowance and completion cap. Returned usage settles unused reserved tokens; uncertain inference and authoritative provider-header ceilings remain charged. Actual quota exhaustion still returns provider timing. This does not promise a measured live end-to-end latency: cold catalog responses can still be slow. Details are in [discovery](DISCOVERY.md) and [security limits](SECURITY_LIMITS.md).

## Artwork and layout

The owner explicitly required real images, superseding the obsolete `CATALOG_ARTWORK_CLEARED` gate. Valid catalog image URLs now render directly. Search reserves a fixed cover column; fallback text cannot occupy the title column. Watch next uses equal 2:3 frames with separately wrapping captions. The desktop deck contains its cover beside naturally expanding text; phone stacks cover and copy. Long titles, a missing cover, and a 600-character recommendation reason were inspected without text/action overlap. The paper/ink/red palette, Anton/Source Sans typography, ink rules and navigation remain intact. Motion respects reduced-motion preferences.

## Preview database and verification

The owner confirmed `.env.local` points to the preview database. Applied only `202611050003_watching_notes`, adding three nullable Feedback text columns. All four migrations completed. No reset, import, account edit or personal-library write was performed. Browser writes used isolated in-memory fixtures.

| Check | Result |
| --- | --- |
| Unit/regression suite | 132 passing tests across 25 files |
| TypeScript | Standalone typecheck and final production build passed |
| PostgreSQL budget integration | Six checks passed, including concurrency, replay and token settlement |
| Live Groq strict-schema smoke | Five validated fixed candidate IDs; one request, no user data or DB writes |
| Browser journey | 11/11 scenarios; both swipe directions, Undo, no regeneration on passing, notes persistence/search/isolation, no uncaught exceptions |
| Responsive geometry | 1363×647, 390×844 and 720×450 search rows; desktop/phone Discover and notes; long-copy deck |
| Visual review | Independent reviewer disposition **ship**, no material fixes; documenter confirmed incumbent tokens preserved |
| Design detector | One pass, no findings |

Browser evidence uses synthetic authenticated account, catalog and ranker fixtures with real public cover JPEG bytes injected into fixture image requests. It verifies rendered art and interaction/layout behavior, not live login or personal recommendation quality. Landscape search recapture uses fixture art plus a forced fallback. The full-page phone notes image includes Chrome's fixed-navigation capture placement; the actual scrolling viewport was separately inspected.

Screenshots and assertions: [evidence folder](verification/discovery-deck-2026-11-05/), [checks](verification/discovery-deck-2026-11-05/checks.json), [cover sources](verification/discovery-deck-2026-11-05/cover-sources.json), and [visual review](verification/discovery-deck-2026-11-05/review.md).

For repeatable isolated checks, start `ANIME_PREVIEW_FIXTURES=1 MIGRATION_ENABLED=false APP_URL=http://localhost:3071 npm run dev -- --port 3071`, then run `node scripts/browser/deck-journey.mjs`. Optional `ANIME_QA_COVERS` points to a JSON title map of `{url,type,body}` with base64 image bytes; absent that input, the script uses original typography fixture art. The script refuses writes unless `/api/me` identifies the isolated fixture account.

Restart the regular local dev server after updating/generated Prisma changes. Deployment and live sign-in remain with the owner as requested. Existing Impeccable PRODUCT schema/sidecar drift is unchanged; `init`/`document` can refresh those artifacts separately.
