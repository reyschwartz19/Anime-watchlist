# Catalog, Groq, and preview handoff

Verified on 2026-11-05 on `feat/manga-shelf`. The approved Manga Shelf layout, colors, fonts, and existing design evidence are preserved. The original untracked `Manga-shelf-design/` folder and private `.env.local` are untouched. The owner will deploy to Vercel and complete live sign-in.

## Implemented gaps

- Shared server-only Jikan v4 client for Search, Details, onboarding favorites, saves, and discovery: validated responses, normalized public cache keys, pagination, coalescing, metadata reuse, bounded requests, and distinct missing/empty/timeout/rate-limit states.
- Search supports debouncing, stale-response rejection, alternate titles, year/format, and inline saves into all four statuses while retaining query and scroll. Repeated saves update the same owner/MAL-ID entry. Details includes the canonical MAL link and preserves search page context.
- Groq `openai/gpt-oss-120b` uses the explicit Groq chat-completions endpoint, non-streaming strict JSON Schema output, validated candidate ID/reason pairs, bounded model input/output, and no fallback or automatic inference retry. Search and library work without a model key.
- Candidates combine favorite/liked-title recommendations and relations, genres, popularity, and seasonal sources. Stable IDs stay distinct across seasons. Known franchise relations limit pool concentration. Completed prequels and hard constraints are checked before ranking and again before cached/fresh results return. Finished/max-13 requests require verified completion and a known count within the limit.
- Feedback remains distinct from library status and impressions. Save, Already watched, optional taste, session passes, permanent/strong dismissals, Profile restore, and Undo are covered. Undo refuses newer edits, including a different rating within the same timestamp millisecond. Retried operations bind their original action and reason.
- Shared atomic Neon budgets cover providers, user operations, auth requests, and direct managed-session verification. Durable generation claims prevent ambiguous request replay. Candidate-pool events, displayed ranks, model/prompt metadata, and feedback reuse the existing recommendation schema.
- Auth origin/callback guards, body limits, sanitized errors, silent provider logs, session read limits, and security headers were added. No dependency upgrade was indicated by the zero-vulnerability audit. The application architecture and standalone migration utility remain intact; no Firebase configuration or import is needed for normal use.

See [discovery implementation](DISCOVERY.md) and [security and limits](SECURITY_LIMITS.md) for decisions, official API references, retention, and scope limitations.

## Preview database

The owner explicitly confirmed `.env.local` as the isolated preview target. Read-only checks verified that pooled/direct URLs identify the same Neon database and require TLS. Existing initial and discovery migrations were already applied.

Reviewed and applied `202611050002_shared_rate_limits`: it creates only `RateLimitState` and its expiry index. All three migrations now show completed, with no pending or failed migration. No reset, personal import, Firebase access, account change, or library write ran against the preview database.

A live check on this Neon preview admitted exactly three of ten simultaneous attempts under a temporary three-request budget, denied the other seven, and blocked replay of a retained generation request ID. Its temporary QA budget rows were removed. Normal provider budget rows and existing user data were preserved.

## Actual configured limits

The local environment has no quota overrides; these defaults are effective:

| Scope | Limit |
| --- | --- |
| Jikan, shared across app consumers | 3 requests/second, 60/minute, 2 concurrent |
| Groq, shared across this app/database | 30 requests/minute, 1,000/day, 8,000 tokens/minute, 200,000/day, 1 concurrent |
| Generation per user | 5 requests/minute including cached retries; 1 concurrent generation |
| Library/profile/feedback mutations per user | 60/minute |
| Search/favorites/catalog access per user | 60/minute |
| Auth per trusted client IP | 10 writes/minute; 120 reads/session verifications per minute |
| Inference | 6,400-byte request cap; 1,200 completion tokens; 45-second timeout |
| Catalog | 12-second timeout; 2 MB response cap |
| Application/auth bodies | 64 KiB Server Actions; 16 KiB auth bodies |
| Recommendation route | `maxDuration=180`, confirmed in the production functions manifest |

Provider headers can further reduce budgets and establish shared Retry-After cooldowns. Token reservations deliberately overestimate usage. Other applications or isolated databases using the same Groq organization are outside this ledger; coordinate or partition their quotas before production.

## Verification completed

| Check | Result |
| --- | --- |
| `npm test` | 118 tests across 23 files passed |
| `npm run typecheck` | Passed |
| `ANIME_BUILD_DIR=.next-build npm run build` | Production compilation, typechecking, route generation passed |
| `npm audit --json` | Zero reported vulnerabilities, including development dependencies |
| Disposable real PostgreSQL limiter suite | 6 contention, generation-claim, header/token, scope, and cleanup checks passed |
| Live Neon preview | Paired URLs, migration status, atomic limits, replay protection, and QA cleanup passed |
| Live Groq smoke | One ranking request; structured output with a valid fixed candidate ID passed |
| Live Jikan smoke | Blocked: direct Node and curl connections timed out from this machine |
| Browser fixture journeys | 17 existing journeys and 5 new catalog checks passed |
| Local production HTTP | 7 signed-out/auth-boundary checks passed; no login or provider request |
| Client bundle scan | None of the checked private API, cookie-secret, or database values found |

Focused coverage includes repeated/concurrent manual saves, separate seasons, old watched titles beyond 250 recent entries, full-library exclusion, stale cached batches, saves/dismissals during model latency, Plan to Watch eligibility, strict completion/episode constraints, foreign/duplicate IDs and reason alignment, malformed output, provider 429s/timeouts, feedback attribution/Undo, and overlapping owner isolation.

Browser checks covered query/scroll retention, stale typing, dismissal persistence across reload, restore, optional taste, session passes, backlog mode, keyboard recovery, 390/1440 layouts, and equivalent 200% reflow. These use isolated in-memory data and do not certify live email, OAuth, catalog, or deployed database journeys. A transient unavailable-budget response during local production warmup failed closed; the subsequent boundary checks all passed.

New evidence lives in [verification/catalog-2026-11-05](verification/catalog-2026-11-05/). The earlier design evidence was not overwritten. Impeccable's detector returned no findings.

Repeat live provider checks safely:

```sh
node --import tsx scripts/smoke-jikan.ts
node --env-file=.env.local --import tsx scripts/smoke-groq.ts
```

The Groq smoke uses fixed public candidate metadata and makes one call without retries or database writes. Both smokes print sanitized outcomes. Node reads local environment values without shell evaluation.

## Owner's Vercel preview steps

1. Use the existing Vercel project, repository root, Next.js preset, Node 24, `npm ci`, and `npm run build`. Do not set the local `ANIME_BUILD_DIR` override on Vercel. No deployment or preview URL was created in this task, at the owner's request.
2. Scope `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `APP_URL`, `GROQ_API_KEY`, and `GROQ_MODEL=openai/gpt-oss-120b` to Preview and this feature branch. Match the auth verification-method setting. Keep `ANIME_PREVIEW_FIXTURES` unset and `MIGRATION_ENABLED=false`. Use the confirmed preview database, never production values.
3. Set `APP_URL` to the actual stable HTTPS preview origin and allowlist that exact origin in the preview Neon Auth branch. Confirm the Google provider callback uses the Neon-managed callback registration. Redeploy after environment changes. These remote settings and live callbacks have not been verified here.
4. Create the fresh account and sign in. Search for a title, mark it Completed, generate new picks, and verify exclusion. Permanently dismiss a pick, reload, verify it remains hidden, then restore it in Profile. Generate in Pick from my list and verify every result belongs to Plan to Watch. Repeat account isolation with a second account.
5. Run the Jikan smoke from a network that can reach it, or verify real search/details in the deployed preview. The successful Groq fixed-input check does not establish catalog reachability.

The existing approved artwork policy is unchanged: actual poster URLs render only when `CATALOG_ARTWORK_CLEARED=1`; otherwise title placeholders cover missing/unapproved art. Review the existing [asset register](design/assets.md) before changing that setting. Retrieval/hydration is intentionally bounded and may return fewer matches; candidate events record the verified pool, which may be further reduced for the model's byte budget. Displayed IDs and reasons are recorded exactly.

## Before production

Finish the live preview journey above; review the feature commit; configure separate production database/Auth/provider values and exact origins; review and deploy only missing application migrations to that intended database; rerun tests/audit/provider checks; and verify the production auth callback configuration. Confirm organization-wide Groq quotas account for any other callers. Merge and production promotion remain exclusively for the owner's review. Manual title entry is the chosen workflow; the standalone import utility is not part of these steps.
