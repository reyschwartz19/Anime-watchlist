import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogSearchInput, searchPath } from './search';

test('catalog search bounds pagination and text without allowing forged ownership', () => {
  assert.deepEqual(catalogSearchInput.parse({ query: '  鬼滅の刃  ', page: 2 }), { query: '鬼滅の刃', page: 2 });
  for (const page of [0, -1, 1.5, 1001, Infinity, NaN]) assert.equal(catalogSearchInput.safeParse({ query: 'One Punch Man', page }).success, false);
  assert.equal(catalogSearchInput.safeParse({ query: 'x'.repeat(201) }).success, false);
  assert.equal(catalogSearchInput.safeParse({ query: 'Cowboy Bebop', userId: 'another-user' }).success, false);
});

test('return URLs preserve the exact title and page with a fixed safe route', () => {
  assert.equal(searchPath('  One Punch Man  ', 2), '/search?q=One+Punch+Man&page=2');
  assert.equal(searchPath(''), '/search');
  assert.equal(searchPath('a&from=//attacker.test'), '/search?q=a%26from%3D%2F%2Fattacker.test');
});
