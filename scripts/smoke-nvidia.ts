/** Manual live-provider smoke. Read-only: does not import auth or database code. */
import { rankCandidates, retrieveCandidates, verifyCandidates } from '../src/lib/providers';
import { eligible, type Eligibility } from '../src/features/discovery/engine';

if (process.env.ANIME_PREVIEW_FIXTURES === '1') throw new Error('Disable ANIME_PREVIEW_FIXTURES for a live provider smoke test.');
if (!process.env.NVIDIA_API_KEY) throw new Error('Set NVIDIA_API_KEY in your private .env.local before running this live smoke test.');
const context: Eligibility = { mode: 'new', library: [], dismissedIds: [], sessionPassIds: [], constraints: { maxEpisodes: 30 } };
const candidates = (await verifyCandidates((await retrieveCandidates(['Adventure'], context.constraints)).filter((anime) => eligible(anime, context)))).filter((anime) => eligible(anime, context));
const picks = await rankCandidates({ candidates, mode: 'new', request: 'An adventure of at most 30 episodes for tonight', constraints: context.constraints, interests: ['Adventure'], favorites: [{ animeId: 205, title: 'Samurai Champloo' }], feedback: [] });
if (!picks.length) throw new Error('Live provider returned no eligible picks.');
console.log('Live Jikan + NVIDIA smoke passed. No database writes.');
for (const [index, pick] of picks.entries()) console.log(`${index + 1}. MAL ${pick.anime.mal_id}: ${pick.anime.title}\n${pick.reason}`);
