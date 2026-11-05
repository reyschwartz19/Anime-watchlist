import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing retry QA against a non-fixture app.');
const folder = resolve('docs/design/evidence/manga-shelf');
await mkdir(folder, { recursive: true });
const checks = [];
const requests = [];
const interceptions = [];
const interceptionErrors = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const b = await openBrowser(base);
const lead = () => b.evaluate(`(()=>{const a=document.querySelector('.featured-pick h2 a');return a?{title:a.textContent,id:Number(a.getAttribute('href').match(/anime\\/(\\d+)/)[1])}:null})()`);
const picks = () => b.evaluate(`[...document.querySelectorAll('.featured-pick h2 a,.secondary-pick>a')].map(a=>Number(a.getAttribute('href').match(/anime\\/(\\d+)/)[1]))`);
const libraryHas = id => b.evaluate(`(async()=>{const html=await(await fetch('/library?status=all',{cache:'no-store'})).text();const doc=new DOMParser().parseFromString(html,'text/html');return [...doc.querySelectorAll('.anime-card a')].some(a=>a.getAttribute('href')?.startsWith('/anime/${id}?'))})()`);
async function scenario(name, run) {
  try { const details = await run(); checks.push({ name, pass: true, ...(details ? { details } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, pass: false, details: { message: error.message, body: await b.evaluate('document.body.innerText').catch(() => '') } }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
}
b.on('Network.requestWillBeSent', event => {
  if (event.request.method !== 'POST' || new URL(event.request.url).pathname !== '/recommendations') return;
  const body = event.request.postData ?? '';
  const operationId = body.match(/operationId\\*"\s*:\s*\\*"([0-9a-f-]{36})/i)?.[1] ?? null;
  const action = body.match(/action\\*"\s*:\s*\\*"(save|watched|not_interested|strong_dismiss|not_tonight)/)?.[1] ?? (body.includes('undoToken') ? 'undo' : 'generation');
  requests.push({ action, operationId });
});
let dropNext = true;
b.on('Fetch.requestPaused', event => {
  void (async () => {
    if (dropNext && event.request.method === 'POST' && new URL(event.request.url).pathname === '/recommendations') {
      dropNext = false;
      interceptions.push({ path: '/recommendations', method: 'POST', responseStatusCode: event.responseStatusCode, responseStage: typeof event.responseStatusCode === 'number', deliberatelyDropped: true });
      await b.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' });
    } else await b.send('Fetch.continueRequest', { requestId: event.requestId });
  })().catch(error => interceptionErrors.push(error.message));
});
let selected;
try {
  await b.cookie('anime_preview_user', 'second');
  await b.navigate('/recommendations');
  const second = await b.evaluate(`fetch('/api/me').then(response=>response.json())`);
  assert(second.authProviderId === 'fixture-second', 'Browser did not resolve the isolated second fixture account.');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.evaluate(`document.querySelector('.discover-controls button[type="submit"]').click()`);
  await b.wait('!!document.querySelector(".featured-pick")');
  selected = await lead();
  assert(selected, 'Generation produced no lead.');
  await scenario('generated batch survives Details and Back to Discover', async () => {
    const before = await picks();
    await b.evaluate(`document.querySelector('.featured-pick h2 a').click()`);
    await b.wait(`location.pathname==='/anime/${selected.id}' && !!document.querySelector('#detail-status')`);
    const href = await b.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Back to Discover'))?.getAttribute('href')`);
    assert(href === '/recommendations', `Unexpected Back link: ${href}`);
    await b.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Back to Discover')).click()`);
    await b.wait(`location.pathname==='/recommendations' && !!document.querySelector('.featured-pick')`);
    const after = await picks();
    assert(JSON.stringify(before) === JSON.stringify(after), `Batch changed on return: ${JSON.stringify({before,after})}`);
    return { before, after, restoration: 'Persisted request ID is reloaded through the owner-checked server generation action.' };
  });
  await scenario('lost Save response keeps the old lead and displays local retry recovery', async () => {
    assert(!await libraryHas(selected.id), 'Generated new-mode lead was already on the second user shelf.');
    await b.send('Fetch.enable', { patterns: [{ urlPattern: `${base}/recommendations*`, requestStage: 'Response' }] });
    await b.clickText('Save', '.featured-pick button');
    await b.wait(`document.body.innerText.includes('We couldn’t confirm your choice. Retry the same action to safely check it.')`);
    assert((await lead())?.id === selected.id, 'The old lead disappeared after its response was lost.');
    assert(interceptions.length === 1 && interceptions[0].responseStage && interceptions[0].responseStatusCode === 200, 'A successful server response was not deliberately lost.');
    assert(await libraryHas(selected.id), 'The server did not commit Save before its response was lost.');
    await b.send('Fetch.disable');
    return { selected, serverCommitVisibleOnMyList: true, oldLeadRetained: true, recoveryMessage: 'We couldn’t confirm your choice. Retry the same action to safely check it.' };
  });
  await scenario('same Save retry succeeds and Undo restores the original absent shelf state', async () => {
    await b.clickText('Save', '.featured-pick button');
    await b.wait(`!document.querySelector('.featured-pick h2 a[href^="/anime/${selected.id}?"]') && [...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Undo'&&!button.disabled)`);
    const saveRequests = requests.filter(request => request.action === 'save');
    assert(saveRequests.length === 2, `Expected two Save requests, observed ${saveRequests.length}.`);
    if (saveRequests.every(request => request.operationId)) assert(saveRequests[0].operationId === saveRequests[1].operationId, 'Save retry used a different operation UUID.');
    assert(await libraryHas(selected.id), 'Successful retry did not leave the title saved before Undo.');
    await b.clickText('Undo');
    await b.wait(`document.body.innerText.includes('Undone. Your previous choice is restored.')`);
    assert((await lead())?.id === selected.id, 'Undo did not restore the original lead.');
    await b.navigate('/library?status=all');
    assert(!await b.evaluate(`[...document.querySelectorAll('.anime-card a')].some(a=>a.getAttribute('href')?.startsWith('/anime/${selected.id}?'))`), 'Undo left the title on My List; a retried event may have masked the original before-image.');
    return { saveRequests, sameOperationId: saveRequests.every(request => request.operationId) ? saveRequests[0].operationId === saveRequests[1].operationId : 'Action payload did not expose the operation UUID.', undoRemovedTitleFromMyList: true };
  });
  assert(interceptionErrors.length === 0, interceptionErrors.join('; '));
} catch (error) {
  process.exitCode = 1;
} finally {
  await b.send('Fetch.disable').catch(() => {});
  await writeFile(`${folder}/retry-recovery-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), base, fixtureBoundary: { server: 'Existing isolated Next fixture server on localhost:3067.', initialApiMe: identity.authProviderId, browserIdentity: 'fixture-second', cookie: 'anime_preview_user=second', profile: 'Fresh owned Chrome profile, removed after run.', services: 'In-memory fixture database, fixture catalog, fixture recommendation ranking and fixture authentication only. No live OAuth, email, catalog, Groq or real database.', failure: 'One local /recommendations POST response dropped with CDP Fetch.failRequest only after the successful HTTP response reached the browser.' }, selected, checks, interceptions, requests, interceptionErrors, browserRuntimeErrors: b.errors }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length }));
