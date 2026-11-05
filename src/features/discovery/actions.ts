'use server';

import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { previewEnabled } from '@/lib/preview';
import { acquireGenerationLease, enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { ProviderError, rankCandidates, retrieveCandidates, verifyCandidates } from '@/lib/providers';
import { parseFavorite } from '@/features/library/favorites';
import { toAnimeView, type AnimeView, type LibraryStatus } from '@/features/library/model';
import { DEFAULT_MODEL, PROMPT_VERSION, eligible, generationSchema, requestConstraints, type Candidate, type Eligibility } from './engine';

export interface RecommendationView {
  anime: AnimeView;
  reason: string;
  requestId: string;
  currentStatus?: LibraryStatus;
  feedback: 'like' | 'dislike' | null;
}
export type GenerationResult = { ok: true; recommendations: RecommendationView[]; requestId: string } |
  { ok: false; kind: 'catalog' | 'model' | 'empty' | 'invalid' | 'storage' | 'rate_limit'; message: string; retryAfterSeconds?: number; newRequestRequired?: boolean };

type SavedPick = { anime: Candidate; reason: string };
function savedPicks(value: unknown): SavedPick[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('anime' in item) || !('reason' in item)) return [];
    const anime = item.anime as Candidate;
    return anime && Number.isInteger(anime.mal_id) && typeof item.reason === 'string' ? [{ anime, reason: item.reason }] : [];
  });
}
function constraintKey(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}
function displayEventId(batchId: string, ids: number[], animeId: number): string {
  const digest = createHash('sha256').update(JSON.stringify([batchId, ids, animeId])).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export async function generateRecommendations(input: unknown): Promise<GenerationResult> {
  const user = await requireUser();
  const parsed = generationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, kind: 'invalid', message: 'Choose a discovery mode and a valid request. Try generating again.' };
  const data = parsed.data;
  const constraints = requestConstraints(data.request, data.constraints);
  let lease: Awaited<ReturnType<typeof acquireGenerationLease>> | undefined;
  let inferenceStarted = false;
  try {
    const db = getDb();
    // Cached batches also perform private reads and impression writes.
    await enforceUserLimit(user.id, 'generation');
    const loadState = async () => {
      const [library, preferences] = await Promise.all([
        db.libraryEntry.findMany({ where: { userId: user.id, deletedAt: null } }),
        db.feedback.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
      ]);
      const eligibility: Eligibility = {
        mode: data.mode, library,
        dismissedIds: preferences.filter((item) => item.dismissal !== null && item.dismissal !== undefined).map((item) => item.animeId),
        sessionPassIds: data.sessionPassIds, constraints,
      };
      return { library, preferences, eligibility };
    };
    const state = await loadState();
    const cached = await db.recommendationBatch.findFirst({ where: { id: data.requestId, userId: user.id } });
    let picks: SavedPick[];
    if (cached) {
      // A retry cannot swap request semantics under an existing impression ID.
      if (cached.mode !== data.mode || cached.request !== data.request || constraintKey(cached.constraints) !== constraintKey(constraints)) {
        return { ok: false, kind: 'invalid', message: 'This request changed. Generate a fresh set of picks.' };
      }
      picks = savedPicks(cached.picks);
    } else {
      if (data.mode === 'list' && !state.library.some((entry) => entry.status === 'plan_to_watch')) {
        return { ok: false, kind: 'empty', message: 'Your Plan to Watch shelf is empty. Save a title from Search or find something new.' };
      }
      if (!previewEnabled() && !process.env.GROQ_API_KEY?.trim()) return { ok: false, kind: 'model', message: 'Recommendations are unavailable until Groq is configured. You can still search and manage your list.' };
      lease = await acquireGenerationLease(user.id, data.requestId);
      let candidates: Candidate[];
      if (data.mode === 'list') {
        candidates = state.library.filter((entry) => entry.status === 'plan_to_watch').flatMap((entry) => {
          const anime = entry.anime as unknown as Candidate;
          return [{ ...anime, mal_id: entry.animeId, title: typeof anime?.title === 'string' ? anime.title : `Anime #${entry.animeId}`, genres: Array.isArray(anime?.genres) ? anime.genres : [], synopsis: typeof anime?.synopsis === 'string' ? anime.synopsis : '' }];
        });
      } else candidates = await retrieveCandidates(user.interests, constraints, {
        favorites: user.favoriteAnimes.map(parseFavorite),
        likedIds: state.preferences.filter((item) => item.value === 'like').map((item) => item.animeId),
      });
      // Relations are verified only after cheap ID/constraint filtering. Do not
      // infer sequels from title similarity or trust the model to enforce them.
      // Edge search summaries omit genres/completion status. Verify full facts
      // before applying those constraints; an absent summary fact isn't a mismatch.
      candidates = candidates.filter((anime) => eligible(anime, { ...state.eligibility, constraints: {} }));
      candidates = (await verifyCandidates(candidates, state.eligibility)).filter((anime) => eligible(anime, state.eligibility));
      if (!candidates.length) return { ok: false, kind: 'empty', message: data.mode === 'list' ? 'No Plan to Watch titles fit these choices. Adjust your request or restore hidden titles in Profile.' : 'No eligible catalog titles match these choices. Adjust your request or try a different genre.' };
      const libraryTitles = new Map(state.library.map((entry) => [entry.animeId, toAnimeView(entry.anime, entry.animeId).title]));
      inferenceStarted = true;
      picks = await rankCandidates({
        candidates, mode: data.mode, request: data.request, constraints,
        interests: user.interests,
        favorites: user.favoriteAnimes.map(parseFavorite),
        libraryTaste: state.library.map((entry) => ({ animeId: entry.animeId, title: toAnimeView(entry.anime, entry.animeId).title, status: entry.status })),
        feedback: state.preferences.filter((item) => !!item.value || !!item.dismissal).map((item) => ({ animeId: item.animeId, value: item.value, reason: item.reason, title: item.title || libraryTitles.get(item.animeId) || null, dismissal: item.dismissal, dismissalReason: item.dismissalReason })),
      });
      // Re-read after provider latency: concurrent saves and dismissals win.
      const refreshed = await loadState();
      picks = picks.filter(({ anime }) => eligible(anime, refreshed.eligibility));
      try {
        await db.$transaction(async (tx) => {
          await tx.recommendationBatch.create({ data: {
            id: data.requestId, userId: user.id, mode: data.mode, request: data.request,
            constraints: constraints as Prisma.InputJsonValue,
            model: process.env.GROQ_MODEL || DEFAULT_MODEL, promptVersion: PROMPT_VERSION,
            picks: JSON.parse(JSON.stringify(picks)) as Prisma.InputJsonValue,
          } });
          // Reuse events for the verified candidate pool before ranking. The
          // bounded inference prompt can include a smaller subset of this pool.
          const candidateIds = [-1, ...candidates.map((item) => item.mal_id)];
          await tx.recommendationEvent.createMany({ data: candidates.map((anime, position) => ({
            id: displayEventId(data.requestId, candidateIds, anime.mal_id),
            userId: user.id, batchId: data.requestId, animeId: anime.mal_id, action: 'candidate', position,
          })), skipDuplicates: true });
        });
      } catch (problem) {
        // Two identical in-flight retries may race; reuse the committed winner.
        const winner = await db.recommendationBatch.findFirst({ where: { id: data.requestId, userId: user.id } });
        if (!winner) throw problem;
        if (winner.mode !== data.mode || winner.request !== data.request || constraintKey(winner.constraints) !== constraintKey(constraints)) {
          return { ok: false, kind: 'invalid', message: 'This request changed. Generate a fresh set of picks.', newRequestRequired: true };
        }
        picks = savedPicks(winner.picks);
      }
    }
    const fresh = await loadState();
    const values = new Map(fresh.preferences.map((entry) => [entry.animeId, entry.value]));
    const byId = new Map(fresh.library.map((entry) => [entry.animeId, entry.status]));
    const seen = new Set<number>();
    const recommendations = picks.filter(({ anime }) => {
      if (seen.has(anime.mal_id) || !eligible(anime, fresh.eligibility)) return false;
      seen.add(anime.mal_id); return true;
    }).map((pick) => ({ anime: toAnimeView(pick.anime, pick.anime.mal_id), reason: pick.reason, requestId: data.requestId, currentStatus: byId.get(pick.anime.mal_id), feedback: values.get(pick.anime.mal_id) ?? null }));
    if (!recommendations.length) return { ok: false, kind: 'empty', message: 'No eligible picks remain in this batch. Generate again or adjust your request.' };
    const displayedIds = recommendations.map((pick) => pick.anime.mal_id);
    // The actual returned set may be smaller than the original ranker batch
    // after a concurrent edit or cached retry. Record that precise set/order.
    // Its deterministic operation IDs keep retries from duplicating impressions.
    const displayedAt = new Date();
    await db.recommendationEvent.createMany({ data: recommendations.map((pick, position) => ({
      id: displayEventId(data.requestId, displayedIds, pick.anime.mal_id), userId: user.id,
      batchId: data.requestId, animeId: pick.anime.mal_id, action: 'display', position, createdAt: displayedAt,
    })), skipDuplicates: true });
    return { ok: true, recommendations, requestId: data.requestId };
  } catch (problem) {
    if (problem instanceof RateLimitError) return { ok: false, kind: 'rate_limit', message: problem.message, retryAfterSeconds: problem.retryAfterSeconds, newRequestRequired: true };
    if (problem instanceof ProviderError) return { ok: false, kind: problem.kind, message: problem.message, retryAfterSeconds: problem.retryAfterSeconds, newRequestRequired: inferenceStarted };
    return { ok: false, kind: 'storage', message: 'Your recommendation history could not be read or saved. Your input is kept; try again.', newRequestRequired: inferenceStarted };
  } finally {
    // Expiring leases recover crashed workers. Release failures must not turn a
    // committed response into an ambiguous retry for the viewer.
    if (lease) await lease.release({ retainRequest: inferenceStarted }).catch(() => {});
  }
}
