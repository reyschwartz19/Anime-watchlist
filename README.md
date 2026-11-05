# Anime Watchlist

Next.js App Router and TypeScript, Prisma 7, Neon PostgreSQL, and Neon's **Managed Better Auth** (`@neon/auth`). The original Firebase app remains runnable under `legacy/firebase/`; its source files and Firestore rules are retained. Prior project skills, design docs, mockup, and reference evidence remain intact.

This checkout is prepared for an isolated preview. No live Firebase export, Neon import, production database write, hosting change, or cutover has run.

## Setup

Use Node.js 24 LTS (or supported Node 22.12+) and npm. Follow [Neon and new-login setup](docs/NEON_SETUP.md), then merge `.env.example` into `.env.local` without replacing existing settings.

```sh
npm ci
npm run db:generate
# Double-check DATABASE_URL_UNPOOLED points to the isolated PREVIEW first.
npm run db:migrate
npm run dev
```

Open `http://localhost:3000/auth/sign-up`, create a new login, and verify its email. For migration, open `/profile` or `/api/me` before saving preferences or completing onboarding. Follow the [one-user migration runbook](docs/MIGRATION.md) for exact IDs, verified destination receipt, read-only export, dry run, preview import, per-field verification, edit freeze, and rollback. All credentials are server-only.

## Routes

| Route | Behavior |
| --- | --- |
| `/library` | Watching, Plan to watch, Completed, Dropped, and All filters; save/update/remove |
| `/search?q=…` | Jikan catalog search with owner-specific saved state |
| `/recommendations` | Personalized recommendations and independent persisted feedback |
| `/profile`, `/onboarding` | Name/photo, interests, favorite anime and onboarding state |
| `/auth/sign-in`, `/auth/sign-up` | Managed email/password and configured Google login |
| `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` | Email verification and recovery |

Old `/#/`, `/#/auth`, `/#/search`, `/#/recommendations`, `/#/profile`, and `/#/onboarding` entry points translate in the browser, retaining queries and the destination through login. Root avoids an early server redirect because fragments never reach the server. No episode-tracking UI is included.

## Structure and ownership

```text
src/app/                    routes, server layouts, auth proxy, identity endpoints
src/features/library/       library/profile/onboarding logic and UI
src/features/discovery/     search/recommendation UI and action
src/features/feedback/      independent preference feedback
src/features/auth/          managed-login/security UI
src/lib/                    shared server auth/db/provider clients and helpers
prisma/                     application schema and SQL migrations
scripts/migration/          one-user tools and synthetic fixtures
legacy/firebase/            retained Vite/Firebase behavioral reference
```

A stable internal `AppUser.id` owns app data; `authProviderId` is a separate unique login mapping. Every private page/query/action verifies the managed session server-side. Client payloads cannot select an owner. The importer additionally requires a short-lived signed destination receipt. Prisma leaves Neon's managed `neon_auth` schema alone.

Recommendations require server-only `GEMINI_API_KEY` and a currently available structured-output `GEMINI_MODEL`. The existing Google GenAI provider is retained on the server. Library, search, feedback and profile do not require Gemini.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:postgres
```

`test:postgres` creates and removes a temporary local PostgreSQL cluster, ignoring real destination connection variables. It needs PostgreSQL 16 binaries (`PG_BIN` overrides their location) and a non-root user. See [actual checks and limits](docs/MIGRATION_VERIFICATION.md).

## Retained Firebase app

```sh
npm run legacy:dev
npm run legacy:build
```

Its original Firebase/Gemini variables remain in the root local environment; real credentials are not copied into `legacy/`. The retained app can still write Firebase when you sign in and edit it. Migration tools only read the explicit source document. Keep the old deployment/project intact until a separately reviewed cutover.
