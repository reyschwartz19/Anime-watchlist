import { existsSync, realpathSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function outsideGitPath(input: string): string {
  if (!isAbsolute(input)) throw new Error('Backup, receipt and report paths must be absolute and outside Git.');
  const absolute = resolve(input);
  const physical = existsSync(absolute) ? realpathSync(absolute) : resolve(realpathSync(dirname(absolute)), absolute.split('/').at(-1)!);
  const withinRepo = relative(realpathSync(repositoryRoot), physical);
  if (withinRepo === '' || (withinRepo !== '..' && !withinRepo.startsWith(`..${sep}`) && !isAbsolute(withinRepo))) throw new Error('Backups/receipts/reports must remain outside the repository, including through symlinks.');
  let current = dirname(physical);
  while (true) {
    const marker = resolve(current, '.git');
    // Worktrees can use a .git file. A real Git directory has HEAD. Some
    // restricted runners mount an empty, read-only .git directory in /tmp;
    // that is not a repository. Unreadable markers fail closed via readdir.
    if (existsSync(marker) && (statSync(marker).isFile() || readdirSync(marker).includes('HEAD'))) {
      throw new Error('Backups/receipts/reports must be outside every Git working tree.');
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return physical;
}

export function writePrivateJson(path: string, value: unknown): void {
  const target = outsideGitPath(path);
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
