import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function testsAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? testsAt(path) : entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const tests = process.argv.includes('--migration-only')
  ? testsAt('scripts/migration')
  : ['src', 'tests', 'scripts/migration'].flatMap(testsAt);
let failed = 0;
for (const path of tests.sort()) {
  console.log(`\nTesting ${path}`);
  const flags = path.endsWith('/ownership.test.ts') ? ['--experimental-test-module-mocks'] : [];
  const result = spawnSync(process.execPath, [...flags, '--import', 'tsx', path], { stdio: 'inherit', timeout: 90_000 });
  if (result.error || result.status !== 0) failed++;
}
console.log(`\n${tests.length - failed}/${tests.length} test files passed.`);
if (failed) process.exitCode = 1;
