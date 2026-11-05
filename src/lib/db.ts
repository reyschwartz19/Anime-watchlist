import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalDb = globalThis as unknown as { animeDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (globalDb.animeDb) return globalDb.animeDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be configured for this environment.');
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
  const db = new PrismaClient({ adapter });
  globalDb.animeDb = db;
  return db;
}
