import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { verifyIdentityReceipt } from '../../src/lib/migration-identity';
import { normalize, validateExport, validateSourceUid } from './core';
import { outsideGitPath, writePrivateJson } from './files';
import { requireMatchingDryRun } from './plan';
import { backupDestination, importOneUser, inspectMigration, type MigrationReport } from './store';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const help = `One-user Firebase migration (no production writes or cutover)

export --source-uid UID --firebase-project-id PROJECT --out /outside-git/user.json
dry-run --source-uid UID --destination-user-id UUID --identity-receipt /outside-git/identity.json --file /outside-git/user.json [--report /outside-git/plan.json]
import --source-uid UID --destination-user-id UUID --identity-receipt /outside-git/identity.json --file /outside-git/user.json --dry-run-report /outside-git/plan.json --destination-backup /outside-git/before.json --confirm-write UID:UUID [--accept-issues] [--report /outside-git/result.json]
verify --source-uid UID --destination-user-id UUID --identity-receipt /outside-git/identity.json --file /outside-git/user.json [--report /outside-git/verification.json]

No command defaults to import. Without a command, dry-run is selected.
All backup, source-export, receipt and report paths must be absolute, outside every Git working tree. Outputs are new files with mode 0600; existing files are never replaced.
Destination commands require DATABASE_URL, NEON_AUTH_BASE_URL and MIGRATION_IDENTITY_SECRET. Obtain a short-lived identity receipt from the signed-in preview's /api/migration/identity endpoint.
Import additionally requires MIGRATION_TARGET=preview and refuses production process/Vercel environments. It writes only inside a serializable transaction, never changes Firebase, never overwrites an existing library key or newer profile, and retains deletion tombstones.
Exit codes: 0=planned/equivalent, 2=verification differences preserved for review, 1=invalid input or failed operation. Source problems are always reported; import with malformed fields requires explicit --accept-issues.
`;

function argumentsFor(args: string[]) {
  const commands = new Set(['export', 'dry-run', 'import', 'verify']);
  const command = args[0] && commands.has(args[0]) ? args.shift()! : 'dry-run';
  const allowed = new Set(['source-uid', 'firebase-project-id', 'out', 'destination-user-id', 'identity-receipt', 'file', 'report', 'dry-run-report', 'destination-backup', 'confirm-write', 'accept-issues']);
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const key = args[index].startsWith('--') ? args[index].slice(2) : '';
    if (!allowed.has(key) || result.has(key)) throw new Error(`Unknown or duplicate argument: ${args[index]}`);
    if (key === 'accept-issues') result.set(key, 'true');
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`--${key} requires an explicit value.`);
      result.set(key, value);
    }
  }
  const require = (name: string) => {
    const value = result.get(name);
    if (!value) throw new Error(`--${name} is required.`);
    return value;
  };
  return { command, flags: result, require };
}

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Use the dedicated preview branch configuration.`);
  return value;
}

function emitReport(report: MigrationReport, path?: string): void {
  if (path) writePrivateJson(path, report);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  if (process.argv.slice(2).some(arg => arg === '--help' || arg === '-h')) { console.log(help); return; }
  const { command, flags, require } = argumentsFor(process.argv.slice(2));
  const sourceUid = validateSourceUid(require('source-uid'));
  if (flags.has('report')) outsideGitPath(require('report'));
  if (command === 'export') {
    const { exportFirebaseUser } = await import('./export');
    const exported = await exportFirebaseUser({ sourceUid, projectId: require('firebase-project-id'), output: require('out') });
    console.log(JSON.stringify({ mode: 'read-only-export', sourceUid, sourcePath: exported.source.path, projectId: exported.source.projectId, sourceDigest: exported.sourceDigest, output: require('out'), normalization: normalize(exported).issues }, null, 2));
    return;
  }
  const destinationUserId = require('destination-user-id');
  const file = outsideGitPath(require('file'));
  const receiptFile = outsideGitPath(require('identity-receipt'));
  const snapshot = validateExport(JSON.parse(readFileSync(file, 'utf8')), sourceUid);
  // Verify the signed, expiring server-session proof before creating a DB client.
  const databaseUrl = environment('DATABASE_URL');
  const identity = verifyIdentityReceipt(JSON.parse(readFileSync(receiptFile, 'utf8')), {
    destinationUserId, authBaseUrl: environment('NEON_AUTH_BASE_URL'),
    databaseUrl, secret: environment('MIGRATION_IDENTITY_SECRET'),
  });
  if (command === 'import') {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' || process.env.MIGRATION_TARGET !== 'preview') throw new Error('Import is restricted to an explicitly configured preview target. Production writes/cutover are not enabled.');
    if (require('confirm-write') !== `${sourceUid}:${destinationUserId}`) throw new Error('--confirm-write must exactly match SOURCE_UID:DESTINATION_USER_ID.');
    requireMatchingDryRun(require('dry-run-report'), { sourceUid, destinationUserId, sourceDigest: snapshot.sourceDigest });
    outsideGitPath(require('destination-backup'));
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 15000 }) });
  try {
    const verified = { userId: identity.userId, authProviderId: identity.authProviderId, email: identity.email };
    if (command === 'import') {
      // This backup is intentionally outside the transaction. The write path is
      // insert-only and separately rechecks all state under lock inside it.
      writePrivateJson(require('destination-backup'), await backupDestination(db, snapshot, verified));
      const report = await importOneUser(db, snapshot, verified, { acceptIssues: flags.has('accept-issues') });
      emitReport(report, flags.get('report'));
      if (!report.equivalent) process.exitCode = 2;
    } else {
      const report = await inspectMigration(db, snapshot, verified, command === 'verify' ? 'verify' : 'dry-run');
      emitReport(report, flags.get('report'));
      if (command === 'verify' && !report.equivalent) process.exitCode = 2;
    }
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  // Do not dump credential-bearing connection URLs, session receipts, SDK
  // request objects or full database error objects into logs.
  const message = error instanceof Error ? error.message : 'Migration failed.';
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[database URL redacted]'));
  process.exitCode = 1;
});
