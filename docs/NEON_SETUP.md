# Neon preview database and managed login setup

For the current branch's credential failure, canonical URL strategy, exact Vercel corrections and runtime test checklist, use [Preview reliability handoff](PREVIEW_RELIABILITY.md).

For normal use, create a fresh account, finish onboarding, and manually add titles from Search. Firebase and importer variables are optional and unrelated to normal startup/build. The owner handles Vercel deployment and live sign-in; current validation is recorded in [the catalog handoff](CATALOG_DISCOVERY_HANDOFF.md).

Prepared against current official documentation and registry metadata on **2026-11-04**. The app uses **Neon's Managed Better Auth**, via pinned `@neon/auth` **0.8.2**. It does not run a self-hosted Better Auth instance, migrate Firebase passwords, or use the older Stack Auth integration. Earlier examples importing `@neondatabase/auth` are not the package used here. Sources: [current Next.js quick start](https://neon.com/docs/auth/quick-start/nextjs-api-only), [SDK package source](https://github.com/neondatabase/neon-pkgs/blob/main/packages/auth/package.json).

These steps prepare an isolated preview. Do not point the preview or importer at a production database, change DNS, replace the Firebase deployment, or run an import against production.

## 1. Prepare an isolated Neon branch

1. In [Neon Console](https://console.neon.tech), create a project for this migration, or select an existing non-production project. Keep a record of project, branch, database and role names outside Git.
2. Create/select a dedicated **migration-preview** branch. Use an empty development parent for a new migration; do not copy unrelated users into the test environment.
3. From **Connect**, select that exact branch, database and role. Copy the pooled connection string for application requests and the non-pooled connection string for Prisma schema migrations. Keep TLS enabled. Both URLs must refer to the same branch and database.
4. On that branch, open **Better Auth** (also shown as **Auth → Configuration**, or **Settings → Better Auth**) and select **Enable Auth**. Copy the full **Auth URL**, including the database/auth suffix if displayed.

Managed auth owns its `neon_auth` schema. Prisma's application migration creates only the app's tables; do not introspect and rewrite the managed auth tables or run a schema reset. Branches have independent auth endpoints and state; keep the database URLs and Auth URL paired. [Official branch behavior](https://neon.com/docs/auth/branching-authentication), [Prisma and Neon setup](https://neon.com/docs/guides/prisma).

## 2. Configure email and trusted origins

For the preview branch, enable **Sign-up with Email**. Enable **Verify at Sign-up** and choose verification **codes** for the simplest test setup. Shared development email supports verification codes; verification links require custom SMTP. The login screen includes verification-code entry and resend. Reset emails are supported as well. [Email verification configuration](https://neon.com/docs/auth/guides/email-verification), [email-provider requirements](https://neon.com/docs/auth/production-checklist#email-provider).

Under **Auth → Configuration → Domains**, add the exact preview app origin with protocol and without a trailing slash, for example `https://your-preview.example.com`. The preview's `APP_URL` must match. Localhost ports are allowed by the development **Allow Localhost** setting; keep that enabled only on development branches. Prefer a stable preview alias or narrowly scoped trusted patterns under your control, rather than allowing every hosted preview on a shared domain. [Trusted-domain setup](https://neon.com/docs/auth/guides/configure-domains).

Google sign-in is available through the managed service's development configuration. To test your own Google credentials, use the authorization callback URL shown by the branch's provider dialog. That URL is on the Neon auth service, **not** the app's `/api/auth/callback` route. Each tested branch needs its own provider redirect registration. No Google credentials belong in this repository or client bundle. [OAuth setup](https://neon.com/docs/auth/guides/setup-oauth).

## 3. Set local and Preview environment variables

Use `.env.local` locally. For a hosted preview, set these in its **Preview** environment, scoped to the selected preview branch/deployment. Do not copy Production values by default.

```dotenv
# Application requests: pooled URL for migration-preview
DATABASE_URL=postgresql://ROLE:PASSWORD@PREVIEW-ENDPOINT-pooler.neon.tech/neondb?sslmode=require
# Schema migrations: direct URL for the SAME preview database
DATABASE_URL_UNPOOLED=postgresql://ROLE:PASSWORD@PREVIEW-ENDPOINT.neon.tech/neondb?sslmode=require

# Exact origin of THIS deployment; localhost locally, HTTPS origin on hosted preview
APP_URL=http://localhost:3000
NEON_AUTH_BASE_URL=https://PREVIEW-AUTH-ENDPOINT.neonauth.REGION.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=GENERATE_A_RANDOM_VALUE_OF_AT_LEAST_32_CHARACTERS
```

Generate the cookie secret locally with:

```sh
openssl rand -base64 32
```

Store the generated value in the environment only. Keep it stable for a deployment; rotating it invalidates that deployment's signed session cache. Use different secrets for independent environments and leave cookie domain unset, so preview cookies stay host-scoped. These variables are all server-only; none uses `NEXT_PUBLIC_`. The browser calls the app's same-origin `/api/auth` SDK proxy. [Server SDK configuration](https://neon.com/docs/auth/reference/nextjs-server).

Set the importer/receipt variables separately according to the migration runbook. An auth cookie secret is not an importer credential. Firebase service-account credentials are needed only for the explicit read-only export, outside the web app and outside Git.

### If hosting the preview on Vercel

1. Use the repository root and **Next.js** framework preset, Node.js 24, install command `npm ci`, build command `npm run build`, and the default Next.js output settings. Do not select `legacy/firebase` or a Vite/static output directory.
2. In Project → Settings → Environment Variables, select **Preview** and scope the database/Auth keys to the intended migration branch. Add `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, and `APP_URL`. Add `MIGRATION_ENABLED=true`, `MIGRATION_TARGET=preview`, and the separate `MIGRATION_IDENTITY_SECRET` only for the migration preview. Add the server-only `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b` to test live recommendations. Do not configure another inference provider or fallback. Keep `MIGRATION_ENABLED=false` for ordinary use. Shared provider limits require the additive RateLimitState migration; see [configured limits](SECURITY_LIMITS.md). Match `NEON_AUTH_EMAIL_VERIFICATION_METHOD=otp` (default) or `link` to the branch configuration. Never add the Firebase Admin credential here.
3. Copy the actual preview's stable branch alias or your owned preview domain into `APP_URL` (include `https://`), and allowlist that same origin in this Neon branch. If its URL is only known after an initial deployment, align the env/origin settings and redeploy **before creating the new login**. The app does not infer `APP_URL` from an untrusted request header or from `VERCEL_URL`.
4. Redeploy after env changes. Keep Production env values separate; verify the paired database/Auth branch again before following the importer runbook. This task does not deploy or provision a hosted preview.

Install dependencies, generate Prisma Client, and apply only pending checked-in application migrations to the disposable preview branch. The initial migration is already applied in the current migration-preview database; do not rerun or reset it:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Use the script names in the root README/package.json if the runbook updates them. `db:migrate` must resolve the direct preview URL. Nothing here should be run against production during this migration task. Next.js reads `.env.local`; the Prisma config explicitly loads it for CLI commands. For Safari or secure-cookie issues locally, run `npm run dev -- --experimental-https`, change local `APP_URL` to `https://localhost:3000`, and open that HTTPS origin.

## 4. Create and verify the new login

1. Open `/auth/sign-up` on the preview. Use an email account you control and choose a new password. Firebase passwords are not imported, and Firebase sign-in remains separate.
2. Signup automatically opens verification with the destination email. Paste the emailed code and submit, or follow the link when this branch is configured for links. Use resend or Change email to recover.
3. Successful verification resolves the actual server session and routes by onboarding status. If the provider requires reauthentication, use the single prefilled sign-in action. The server creates/maps a stable internal application user from the verified provider session. No Firebase profile is auto-matched by email.
4. Finish onboarding and add your old titles from Search. Choose each title by MAL ID, year, and format to distinguish seasons and remakes. A repeated save updates that title in your own library. `/profile` manages preferences and permanent hidden titles.
5. Optional standalone import only, outside the manual-entry workflow: with `MIGRATION_ENABLED=true`, `MIGRATION_TARGET=preview` and the runbook's receipt secret configured, download `/api/migration/identity` in the signed-in browser. The receipt must come from this exact deployment and requires a verified login email. Keep the file outside the repository. It expires after 15 minutes; renew before a later dry-run/import/verification if needed. The receipt binds the internal destination ID and managed auth account to this preview's database and Auth URL.

Neon's `neon_auth` user ID and the app's internal `AppUser.id` serve different purposes. Private app operations derive the internal user from the current managed session; a browser-supplied user ID never chooses the owner. The importer additionally checks the signed destination receipt and explicit destination ID.

## 5. Optional standalone import verification

- Confirm both email/password and, if enabled, Google sign-in reach the preview; sign-out must invalidate subsequent private requests.
- An unauthenticated private request must fail or redirect without exposing another user's data. Try a second preview login with an overlapping anime ID; neither account should see the other's collection or feedback.
- Confirm the profile identity and downloaded receipt identify the same internal app user and managed auth account. Never substitute the Firebase UID as the destination ID.
- Confirm `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL` and the receipt identify the same preview environment before following export/dry-run/import/verification steps in the migration runbook.

The app's private-operation check deliberately performs an uncached managed `/get-session` request, forwarding the official SDK session token and omitting the local `session_data` snapshot. It validates matching session/user IDs and expiry. Revoked sessions, failures, malformed responses and forged local snapshots cannot authorize a write. The SDK auth proxy still owns login, signup, verification, password reset and cookie handling. [Official SDK implementation](https://github.com/neondatabase/neon-pkgs/blob/main/packages/auth/src/server/client-factory.ts), [cookie extraction](https://github.com/neondatabase/neon-pkgs/blob/main/packages/auth/src/server/utils/cookies.ts).

Local fixture checks are not evidence of a completed live login. A Neon project, branch, auth configuration, email delivery and preview deployment must be configured and exercised by the operator before a live rehearsal. Production settings, real-user writes and cutover remain pending.

## OAuth callback review

The provider redirect remains the Neon-managed Google callback. The app callback is `/auth/callback`: the installed Neon middleware exchanges its session verifier/challenge cookie, then a no-store `/api/me` read resolves email verification and onboarding. Inspect callback origin, SDK Set-Cookie propagation, the remotely verified server session, profile response and destination as separate boundaries. A profile 503 offers Retry and never sends an existing viewer into onboarding. No live Google authorization or mailbox verification is certified by fixture tests.
