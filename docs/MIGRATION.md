# One-user Firebase → Neon migration runbook

Prepared 2026-11-05. **Stop before production writes or cutover.** These commands are for an operator-run rehearsal on an isolated Neon preview. No live export, import, provisioning, or cutover has run as part of this implementation. Keep Firebase authoritative until a later explicit cutover decision.

## Preservation and identity

The exporter reads **exactly** `users/{SOURCE_UID}` once using document `get()`. It neither enumerates the users collection nor writes Firebase. It does not infer a UID from an email or migrate passwords.

| Original data | Preservation |
| --- | --- |
| Anime ID and four statuses | Per-user `(userId, animeId)` key; exact `watching`, `completed`, `plan_to_watch`, `dropped` values |
| Metadata, extra entry fields | `anime` JSON, exact `legacyRaw`, and full source snapshot |
| Existing `addedAt` | Actual source time only; missing/ambiguous time remains null, with original representation retained |
| Legacy `progress` | Exact `legacyProgress` and raw source; no episode-tracking UI |
| Name, photo, interests, favorites, onboarding | First-import copy into an unedited profile; preserve array order and duplicate favorites |
| Unknown/unmappable values and malformed entries | Lossless full `MigrationSnapshot.sourceDocument` plus issue report; do not fabricate a replacement |
| Original UID/email and other timestamps | Retained in the full snapshot; the managed-login email is authoritative for new authentication |

Firestore timestamps retain seconds/nanoseconds in tagged JSON; bigint, bytes, nonfinite numbers and references have explicit tags. Reserved user keys are escaped. A normalized PostgreSQL date has millisecond precision; raw JSON preserves the exact original. New account/import audit times are technical metadata, **not watch history**.

`AppUser.id` is the stable internal UUID and owns the library. Its `authProviderId` is the separate managed-login ID. Unique source-UID and destination-user bindings prevent silently moving a retry to another person/project. No email-based account merge occurs.

## 1. Prepare the isolated preview

Follow [NEON_SETUP.md](NEON_SETUP.md) for branch creation, paired pooled/direct database URLs and managed Auth URL, exact trusted origins, new-login creation and email verification. Apply only the checked-in application schema to that preview. Prisma does not manage `neon_auth`.

Merge `.env.example` into `.env.local` while preserving existing settings. Also configure these keys in both the preview and your local CLI environment:

```dotenv
MIGRATION_ENABLED=true
MIGRATION_TARGET=preview
MIGRATION_IDENTITY_SECRET=ANOTHER_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate a separate receipt secret with `openssl rand -base64 32`; do not reuse the auth-cookie secret. Restart/redeploy after changing env vars. All these keys are server-only. Never put Firebase service-account credentials on the web deployment.

Create a durable backup directory **outside every Git working tree**:

```sh
MIGRATION_BACKUP_DIR="$HOME/.local/share/anime-watchlist-migration/2026-11-05-rehearsal"
mkdir -p "$MIGRATION_BACKUP_DIR"
chmod 700 "$MIGRATION_BACKUP_DIR"
```

The CLI requires absolute paths, resolves symlinks, rejects repository paths, writes new JSON files with mode `0600`, and refuses to replace existing files. Use fresh filenames per attempt. Keep source/receipt/report/backup files secure and outside commits, CI artifacts and shared logs; an ignored repository directory is insufficient. Do not rely on temporary directories for your only real backup.

## 2. Find both IDs and verify the destination

1. **Firebase UID:** in your existing Firebase project's Authentication → Users, open your known account and copy its UID. Cross-check Firestore Database → users → that UID. Select it manually; the tool does not list accounts. Record the explicit Firebase project ID too.
2. **Internal destination UUID:** create the new managed login, verify its email, sign in, then open `/profile` directly or `/api/me` in that browser. Read `internalUserId` and `authProviderId`. Use **internalUserId**, never the provider ID or Firebase UID.
3. **Do not save preferences or finish onboarding before the first import** if the old preferences/onboarding state should populate the fresh target. Actual new profile edits are protected from import overwrites.
4. Download `/api/migration/identity` from the signed-in browser into the external directory, using the link on `/profile`. Rename it to an unused filename, such as `identity-01.json`. It requires verified email, enabled preview migration settings and an existing internal user.

The signed receipt expires in **15 minutes**. It binds the internal UUID, managed auth ID, verified email, Auth URL and database endpoint/database/role fingerprint. The importer verifies those values, its signature/expiry, and the current destination DB mapping; typing an ID is not verification. It contains no password or session token. Renew it when necessary. After a managed email change, reload `/profile` or `/api/me`, then obtain a new receipt; the UUID stays stable.

```sh
SOURCE_UID='YOUR_EXACT_FIREBASE_UID'
FIREBASE_PROJECT_ID='YOUR_EXISTING_FIREBASE_PROJECT_ID'
DESTINATION_USER_ID='YOUR_PREVIEW_INTERNAL_UUID'
IDENTITY_RECEIPT="$MIGRATION_BACKUP_DIR/identity-01.json"
```

## 3. Read-only export

Use a dedicated read-only GCP/Firebase credential, for example Cloud Datastore Viewer, whose JSON is outside Git. Admin SDK access uses IAM and bypasses Firestore rules; do not use an unnecessarily privileged owner/editor credential. Set it only for the exporter:

```sh
GOOGLE_APPLICATION_CREDENTIALS='/ABSOLUTE/OUTSIDE-GIT/read-only-firebase-credential.json' \
  npm run migration -- export \
  --source-uid "$SOURCE_UID" \
  --firebase-project-id "$FIREBASE_PROJECT_ID" \
  --out "$MIGRATION_BACKUP_DIR/firebase-01.json"
```

The export contains the source project/path, read/update times, export time, lossless document and canonical content digest. Missing documents and unsupported value types stop export. It is a one-document application export, not a bulk Firestore export. Normalization reports malformed entries and missing fields.

## 4. Dry run

The CLI and Prisma config explicitly load `.env.local`, then `.env`; existing shell env vars take precedence. Confirm all URLs belong to the same preview. Destination operations use the app's pooled `DATABASE_URL`; schema migration uses `DATABASE_URL_UNPOOLED`.

```sh
npm run migration -- dry-run \
  --source-uid "$SOURCE_UID" \
  --destination-user-id "$DESTINATION_USER_ID" \
  --identity-receipt "$IDENTITY_RECEIPT" \
  --file "$MIGRATION_BACKUP_DIR/firebase-01.json" \
  --report "$MIGRATION_BACKUP_DIR/plan-01.json"
```

Omitting the command also selects dry-run; nothing defaults to import. Dry-run uses a read-only repeatable-read PostgreSQL transaction. Review `issues`, `rejectedSourceKeys`, every profile field's `equal/copy/preserve` result, planned IDs, each ID's differences, and destination-only IDs. Report stdout also contains private values: avoid shared terminal/CI logs.

Do not approve based on totals. A status, metadata, timestamp, raw-value or legacy-progress mismatch matters even when counts match. IDs/statuses are never guessed. A missing payload ID can be recovered only from its existing numeric source map key, with a warning. Source errors block import; `--accept-issues` requires explicit review and only archives malformed originals while importing the valid subset. Those errors remain visible and prevent claiming full equivalence.

## 5. Import into preview only

Pause preview editing and create a Neon branch/restore-point backup before rehearsal. The command additionally requires a JSON backup of this user's destination state **before** the write transaction. If desired, take an application-schema dump with securely loaded direct preview credentials:

```sh
# pg_dump does not load .env.local. Set DATABASE_URL_UNPOOLED securely first.
pg_dump --format=custom --no-owner --no-acl --schema=public \
  --dbname "$DATABASE_URL_UNPOOLED" \
  --file "$MIGRATION_BACKUP_DIR/neon-preview-before-01.dump"
```

The dump covers application data. Use Neon's branch backup for paired managed-auth state. Do not dump into the repo or connect this command to production. Renew the identity receipt if expired, then:

```sh
npm run migration -- import \
  --source-uid "$SOURCE_UID" \
  --destination-user-id "$DESTINATION_USER_ID" \
  --identity-receipt "$IDENTITY_RECEIPT" \
  --file "$MIGRATION_BACKUP_DIR/firebase-01.json" \
  --destination-backup "$MIGRATION_BACKUP_DIR/destination-before-01.json" \
  --confirm-write "$SOURCE_UID:$DESTINATION_USER_ID" \
  --report "$MIGRATION_BACKUP_DIR/import-01.json"
```

Import refuses production Node/Vercel environments and requires `MIGRATION_TARGET=preview`. The destination backup contains this user's profile, library, feedback, migration binding and source snapshots. Backup and import are separate consistent transactions: pause editing so the backup covers the state you intend to restore.

Binding, first-profile copy, missing entries and snapshot commit together in one serializable transaction, protected by unique constraints. An interruption rolls back all of them; serialization conflicts retry. If a connection drops after commit and the outcome is unclear, verify and replay with **new** backup/report filenames.

Existing library keys are never overwritten, even if edited or tombstoned. Real removals retain tombstones so retries cannot resurrect them. Profile edits set `profileEditedAt`, and repeat imports never recopy a previously imported profile. A changed source revision is archived but does not update existing rows. This is **insert-only**, not a merge or sync engine.

## 6. Verify IDs and preserved fields

```sh
npm run migration -- verify \
  --source-uid "$SOURCE_UID" \
  --destination-user-id "$DESTINATION_USER_ID" \
  --identity-receipt "$IDENTITY_RECEIPT" \
  --file "$MIGRATION_BACKUP_DIR/firebase-01.json" \
  --report "$MIGRATION_BACKUP_DIR/verify-01.json"
```

- Exit **0**: source archive, mapped profile fields, anime IDs/statuses/metadata/timestamps/raw/progress and destination ID set compare equivalent, with no source errors. Warnings still need review.
- Exit **2**: differences were retained for review, including newer edits, tombstones, extra destination IDs, malformed source records or missing rows. This is not a passing cutover check; do not erase wanted newer data merely to obtain `0`.
- Exit **1**: invalid input, identity, configuration or failed operation.

Hard-reload the preview. Inspect all four statuses, actual titles and counts, preferences/duplicate favorites, onboarding, search/save/remove, and feedback. With a second preview login and an overlapping anime ID, confirm isolation. Legacy progress remains stored but has no tracking UI. No live login/import is implied by fixture tests.

## 7. Avoid losing edits before a later cutover

Use a disposable branch for rehearsal. Firebase remains authoritative; preview is not a second production writer. A future cutover requires separate approval:

1. Inventory all source writers: old tabs, phones/offline clients, scripts/admin tools. Save pending edits and wait for acknowledgements before freezing. Pause destination writers too.
2. Enforce a **server-side per-user write freeze** for the explicit Firebase UID. A banner or closed tab cannot stop queued/offline writes. If changing Firestore rules later, replace the granting condition to exclude this UID; an additional false/deny rule cannot override an existing matching `allow`. Do not deploy such a change now.
3. Reconnect/drain clients and resolve pending-write failures. Record the freeze time. Export again **after** the freeze to a fresh file, retaining read/update times. If another write may have occurred, re-export and compare digests/fields before proceeding.
4. Use that final snapshot, a fresh receipt, and a verified clean destination. An older rehearsal's rows will not auto-update; use a fresh destination rehearsal or explicitly reconcile every conflict. Never reset a target containing newer wanted edits just to rerun.
5. Import, verify per ID/field, and inspect the UI while both sides stay frozen. Any new edit reopens reconciliation. Keep final source and pre-import backups and reports.
6. Only after a separate approval, select one authoritative writer and change hosting/routing. Keep Firebase readable and backed up during the rollback window.

No change feed or synthetic history fills an export gap. If both apps receive wanted edits, stop and reconcile the explicit differences.

## 8. Rollback

- **Before cutover:** continue using the unchanged Firebase deployment. Preserve rehearsal artifacts and any wanted preview edits, then discard/restore the isolated preview. Disable `MIGRATION_ENABLED` and remove the receipt secret afterward.
- **Interrupted import:** verify first; uncommitted work rolled back. A committed import is safe to replay with fresh output filenames; existing rows are not replaced.
- **Preview restore:** stop writers, preserve current state, and restore the Neon branch/restore point into an isolated branch. Pair its database and Auth URLs correctly and validate login/data before pointing the preview to it. A public-schema `pg_restore` is for a disposable target after inspection; do not run destructive restore commands or modify `neon_auth` during this task.
- **After a future cutover:** do not simply send traffic back to Firebase after Next.js has accepted edits. There is no reverse sync. Freeze both writers, back up current Neon app/auth state and Firebase, compare explicit post-cutover edits, and review reverse reconciliation or forward repair. Reverting code/DNS alone would lose those edits.

Never delete the Firebase project or source user document as part of this process.

## Official setup references

[Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Neon managed auth](https://neon.com/docs/auth/quick-start/nextjs-api-only), [auth branching](https://neon.com/docs/auth/branching-authentication), [Neon Prisma guide](https://neon.com/docs/guides/prisma), [Prisma 7 PostgreSQL/driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Firebase single-document reads](https://firebase.google.com/docs/firestore/query-data/get-data), [Admin SDK setup](https://firebase.google.com/docs/admin/setup), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam).

See [verification evidence and limits](MIGRATION_VERIFICATION.md). The Neon guide explicitly pins Prisma 7 while npm `latest` points to a Prisma 8 prerelease; the installed managed SDK is the current `@neon/auth`, not the older package or self-hosted Better Auth.
