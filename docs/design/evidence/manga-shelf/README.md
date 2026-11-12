# Manga Shelf browser evidence

Captured on 2026-11-05 against the actual Next.js routes in development, using an
explicitly enabled, production-disabled in-memory fixture adapter. Every screen
labels the fixture environment. No live email delivery, Google OAuth exchange,
NVIDIA completion, personal Firebase import, or production database operation
passed on the strength of these fixtures.

The reviewed story is: choose a mode or title in the browser → authenticated
server action → owner-scoped library/feedback/impression storage and verified
catalog candidates → attributable ranked picks → persisted collection state and
reversible feedback rendered in the browser. Auth fixtures intercept provider
responses; the destination still comes from the app’s server profile endpoint.

| Run | Result | Evidence |
| --- | --- | --- |
| Eight routes at three viewports | 53/53 assertions | [browser-checks.json](browser-checks.json) |
| Discovery, feedback, recovery and isolation | 17/17 journeys | [journey-checks.json](journey-checks.json) |
| Browser-intercepted signup/invalid and expired OTP/Google responses | 6/6 journeys | [auth-fixture-checks.json](auth-fixture-checks.json) |
| Long titles, missing art, scroll, keyboard and responsive edges | 6/6 checks | [edge-state-checks.json](edge-state-checks.json) |
| Favorites across queries, Back, refresh, failure and Finish | 2/2 journeys | [onboarding-fixture-checks.json](onboarding-fixture-checks.json) |
| Lost response, same-operation retry and Undo after server commit | 3/3 journeys | [retry-recovery-checks.json](retry-recovery-checks.json) |

All **87 assertions passed** in the final runs. Each JSON file records its own
configuration and timestamp. The synthetic server state was restarted for the
final capture round; completing onboarding ran last. The dev server used blank
database/provider credentials, and migration downloads were disabled. Existing
user development servers were preserved.

## Screenshots

Every route has `-phone`, `-desktop`, and `-compact` captures at **390×844**,
**1440×900**, and **1363×647** respectively. Files ending `-viewport.png` show the
first viewport; the matching `.png` file shows the full page. Fonts and images
were settled, reduced motion was enabled, and the Next.js developer status
bubble was hidden from evidence. Runtime exceptions remained checked.

| Surface | Phone | Desktop | Compact desktop |
| --- | --- | --- | --- |
| Sign-in | [View](sign-in-phone-viewport.png) | [View](sign-in-desktop-viewport.png) | [View](sign-in-compact-viewport.png) |
| Verification | [View](verification-phone-viewport.png) | [View](verification-desktop-viewport.png) | [View](verification-compact-viewport.png) |
| Favorites | [View](favorites-phone-viewport.png) | [View](favorites-desktop-viewport.png) | [View](favorites-compact-viewport.png) |
| Populated Discover | [View](discover-phone-viewport.png) | [View](discover-desktop-viewport.png) | [View](discover-compact-viewport.png) |
| My List | [View](my-list-phone-viewport.png) | [View](my-list-desktop-viewport.png) | [View](my-list-compact-viewport.png) |
| Search | [View](search-phone-viewport.png) | [View](search-desktop-viewport.png) | [View](search-compact-viewport.png) |
| Anime Details | [View](details-phone-viewport.png) | [View](details-desktop-viewport.png) | [View](details-compact-viewport.png) |
| Profile | [View](profile-phone-viewport.png) | [View](profile-desktop-viewport.png) | [View](profile-compact-viewport.png) |

Contact sheets: [phone](contact-phone.jpg), [desktop](contact-desktop.jpg),
[compact desktop](contact-compact.jpg). Additional inspected evidence:
[long title](details-long-title-phone.png), [missing imagery](details-missing-art-phone.png),
[keyboard email focus at 390px](sign-in-keyboard-focus-phone.png),
[320px entrance](sign-in-narrow-320.png),
[expired-code recovery](verification-expired-fixture.png),
[keyboard Pass focus after Escape, scrolled phone](discover-keyboard-focus-scrolled-phone.png),
and [200% equivalent reflow](profile-200-percent.png). The latter emulates a
720×450 CSS viewport at device scale 2 for a 1440×900 display; it is not a physical
device or screen-reader test.

## Findings fixed during implementation

- Compact Favorites initially placed first-row captions below the viewport.
  Short-height masthead, spacing and artwork rules now keep recognizable titles
  visible in the first 647px. The first complete round survives in
  [initial-review/](initial-review/).
- Mobile Discover initially put the title, reason and Save below the first
  viewport. A collapsed request disclosure and lower artwork crop now keep the
  lead’s title, reason and primary action together.
- Initial image failures could occur before React attached `onError`, leaving a
  broken blank image. The shared poster component now checks already-completed
  image dimensions on mount; the blocked-image check confirms the fallback.
- Session-pass restoration could overwrite the restored draft during mount.
  Persistence now waits for hydration, and reloads recheck stored batch IDs on the
  server against current library, dismissal and session-pass eligibility.
- Neon can throw a normalized auth error while retaining the specific OTP code
  in its nested error. Both returned and thrown provider errors now receive the
  specific invalid/expired-code recovery message.

The QA harness also needed two corrections: serialize DOM-presence predicates
as booleans for CDP, and include carriage-return text when sending Enter. Its
fixture adapter now applies Prisma’s nullable defaults to new library rows.
These were test-infrastructure defects, not live-provider results.

A separate fixture browser dropped a successful Save response after the server
had committed it. The UI retained the previous pick and recovery message, reused
the same operation ID on retry, and Undo restored the original absent library
state. Stored batches also survived Details and Back, with server eligibility
revalidation. This tests application retry behavior using fixtures, not service
availability or a live provider session.

## Boundaries and remaining checks

The app UI and server actions ran with fixtures; actual database transactions
were separately verified by `npm run test:postgres` in an owned temporary local
PostgreSQL cluster. All 12 migration scenarios passed. The migration CLI requires
a private matching dry-run report before import, backups now include new
recommendation history, and the personal import remains pending. See
[migration verification](../../../MIGRATION_VERIFICATION.md).

The owned entrance graphic and explicit cover placeholders intentionally replace
uncleared artwork. The approved boards remain intact as review references; no
fake covers or controls were extracted. Live catalog artwork requires the
documented permission configuration. Provider credentials and licensed artwork
are separate review gates, not failed fixture assertions.

The previously recorded [framework-migration auth captures](../../../migration-evidence/)
are historical before evidence. Their old styling and test record do not certify
the new screens. Repeatable browser commands are in
[scripts/browser/README.md](../../../../scripts/browser/README.md).
