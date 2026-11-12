# Persistent Preview 503: safe diagnostic investigation

Branch: `feat/manga-shelf`. Reviewed 2026-11-12. No credentials or Vercel settings changed; no migrations, push or deployments performed.

## Confirmed root causes in code

1. `databaseFailureCode()` recognized only authentication and missing-schema failures. Every other exception returned `DATABASE_UNAVAILABLE`. `AuthRateLimitUnavailableError` logged this result and discarded the underlying exception. The old log cannot distinguish configuration rejection, PostgreSQL connection failure, Prisma transaction failure or application errors.
2. `EnvironmentError` carried no structured variable/check fields, and `urlValue()` caught even required-value errors and replaced them with a generic URL error. The compound pair predicate hid which comparison failed.
3. The pair validator compared percent-encoded role/password/database strings literally. Equivalent encodings (for example `%2f` and `%2F`) could reject an otherwise valid pair **before** constructing PrismaPg. This is reproduced by a regression test and corrected by decoding once for comparison. Different decoded passwords, endpoints, roles and databases still fail. TLS checks and Preview pairing remain enabled.

These are confirmed code defects. They do not establish which exception occurred in the already deployed request.

## Evidence for the current deployment

The stable alias resolved to Preview `dpl_5SpLqfNuKFfLjjffirLNBXdom16p`, source commit `f634519`. Its Google initiation request `b6v7x-1794509717584-644b3afd82e7` emitted the pg SSL warning at **19:55:18.198 Africa/Douala**, then the generic rate-limit error at **19:55:23.184**. The warning is emitted after the Preview pair check, during PostgreSQL client creation. This sequence points beyond that check for this request; it does not identify the subsequent exception.

The 4.986-second interval is consistent with the existing Prisma `maxWait: 5000` transaction-start deadline, which is shorter than the pool's `connectionTimeoutMillis: 10000`. Prisma 7.10.1's installed source maps show `TransactionStartTimeoutError` uses `P2028` and the fixed message `Unable to start a transaction in the given time.` **This is a hypothesis, not a confirmed deployed diagnosis.** No timeout was increased on that assumption.

Vercel denied access to the request's OpenTelemetry trace (HTTP 403). Historical logs discarded the exception; it cannot be reconstructed from the generic event. Preview environment metadata shows branch-specific and inherited database variable entries, but secret values were not exposed or changed, and effective Vercel values were not established from metadata.

## Runtime and regression evidence

| Check | Result |
| --- | --- |
| Current local Preview pair validation | Passed. |
| Real Prisma pooled `SELECT 1` | Passed. |
| Prisma transaction and RateLimitState read | Passed. |
| Fresh transaction before warming the pool | Passed in 2,220 ms. |
| Real auth limiter with a unique synthetic identity | Passed in 2,163 ms, including advisory lock/read/write/commit. Only its own diagnostic reservation was removed afterward. |
| Missing direct URL before Prisma construction | Regression verifies environment key/check and database-initialization phase; neither adapter nor transaction is invoked. |
| Equivalent percent encodings | Regression verifies the validator permits the same decoded credentials and still rejects actual mismatches. |
| Prisma P2028 startup timeout | Injected regression retains P2028 and transaction-start phase; protection continues to return a recoverable 503. |
| Lock, read, write and commit errors | Injected regressions identify each boundary separately. |
| Secret redaction | Tests reject raw messages, stacks, SQL, params, URLs and synthetic secret markers in diagnostic output. |
| `npm run typecheck` | Passed. |
| `npm test` | All 31 test files passed. |
| `ANIME_BUILD_DIR=.next-build npm run build` | Passed; local build only. |

## Temporary Preview diagnostics

Every failure still returns the sanitized `AUTH_RATE_LIMIT_UNAVAILABLE` response; rate limiting never bypasses a failed database operation. Only when `VERCEL_ENV=preview`, the existing server log event additionally includes:

- `phase`: configuration, database-initialization, transaction-start, advisory-lock, budget-read, budget-write or transaction-commit.
- `environment.key` and `environment.check`: predefined names only, such as DATABASE_URL_UNPOOLED / missing or DATABASE_URL / neon-tls.
- `prismaCodes`, `postgresCodes` (including nested adapter originalCode), allowlisted network/TLS codes and adapter kinds.
- A safe timeout category for recognized code-less pg connection errors and Prisma transaction-start/execution errors.
- Allowlisted error class names. No raw exception is attached to the public error.

Reasons distinguish ENVIRONMENT_VALIDATION_FAILED, DATABASE_TRANSACTION_START_TIMEOUT, DATABASE_TRANSACTION_EXECUTION_TIMEOUT, DATABASE_TRANSACTION_FAILED, DATABASE_CONNECTION_TIMEOUT, DATABASE_NETWORK_FAILED, DATABASE_TLS_FAILED, schema/authentication failures and other recognized Prisma/driver codes. Unknown failures are explicitly unclassified; they are never assumed to be credentials.

Deploy this feature commit to **Preview** and reproduce one sign-in attempt on the stable alias. Inspect that request's `auth_operation_failed` event:

- `phase=database-initialization` plus an environment check proves rejection before connection. Correct only the named check; no password rotation is implied.
- `phase=transaction-start` plus P2028 / transaction-start timeout confirms the acquisition deadline, rather than a credential or schema error. Investigate pool wait/cold connection timing before adjusting bounded limits.
- PostgreSQL/network/TLS codes identify the actual driver failure; transaction callback phases identify whether lock acquisition or budget table access failed.

Remove the Preview-only detailed payload after the deployed root cause is established. Production logs remain concise; no Production settings or authentication protections change. Successful local tests do not certify successful Vercel runtime authentication.
