import { Prisma, PrismaClient, type AppUser, type LibraryEntry, type MigrationBinding, type MigrationSnapshot } from '@prisma/client';
import { canonical, compareEntry, normalize, type Json, type NormalizedSource, type UserExport } from './core';

export interface DestinationIdentity { userId: string; authProviderId: string; email: string }
interface DestinationState {
  user: AppUser;
  entries: LibraryEntry[];
  binding: MigrationBinding | null;
  snapshot: MigrationSnapshot | null;
}

export interface MigrationReport {
  version: 1;
  mode: 'dry-run' | 'import' | 'verify';
  sourceUid: string;
  destinationUserId: string;
  sourceDigest: string;
  issues: NormalizedSource['issues'];
  rejectedSourceKeys: string[];
  profile: { field: string; result: 'equal' | 'copy' | 'preserve'; source: Json; destination: Json }[];
  entries: ReturnType<typeof compareEntry>[];
  destinationOnlyAnimeIds: number[];
  plannedInsertAnimeIds: number[];
  archive: 'missing' | 'equal' | 'different';
  equivalent: boolean;
}

type Tx = Prisma.TransactionClient;
function json(value: Json): Prisma.InputJsonValue | typeof Prisma.JsonNull { return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue; }

async function destinationState(tx: Tx, source: UserExport, identity: DestinationIdentity): Promise<DestinationState> {
  const user = await tx.appUser.findUnique({ where: { id: identity.userId } });
  if (!user || user.authProviderId !== identity.authProviderId || user.email !== identity.email) throw new Error('Verified destination identity no longer matches the internal user/auth-provider/email binding. Sign in again and download a fresh receipt.');
  const bindings = await tx.migrationBinding.findMany({ where: { OR: [{ userId: identity.userId }, { sourceUid: source.source.uid }] } });
  for (const binding of bindings) if (binding.userId !== identity.userId || binding.sourceUid !== source.source.uid || binding.sourceProjectId !== source.source.projectId || binding.sourcePath !== source.source.path) throw new Error('Source or destination is already bound to a different migration identity. No writes performed.');
  const binding = bindings[0] ?? null;
  const entries = await tx.libraryEntry.findMany({ where: { userId: identity.userId }, orderBy: { animeId: 'asc' } });
  const snapshot = binding ? await tx.migrationSnapshot.findUnique({ where: { bindingId_sourceDigest: { bindingId: binding.id, sourceDigest: source.sourceDigest } } }) : null;
  return { user, entries, binding, snapshot };
}

function reportFor(source: NormalizedSource, state: DestinationState, mode: MigrationReport['mode']): MigrationReport {
  const existing = new Map(state.entries.map(entry => [entry.animeId, entry]));
  const entries = source.entries.map(entry => compareEntry(entry, existing.get(entry.animeId) as Parameters<typeof compareEntry>[1]));
  const canCopyProfile = !state.binding && state.user.profileEditedAt === null;
  const profile = Object.entries(source.profile).map(([field, value]) => {
    const destination = state.user[field as keyof typeof source.profile] as Json;
    return { field, result: canonical(value as Json) === canonical(destination) ? 'equal' as const : canCopyProfile ? 'copy' as const : 'preserve' as const, source: value as Json, destination };
  });
  const archive = !state.snapshot ? 'missing' : canonical(state.snapshot.sourceDocument as Json) === canonical(source.snapshot.document) ? 'equal' : 'different';
  const destinationOnlyAnimeIds = state.entries.filter(entry => !source.entries.some(sourceEntry => sourceEntry.animeId === entry.animeId)).map(entry => entry.animeId);
  return {
    version: 1, mode, sourceUid: source.snapshot.source.uid, destinationUserId: state.user.id,
    sourceDigest: source.snapshot.sourceDigest, issues: source.issues, rejectedSourceKeys: source.rejectedSourceKeys,
    profile, entries, destinationOnlyAnimeIds,
    plannedInsertAnimeIds: entries.filter(entry => entry.result === 'missing').map(entry => entry.animeId),
    archive, equivalent: archive === 'equal' && destinationOnlyAnimeIds.length === 0 &&
      !source.issues.some(issue => issue.severity === 'error') &&
      entries.every(entry => entry.result === 'equal') && profile.every(field => field.result === 'equal'),
  };
}

export async function inspectMigration(db: PrismaClient, snapshot: UserExport, identity: DestinationIdentity, mode: 'dry-run' | 'verify' = 'dry-run'): Promise<MigrationReport> {
  const source = normalize(snapshot);
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return reportFor(source, await destinationState(tx, snapshot, identity), mode);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function backupDestination(db: PrismaClient, snapshot: UserExport, identity: DestinationIdentity): Promise<unknown> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const state = await destinationState(tx, snapshot, identity);
    const feedback = await tx.feedback.findMany({ where: { userId: identity.userId } });
    const snapshots = state.binding ? await tx.migrationSnapshot.findMany({ where: { bindingId: state.binding.id } }) : [];
    return { format: 'anime-watchlist-destination-backup', version: 1, capturedAt: new Date().toISOString(), sourceUid: snapshot.source.uid, destinationUserId: identity.userId, user: state.user, library: state.entries, feedback, binding: state.binding, snapshots };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

// The failure hook is an in-process test seam, never a CLI flag. PostgreSQL must
// roll back source binding, profile, entries and snapshot together on interruption.
export async function importOneUser(db: PrismaClient, snapshot: UserExport, identity: DestinationIdentity, options: { acceptIssues?: boolean; failAfter?: 'binding' | 'entries' | 'profile' } = {}): Promise<MigrationReport> {
  const source = normalize(snapshot);
  if (!options.acceptIssues && source.issues.some(issue => issue.severity === 'error')) throw new Error('Malformed source entries/fields require review. Dry-run first; use --accept-issues only after reviewing the report. Every original value will remain in the source snapshot.');
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // Serialize imports of this user and profile writes. The ID is a bound
        // parameter, never interpolated SQL. Library unique keys cover app races.
        await tx.$queryRaw`SELECT "id" FROM "AppUser" WHERE "id" = ${identity.userId}::uuid FOR UPDATE`;
        const state = await destinationState(tx, snapshot, identity);
        const before = reportFor(source, state, 'import');
        if (before.archive === 'different') throw new Error('Existing archived source digest has different content; stopped.');
        const binding = state.binding ?? await tx.migrationBinding.create({ data: {
          sourceUid: snapshot.source.uid, sourceProjectId: snapshot.source.projectId,
          sourcePath: snapshot.source.path, userId: identity.userId,
        } });
        if (options.failAfter === 'binding') throw new Error('Fixture interruption after binding');
        const missingIds = new Set(before.plannedInsertAnimeIds);
        const missing = source.entries.filter(entry => missingIds.has(entry.animeId));
        if (missing.length) await tx.libraryEntry.createMany({ data: missing.map(entry => ({
          userId: identity.userId, animeId: entry.animeId, status: entry.status,
          anime: json(entry.anime), addedAt: entry.addedAt, editedAt: null,
          legacyRaw: json(entry.legacyRaw), legacyProgress: entry.legacyProgress === undefined ? Prisma.DbNull : json(entry.legacyProgress),
          importSourceDigest: snapshot.sourceDigest,
        })), skipDuplicates: true });
        if (options.failAfter === 'entries') throw new Error('Fixture interruption after entries');
        // A previous import or an actual profile edit is never overwritten.
        if (!state.binding && state.user.profileEditedAt === null && Object.keys(source.profile).length) await tx.appUser.update({ where: { id: identity.userId }, data: source.profile });
        if (options.failAfter === 'profile') throw new Error('Fixture interruption after profile');
        if (!state.snapshot) await tx.migrationSnapshot.create({ data: {
          bindingId: binding.id, sourceDigest: snapshot.sourceDigest,
          sourceDocument: json(snapshot.document), report: json(before as unknown as Json),
          exportedAt: new Date(snapshot.exportedAt), sourceReadTime: json(snapshot.sourceReadTime), sourceUpdateTime: json(snapshot.sourceUpdateTime),
        } });
        return reportFor(source, await destinationState(tx, snapshot, identity), 'import');
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 120000 });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
      // With a JS driver adapter, PostgreSQL 40001/40P01 from the bound raw
      // row lock is wrapped as P2010 rather than Prisma's usual P2034.
      const meta = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : undefined;
      const adapter = meta?.driverAdapterError as { cause?: { originalCode?: string; kind?: string } } | undefined;
      const pgCode = adapter?.cause?.originalCode;
      const retryable = code === 'P2034' || code === 'P2002' ||
        (code === 'P2010' && (pgCode === '40001' || pgCode === '40P01' || adapter?.cause?.kind === 'TransactionWriteConflict'));
      if (attempt >= 2 || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
