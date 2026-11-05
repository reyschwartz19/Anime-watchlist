import { createGroqRanker } from '../src/lib/groq-client';
import { ProviderError } from '../src/lib/provider-error';
import type { Candidate } from '../src/features/discovery/engine';

// A single inference with fixed public metadata. No identity, catalog or database
// access; no automatic retries. Node loads local env without evaluating a shell.
const records = [
  [205, 'Samurai Champloo', 26, 'Action', 'Three travelers cross Edo-period Japan with an energetic soundtrack.'],
  [457, 'Mushi-Shi', 26, 'Supernatural', 'A wandering specialist investigates quiet encounters between people and mysterious life forms.'],
  [9253, 'Steins;Gate', 24, 'Sci-Fi', 'A small group investigates the consequences of an unusual scientific discovery.'],
  [1, 'Cowboy Bebop', 26, 'Action', 'A mismatched crew of bounty hunters travels through space.'],
  [30276, 'One Punch Man', 12, 'Comedy', 'An exceptionally powerful hero searches for a worthwhile challenge.'],
] as const;
const candidates: Candidate[] = records.map(([mal_id, title, episodes, genre, synopsis]) => ({
  mal_id, title, episodes, synopsis, genres: [{ name: genre }], status: 'Finished Airing', type: 'TV',
  images: { jpg: { image_url: null, large_image_url: null } }, relations: [], relationsVerified: true,
}));

try {
  if (process.env.ANIME_PREVIEW_FIXTURES === '1') throw new ProviderError('model', 'Disable ANIME_PREVIEW_FIXTURES before a live check.', 'unconfigured');
  const rank = createGroqRanker({ apiKey: () => process.env.GROQ_API_KEY, model: () => process.env.GROQ_MODEL });
  const picks = await rank({ candidates, mode: 'new', request: 'A thoughtful adventure tonight', constraints: {}, interests: ['Adventure'], favorites: [], feedback: [] });
  if (picks.length !== 5) throw new ProviderError('model', 'The provider did not return a full five-card deck from the fixed candidates.', 'invalid_response');
  console.log(`Live Groq strict-schema smoke passed: ${picks.length} validated fixed candidate IDs. One request; no database writes.`);
} catch (error) {
  console.error(`Groq smoke failed: ${error instanceof ProviderError ? error.message : 'The provider check could not complete.'}`);
  process.exitCode = 1;
}
