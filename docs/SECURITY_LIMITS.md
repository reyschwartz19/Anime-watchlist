# Shared budgets and security verification

The normal app uses the owner-selected Jikan Edge catalog service, Groq, Neon PostgreSQL and Neon Managed Better Auth. Jikan's original public API was retired on October 1, 2026; see [the maintainer notice](https://github.com/jikan-me/jikan-rest/issues/613). Existing `JIKAN_*` budgets now cover Edge traffic. Firebase credentials are unnecessary for startup, build, Search, manual entry or discovery. The standalone migration utilities remain separate and disabled by default. No paid limiter service or fallback model provider is used.

## Configured budgets

All windows below are rolling windows enforced atomically in the application database, across Vercel instances using that database. Environment variables can lower budgets; Groq variables can be adjusted to the exact account limits. Jikan configuration cannot exceed its documented ceilings.

| Traffic | Default budget | Configuration |
| --- | --- | --- |
| All Jikan consumers together | 3 requests/second; 60/minute; 2 simultaneous requests | `JIKAN_RPS`, `JIKAN_RPM`, `JIKAN_CONCURRENCY` |
| Groq ranking | 30 requests/minute; 1,000/day; 8,000 tokens/minute; 200,000 tokens/day; 1 simultaneous request | `GROQ_RPM`, `GROQ_RPD`, `GROQ_TPM`, `GROQ_TPD`, `GROQ_CONCURRENCY` |
| Generation per verified internal user | 5/minute; 1 simultaneous generation | `USER_GENERATION_RPM`; concurrency fixed at 1 |
| Authenticated mutation per internal user | 60/minute shared by library, profile and feedback actions | `USER_MUTATION_RPM` |
| Catalog access per verified internal user | 60/minute shared by Search, favorites and uncached Details | `USER_CATALOG_RPM` |
| Auth writes per client IP | 10/minute | `AUTH_WRITE_RPM` |
| Auth reads/session verification per client IP | 120/minute | `AUTH_READ_RPM` |

[Jikan Edge's documentation](https://jikan.lucashdo.com/docs) specifies 30 requests/10 seconds and 60/minute; the existing 3/second ceiling is conservative within that budget. Groq's [rate-limit documentation](https://console.groq.com/docs/rate-limits) lists the free `openai/gpt-oss-120b` budgets above; exact organization limits can differ and should be checked in its console. Groq limits are organization-wide. A separate application, developer tool, or preview database using the same Groq organization can consume quota outside this database's counters. Use appropriately partitioned lower budgets or one coordinated budget store for such callers; do not assume isolated Neon branches share counters.

The auth IP key uses the client `x-forwarded-for` supplied by Vercel, following its [request-header contract](https://vercel.com/docs/headers/request-headers). Self-hosted requests use a conservative shared key because arbitrary forwarded headers are untrusted. Introducing another proxy requires reviewing its IP trust boundary. Keys hash IPs/internal user IDs; these hashes are pseudonymous rather than anonymous.

## Atomic enforcement, retention and failures

`RateLimitState` is the single additive application-owned table. A PostgreSQL advisory transaction lock serializes each scope's read, rolling-window decision, reservation and write. Reservations use the database clock. No database transaction remains open while waiting for catalog or model HTTP responses. Missing/unavailable limiter storage fails closed; it never switches to a process-local counter. Isolated development/test fixtures bypass live services and these database counters; production cannot enable that fixture path.

Provider concurrency leases expire after 20 seconds for Jikan and 60 seconds for Groq if a function crashes; ordinary completion releases them earlier. Generation leases last 240 seconds, exceeding the recommendation route's 180-second runtime ceiling. A separate request-ID claim lasts 24 hours. Catalog failures before inference can release this claim; after an inference attempt it remains even on a timeout. A same-ID replay must use an existing saved batch or return a useful generate-fresh message. This prevents ambiguous automatic inference replay within the retention window. Successful persisted batches keep their original request IDs independently of the limiter retention.

Counter rows expire after inactivity, normally 24 hours. An opportunistic sweep deletes up to 100 expired rows per process per minute, outside reservation transactions. This local maintenance throttle does not enforce budgets. Expiry and window pruning bound active counter contents; the sweep requires no background worker or paid dependency. Rows contain request/token counts, timestamps, hashed scope keys and random lease IDs, without prompts, emails, auth tokens or catalog metadata.

Groq reserves a conservative UTF-8 byte bound for its entire JSON request, plus 256 tokens for framing and the maximum 1,200 completion tokens. The serialized request is capped at 6,400 bytes, keeping the default reservation below 8,000 tokens. This deliberately overestimates ordinary input tokenization, so usable throughput can be lower than the nominal quota. Ambiguous inference requests receive no token refund. Change this only with model-specific tokenizer verification.

Groq response `x-ratelimit-remaining-requests`/`reset-requests` refer to requests per **day**; their token equivalents refer to tokens per **minute**. These remaining/reset values also constrain subsequent reservations. A provider `429` records a shared `Retry-After` cooldown (seconds or an HTTP date); missing timing uses a conservative 60 seconds. Provider and inbound budget failures include safe retry timing. The ranker makes one non-streaming inference attempt and does not automatically retry timeouts or switch providers.

All catalog consumers use the same Jikan transport and budget. Only public, validated catalog responses enter the five-minute shared cache. Normalized request keys and a bounded in-process in-flight map coalesce repeated local requests. Private library state, sessions, prompts and ranked batches never enter that public cache. Jikan calls time out after 12 seconds and cap response bodies at 2 MB. Groq calls time out after 45 seconds and cap bodies at 64 KB. Both use fixed HTTPS destinations with redirects rejected.

## Security changes and reviewed boundaries

- Every private action obtains a remotely verified Neon session and derives the internal owner from it. The signed cookie snapshot alone cannot authorize access. Ownership filters cover overlapping anime IDs, recommendation batches, feedback and Undo; cached picks recheck current library and dismissal state.
- Auth writes require the exact configured `APP_URL` origin and JSON bodies. Callback/recovery destinations stay on that origin. Streaming bodies have a 16 KiB cap and five-second read deadline; auth paths and URLs are bounded. Auth responses are private/no-store, upstream error messages are sanitized while recovery codes survive, and Neon SDK console logging is disabled.
- Next Server Action bodies are capped at 64 KiB. Application schemas additionally bound MAL IDs, pagination, requests, tastes and feedback. Prisma parameterization covers dynamic SQL, including advisory-lock keys. Input never chooses provider destinations.
- Security response headers prevent framing, MIME sniffing, plugins and base-URL changes, and disable unnecessary camera/microphone/location access. The minimal CSP deliberately avoids an unverified script policy that would break Next hydration.
- Server-only modules contain provider keys. `.env.local` remains ignored; `.env.example` contains placeholders and non-secret defaults. Model input uses an explicit field whitelist, omitting emails, authentication IDs, tokens and unrelated profile data. User text and synopses are declared untrusted model data. Model output is validated against supplied candidate IDs and keeps each reason attached to its ID.
- Concurrent feedback transactions use serializable isolation, owner-scoped operation IDs and before-images. Undo checks that no newer library/feedback edit has replaced the outcome. Repeated manual saves upsert the same owner/MAL-ID entry.

## Checks

`npm test` includes focused pure rolling-window/header tests, streaming auth-body and callback validation tests, auth-route boundary tests, and application ownership tests. Fixture success does not certify live auth, Jikan or Groq.

For real PostgreSQL contention without remote credentials:

```sh
node --import tsx scripts/run-rate-limit-postgres.ts
```

The runner creates a fresh loopback-only PostgreSQL cluster, applies only the limiter table SQL, exercises simultaneous reservations and request claims, then stops and deletes its cluster. It never loads `.env.local`, contacts providers, or writes to Neon. It verifies exactly three winners from ten concurrent attempts at a three-request budget, separate users, generation concurrency/ambiguous-request claims, provider concurrency, token/header ceilings and hashed scope storage.

`npm audit --omit=dev --json` returned zero vulnerabilities during this change. Build/typecheck, complete dependency audit and live preview/provider results belong in the task handoff; rerun before production promotion. No finding here authorizes a production migration, merge or deployment.
