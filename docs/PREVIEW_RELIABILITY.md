# Preview authentication and routing handoff

Scope: `feat/manga-shelf`, reviewed 2026-11-12. Canonical Preview origin:

`https://anime-watchlist-git-feat-manga-shelf-reyschwartz19s-projects.vercel.app`

## Confirmed causes and current limits

| Symptom | Evidence and cause | Resolution / remaining action |
| --- | --- | --- |
| Prisma P1000 | Fresh Vercel Preview logs on `/library` show P1000 while starting the shared limiter transaction. Read-only checks independently reached Neon and rejected both locally configured pooled/direct connections with database authentication failures. | Credentials still require operator correction. Structural URL checks pass locally; that cannot prove branch ownership or password validity. No migrations could be read and none were applied. |
| Google 403 on deployment URL | Auth writes compare Origin with APP_URL; the deployment hostname differs from the stable alias. Confirmed by route tests. Neon also independently validates trusted origins. | Only the exact platform-provided VERCEL_URL redirects browser pages to APP_URL, only in Preview. API requests on another host fail with CANONICAL_ORIGIN_REQUIRED. No wildcard trust is added. Actual provider settings still need Console/browser verification. |
| Google 503 on stable URL | All auth proxy requests reserve a PostgreSQL budget before contacting Neon. The confirmed P1000 can therefore stop OAuth initiation. | Keep failing closed. AUTH_RATE_LIMIT_UNAVAILABLE identifies the limiter outage; sanitized logs distinguish DATABASE_AUTHENTICATION_FAILED, DATABASE_SCHEMA_UNAVAILABLE and DATABASE_UNAVAILABLE. Provider 5xx has its own AUTH_PROVIDER_UNAVAILABLE code. |
| `/library` load failure | Server session verification itself requires the database limiter, before application profile resolution. A service 403 was also incorrectly interpreted as a missing session. | Missing/expired sessions redirect to sign-in. Upstream 403 and service failures remain recoverable errors. `/api/me` distinguishes account verification, profile outages and throttling. Private ownership verification remains authoritative. |
| Root always opens Library | LegacyHashBridge unconditionally replaced `/` with `/library`. | Root computes its fallback from the server session/profile: sign-in, verification, onboarding, or Discover. The browser performs one handoff so supported hash links can take precedence. Only public handoff content renders at root. A Continue link works without JavaScript. |
| Retry does not refresh failed server content | Installed Next.js 16.4.5 docs say reset clears boundary state; retry re-fetches server content. | Both error boundaries now use retry. Email sign-in profile recovery retries `/api/me` without resubmitting credentials. |

The existing stable alias resolves to Preview deployment `dpl_B1s4ED9X1VTK8TKcngC1rnbSCN7w`, commit `7133100`, when inspected. The changes in this commit have **not** been deployed. A protected HTTP fetch returned Vercel `deployment_authentication_required`; no authenticated CLI/link was available locally. Runtime logs and environment metadata were accessible through the Vercel connector. No Production settings were changed.

## Correct Preview configuration

In Vercel → anime-watchlist → Settings → Environment Variables, select **Preview**, then the **feat/manga-shelf** branch override. Keep Production separate. Enter bare values in the dashboard, without literal quotes, newlines or leading/trailing whitespace. Dotenv file syntax may use quotes, which dotenv removes; dashboard values must not contain them.

| Variable | Required value / check |
| --- | --- |
| DATABASE_URL | Pooled connection copied from Neon Connect for **migration-preview**, the intended database and application role. Host contains `-pooler`. |
| DATABASE_URL_UNPOOLED | Direct connection from the same selection. Same endpoint apart from `-pooler`, same role, database and password. Only this URL is used by Prisma migration commands. |
| NEON_AUTH_BASE_URL | Managed Better Auth URL from **that same branch**, including its displayed `/database/auth` suffix. Do not substitute the database connection host. |
| NEON_AUTH_COOKIE_SECRET | Independent random secret, at least 32 characters, stable across this branch's deployments. Replacing it invalidates signed local cookie snapshots; use a separate Production value. |
| APP_URL | Exact canonical origin shown above. Do not use a single deployment's generated URL. |
| NEON_AUTH_EMAIL_VERIFICATION_METHOD | Explicit `otp` or `link`, matching the branch's actual email verification configuration. Returned Preview metadata lacked this key during this audit; the UI currently defaults to OTP when omitted. |
| GROQ_API_KEY | Preview-scoped Groq key for recommendations. Missing values must not prevent email/library use. |
| GROQ_MODEL | Model enabled for that Groq key, for example the repository's configured model. Verify availability in the provider account. |

Vercel metadata contained the other seven keys, with secret values hidden. Their Vercel values could not be compared with local secrets. Check both branch overrides and inherited Preview values, especially integration-provided database variables. Never copy Production credentials into Preview.

### Repair P1000 in Neon and Vercel

1. Open Neon Console, select the intended project and **migration-preview** branch. Confirm this is an isolated Preview branch before proceeding. Record the branch ID, endpoint, database and role outside Git.
2. In **Connect**, select that exact database and role. Copy both generated pooled and direct strings. Check the role exists and its password is current. If necessary, reset only the isolated Preview role's password; avoid resetting a role shared with Production.
3. Prefer the generated URL. If constructing one manually, percent-encode reserved password characters exactly once (`@`, `:`, `/`, `?`, `#`, `%`); do not encode an already encoded password again. Keep TLS enabled (`sslmode=require` or `verify-full`) and preserve supported parameters from Connect. Never use `rejectUnauthorized: false` or remove TLS to address P1000.
4. Replace both Vercel **Preview / feat/manga-shelf** URL values together. Do not edit Production or another branch. Check no stale branch override supersedes the replacement.
5. Copy the matching branch's Managed Better Auth endpoint, set the cookie secret, canonical APP_URL and explicit verification method. Do not migrate or modify the managed `neon_auth` schema.
6. For local checks, securely update ignored `.env.local` from the same Preview values. Do not overwrite an existing file with a blind environment pull. Set `MIGRATION_TARGET=preview` for the diagnostic script; this does not enable importing personal data.
7. Run `npm run preview:check`, then `npm run preview:check -- --connect`. The latter uses read-only transactions and checks both connections plus all repository migration records. It never prints database URLs, passwords, tokens, role names or emails. A valid pair is not proof of branch ownership: verify Console selection independently.
8. If credentials work but migrations are pending, review the checked-in SQL and confirm the target again. Run `npm run db:migrate` against the Preview direct URL, then repeat the read-only check. Do not use migrate reset, db push with data loss, or a Firebase import. The build generates the Prisma client but deliberately does **not** apply migrations.
9. Create a new **Preview** deployment from the reviewed feature commit, or redeploy the branch with the corrected variables. Environment changes do not repair an existing deployment's captured values. Confirm the stable alias points to the new Preview and the expected commit. Do not promote it to Production.

### Domains, provider callback and cookies

In Neon → migration-preview → Auth → Configuration → Domains, add exactly the canonical HTTPS origin above, without a trailing slash. This allowlist controls both request Origin and allowed redirects. No `*.vercel.app` entry is needed. See [Neon's trusted-domain guidance](https://neon.com/docs/auth/guides/configure-domains).

Enable Google for this branch. If using custom Google OAuth credentials, copy the **Neon-managed Google redirect URI shown in Neon Console** into Google's Authorized redirect URIs. The managed provider callback and the app's `/auth/callback` have different jobs; do not substitute one for the other. See [Neon's OAuth setup](https://neon.com/docs/auth/guides/setup-oauth).

The flow is: canonical sign-in page → same-origin `/api/auth/sign-in/social` → origin/callback guards → shared database budget → installed Neon SDK proxy → managed OAuth initiation → Google → Neon provider callback → canonical `/auth/callback` with verifier and host-bound challenge cookie → SDK verifier exchange and Set-Cookie propagation → uncached `/api/me` → remotely verified session → application profile → verification, onboarding or intended destination (Discover by default).

Only a request carrying a verifier invokes SDK exchange in proxy.ts; ordinary callback retries go directly to the profile resolver. Cookies stay host-bound, HttpOnly and SameSite=Lax through SDK handling. If an old in-flight flow returns on a deployment hostname, the app sends the browser to canonical sign-in and discards that verifier URL; start a fresh login there. It never transfers verifier tokens or challenge cookies across hosts. Unrelated Vercel hosts are not trusted, and Production never uses the Preview handoff.

## Regression and runtime verification

Changed files and purposes:

| Files | Purpose |
| --- | --- |
| `src/lib/environment.ts`, `src/lib/db.ts`, `src/lib/auth.ts` | Validate secret-free configuration errors and pooled/direct Preview pairing; keep the runtime Prisma adapter on DATABASE_URL. |
| `src/lib/operational-error.ts`, `src/lib/rate-limit.ts`, `src/lib/auth-session.ts`, `src/app/api/auth/[...path]/route.ts`, `src/app/api/me/route.ts` | Fail-closed rate limits, sanitized operational classification, callback validation and correct session/service distinction. |
| `src/proxy.ts`, `src/app/page.tsx`, `src/app/LegacyHashBridge.tsx`, `src/lib/current-user.ts`, `src/features/auth/destination.ts`, `src/features/auth/session-resolution.ts` | Canonical Preview handoff, server-derived root destination, safe return paths and legacy hash preservation. |
| `src/features/auth/AuthForm.tsx`, `src/features/auth/provider-errors.ts`, both `src/app/**/error.tsx` boundaries | Retry account lookup without reauthenticating, distinguish 503 from throttling, refresh failed server content and prevent pre-hydration GET submissions of credentials. |
| Auth/session/destination/provider/ownership tests, `src/lib/environment.test.ts`, browser auth journeys | Regression coverage for failure modes and routing boundaries, with provider mocks explicitly identified. |
| `scripts/check-preview.ts`, `package.json`, setup and browser documentation | Read-only operator diagnostics and repeatable Preview verification. |

Automated coverage includes real handler guards with mocked providers/budgets; real limiter code with mocked PostgreSQL failures; missing, expired and malformed sessions; upstream 403; profile 503; all root account states; exact Preview origin handoff and Production isolation; OAuth callbacks/cookies; safe deep links and duplicate callback parameters. Browser provider responses are synthetic and clearly labeled.

Run:

```sh
npm run typecheck
npm test
npm run build
```

Browser fixture setup remains in [scripts/browser/README.md](../scripts/browser/README.md). Run the build and fixture dev server sequentially: they regenerate shared Next type-entry files. A local Turbopack hot-refresh loop prevented stable browser testing in this environment; the supported `--webpack` development flag can isolate that tooling issue without changing the production build. To keep browser evidence separate from approved design artifacts:

```sh
ANIME_QA_OUTPUT_DIR=/tmp/anime-preview-browser node scripts/browser/auth-journeys.mjs
```

Execution results on 2026-11-12:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | All 29 test files passed. The existing CLI subprocess test needed execution outside the filesystem sandbox. |
| `ANIME_BUILD_DIR=.next-build npm run build` | Passed using the production Turbopack builder. Builds locally; does not deploy or migrate. |
| Browser auth journeys | All 13 passed using the isolated webpack fixture server. [Committed synthetic evidence](verification/preview-auth-2026-11-12.json). |
| `npm run preview:check` with existing local values | Correctly failed because the verification-method variable is missing; paired URL and auth configuration syntax otherwise passed. |
| Read-only connection/migration checks | Both connections reached Neon and failed database authentication. An explicit `otp` value was supplied only to allow this diagnostic run; the branch's actual verification mode remains unconfirmed. Migration records were therefore inaccessible. |
| Live OAuth/email | Not verified. Vercel protection blocked direct HTTP inspection; invalid database credentials block the app's auth limiter. |

Live Google authorization, mailbox delivery, email verification, migration status and successful database-backed authentication remain uncertified until the operator checklist below passes. A successful build alone proves none of these.

## Preview testing checklist

- [ ] Confirm corrected credentials connect through both pooled and direct URLs; all four repository migrations are applied to migration-preview.
- [ ] Confirm the stable branch alias serves the reviewed commit and Preview-scoped values. Confirm Vercel Deployment Protection access for your testing browser without disabling protection.
- [ ] In a fresh browser, `/` opens `/auth/sign-in`; `/library?status=watching` retains that safe return path. No private shelf content flashes.
- [ ] A generated URL hands off once to the stable alias before sign-in. An unrelated Vercel origin cannot POST auth requests or choose an external callback.
- [ ] Signup shows the registered email on verification. Paste a code, try invalid/expired codes, resend, and verify successfully. For link mode, follow the email link and confirm a real server session; if the provider does not create one, sign in once afterward.
- [ ] Start Google sign-in, cancel, then retry successfully. Inspect network status without sharing credentials, request bodies, query verifier tokens or cookies.
- [ ] New and incomplete users reach onboarding; returning onboarded users reach Discover. An explicit safe Library/Search/detail return destination is retained after authentication.
- [ ] Sign out, then reopen a protected route. A revoked/expired session must not authorize reads or writes.
- [ ] Double-submit email/Google/verification and confirm only one in-flight request. On an operational 503, input is retained and the message indicates unavailable sign-in protection rather than invalid credentials.
- [ ] On an isolated test outage, profile lookup stays recoverable with Retry; retrying email profile lookup does not re-submit credentials. Retry failed server content after recovery; no redirect loop or new-user fallback is acceptable.
- [ ] Confirm supported `/#/search?q=Frieren` links still resolve. Confirm another user's data remains inaccessible and Production configuration is unchanged.

To reproduce the remaining confirmed blocker before correcting credentials, run the read-only connectivity check with the current Preview values, or attempt Google initiation on the old stable deployment and inspect its Preview runtime logs. To reproduce live provider uncertainty after repair, complete the Google and email checklist with a dedicated test account; unit and fixture results cannot replace that exercise.
