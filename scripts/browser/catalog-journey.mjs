import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3071';
const folder = resolve(process.env.ANIME_QA_OUTPUT_DIR ?? '/tmp/manga-catalog-qa');
await mkdir(folder, { recursive: true });
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing writes against a non-fixture app.');
const b = await openBrowser(base);
const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function scenario(name, action) {
  try { await action(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, pass: false, message: error.message }); console.log(`FAIL ${name}: ${error.message}`); await b.screenshot(`${folder}/catalog-failure-${checks.length}.png`).catch(() => {}); }
}
try {
  await b.cookie('anime_preview_user', 'second');
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await scenario('manual Completed save preserves query and scroll, repeated clicks keep one entry', async () => {
    await b.navigate('/search?q=a');
    await b.wait('document.querySelectorAll(".search-entry").length>3');
    await b.evaluate(`(()=>{const row=[...document.querySelectorAll('.search-entry')].at(-1);row.dataset.testTarget='true';const select=row.querySelector('select');select.value='completed';select.dispatchEvent(new Event('change',{bubbles:true}));row.scrollIntoView({block:'center'});})()`);
    const before = await b.evaluate(`({scroll:scrollY,id:Number(document.querySelector('[data-test-target] a').getAttribute('href').split('/')[2].split('?')[0])})`);
    await b.evaluate(`(()=>{const button=document.querySelector('[data-test-target] .primary');button.click();button.click()})()`);
    await b.wait(`!![...document.querySelectorAll('.search-entry')].find(row=>row.querySelector('a').getAttribute('href').startsWith('/anime/${before.id}?')&&row.innerText.includes('On your shelf: Completed'))`);
    const after = await b.evaluate('({scroll:scrollY,path:location.pathname,query:new URLSearchParams(location.search).get("q")})');
    assert(after.path === '/search' && after.query === 'a', 'Search query changed on save.');
    assert(Math.abs(after.scroll - before.scroll) <= 64, `Scroll changed: ${before.scroll} → ${after.scroll}`);
    await b.screenshot(`${folder}/catalog-inline-save-phone.png`, false, true);
    await b.navigate('/library?status=completed');
    assert(await b.evaluate(`[...document.querySelectorAll('.anime-card a')].filter(a=>a.getAttribute('href').startsWith('/anime/${before.id}?')).length===1`), 'Repeated save produced duplicate/missing entries.');
    await b.navigate('/recommendations');
    await b.evaluate('document.querySelector(".discover-controls button[type=submit]").click()');
    await b.wait('!!document.querySelector(".featured-pick") || !!document.querySelector("[role=alert]")');
    assert(!await b.evaluate(`!!document.querySelector('a[href^="/anime/${before.id}?"]')`), 'Completed title appeared in new picks.');
  });
  await scenario('debounced searches discard older responses and preserve the latest phrase in the URL', async () => {
    await b.navigate('/search');
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: -1, uploadThroughput: -1 });
    await b.input('#anime-query', 'Samurai'); await pause(400); await b.input('#anime-query', 'One');
    await b.wait('document.querySelector(".search-entry h2")?.textContent.includes("One Punch Man") && new URLSearchParams(location.search).get("q")==="One"');
    await pause(1200);
    assert(!await b.evaluate('[...document.querySelectorAll(".search-entry h2")].some(node=>node.textContent.includes("Samurai"))'), 'An earlier response replaced the latest search.');
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.screenshot(`${folder}/catalog-search-phone.png`);
  });
  await scenario('search controls fit phone, desktop and equivalent 200% reflow', async () => {
    for (const [width,height,scale] of [[390,844,1],[1440,900,1],[720,450,2]]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: width<600 });
      await b.navigate('/search?q=a');
      assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), `Horizontal overflow at ${width}×${height}.`);
      assert(await b.evaluate('new Set([...document.querySelectorAll("select")].map(node=>node.id)).size===document.querySelectorAll("select").length'), 'Status selectors have duplicate IDs.');
      await b.screenshot(`${folder}/catalog-search-${width}.png`, false);
    }
  });
  await scenario('details retains search page and has a canonical MAL source link', async () => {
    await b.navigate('/anime/205?from=%2Fsearch%3Fq%3DSamurai%26page%3D2');
    assert(await b.evaluate(`!!document.querySelector('a[href="/search?q=Samurai&page=2"]')`), 'Return query/page was lost.');
    assert(await b.evaluate(`!!document.querySelector('a[href="https://myanimelist.net/anime/205"]')`), 'Canonical MAL link missing.');
  });
  checks.push({ name: 'no uncaught browser exceptions', pass: b.errors.length === 0, errors: b.errors });
} finally {
  await writeFile(`${folder}/catalog-checks.json`, JSON.stringify({ configuration: 'Isolated in-memory fixtures; no live auth, database, catalog or model certification.', checks }, null, 2));
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check=>check.pass).length, failed: checks.filter(check=>!check.pass).length }));
if (checks.some(check=>!check.pass)) process.exitCode=1;
