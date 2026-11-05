import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

// Exercise the real server-action modules with their auth/database/provider
// boundaries replaced. No managed auth, database or Firebase service is called.
// Run with Node's --experimental-test-module-mocks flag and --import tsx.
type User = { id: string; onboarded: boolean; displayName: string; interests: string[]; favoriteAnimes: string[] };
type Entry = { userId: string; animeId: number; status: string; anime: unknown; addedAt: Date; editedAt: Date | null; deletedAt: Date | null; legacyRaw: unknown; legacyProgress: unknown };
const users = new Map<string, User>();
const entries = new Map<string, Entry>();
const feedback = new Map<string, { userId: string; animeId: number; value: string }>();
let authenticatedUser: string | null = 'a';
let databaseCalls = 0;
let providerCalls = 0;
const key = (userId: string, animeId: number) => `${userId}:${animeId}`;

const fakeDb = {
  libraryEntry: {
    async findUnique({ where }: { where: { userId_animeId: { userId: string; animeId: number } } }) {
      databaseCalls += 1;
      const pair = where.userId_animeId;
      return entries.get(key(pair.userId, pair.animeId)) ?? null;
    },
    async update({ where, data }: { where: { userId_animeId: { userId: string; animeId: number } }; data: Partial<Entry> }) {
      databaseCalls += 1;
      const pair = where.userId_animeId;
      const row = entries.get(key(pair.userId, pair.animeId));
      if (!row) throw new Error('Missing row');
      Object.assign(row, data);
      return row;
    },
    async upsert({ where, create, update }: { where: { userId_animeId: { userId: string; animeId: number } }; create: Entry; update: Partial<Entry> }) {
      databaseCalls += 1;
      const pair = where.userId_animeId;
      const id = key(pair.userId, pair.animeId);
      const row = entries.get(id);
      if (row) Object.assign(row, update);
      else entries.set(id, { ...create });
      return entries.get(id);
    },
    async updateMany({ where, data }: { where: { userId?: string; animeId: number; deletedAt?: null }; data: Partial<Entry> }) {
      databaseCalls += 1;
      for (const row of entries.values()) {
        if (row.animeId === where.animeId && (where.userId === undefined || row.userId === where.userId) && (!Object.hasOwn(where, 'deletedAt') || row.deletedAt === where.deletedAt)) Object.assign(row, data);
      }
    },
  },
  appUser: {
    async update({ where, data }: { where: { id: string }; data: Partial<User> }) {
      databaseCalls += 1;
      const user = users.get(where.id);
      if (!user) throw new Error('Missing user');
      Object.assign(user, data);
      return user;
    },
  },
  feedback: {
    async findUnique({ where }: { where: { userId_animeId: { userId: string; animeId: number } } }) {
      databaseCalls += 1;
      const pair = where.userId_animeId;
      return feedback.get(key(pair.userId, pair.animeId)) ?? null;
    },
    async upsert({ where, create, update }: { where: { userId_animeId: { userId: string; animeId: number } }; create: { userId: string; animeId: number; value: string }; update: { value: string } }) {
      databaseCalls += 1;
      const pair = where.userId_animeId;
      const id = key(pair.userId, pair.animeId);
      const row = feedback.get(id);
      feedback.set(id, row ? { ...row, ...update } : { ...create });
    },
    async deleteMany({ where }: { where: { userId?: string; animeId: number } }) {
      databaseCalls += 1;
      for (const [id, row] of feedback) if (row.animeId === where.animeId && (where.userId === undefined || row.userId === where.userId)) feedback.delete(id);
    },
  },
};

mock.module('next/cache', { namedExports: { revalidatePath() {} } });
mock.module('../../lib/current-user.ts', { namedExports: {
  async requireUser() {
    if (!authenticatedUser) throw new Error('Unauthenticated');
    return users.get(authenticatedUser)!;
  },
} });
mock.module('../../lib/db.ts', { namedExports: { getDb: () => fakeDb } });
mock.module('../../lib/providers.ts', { namedExports: {
  async getAnimeDetails(animeId: number) {
    providerCalls += 1;
    return { mal_id: animeId, title: `Catalog title ${animeId}`, images: { jpg: { image_url: 'https://example.test/a.jpg', large_image_url: 'https://example.test/a.jpg' } }, synopsis: '', genres: [] };
  },
} });

const { saveAnime, removeAnime, saveProfile } = await import('./actions');
const { setFeedback } = await import('../feedback/actions');

beforeEach(() => {
  users.clear(); entries.clear(); feedback.clear();
  authenticatedUser = 'a'; databaseCalls = 0; providerCalls = 0;
  for (const id of ['a', 'b']) {
    users.set(id, { id, onboarded: true, displayName: `Viewer ${id}`, interests: ['Fantasy'], favoriteAnimes: ['Mushi-Shi'] });
    entries.set(key(id, 457), { userId: id, animeId: 457, status: id === 'a' ? 'watching' : 'completed', anime: { title: `Original ${id}`, mal_id: 457 }, addedAt: new Date('2007-01-01T00:00:00Z'), editedAt: null, deletedAt: null, legacyRaw: { original: id }, legacyProgress: 7 });
  }
});

test('a status edit reaches only the signed-in owner despite overlapping anime IDs', async () => {
  const other = structuredClone(entries.get('b:457'));
  const original = structuredClone(entries.get('a:457'))!;
  assert.equal((await saveAnime({ animeId: 457, status: 'dropped' })).ok, true);
  assert.equal(entries.get('a:457')?.status, 'dropped');
  assert.deepEqual(entries.get('b:457'), other);
  for (const field of ['anime', 'addedAt', 'legacyRaw', 'legacyProgress'] as const) assert.deepEqual(entries.get('a:457')?.[field], original[field]);
  assert.ok(entries.get('a:457')?.editedAt instanceof Date);
  assert.equal(providerCalls, 0);
});

test('removal is an owner-scoped tombstone and a forged owner is rejected', async () => {
  assert.equal((await removeAnime({ animeId: 457 })).ok, true);
  assert.ok(entries.get('a:457')?.deletedAt instanceof Date);
  assert.equal(entries.get('b:457')?.deletedAt, null);
  const calls = databaseCalls;
  assert.equal((await removeAnime({ animeId: 457, userId: 'b' })).ok, false);
  assert.equal((await saveAnime({ animeId: 457, status: 'watching', userId: 'b' })).ok, false);
  assert.equal(databaseCalls, calls);
});

test('saving a new title binds it to the signed-in internal ID', async () => {
  assert.equal((await saveAnime({ animeId: 42, status: 'plan_to_watch' })).ok, true);
  assert.equal(entries.get('a:42')?.status, 'plan_to_watch');
  assert.equal(entries.has('b:42'), false);
  assert.equal(providerCalls, 1);
});

test('profile editing cannot modify another user or reset completed onboarding', async () => {
  const other = structuredClone(users.get('b'));
  const draft = { displayName: 'New name', photoURL: null, interests: ['Drama'], favoriteAnimes: [], completeOnboarding: false };
  assert.equal((await saveProfile(draft)).ok, true);
  assert.equal(users.get('a')?.displayName, 'New name');
  assert.equal(users.get('a')?.onboarded, true);
  assert.deepEqual(users.get('b'), other);
  assert.equal((await saveProfile({ ...draft, userId: 'b' })).ok, false);
});

test('feedback creation and clearing remain isolated for the same anime ID', async () => {
  assert.equal((await setFeedback({ animeId: 457, value: 'like' })).ok, true);
  authenticatedUser = 'b';
  assert.equal((await setFeedback({ animeId: 457, value: 'dislike' })).ok, true);
  authenticatedUser = 'a';
  assert.equal((await setFeedback({ animeId: 457, value: null })).ok, true);
  assert.equal(feedback.has('a:457'), false);
  assert.deepEqual(feedback.get('b:457'), { userId: 'b', animeId: 457, value: 'dislike' });
});

test('anonymous actions stop before database or provider access', async () => {
  authenticatedUser = null;
  await assert.rejects(saveAnime({ animeId: 457, status: 'watching' }), /Unauthenticated/);
  await assert.rejects(removeAnime({ animeId: 457 }), /Unauthenticated/);
  await assert.rejects(saveProfile({}), /Unauthenticated/);
  await assert.rejects(setFeedback({ animeId: 457, value: 'like' }), /Unauthenticated/);
  assert.equal(databaseCalls, 0);
  assert.equal(providerCalls, 0);
});

test('section-local profile writes preserve newer values outside the edited section', async () => {
  users.get('a')!.interests = ['Newer taste'];
  const stale = { displayName: 'New name', photoURL: null, interests: ['Old taste'], favoriteAnimes: [], completeOnboarding: false };
  assert.equal((await saveProfile({ ...stale, section: 'identity' })).ok, true);
  assert.deepEqual(users.get('a')!.interests, ['Newer taste']);
  assert.equal((await saveProfile({ ...stale, displayName: 'Stale name', interests: ['Drama'], section: 'taste' })).ok, true);
  assert.equal(users.get('a')!.displayName, 'New name');
  assert.deepEqual(users.get('a')!.interests, ['Drama']);
});
