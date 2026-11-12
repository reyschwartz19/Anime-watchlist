import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { previewEnabled } from './preview';
import { getFixtureDatabase } from './fixture-db';
import { databaseUrl, validatePreviewDatabasePair } from './environment';

const globalDb = globalThis as unknown as { animeDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (previewEnabled()) return getFixtureDatabase();
  if (globalDb.animeDb) return globalDb.animeDb;
  if (process.env.VERCEL_ENV === 'preview') validatePreviewDatabasePair();
  const connectionString = databaseUrl('DATABASE_URL');
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
  const db = new PrismaClient({ adapter });
  globalDb.animeDb = db;
  return db;
}
