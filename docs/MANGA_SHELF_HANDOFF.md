# Manga Shelf implementation handoff

Historical design implementation record. For current discovery, artwork, notes, limits, migration status and verification, use [the deck handoff](DISCOVERY_DECK_HANDOFF.md). NVIDIA and artwork-gate references below describe prior implementation.

Review branch: `feat/manga-shelf`, created from the authoritative working checkout at `478a163`. The original untracked `Manga-shelf-design/` input directory is preserved. Its approved documents and both intact boards are integrated at their intended paths. Earlier DESIGN/reference documents survive in `docs/design/history`; earlier standalone mockups and evidence remain available. No ZIP was present in the checkout or attachments.

## Working changes

- Paper `#F9EBD7`, ink `#0F0F0B`, red `#CF102C`; self-hosted Anton and Source Sans 3 with licenses; responsive desktop compositions, compact poster shelf, four-destination mobile navigation, focus and reduced-motion treatment.
- Email signup advances to branch-configured verification with destination email, paste/autofill, resend timing, invalid/expired recovery and server-session routing. Google returns through the installed Neon verifier/cookie exchange before the authoritative profile query. Cancellation, provider failure and profile-read failure have separate recovery; failed reads never imply a new user.
- Three-step onboarding preserves user-scoped safe drafts and favorite selections across searches, Back, refresh and recoverable errors. New favorites retain MAL IDs and distinguish seasons; legacy title strings remain readable. Initials replace the photo-URL field. Finishing opens Discover.
- Discover ranks real verified candidate IDs through server-only NVIDIA. New mode excludes the entire active library, durable dismissals and session passes; List mode permits only Plan to Watch. Known prequels and supported hard constraints are checked before and after ranking, including cached retries. Save, Already watched, temporary pass, permanent/strong dismissal, optional explicit taste, Undo and Profile restore are implemented. Request/model/prompt, returned order and attributed outcomes are separate retry-safe records.
- My List exposes all four statuses and URL-backed filters/search. Search has recent queries, saved state and distinct no-match/outage states. Details preserves return query/filter/scroll and offers status editing/recoverable removal. Profile has section-local editing, Cancel, unsaved-edit protection, hidden-title restore and real configured security actions.
- The Firebase importer now requires a private matching dry-run report before import. Existing transactional ownership, lossless snapshots, ID/field comparison, private backup, rerun/newer-edit and post-cutover rollback safeguards are retained. No personal import was executed.

## Starting database and provider state

A read-only transaction against the configured `MIGRATION_TARGET=preview` database found only `202611040001_initial` applied, one AppUser, zero LibraryEntry rows and zero MigrationBinding rows. The transaction was rolled back. No individual account fields, credentials or exports were printed. The anonymous managed-auth session endpoint returned HTTP 200 with no session.

The new additive `202611050001_discovery_feedback` migration is committed for review but **not applied to the remote preview**. The initial migration must not be reset or rerun. Disposable local PostgreSQL fixtures apply the ordered migration chain to a new temporary cluster only.

NVIDIA credentials are absent in the current local configuration. Legacy Gemini variables were preserved in the private environment but are unused by the active app. The NVIDIA request shape/default model was checked against its [official inference reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer). A direct live Jikan check was attempted using Node and curl; this environment timed out connecting to the public catalog. Live catalog reachability and inference therefore remain unverified here.

## Intentional artwork departures

No cleared entrance illustration or eye strip was supplied. The documented owned typeset wordmark and lines keep the composition functional. Catalog artwork also has no recorded source-specific display/crop permission; `CATALOG_ARTWORK_CLEARED=0` keeps neutral title fallbacks. The review fixture uses original typography graphics, never crops or fake covers extracted from the boards. Record permission for the actual source in [the asset manifest](design/assets.md) before enabling it. Licensed fonts and icon notices are recorded there separately.

## Browser evidence

Before: [phone sign-in](migration-evidence/auth-phone.png), [desktop signup](migration-evidence/auth-desktop.png). These are preserved evidence from the prior reviewed implementation, not newly claimed runs.

After: [all capture files](design/evidence/manga-shelf/README.md). Each of Sign-in, Verification, Favorites, populated Discover, My List, Search, Anime Details and Profile has full-page and exact viewport captures at 390×844, 1440×900 and 1363×647. Contact sheets aid comparison; individual captures remain the evidence. Fixture labels are visible.

The initial rendered review exposed Discover decision controls below the first fold, compact Favorites captions and My List statuses below the viewport, and Details identity after its cover. These were corrected and recaptured. The independent finish reviewer closed all five findings with a scoped ship verdict in [the finish review](design/workflow/manga-shelf-finish-review.md). Current checks and review outcomes are recorded alongside the evidence; fixture results do not certify live services.

## Verification and limits

Commands used:

```sh
npm run typecheck
npm test
ANIME_BUILD_DIR=.next-build npm run build
npm run test:postgres
node scripts/browser/review.mjs
node scripts/browser/journeys.mjs
node scripts/browser/auth-journeys.mjs
node scripts/browser/edge-states.mjs
node scripts/browser/onboarding-journey.mjs
node scripts/browser/retry-recovery.mjs
```

TypeScript, production compilation and all 72 tests across 16 test files pass. PostgreSQL fixtures pass 12 scenarios in a disposable loopback cluster. All 87 browser fixture assertions pass, including the focused lost-response retry rehearsal. The browser evidence index gives final per-script results and covers actual rendered fixture journeys, labels/reflow, focused controls, reduced motion, missing images, long titles, narrow screens and zoom checks.

Impeccable context ran once; the rendered finish review compared both boards with all routes and required the fixes above. Its detector ran exactly once over implemented app/components/features, returning exit 0 with `[]`. The project-local usability skill was installed from the requested source and applied to goal/action/feedback/recovery. Current Vercel Web Interface Guidelines and React guidance were applied; the independent interface audit records seven source findings and their correction. The focused lost-response check confirms that a Save commits before a dropped response, retry reuses the operation ID, Undo restores the original library state, and Details → Back restores its validated batch. See [interface audit](design/workflow/manga-shelf-interface-audit.md), [auth audit](design/workflow/manga-shelf-auth-audit.md), [detector output](design/workflow/manga-shelf-detector.json) and [design metadata](../.impeccable/design.json).

Live mailbox delivery, real OTP consumption and interactive Google authorization/cancellation require a human-controlled inbox/account on the isolated preview. Mocked browser responses establish client behavior only. NVIDIA inference needs the private key; catalog access needs working network egress. No production deployment, merge, remote data migration or personal import ran.

## Run locally

Credential-free review:

```sh
git switch feat/manga-shelf
npm ci
npm run db:generate
ANIME_PREVIEW_FIXTURES=1 MIGRATION_ENABLED=false APP_URL=http://localhost:3067 npm run dev -- --port 3067
```

Open `http://localhost:3067/recommendations`. This mode uses a guarded in-memory database, owned placeholders and synthetic providers, and is disabled in production. Its `.next-review` output does not replace a normal dev server. Restarting resets fixture data. CDP checks require installed Chrome/Chromium (`CHROME_BIN` can select it).

Real isolated Neon preview:

1. Align `.env.local` with [Neon setup](NEON_SETUP.md): paired preview database/Auth URLs, cookie secret, exact `APP_URL`, branch verification method and private NVIDIA key. Leave fixture mode unset and keep migration tools disabled unless separately reviewing migration identity.
2. Review the additive SQL. Confirm the direct URL belongs to the migration-preview branch, then apply pending migrations with `npm run db:migrate`. Prisma deploy skips the already-applied initial migration; do not reset the database.
3. Run `npm run dev`, open the configured localhost origin and exercise live email/Google with your own inbox/account. Complete onboarding, then verify ranking and library outcomes.
4. Run the read-only inference smoke:

```sh
node --conditions=react-server --env-file=.env.local --import tsx scripts/smoke-nvidia.ts
```

## Review a Vercel Preview

No hosted deployment was created by this task. After reviewing the branch, push it with:

```sh
git push -u origin feat/manga-shelf
```

With the repository's Vercel Git integration, non-production branch pushes create Preview deployments ([official environment documentation](https://vercel.com/docs/deployments/environments)). Select this branch's deployment and verify its commit before testing. Use repository root, Next.js preset, Node 24, `npm ci`, `npm run build`, and default output settings; do not set the local `ANIME_BUILD_DIR` override on Vercel.

Scope environment values to **Preview / this branch**. Use the isolated Neon branch and its Auth URL, private NVIDIA key/model, stable cookie secret and actual HTTPS preview origin. Match `APP_URL` to the origin allowlisted in Neon; recheck the Google managed callback registration. Keep `ANIME_PREVIEW_FIXTURES` unset. Keep `MIGRATION_ENABLED=false` for ordinary review. Apply pending application SQL to that isolated database only, then redeploy after environment changes. Open `/auth/sign-up` and repeat the live journeys; fixture screenshots are a separate local artifact.

Merge, production environment changes, licensed-art approval and personal Firebase cutover remain for the owner's review. The [migration runbook](MIGRATION.md) includes edit freeze, backup, reconciliation and rollback after future post-cutover edits.
