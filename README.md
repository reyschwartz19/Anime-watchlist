# Anime Watchlist

Next.js App Router and TypeScript, Prisma 7, Neon PostgreSQL, and Neon's **Managed Better Auth** (`@neon/auth`). The original Firebase app remains runnable under `legacy/firebase/`; its source files and Firestore rules are retained. The approved Manga Shelf boards govern the live routes. Earlier mockups and reference evidence remain under docs/design/history and docs/design/evidence.

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

Open `http://localhost:3000/auth/sign-up`, create a fresh login, verify its email, and complete onboarding. Search for your old titles and mark each Completed, Watching, Plan to Watch, or Dropped. Saving a title again updates the same MAL ID. Normal startup and builds need no Firebase configuration. All credentials are server-only.

## Routes

| Route | Behavior |
| --- | --- |
| `/library` | Watching, Plan to watch, Completed, Dropped, and All filters; save/update/remove |
| `/search?q=…` | Jikan catalog search with owner-specific saved state |
| `/recommendations` | Groq-ranked new discoveries or Plan to Watch picks, save/watched/pass/dismiss/undo |
| `/anime/[id]?from=…` | Catalog details, all four statuses, recoverable removal and return context |
| `/profile`, `/onboarding` | Progressive identity/favorites/taste setup, initials, hidden-title restore and security |
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

Recommendations use server-only `GROQ_API_KEY` and `GROQ_MODEL=openai/gpt-oss-120b`, with strict JSON Schema output at Groq's explicit chat-completions endpoint. There is no provider fallback or OpenAI API key requirement. Library, search and preferences work without Groq. See [discovery architecture and smoke checks](docs/DISCOVERY.md), [limits and security](docs/SECURITY_LIMITS.md), and [current verification and preview handoff](docs/CATALOG_DISCOVERY_HANDOFF.md). Catalog artwork remains a neutral fallback until source-specific display permission is recorded and `CATALOG_ARTWORK_CLEARED=1` is set.

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

Only this retained app uses Firebase/Gemini configuration. Real credentials are never copied into `legacy/`. Its data is independent of the active Next.js app. The standalone [migration utility](docs/MIGRATION.md) remains available for a separately authorized import; manual re-entry is the current workflow. No Firebase import runs during startup, build, tests, or deployment.

## Manga Shelf review

See the [design implementation record](docs/MANGA_SHELF_HANDOFF.md) and [current catalog and preview handoff](docs/CATALOG_DISCOVERY_HANDOFF.md). Review and apply only pending migrations to the isolated preview; never reset a database. Production promotion and merging remain for the owner's review.

For a credential-free browser review, run the isolated dev fixture adapter (unavailable in production):

```sh
ANIME_PREVIEW_FIXTURES=1 MIGRATION_ENABLED=false APP_URL=http://localhost:3067 npm run dev -- --port 3067
# Separate terminal; requires installed Google Chrome/Chromium
node scripts/browser/review.mjs
node scripts/browser/journeys.mjs
# Other focused auth/onboarding/edge/retry scripts are linked in the handoff.
```

It uses an in-memory database and original typography placeholders. It never connects to Neon, Groq, Jikan or Firebase. Restarting the fixture server resets its data. Do not enable fixture mode for a hosted preview.
