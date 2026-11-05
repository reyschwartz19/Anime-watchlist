import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnPath } from './return-path';
test('details return paths retain search queries and all library filters without allowing foreign redirects', () => {
  for (const path of ['/library?status=dropped&q=long+title', '/search?q=Samurai%20Champloo', '/recommendations']) assert.equal(safeReturnPath(path), path);
  for (const path of ['//foreign.test', '/\\foreign.test', '/api/me', '/profile', '/library/elsewhere', 'https://foreign.test/library', ['search'], null]) assert.equal(safeReturnPath(path), '/recommendations');
});
