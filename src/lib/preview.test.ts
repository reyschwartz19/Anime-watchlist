import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewEnabled, previewIdentity, previewFailure, fixtureCatalog } from './preview';
import { createFixtureDatabase } from './fixture-db';

test('fixture guard refuses production regardless of URL or fixture cookie', async () => {
  const original = { flag: process.env.ANIME_PREVIEW_FIXTURES, node: process.env.NODE_ENV, vercel: process.env.VERCEL_ENV };
  try {
    process.env.ANIME_PREVIEW_FIXTURES = '1';
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'production';
    assert.equal(previewEnabled(), false);
    assert.equal(previewIdentity('anime_preview_user=viewer'), null);
    assert.equal(previewFailure('anime_preview_failure=profile'), null);
    assert.throws(createFixtureDatabase, /disabled/);
    env.NODE_ENV = 'development'; process.env.VERCEL_ENV = 'production';
    assert.equal(previewEnabled(), false);
    process.env.VERCEL_ENV = 'preview';
    delete process.env.ANIME_PREVIEW_FIXTURES;
    assert.equal(previewEnabled(), false);
    process.env.ANIME_PREVIEW_FIXTURES = '1';
    assert.equal(previewEnabled(), true);
    assert.equal(previewIdentity('anime_preview_user=anonymous'), null);
    assert.equal(previewIdentity('anime_preview_user=second')?.id, 'fixture-second');
    assert.equal(previewFailure('anime_preview_user=profile-error'), 'profile');
    assert.ok(fixtureCatalog().every(anime => Number.isInteger(anime.mal_id)));
  } finally {
    const env = process.env as Record<string, string | undefined>;
    for (const [key, value] of Object.entries({ ANIME_PREVIEW_FIXTURES: original.flag, NODE_ENV: original.node, VERCEL_ENV: original.vercel })) value === undefined ? delete env[key] : env[key] = value;
  }
});

test('isolated fixture adapter scopes composite keys, serializes retries and rolls back failed transactions', async () => {
  const env = process.env as Record<string, string | undefined>;
  const original = { flag: env.ANIME_PREVIEW_FIXTURES, node: env.NODE_ENV, vercel: env.VERCEL_ENV };
  env.ANIME_PREVIEW_FIXTURES = '1'; env.NODE_ENV = 'test'; env.VERCEL_ENV = 'preview';
  try {
    const db = createFixtureDatabase();
    const viewer = '00000000-0000-4000-8000-000000000001';
    const second = '00000000-0000-4000-8000-000000000003';
    const key = { userId_animeId: { userId: viewer, animeId: 457 } };
    await db.libraryEntry.update({ where: key, data: { status: 'dropped' } });
    assert.equal((await db.libraryEntry.findUnique({ where: { userId_animeId: { userId: second, animeId: 457 } } }))?.status, 'completed');
    await assert.rejects(() => db.$transaction(async tx => {
      await tx.libraryEntry.update({ where: key, data: { status: 'completed' } });
      throw new Error('interrupt');
    }), /interrupt/);
    assert.equal((await db.libraryEntry.findUnique({ where: key }))?.status, 'dropped');
    await Promise.all([1, 2].map(() => db.$transaction(async tx => {
      await tx.libraryEntry.upsert({ where: { userId_animeId: { userId: viewer, animeId: 205 } }, create: { userId: viewer, animeId: 205, status: 'plan_to_watch', anime: {}, addedAt: new Date() }, update: { status: 'plan_to_watch' } });
    })));
    assert.equal(await db.libraryEntry.count({ where: { userId: viewer, animeId: 205 } }), 1);
    assert.equal(await db.libraryEntry.count({ where: { userId: viewer, animeId: 205, deletedAt: null } }), 1, 'new fixture rows must apply Prisma nullable defaults so normal library queries can see saves');
  } finally {
    for (const [key, value] of Object.entries({ ANIME_PREVIEW_FIXTURES: original.flag, NODE_ENV: original.node, VERCEL_ENV: original.vercel })) value === undefined ? delete env[key] : env[key] = value;
  }
});
