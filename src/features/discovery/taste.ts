import type { Candidate } from './engine';

export interface TasteSignal {
  animeId: number; value: string | null; reason: string | null;
  likedAspects?: string | null; dislikedAspects?: string | null; visualStyle?: string | null;
  dismissal?: string | null; dismissalReason?: string | null;
}
export interface TasteLibrary { animeId: number; status: string; anime: unknown }
const stop = new Set('a an the and or but to of in on for is it its with this that i my me was were very really like liked love loved dislike disliked not dont anime show story series'.split(' '));
function words(value: string): string[] { return [...new Set(value.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(word => !stop.has(word)); }
function facts(anime: Candidate): string { return [anime.title, anime.synopsis, anime.type, anime.source, ...anime.genres.map(item => item.name), ...(anime.studios ?? []).map(item => item.name)].filter(Boolean).join(' '); }
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, aa = 0, bb = 0;
  for (const [key, value] of a) { dot += value * (b.get(key) ?? 0); aa += value * value; }
  for (const value of b.values()) bb += value * value;
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

/** Explicit ratings/notes outweigh completion; Dropped is never an implied dislike. */
export function prioritizeCandidates(candidates: Candidate[], library: TasteLibrary[], signals: TasteSignal[], request: string, maximum = 12): Candidate[] {
  const documents = candidates.map(anime => words(facts(anime)));
  const frequencies = new Map<string, number>();
  for (const document of documents) for (const word of document) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const idf = (word: string) => 1 + Math.log((documents.length + 1) / ((frequencies.get(word) ?? 0) + 1));
  const vectors = documents.map(document => new Map(document.map(word => [word, idf(word)])));
  const positive = new Map<string, number>(); const negative = new Map<string, number>();
  const add = (target: Map<string, number>, text: string, weight: number) => { for (const word of words(text)) target.set(word, (target.get(word) ?? 0) + weight * idf(word)); };
  add(positive, request, 4);
  const feedback = new Map(signals.map(signal => [signal.animeId, signal]));
  for (const entry of library) {
    const signal = feedback.get(entry.animeId);
    const anime = entry.anime as Partial<Candidate> | null;
    const text = [...(anime?.genres ?? []).map(item => item.name), ...(anime?.studios ?? []).map(item => item.name)].join(' ');
    if (signal?.value === 'like') add(positive, text, 2.5);
    else if (signal?.value === 'dislike') add(negative, text, 1.5);
    else if (entry.status === 'completed') add(positive, text, 0.35);
  }
  for (const signal of signals) {
    add(positive, signal.likedAspects ?? '', 3);
    add(negative, signal.dislikedAspects ?? '', 3);
    if (signal.value === 'like') add(positive, signal.reason ?? '', 2);
    if (signal.value === 'dislike') add(negative, signal.reason ?? '', 2);
    if (signal.visualStyle) add(/\b(?:hate|dislike|avoid|bad|stiff|ugly|poor|not)\b/i.test(signal.visualStyle) ? negative : positive, signal.visualStyle, 2);
    // A reasonless strong dismissal carries no genre or similarity penalty.
    if (signal.dismissalReason) add(negative, signal.dismissalReason, 1.5);
  }
  const relevance = vectors.map(vector => cosine(vector, positive) - 0.65 * cosine(vector, negative));
  const remaining = new Set(candidates.map((_, index) => index)); const chosen: number[] = [];
  while (remaining.size && chosen.length < maximum) {
    let best = -1, score = -Infinity;
    for (const index of remaining) {
      const similarity = chosen.length ? Math.max(...chosen.map(other => cosine(vectors[index], vectors[other]))) : 0;
      // Maximal marginal relevance: retain relevance while widening the deck.
      const value = 0.78 * relevance[index] - 0.22 * similarity - index * 0.00001;
      if (value > score) { best = index; score = value; }
    }
    chosen.push(best); remaining.delete(best);
  }
  return chosen.map(index => candidates[index]);
}
