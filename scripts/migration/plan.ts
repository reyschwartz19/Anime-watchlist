import { readFileSync, statSync } from 'node:fs';
import { outsideGitPath } from './files';

/** Match the reviewed plan to both identities and the exact immutable export. */
export function requireMatchingDryRun(path: string, expected: { sourceUid: string; destinationUserId: string; sourceDigest: string }): void {
  const physical = outsideGitPath(path);
  if ((statSync(physical).mode & 0o077) !== 0) throw new Error('The dry-run report must be private (chmod 600).');
  const value: unknown = JSON.parse(readFileSync(physical, 'utf8'));
  if (!value || typeof value !== 'object') throw new Error('A prior matching dry-run report is required.');
  const report = value as Record<string, unknown>;
  if (report.version !== 1 || report.mode !== 'dry-run' ||
      report.sourceUid !== expected.sourceUid || report.destinationUserId !== expected.destinationUserId || report.sourceDigest !== expected.sourceDigest ||
      !Array.isArray(report.entries) || !Array.isArray(report.profile) || !Array.isArray(report.issues) || !Array.isArray(report.plannedInsertAnimeIds)) {
    throw new Error('The dry-run report does not match this source export and destination. Run and review a new dry-run first.');
  }
}
