# Migration verification

Manga Shelf follow-up on 2026-11-05: the importer now requires a private prior dry-run report for the exact source UID, verified destination and export digest before constructing the write client. Its destination backup also includes new recommendation batches and attributable events, alongside explicit taste and hidden-title state. The report is an operator review artifact, not a signed approval; current destination state is still checked transactionally. New guard tests reject a missing/mismatched plan before database access. `npm run test:migration` passed 3 files (10 cases), and `npm run test:postgres` passed all 12 scenarios after applying the ordered schema chain to a freshly owned, temporary loopback database. No personal export/import or Neon data operation ran. The earlier evidence below remains historical for the framework migration.

Verified locally on 2026-11-05. No real Firebase export, Neon provisioning/login/import, production writes, hosting change, or cutover ran. Only synthetic fixtures and temporary loopback PostgreSQL/browser processes were used.

## Versions and official setup choices

| Component | Installed version |
| --- | --- |
| Next.js App Router | 16.4.5 |
| React / React DOM | 19.3.1 |
| TypeScript | 5.8.3 |
| Prisma CLI, Client, pg adapter | 7.10.1 |
| Neon Managed Better Auth SDK | `@neon/auth` 0.8.2 |
| PostgreSQL driver | `pg` 8.23.1 |

The current [Neon managed auth quick start](https://neon.com/docs/auth/quick-start/nextjs-api-only) uses the renamed `@neon/auth` package. The [Neon Prisma guide](https://neon.com/docs/guides/prisma) explicitly pins Prisma 7 because the unqualified npm `latest` tag currently selects a Prisma 8 prerelease. The app uses the supported [Prisma pg driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql) with Neon's pooled PostgreSQL connection, and a direct connection for schema migration.

## Checks run

| Check | Result and scope |
| --- | --- |
| `npm test` | 36 test cases across 8 files passed; no live services |
| `npm run typecheck` | Passed, including `src`, importer/scripts and tests |
| `npm run build` | Prisma Client generation and optimized Next.js build passed without live database/auth credentials |
| `npm run legacy:build` | Retained Vite app builds; existing large-bundle advisory remains |
| `npm run test:postgres` | All 12 scenarios passed using actual Prisma/PostgreSQL transactions against an owned temporary local PostgreSQL 16 cluster |
| `npm run migration -- --help` | Export/dry-run/import/verify interface verified |
| `npm ci --ignore-scripts --dry-run` | Updated lockfile is reproducible; the SDK's transitive peer-version warning is nonfatal |
| Dependency audit | 0 known vulnerabilities after compatible updates and a gRPC 1.14.7 override for retained Firebase dependencies; no forced Firebase downgrade |
| Original Firebase files | 21 moved source/assets byte-identical to original tracked files; Firestore rules unchanged |
| Browser / HTTP | 18 checks passed with synthetic config and no live auth/catalog requests |

The test runner uses native Node tests. The action-boundary suite uses Node's experimental module mocks; this affects tests only. Native `node --import tsx` avoids a sandbox IPC dependency in the `tsx` command wrapper.

## What the tests establish

- One explicit Firebase UID produces exactly one `users/{uid}` document read. Missing/invalid UIDs stop before reading; no collection enumeration API is used.
- All four statuses survive; old records can recover an absent payload ID only from the numeric source key. Missing timestamps stay null. Favorites retain order/duplicates, interests/onboarding copy correctly, and legacy progress/unknown values remain intact.
- Lossless source encoding handles nanosecond timestamps, bigint, bytes, nonfinite numbers, negative zero and reserved-tag collisions. Altered exports fail content-digest validation.
- Malformed records and missing fields are reported; ambiguous IDs/statuses are not fabricated. Invalid records require explicit acceptance and remain archived, while verification still reports non-equivalence.
- Dry-run transactions are read-only. Imports commit binding/profile/entries/snapshot together. Interruptions after binding, entries, or profile roll back every change and succeed on retry.
- Sequential and concurrent repeats do not duplicate data. The PostgreSQL driver's wrapped serialization-conflict path is retried. Later destination status/metadata/preferences/deletions are preserved. New source revisions cannot replace existing rows.
- Two users can own the same anime ID with different statuses. Unique source/destination bindings prevent stealing another migration. Extra destination IDs and modified preserved fields make verification fail even when totals could look similar.
- Real server-action modules authenticate before DB/provider access. Strict inputs reject supplied ownership IDs. Save/remove/profile/feedback operations are scoped to the signed-in internal ID, including overlapping anime IDs and anonymous attempts.
- Auth fixtures verify official SDK cookie/header names, uncached remote session verification, omission of the local session snapshot, repeated upstream checks, revocation/expiry/malformed/network failures, and session/user ID matching. Email verification is distinct from merely having a valid session.
- Signed destination receipts reject tampering, another user, wrong database/role/Auth branch, expired/future issuance, and the wrong key. CLI guard fixtures reject production writes, missing IDs, invalid confirmations and forged receipts before connecting.
- Backups/reports/receipts must be outside Git and symlink escapes are rejected. Files use mode 0600 and existing outputs cannot be overwritten.

## Browser evidence

Temporary production-mode Next.js and Chrome ran locally with a synthetic Auth URL, no DB connection, and migration downloads disabled. No auth form was submitted. Processes and profiles were stopped/removed afterward.

See [raw checks](migration-evidence/browser-checks.json), [phone sign-in](migration-evidence/auth-phone.png), and [desktop sign-up](migration-evidence/auth-desktop.png). Both screenshots were visually inspected.

Verified:

- Anonymous library/search/profile/recommendations/onboarding requests redirect to login while retaining the intended path/query.
- `/api/me` rejects both absent cookies and a forged local session snapshot; a browser-supplied owner ID does not grant access.
- Migration identity downloads are disabled by default.
- An actual browser opening `/#/search?q=Mushi-Shi` reaches sign-in with the search destination/query intact.
- Phone 390×844 and desktop 1440×1000 login forms render, have no horizontal overflow, labeled inputs, buttons at least 44px high, and visible keyboard focus.
- No live auth or catalog request occurred during those checks.

Private page responses can stream a loading shell followed by a redirect meta tag with HTTP 200. That is [documented Next.js redirect behavior](https://nextjs.org/docs/app/api-reference/functions/redirect), not private-data access. The browser follows it. Private API identity requests return 401. Authoritative session checks also remain inside each page/query/action, independent of navigation proxy behavior.

The interaction review consulted the freshly fetched [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) for semantics, input labels, keyboard/focus, pending/error states, URL state and destructive-action confirmation. This is not a claim that all production accessibility/performance rules or every authenticated screen were certified. Prior Impeccable/design-review artifacts remain the separate provisional design workflow; this framework migration does not approve that pending reference-led restyle.

## Operator checks still required

1. Configure the real isolated Neon branch, trusted origins, email delivery and managed auth providers using [NEON_SETUP.md](NEON_SETUP.md).
2. Exercise a real sign-up, email verification, sign-in, reset, email/password change, optional Google sign-in, revocation and sign-out. Recheck host-scoped cookies on the actual browser/domain.
3. Find the explicit source UID and internal destination UUID, obtain a fresh destination receipt, and run the read-only export/dry-run using the operator's readonly credential. Review actual data issues.
4. Perform only a preview import and field-level verification using [MIGRATION.md](MIGRATION.md), then test authenticated search/library/profile/feedback end-to-end with two preview users. External Jikan/Gemini availability and model quality were not tested live.
5. Verify physical-phone and assistive-technology behavior. The browser checks use desktop Chrome emulation, not a screen reader or actual mobile browser.
6. Review the edit-freeze, final-export, reconciliation and rollback procedure before any separately authorized production write/cutover. An insert-only rehearsal cannot synchronize edits made later in either app.

Firebase remains intact. Existing design/skills/reference artifacts were preserved, and the original Firebase source remains available under `legacy/firebase/` with separate Vite commands.
