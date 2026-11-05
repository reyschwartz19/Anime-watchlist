import { createCatalogClient, createCatalogTransport } from '../src/lib/catalog-client';
import { ProviderError } from '../src/lib/provider-error';

// A public GET check independent of app auth/database. Application catalog calls
// additionally reserve the shared Neon budget before making outbound requests.
try {
  if (process.env.ANIME_PREVIEW_FIXTURES === '1') throw new ProviderError('catalog', 'Disable ANIME_PREVIEW_FIXTURES before a live check.', 'unconfigured');
  const client = createCatalogClient(createCatalogTransport({}));
  const page = await client.searchAnimePage('Samurai Champloo');
  if (!page.items.some(anime => anime.mal_id === 205)) throw new Error('Expected stable ID missing');
  const title = await client.getAnimeDetails(205);
  if (!title?.relationsVerified) throw new Error('Full metadata missing');
  console.log(`Live Jikan search + full-details smoke passed: stable MAL ID 205, validated pagination and prerequisites. No database writes.`);
} catch (error) {
  console.error(`Jikan smoke failed: ${error instanceof ProviderError ? error.message : 'The public catalog check could not complete.'}`);
  process.exitCode = 1;
}
