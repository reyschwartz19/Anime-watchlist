import { createHash } from 'node:crypto';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonMap = { [key: string]: Json };
export const STATUSES = ['watching', 'completed', 'plan_to_watch', 'dropped'] as const;
export type Status = (typeof STATUSES)[number];
export type Issue = { severity: 'warning' | 'error'; path: string; code: string; message: string };

export interface UserExport {
  format: 'anime-watchlist-firebase-user';
  version: 1;
  source: { projectId: string; uid: string; path: string };
  exportedAt: string;
  sourceReadTime: Json;
  sourceUpdateTime: Json;
  document: Json;
  sourceDigest: string;
}

export interface NormalizedEntry {
  animeId: number;
  status: Status;
  anime: JsonMap;
  addedAt: Date | null;
  legacyRaw: Json;
  legacyProgress?: Json;
  sourceKey: string;
}

export type ProfilePatch = Partial<{
  displayName: string | null;
  photoURL: string | null;
  interests: string[];
  favoriteAnimes: string[];
  onboarded: boolean;
}>;

export interface NormalizedSource {
  snapshot: UserExport;
  profile: ProfilePatch;
  entries: NormalizedEntry[];
  issues: Issue[];
  rejectedSourceKeys: string[];
}

export function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function digest(value: Json): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function isMap(value: unknown): value is JsonMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The reserved-tag map escape keeps an actual user field named $firebaseType
// distinct from a timestamp/bigint/etc. No source values are silently stringified.
export function encodeFirestore(value: unknown): Json {
  if (value === undefined) return { $firebaseType: 'undefined' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return { $firebaseType: 'number', value: '-0' };
    return Number.isFinite(value) ? value : { $firebaseType: 'number', value: String(value) };
  }
  if (typeof value === 'bigint') return { $firebaseType: 'bigint', value: value.toString() };
  if (value instanceof Date) return { $firebaseType: 'date', value: value.toISOString() };
  if (value instanceof Uint8Array) return { $firebaseType: 'bytes', value: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(encodeFirestore);
  if (typeof value === 'object') {
    const special = value as Record<string, unknown>;
    const name = value.constructor?.name;
    if (name === 'Timestamp' && typeof special.seconds === 'number' && typeof special.nanoseconds === 'number') {
      return { $firebaseType: 'timestamp', seconds: special.seconds, nanoseconds: special.nanoseconds };
    }
    if (name === 'GeoPoint' && typeof special.latitude === 'number' && typeof special.longitude === 'number') {
      return { $firebaseType: 'geopoint', latitude: special.latitude, longitude: special.longitude };
    }
    if (name === 'DocumentReference' && typeof special.path === 'string') {
      const reference = special as { path: string; firestore?: { projectId?: string; databaseId?: string } };
      return { $firebaseType: 'reference', path: reference.path, projectId: reference.firestore?.projectId ?? null, databaseId: reference.firestore?.databaseId ?? null };
    }
    if (name !== 'Object' && Object.getPrototypeOf(value) !== null) {
      throw new Error(`Unsupported Firestore value type ${name}; export stopped rather than losing its value.`);
    }
    const entries = Object.entries(special).map(([key, item]) => [key, encodeFirestore(item)] as [string, Json]);
    if (Object.hasOwn(special, '$firebaseType')) return { $firebaseType: 'map', entries: entries.map(([key, item]) => [key, item]) };
    return Object.fromEntries(entries);
  }
  throw new Error(`Unsupported Firestore value ${typeof value}; export stopped.`);
}

export function unwrapMap(value: Json): Json {
  if (Array.isArray(value)) return value.map(unwrapMap);
  if (!isMap(value)) return value;
  if (value.$firebaseType === 'map' && Array.isArray(value.entries)) {
    const result: JsonMap = Object.create(null) as JsonMap;
    for (const pair of value.entries) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string' || pair.length !== 2) throw new Error('Malformed escaped map in export.');
      Object.defineProperty(result, pair[0], { value: unwrapMap(pair[1]), enumerable: true, writable: true });
    }
    return result;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrapMap(item)]));
}

// Decode the map container only; nested reserved-tag maps must retain their
// escape so user objects cannot be mistaken for serialized Firestore types.
function readSourceMap(value: Json): JsonMap | null {
  if (!isMap(value)) return null;
  if (value.$firebaseType !== 'map') return value;
  if (!Array.isArray(value.entries)) throw new Error('Malformed escaped source map.');
  return Object.fromEntries(value.entries.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw new Error('Malformed escaped source map entry.');
    return [pair[0], pair[1]];
  }));
}

export function sourceDigest(snapshot: Pick<UserExport, 'source' | 'document'>): string {
  return digest({ source: snapshot.source, document: snapshot.document });
}

export function validateSourceUid(uid: string): string {
  if (!uid || uid.length > 128 || uid.includes('/') || /[\u0000-\u001f]/.test(uid)) throw new Error('An explicit Firebase UID (one document ID, no slash) is required.');
  return uid;
}

export function makeExport(source: UserExport['source'], document: unknown, times: { read?: unknown; update?: unknown } = {}): UserExport {
  validateSourceUid(source.uid);
  if (!source.projectId || source.path !== `users/${source.uid}`) throw new Error('Source project and exact users/{sourceUid} path are required.');
  const result: UserExport = {
    format: 'anime-watchlist-firebase-user', version: 1, source,
    exportedAt: new Date().toISOString(), sourceReadTime: encodeFirestore(times.read ?? null),
    sourceUpdateTime: encodeFirestore(times.update ?? null), document: encodeFirestore(document), sourceDigest: '',
  };
  result.sourceDigest = sourceDigest(result);
  return result;
}

export function validateExport(value: unknown, expectedUid: string): UserExport {
  validateSourceUid(expectedUid);
  if (!isMap(value) || value.format !== 'anime-watchlist-firebase-user' || value.version !== 1 || !isMap(value.source)) throw new Error('Unsupported export format.');
  const snapshot = value as unknown as UserExport;
  if (snapshot.source.uid !== expectedUid || snapshot.source.path !== `users/${expectedUid}` || !snapshot.source.projectId) throw new Error('Source UID/path does not match the explicitly selected source.');
  if (!Number.isFinite(Date.parse(snapshot.exportedAt))) throw new Error('Export timestamp is missing or invalid.');
  if (snapshot.sourceDigest !== sourceDigest(snapshot)) throw new Error('Export content digest mismatch. The source file changed or is incomplete.');
  if (!Object.hasOwn(snapshot, 'sourceReadTime') || !Object.hasOwn(snapshot, 'sourceUpdateTime')) throw new Error('Export audit fields are missing.');
  return snapshot;
}

function integer(value: Json | undefined): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (isMap(value) && value.$firebaseType === 'bigint' && typeof value.value === 'string') return integer(value.value);
  return null;
}

function sourceDate(value: Json | undefined): Date | null {
  let milliseconds: number | null = null;
  if (typeof value === 'number' || (isMap(value) && value.$firebaseType === 'bigint')) milliseconds = integer(value);
  else if (isMap(value) && value.$firebaseType === 'timestamp' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9) milliseconds = value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
  } else if (isMap(value) && value.$firebaseType === 'date' && typeof value.value === 'string') milliseconds = Date.parse(value.value);
  else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) milliseconds = Date.parse(value);
  if (milliseconds === null || !Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) return null;
  return new Date(milliseconds);
}

export function normalize(snapshot: UserExport): NormalizedSource {
  const data = readSourceMap(snapshot.document);
  if (!data) throw new Error('The selected users/{sourceUid} document is not a map.');
  const result: NormalizedSource = { snapshot, profile: {}, entries: [], issues: [], rejectedSourceKeys: [] };
  const issue = (severity: Issue['severity'], path: string, code: string, message: string) => result.issues.push({ severity, path, code, message });
  if (!Object.hasOwn(data, 'uid')) issue('warning', 'uid', 'missing-field', 'No stored UID; the explicit document path remains the source identity.');
  else if (data.uid !== snapshot.source.uid) issue('error', 'uid', 'uid-mismatch', 'Stored UID differs from the explicit source document path; original value retained.');
  for (const field of ['displayName', 'photoURL'] as const) {
    if (!Object.hasOwn(data, field)) issue('warning', field, 'missing-field', 'Field absent; destination value will not be invented.');
    else if (data[field] === null || typeof data[field] === 'string') result.profile[field] = data[field];
    else issue('error', field, 'invalid-profile-field', 'Expected a string or null; original value retained only in snapshot.');
  }
  for (const field of ['interests', 'favoriteAnimes'] as const) {
    if (!Object.hasOwn(data, field)) issue('warning', field, 'missing-field', 'Field absent; destination value will not be invented.');
    else if (Array.isArray(data[field]) && data[field].every(item => typeof item === 'string')) result.profile[field] = data[field] as string[];
    else issue('error', field, 'invalid-preferences', 'Expected a string array; no values filtered or guessed. The original is retained in snapshot.');
  }
  if (!Object.hasOwn(data, 'onboarded')) issue('warning', 'onboarded', 'missing-field', 'Onboarding state absent; no historical state will be invented.');
  else if (typeof data.onboarded === 'boolean') result.profile.onboarded = data.onboarded;
  else issue('error', 'onboarded', 'invalid-onboarding', 'Expected boolean; original retained, destination not changed.');
  if (!Object.hasOwn(data, 'email')) issue('warning', 'email', 'missing-field', 'Legacy email absent; managed-auth email remains authoritative.');
  else if (data.email !== null && typeof data.email !== 'string') issue('warning', 'email', 'invalid-profile-field', 'Legacy email is not a string or null; original retained, managed-auth email remains authoritative.');
  if (!Object.hasOwn(data, 'watchlist')) {
    issue('warning', 'watchlist', 'missing-field', 'Watchlist absent; this is not evidence of an empty historical collection.');
    return result;
  }
  const watchlist = readSourceMap(data.watchlist);
  if (!watchlist) {
    issue('error', 'watchlist', 'invalid-watchlist', 'Watchlist is not an object; original retained, no entries guessed.');
    return result;
  }
  const collisions = new Map<number, string[]>();
  for (const [key, encodedRaw] of Object.entries(watchlist)) {
    const path = `watchlist.${key}`;
    const raw = readSourceMap(encodedRaw);
    if (!raw) { issue('error', path, 'invalid-entry', 'Entry is not an object; original retained in source snapshot.'); result.rejectedSourceKeys.push(key); continue; }
    const keyId = integer(key);
    const hasId = Object.hasOwn(raw, 'mal_id');
    const animeId = hasId ? integer(raw.mal_id) : keyId;
    if (animeId === null || animeId < 1 || animeId > 2147483647 || (keyId !== null && keyId !== animeId)) {
      issue('error', `${path}.mal_id`, 'ambiguous-anime-id', 'Missing/invalid anime ID or key/payload mismatch; no anime association guessed.'); result.rejectedSourceKeys.push(key); continue;
    }
    if (!hasId) issue('warning', `${path}.mal_id`, 'missing-field', 'ID recovered from the existing numeric watchlist key; exact original retained.');
    if (!STATUSES.includes(raw.status as Status)) {
      issue('error', `${path}.status`, 'invalid-status', 'Missing/unknown status; no status invented. Original retained in source snapshot.'); result.rejectedSourceKeys.push(key); continue;
    }
    for (const field of ['title', 'images', 'synopsis']) if (!Object.hasOwn(raw, field)) issue('warning', `${path}.${field}`, 'missing-field', 'Catalog field absent; source entry is preserved without invented metadata.');
    if (Object.hasOwn(raw, 'title') && (typeof raw.title !== 'string' || !raw.title.trim())) issue('warning', `${path}.title`, 'invalid-catalog-field', 'Title is not a nonempty string; original retained for review.');
    if (Object.hasOwn(raw, 'images')) {
      const images = readSourceMap(raw.images);
      const jpg = images ? readSourceMap(images.jpg ?? null) : null;
      if (!jpg || !['image_url', 'large_image_url'].every(field => typeof jpg[field] === 'string' && /^https?:\/\//i.test(jpg[field] as string))) {
        issue('warning', `${path}.images`, 'invalid-catalog-field', 'Image metadata is incomplete or malformed; original retained, no artwork guessed.');
      }
    }
    if (Object.hasOwn(raw, 'synopsis') && raw.synopsis !== null && typeof raw.synopsis !== 'string') issue('warning', `${path}.synopsis`, 'invalid-catalog-field', 'Synopsis is not a string or null; original retained.');
    if (Object.hasOwn(raw, 'episodes') && raw.episodes !== null && (typeof raw.episodes !== 'number' || !Number.isInteger(raw.episodes) || raw.episodes < 0)) issue('warning', `${path}.episodes`, 'invalid-catalog-field', 'Episode metadata is malformed; original retained without creating tracking history.');
    if (Object.hasOwn(raw, 'score') && raw.score !== null && (typeof raw.score !== 'number' || raw.score < 0 || raw.score > 10)) issue('warning', `${path}.score`, 'invalid-catalog-field', 'Score metadata is malformed; original retained.');
    if (Object.hasOwn(raw, 'genres') && raw.genres !== null && (!Array.isArray(raw.genres) || !raw.genres.every(genre => isMap(genre) && typeof genre.name === 'string'))) issue('warning', `${path}.genres`, 'invalid-catalog-field', 'Genre metadata is malformed; original retained.');
    const addedAt = sourceDate(raw.addedAt);
    if (!Object.hasOwn(raw, 'addedAt')) issue('warning', `${path}.addedAt`, 'missing-field', 'No source timestamp; addedAt remains null.');
    else if (addedAt === null) issue('warning', `${path}.addedAt`, 'unmapped-timestamp', 'Timestamp cannot be mapped unambiguously; addedAt remains null and exact original is retained.');
    const entry: NormalizedEntry = { animeId, status: raw.status as Status, anime: { ...raw, mal_id: animeId }, addedAt, legacyRaw: encodedRaw, sourceKey: key };
    if (Object.hasOwn(raw, 'progress')) entry.legacyProgress = raw.progress;
    result.entries.push(entry);
    collisions.set(animeId, [...(collisions.get(animeId) ?? []), key]);
  }
  for (const [animeId, keys] of collisions) if (keys.length > 1) {
    issue('error', 'watchlist', 'duplicate-anime-id', `Multiple source keys resolve to anime ID ${animeId}; all ambiguous entries retained only in snapshot.`);
    result.entries = result.entries.filter(entry => entry.animeId !== animeId);
    result.rejectedSourceKeys.push(...keys);
  }
  return result;
}

export type ComparableEntry = {
  animeId: number; status: string; anime: Json; addedAt: Date | null;
  legacyRaw: Json | null; legacyProgress: Json | null; deletedAt: Date | null; editedAt: Date | null;
};
export interface EntryComparison {
  animeId: number;
  sourceStatus: Status;
  destinationStatus: string | null;
  result: 'equal' | 'missing' | 'different';
  differences: string[];
  destinationEdited: boolean;
  destinationDeleted: boolean;
}
export function compareEntry(source: NormalizedEntry, destination?: ComparableEntry): EntryComparison {
  if (!destination) return { animeId: source.animeId, sourceStatus: source.status, destinationStatus: null, result: 'missing', differences: ['entry'], destinationEdited: false, destinationDeleted: false };
  const differences: string[] = [];
  if (source.status !== destination.status) differences.push('status');
  if (canonical(source.anime) !== canonical(destination.anime)) differences.push('anime');
  if (source.addedAt?.getTime() !== destination.addedAt?.getTime()) differences.push('addedAt');
  if (canonical(source.legacyRaw) !== canonical(destination.legacyRaw)) differences.push('legacyRaw');
  if (source.legacyProgress !== undefined && canonical(source.legacyProgress) !== canonical(destination.legacyProgress)) differences.push('legacyProgress');
  if (source.legacyProgress === undefined && destination.legacyProgress !== null) differences.push('legacyProgress');
  if (destination.deletedAt) differences.push('deletedAt');
  return { animeId: source.animeId, sourceStatus: source.status, destinationStatus: destination.status, result: differences.length ? 'different' : 'equal', differences, destinationEdited: destination.editedAt !== null, destinationDeleted: destination.deletedAt !== null };
}
