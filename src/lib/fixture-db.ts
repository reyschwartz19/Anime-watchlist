import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { fixtureCatalog, previewEnabled } from './preview';

// Only this adapter uses broad records: it emulates a bounded Prisma surface for
// isolated browser QA. No database connection is constructed in fixture mode.
type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; create?: Row; update?: Row; select?: Row; include?: Row; orderBy?: Row | Row[]; take?: number };
type Tables = Record<string, Row[]>;
const tableNames = ['appUser', 'libraryEntry', 'feedback', 'recommendationBatch', 'recommendationEvent', 'migrationBinding', 'migrationSnapshot'];
const clone = <T>(value: T): T => structuredClone(value);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (Array.isArray(condition) ? condition : [condition]).every(value => matches(row, value as Row));
    if (key === 'OR') return (condition as Row[]).some(value => matches(row, value));
    if (key === 'NOT') return !(Array.isArray(condition) ? condition : [condition]).some(value => matches(row, value as Row));
    if (!(key in row) && condition && typeof condition === 'object' && !Array.isArray(condition)) return matches(row, condition as Row);
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      const op = condition as Row;
      if ('equals' in op && value !== op.equals) return false;
      if ('not' in op && value === op.not) return false;
      if ('in' in op && !(op.in as unknown[]).includes(value)) return false;
      if ('notIn' in op && (op.notIn as unknown[]).includes(value)) return false;
      if ('gte' in op && !((value as number) >= (op.gte as number))) return false;
      if ('gt' in op && !((value as number) > (op.gt as number))) return false;
      if ('lte' in op && !((value as number) <= (op.lte as number))) return false;
      if ('lt' in op && !((value as number) < (op.lt as number))) return false;
      return true;
    }
    return value === condition || (value instanceof Date && condition instanceof Date && +value === +condition);
  });
}

export function createFixtureDatabase() {
  if (!previewEnabled()) throw new Error('Preview fixtures are disabled.');
  let tables: Tables = Object.fromEntries(tableNames.map(name => [name, []]));
  const now = new Date('2026-11-05T10:00:00Z');
  for (const [index, key] of ['viewer', 'new', 'second'].entries()) {
    tables.appUser.push({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      authProviderId: `fixture-${key}`, email: `${key}@example.test`, displayName: key === 'second' ? 'Second viewer' : 'Remy',
      photoURL: null, interests: key === 'new' ? [] : ['Adventure', 'Mystery', 'Drama'],
      favoriteAnimes: key === 'new' ? [] : ['Mushi-Shi', 'Cowboy Bebop'],
      onboarded: key !== 'new', profileEditedAt: null, createdAt: now, updatedAt: now,
    });
  }
  const catalog = fixtureCatalog();
  const owner = tables.appUser[0].id;
  for (const [animeId, status] of [[457, 'watching'], [1, 'completed'], [5114, 'plan_to_watch'], [9253, 'plan_to_watch'], [20, 'dropped']] as const) {
    tables.libraryEntry.push({ userId: owner, animeId, status, anime: catalog.find(anime => anime.mal_id === animeId), addedAt: now, editedAt: null, deletedAt: null, legacyRaw: null, legacyProgress: null, importSourceDigest: null });
  }
  tables.libraryEntry.push({ ...clone(tables.libraryEntry[0]), userId: tables.appUser[2].id, status: 'completed' });

  const db: Record<string, unknown> = {};
  function project(row: Row, query: Query): Row {
    const result = clone(row);
    if (!query.select) return result;
    return Object.fromEntries(Object.keys(query.select).filter(key => query.select![key]).map(key => [key, result[key]]));
  }
  for (const name of tableNames) {
    const find = (query: Query = {}) => tables[name].filter(row => matches(row, query.where));
    const insert = (data: Row) => {
      const row: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...clone(data) };
      if (name === 'libraryEntry') Object.assign(row, { addedAt: null, editedAt: null, deletedAt: null, legacyRaw: null, legacyProgress: null, importSourceDigest: null, ...clone(data) });
      if (name === 'feedback') Object.assign(row, { value: null, reason: null, dismissal: null, dismissalReason: null, title: null, ...clone(data) });
      if (name === 'recommendationEvent') Object.assign(row, { reason: null, previousLibrary: null, previousFeedback: null, undoTokenHash: null, undoneAt: null, ...clone(data) });
      const unique = name === 'libraryEntry' || name === 'feedback' ? ['userId', 'animeId'] : name === 'migrationSnapshot' ? ['bindingId', 'sourceDigest'] : ['id'];
      if (tables[name].some(existing => unique.every(key => existing[key] === row[key])) ||
          (name === 'appUser' && tables[name].some(existing => existing.authProviderId === row.authProviderId))) {
        throw Object.assign(new Error('Duplicate fixture key.'), { code: 'P2002' });
      }
      tables[name].push(row);
      return row;
    };
    db[name] = {
      async findMany(query: Query = {}) {
        const rows = find(query);
        for (const order of [...(Array.isArray(query.orderBy) ? query.orderBy : query.orderBy ? [query.orderBy] : [])].reverse()) {
          for (const [key, direction] of Object.entries(order)) rows.sort((a, b) => (a[key] === b[key] ? 0 : (a[key] as number) < (b[key] as number) ? -1 : 1) * (direction === 'desc' ? -1 : 1));
        }
        return rows.slice(0, query.take ?? rows.length).map(row => project(row, query));
      },
      async findFirst(query: Query = {}) { const row = find(query)[0]; return row ? project(row, query) : null; },
      async findUnique(query: Query) { const row = find(query)[0]; return row ? project(row, query) : null; },
      async findUniqueOrThrow(query: Query) { const row = find(query)[0]; if (!row) throw new Error('Fixture row missing.'); return project(row, query); },
      async count(query: Query = {}) { return find(query).length; },
      async create(query: Query) { return project(insert(query.data ?? {}), query); },
      async createMany(query: { data: Row[]; skipDuplicates?: boolean }) {
        let count = 0;
        for (const data of query.data) {
          try { insert(data); count++; }
          catch (error) { if (!query.skipDuplicates || (error as { code?: string }).code !== 'P2002') throw error; }
        }
        return { count };
      },
      async update(query: Query) { const row = find(query)[0]; if (!row) throw new Error('Fixture row missing.'); Object.assign(row, { updatedAt: new Date() }, clone(query.data ?? {})); return project(row, query); },
      async updateMany(query: Query) { const rows = find(query); rows.forEach(row => Object.assign(row, { updatedAt: new Date() }, clone(query.data ?? {}))); return { count: rows.length }; },
      async upsert(query: Query) { let row = find(query)[0]; if (row) Object.assign(row, { updatedAt: new Date() }, clone(query.update ?? {})); else row = insert(query.create ?? {}); return project(row, query); },
      async deleteMany(query: Query) { const rows = find(query); tables[name] = tables[name].filter(row => !rows.includes(row)); return { count: rows.length }; },
    };
  }
  let queue = Promise.resolve();
  db.$transaction = async (operation: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[]) => {
    if (Array.isArray(operation)) return Promise.all(operation);
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const snapshot = clone(tables);
    try { return await operation(db); }
    catch (error) { tables = snapshot; throw error; }
    finally { release(); }
  };
  db.$disconnect = async () => {};
  return db as unknown as PrismaClient;
}

const scope = globalThis as unknown as { animeFixtureDb?: PrismaClient };
export function getFixtureDatabase(): PrismaClient {
  if (!previewEnabled()) throw new Error('Preview fixtures are disabled.');
  return scope.animeFixtureDb ??= createFixtureDatabase();
}
