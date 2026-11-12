# Catalog and discovery

The active server-only ranker is Groq chat completions at `https://api.groq.com/openai/v1/chat/completions`. Configure private `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b`; `.env.example` contains placeholders. No OpenAI API key, provider fallback, or Firebase configuration is required for normal app startup. Search and library management do not require a Groq key. Missing Groq configuration produces an actionable discovery-unavailable state.

The integration uses non-streaming `response_format.type=json_schema`, `json_schema.strict=true`, closed objects, required fields and an enum of supplied candidate IDs. It follows [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and the [chat-completions reference](https://console.groq.com/docs/api-reference). The schema requests five picks, or every available candidate when fewer exist; the server deduplicates and rechecks eligibility. Completion is capped at 1,200 tokens with low reasoning effort. Request JSON is capped at 14,000 UTF-8 bytes and a 7,600-token reservation: o200k base counting of the whole serialized request, plus 256 framing tokens and the full completion cap. Returned usage settles the reservation downward; ambiguous calls retain their reservation. There is no automatic inference replay or paid fallback.

## Shared catalog client

**2026-11-05 catalog fix:** the original [Jikan public service was discontinued on October 1, 2026](https://github.com/jikan-me/jikan-rest/issues/613). The owner selected the maintainer-listed [Jikan Edge](https://jikan.lucashdo.com/docs) replacement. Active requests now use `https://jikan.lucashdo.com/v1`, not the retired public host. Live search and full-details checks now pass; the earlier timeout below was the retired host, not evidence of a general internet failure.

The adapter translates camelCase fields, flat relations, images, recommendations, and `meta.pagination` into the existing MAL/Jikan application model. It removes unsupported `limit`/`sfw` query parameters, keeps the provider's full page rather than dropping titles, and excludes explicitly adult-rated search rows locally. Full metadata verification excludes explicit adult genres from discovery. Search summaries lack genres/completion status, so discovery hydrates them before applying those hard constraints. Existing IDs and database records need no migration. No fallback provider or new API key is involved.

After this correction, 124 tests across 24 files and the production build pass. Live checks pass for search, a second search page, full details/prerequisites, genre/score/completion filters, popular titles, the full seasonal list, and recommendation IDs. Edge's seasonal response contains 180 entries in this check; the client accepts a bounded full-season response rather than rejecting it as an oversized search page. Restart the local dev server after updating. Search uses a Next Server Action, so HTTP 200 describes successful delivery of its structured result; inspect `ok` and `message` to distinguish catalog failures from successful results.

`src/lib/jikan.ts` centralizes all application requests for Search, Details, onboarding favorites, manual saves and discovery. Jikan Edge documents 30 requests/10 seconds and 60/minute. The app retains its conservative 3/second and 60/minute shared Neon budget, process pacing, bounded concurrency and 12-second HTTP timeouts. Limits can be reduced through the existing `JIKAN_RPS`, `JIKAN_RPM`, and `JIKAN_CONCURRENCY` settings.

Requests use a fixed HTTPS destination with redirects disabled. Search keys normalize whitespace, case and parameter order. Duplicate same-process requests coalesce; validated public envelopes use Next's shared cache for five minutes. Public catalog cache entries contain no identity, library, taste or recommendation data. List metadata is reused for manual saves; `/full` hydration is reserved for full Details/prerequisite verification. Records, MAL IDs, pagination, relations and response sizes are bounded and validated. Null images, unknown episodes and empty search results remain valid states. Timeouts, malformed responses and 429s have distinct sanitized failures and Retry-After timing.

## Candidate selection and ranking

New mode excludes the entire active library across all four statuses, permanent dismissals and session passes. List mode begins only with Plan to Watch entries. These checks use complete database state independently of the small taste payload sent to Groq.

Candidate retrieval combines up to two relevant genre sources, popularity, and recommendation-graph neighbors from up to two liked, favorite or completed MAL IDs. A two-worker queue bounds parallel traffic. Sources retain supplied metadata and interleave by stable ID; full verified metadata cannot be overwritten by a sparse summary. Locally ranked candidates are hydrated in pairs, stopping at ten eligible titles or the scheduling deadline (25 seconds, or 12 seconds once five exist). An already scheduled request can finish after that deadline. Known franchise relations cap family concentration; every known anime prequel requires Completed status. Manga adaptations are not prerequisites. No title-string heuristic merges different seasons.

Required/excluded genres and formats, maximum episode counts, standalone-only and finished-only constraints are applied before ranking. Familiar explicit request wording is parsed into those same deterministic constraints. For `finished series, maximum 13 episodes`, both `status=Finished Airing` and a known count of 1–13 are required. Unknown facts cannot satisfy a hard constraint. The app returns one to five eligible picks, or a clear no-match state.

Local ranking weights request terms, explicit positive/negative notes, genres and studios with inverse-document frequency and cosine similarity. Maximal marginal relevance balances taste similarity and variety (0.78/0.22), following the [MMR formulation](https://www.cs.cmu.edu/afs/cs/Web/People/jgc/publication/MMR_DiversityBased_Reranking_SIGIR_1998.pdf). Completion is a weak signal; Dropped is not a negative rating. This lexical stage does not establish animation style from studio names.

Groq receives up to ten verified candidates from the action (client cap twelve), bounded synopses, episodes, studios/source, current request, favorites, up to twelve recent explicit taste records, and a status-balanced library summary. Notes distinguish liked aspects, disliked aspects, animation/art style and general comments. The model compares these semantically and is told not to invent visual facts. Payloads trim to both byte and token budgets while keeping at least five candidates when available. Only whitelisted fields are serialized; no emails, auth identifiers, tokens or unrelated profile data. Metadata and user text are untrusted data. Completion, dropping, ratings and dismissals remain separate; a reasonless dismissal conveys no genre preference.

Server validation rejects malformed rankings, foreign IDs, duplicate IDs, incomplete completions and empty valid rankings while retaining each accepted ID's own reason. Eligibility is rechecked after model latency and immediately before returning fresh or cached results. Recommendation history records the verified candidate pool (which can be further reduced for inference), model ID, prompt version, returned displayed IDs/order and attributable feedback. User-owned batch caches are scoped to the verified internal user ID; no private ranking result enters a shared public cache.

## Feedback and budgets

Save writes Plan to Watch; Already watched writes Completed. Optional explicit taste remains separate from status. Not tonight is a session pass; Not interested and Strongly not interested persist exclusions until restored. Undo restores the relevant prior state and refuses to overwrite a newer edit. Existing batch retries respect subsequent saves/dismissals. Profile manages hidden titles.

Discover automatically requests Watch next using an owner/taste/history/six-hour key. Reloads reuse its saved batch; eligibility is still checked against current state. Local swipes and opening its deck do not call the model. Equivalent concurrent requests coalesce. Twelve uncached generations/minute per user are allowed by default; cached reads use the separate 60/minute read allowance. Provider token quotas still apply. Bounded retrieval, metadata reuse and a 25-second model timeout limit waiting; these are not a guarantee of live catalog latency.

Watching, Completed and Dropped detail pages offer private viewing notes. Writes verify the active owned library entry; Plan to Watch entries cannot acquire watched notes. Notes persist independently of dismissal state and can be queried through My List search. A taste/history change creates a new Watch next key; a simple save or temporary pass does not.

App requests reserve shared atomic PostgreSQL budgets before outbound calls. Default [Groq free-plan limits](https://console.groq.com/docs/rate-limits) for `openai/gpt-oss-120b` are 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD; configure `GROQ_RPM`, `GROQ_RPD`, `GROQ_TPM`, `GROQ_TPD` and `GROQ_CONCURRENCY` to match the account. Provider headers further constrain remaining request/day and token/minute budgets, and 429 Retry-After creates a shared cooldown. Reservations do not refund uncertain inference, and unavailable budget storage fails closed. Generation/user leases and request-ID claims prevent concurrent duplicate inference across instances. No new paid dependency is used.

## Verification

Run:

```sh
npm test
npm run typecheck
npm run build
node --import tsx scripts/smoke-jikan.ts
node --env-file=.env.local --import tsx scripts/smoke-groq.ts
```

The Jikan smoke performs public search and full-details reads. The Groq smoke uses fixed public candidate IDs and makes one live ranking request, validates its strict structured response, and prints a sanitized result. Both are independent of auth/database and make no user-data writes; application traffic additionally uses the shared budget. Node's env-file loader does not evaluate shell contents. Keep `.env.local` ignored and disable `ANIME_PREVIEW_FIXTURES` for live checks.

On 2026-11-05 the live Groq smoke returned five validated fixed candidate IDs in one strict-schema request; live Edge catalog checks also passed after replacing the retired host. Unit coverage includes cache/coalescing, constraints/exclusions, notes ownership, taste ranking and token settlement. Eleven browser scenarios pass with isolated account/catalog/ranking fixtures and real public cover bytes. See [the current evidence and limits](DISCOVERY_DECK_HANDOFF.md). Fixtures do not certify live sign-in, personal recommendation quality or a deployed preview.
