# Discovery implementation and preview verification

The active App Router provider is server-only NVIDIA NIM at `https://integrate.api.nvidia.com/v1/chat/completions`. Set private `NVIDIA_API_KEY` and optionally `NVIDIA_MODEL`; the default is `nvidia/nemotron-3-ultra-550b-a55b`. There is no active Gemini, browser-key, or OpenAI fallback. Archived Firebase code remains historical evidence. The request format was checked against [NVIDIA's model inference reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer).

Jikan supplies real candidate MAL IDs and metadata before ranking. New mode excludes the entire active library across all four statuses, permanent dismissals, and the caller's session pass IDs. List mode starts only with active Plan to Watch entries. A bounded pool is hydrated through `/anime/{id}/full` before ranking, including old imported entries with incomplete metadata. Known anime prequels must be Completed; unknown episode counts cannot satisfy a maximum-episodes constraint. Explicit required/excluded genres, formats, standalone-only, and supported clear wording in the request are deterministic checks. Broader viewing intent informs ranking. Every returned ID must belong to the supplied pool; foreign IDs and duplicates are dropped with their own reasons. The final eligibility check rereads library and feedback after provider latency and on every cached retry.

A batch uses a client-generated UUID and records request/mode, constraints, model, prompt version and ID/reason pairs. Actual returned IDs/order are recorded as display events with positions and deterministic IDs, including when a cached subset changes after a dismissal. Library Save/Already watched, permanent dismissal, and explicit taste remain separate. Outcome events store the batch attribution and before-images; duplicate operation IDs are safe to retry. Undo is owner-scoped, repeatable, and refuses to overwrite newer title edits. Strong dismissal without a reason creates no genre preference. Restoring a dismissal preserves independent explicit taste. Session passes live in user-scoped session storage and are sent to the server for eligibility filtering.

The additive `202611050001_discovery_feedback` migration only changes application tables. It has not been applied to the configured remote preview database. The ordered migration chain was applied only to disposable local PostgreSQL fixtures during this implementation. Review the SQL and apply it to the isolated Neon preview branch before using these routes against a real database. Do not reset the database or rerun the initial migration.

## Manual live smoke

With the private `.env.local` configured, run:

```sh
node --conditions=react-server --env-file=.env.local --import tsx scripts/smoke-nvidia.ts
```

This retrieves live Jikan metadata, calls NVIDIA, validates stable IDs/constraints, and prints only titles, IDs and reasons. It imports no database or identity code and writes no user data. Disable `ANIME_PREVIEW_FIXTURES` before running. The smoke entry point was exercised without a key and stopped at its explicit configuration check; a successful live NVIDIA request is credential-blocked in this checkout.

## Automated evidence

`npm test` discovers `src/features/discovery/engine.test.ts` and `ownership.test.ts`. These exercise the real action and eligibility code with an isolated in-memory database/provider boundary. They are fixture results, not live NVIDIA, Jikan, Neon, email, or OAuth certification. Coverage includes full-library exclusions, cached dismissal/restore, session pass and list membership, hard constraints and prequels, foreign/duplicate IDs with attached reasons, duplicate actions, undo and newer edits, cross-user isolation, explicit taste separation and distinct model/catalog failures.
