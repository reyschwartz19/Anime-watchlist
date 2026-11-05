# Manga Shelf authentication and onboarding implementation review

Reviewed the implemented auth and onboarding components against the approved boards, screens.md and flows.md, the project-local ux-usability-foundations skill, and the current Vercel Web Interface Guidelines fetched on 2026-11-05. This is the current implementation review; earlier mockup audits do not apply.

## Findings fixed

- `src/proxy.ts`: installed Neon Auth 0.8.2 requires its middleware to exchange `neon_auth_session_verifier` plus the challenge cookie for the application session cookie. The old proxy never invoked that exchange and did not match an auth callback. The new `/auth/callback` reaches the SDK exchange and preserves its response cookies. Server-side ownership checks remain independent. This cause was established by installed SDK source inspection and a boundary test; a live Google account round trip has not been claimed.
- `src/features/auth/AuthForm.tsx`: signup advances to verification with its destination address; OTP resend now uses the OTP endpoint instead of the link endpoint. A server-only verification-method setting supports branches configured for links. Resend observes numeric Retry-After headers and a local 60-second guard. Invalid and expired credentials, cancellation, provider failure and post-verification profile failure have distinct recovery. Successful verification resolves the server session, and a branch requiring reauthentication offers one prefilled sign-in action.
- `src/features/auth/session-resolution.ts`: only HTTP 401 means signed out. Network errors, HTTP failures and malformed profile data cannot classify an existing user as new. Private operations require a verified email before proceeding. `/api/me` returns a no-store 503 when the profile is unavailable.
- `src/features/auth/AuthForm.tsx`: email and code spellcheck disabled; code errors associated with their field; errors move focus; paste and one-time-code autofill stay enabled. Google shows pending feedback and repeated actions have a synchronous lock.
- `src/features/library/ProfileForm.tsx`: identity, favorites and interests are separate progressive steps, with user-scoped, versioned safe drafts across Back and refresh. Passwords and OTPs never enter storage. Title search discards stale results, retains selections across queries, identifies seasons using catalog ID/title/year/type and distinguishes catalog outage from no matches. Legacy title-only favorites remain readable. Avatar initials replace the photo URL field. Genre requirements are visible beside Finish. Submission failure retains the current step and selections.
- `src/features/library/ProfileForm.tsx`: profile editors have section-local payloads, Cancel, dirty-navigation protection, and focus restoration to the opening summary after cancel/save. Existing profile photos are preserved.
- `src/features/library/favorite-actions.ts`: artwork goes through the central permission-aware view projection; board images are never extracted as product assets.

## Verification

Targeted automated tests cover redirect safety, deep-link preservation, malformed/failed profile reads, verified/unverified routing, explicit signed-out handling, cancellation copy, stable/legacy favorites, SDK callback dispatch/cookie propagation, and verified-email enforcement. Browser fixtures are separate evidence and do not establish live provider behavior.

Live email delivery, mailbox OTP consumption and Google authorization/cancellation still require the isolated preview branch's provider configuration and a human-controlled inbox/account. The code defaults to the installed SDK's email OTP method; set `NEON_AUTH_EMAIL_VERIFICATION_METHOD=link` only for a branch configured to send verification links. A change-email recovery starts account creation with the corrected address; it does not pretend to change an unverified account without the provider's verified ownership flow.

## Read-only configured preview checks

On 2026-11-05 the configured `MIGRATION_TARGET=preview` database was inspected inside `BEGIN READ ONLY`: only `202611040001_initial` is applied; aggregate counts are one AppUser, zero LibraryEntry and zero MigrationBinding rows. No personal records were printed, and the transaction was rolled back. The managed auth `get-session` endpoint returned HTTP 200 with no anonymous session. This verifies reachability and starting migration state only. It does not verify live email delivery or Google authorization.
