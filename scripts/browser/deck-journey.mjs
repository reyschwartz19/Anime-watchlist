import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';
const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3071';
const folder = resolve(process.env.ANIME_QA_OUTPUT_DIR ?? '/tmp/manga-deck-qa');
await mkdir(folder, { recursive: true });
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing writes outside the isolated fixture app.');
const covers = process.env.ANIME_QA_COVERS ? JSON.parse(await readFile(process.env.ANIME_QA_COVERS, 'utf8')) : {};
const b = await openBrowser(base);
const checks = []; const requests = []; let realCoverResponses = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
b.on('Network.requestWillBeSent', event => { if (event.request.method === 'POST') requests.push({ action: Object.entries(event.request.headers).find(([name]) => name.toLowerCase() === 'next-action')?.[1] }); });
b.on('Fetch.requestPaused', async event => {
  try {
    const url = new URL(event.request.url); const cover = covers[url.searchParams.get('title')];
    if (url.pathname === '/preview/poster.svg' && cover) { realCoverResponses++; await b.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: cover.type }], body: cover.body }); }
    else await b.send('Fetch.continueRequest', { requestId: event.requestId });
  } catch { await b.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {}); }
});
async function scenario(name, action) {
  try { await action(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, pass: false, message: error.message }); console.log(`FAIL ${name}: ${error.message}`); await b.screenshot(`${folder}/failure-${checks.length}.png`).catch(() => {}); }
}
async function size(width, height) { await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
async function field(selector, value) {
  assert(await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), `Missing field ${selector}`);
}
try {
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${base}/preview/poster.svg*`, requestStage: 'Request' }] });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await size(1440, 900);
  await scenario('automatic Watch next loads five covers without a mood request', async () => {
    await b.navigate('/recommendations'); await b.wait('document.querySelectorAll(".watch-next-item").length===5');
    await b.wait('[...document.querySelectorAll(".watch-next-art img")].every(img=>img.complete&&img.naturalWidth>0)');
    assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Home overflows.');
    if (process.env.ANIME_QA_COVERS) assert(realCoverResponses >= 5, 'Real covers were not rendered.');
    await b.screenshot(`${folder}/home-desktop.png`, false);
  });
  let homeAction;
  await scenario('opening a five-card deck needs no new request', async () => {
    homeAction = requests[0]?.action; const before = requests.length;
    await b.clickText('Start swiping'); await b.wait('!!document.querySelector(".swipe-card")');
    assert(await b.evaluate('document.querySelector(".deck-heading p").textContent.includes("5 picks")'), 'Expected five cards.');
    assert(requests.length === before, 'Opening deck sent another server request.');
    await b.screenshot(`${folder}/deck-desktop.png`, false, true);
  });
  await scenario('left swipe advances immediately and Undo restores the cached card', async () => {
    const title = await b.evaluate('document.querySelector(".deck-copy h3").textContent');
    const box = await b.evaluate('(()=>{const r=document.querySelector(".deck-art").getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+80}})()');
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    for (const dx of [30, 70, 120]) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x - dx, y: box.y, buttons: 1 }); await pause(45); }
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x - 120, y: box.y, button: 'left', clickCount: 1 });
    await b.wait(`document.querySelector('.deck-copy h3')?.textContent!==${JSON.stringify(title)} && document.querySelector('.deck-heading p')?.textContent.includes('4 picks')`);
    await b.wait('!!document.querySelector(".undo-notice button") && !document.querySelector(".undo-notice button").disabled');
    assert(requests.filter(item => item.action === homeAction).length === 1, 'Swipe regenerated Watch next.');
    await b.clickText('Undo'); await b.wait('document.querySelector(".deck-heading p")?.textContent.includes("5 picks")');
  });
  await scenario('rapid visible Pass actions consume the existing deck without blocking the next card', async () => {
    await b.clickText('Pass for tonight'); await b.wait('document.querySelector(".deck-heading p")?.textContent.includes("4 picks")');
    await b.clickText('Pass for tonight'); await b.wait('document.querySelector(".deck-heading p")?.textContent.includes("3 picks")');
    assert(requests.filter(item => item.action === homeAction).length === 1, 'Pass called the model again.');
    await b.wait('!document.querySelector(".undo-notice button")?.disabled');
  });
  await scenario('right swipe saves the lead pick and Undo restores it', async () => {
    const box = await b.evaluate('(()=>{const r=document.querySelector(".deck-art").getBoundingClientRect();return {x:r.x+80,y:r.y+80}})()');
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    for (const dx of [30, 70, 120]) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + dx, y: box.y, buttons: 1 }); await pause(45); }
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 120, y: box.y, button: 'left', clickCount: 1 });
    await b.wait('document.querySelector(".deck-heading p")?.textContent.includes("2 picks")');
    await b.wait('document.querySelector(".undo-notice")?.textContent.includes("Saved") && !document.querySelector(".undo-notice button")?.disabled');
    await b.clickText('Undo'); await b.wait('document.querySelector(".deck-heading p")?.textContent.includes("3 picks")');
    await b.evaluate('document.querySelector(".deck-more").open=true;document.querySelector(".deck-more input").focus()');
    await b.screenshot(`${folder}/deck-more-focus.png`, false, true);
  });
  await scenario('viewing notes persist and are searchable within the owner’s library', async () => {
    await b.navigate('/anime/1?from=%2Flibrary%3Fstatus%3Dcompleted');
    await b.wait('!!document.querySelector(".viewing-notes")');
    await field('#liked-1', 'Fluid character animation and swordfight choreography');
    await field('#disliked-1', 'Filler episodes'); await field('#visual-1', 'Loved the painted backgrounds and expressive 2D animation');
    await field('#comment-1', 'Jazz soundtrack and a satisfying ending.');
    await b.clickText('Liked it'); await b.clickText('Save viewing notes');
    await b.wait('document.querySelector(".viewing-notes [role=status]")?.textContent.includes("Notes saved")');
    await b.navigate('/anime/1?from=%2Flibrary%3Fstatus%3Dcompleted');
    assert(await b.evaluate('document.querySelector("#liked-1").value.includes("choreography")'), 'Notes did not persist.');
    await b.evaluate('document.querySelector("#viewing-notes").scrollIntoView({block:"start"})');
    await b.screenshot(`${folder}/notes-desktop.png`, false, true);
    await b.navigate('/library?status=completed&q=choreography');
    assert(await b.evaluate('document.querySelectorAll(".anime-card").length===1 && document.querySelector(".anime-card h2").textContent==="Cowboy Bebop"'), 'Notes are not searchable.');
  });
  await scenario('another account cannot read or edit the owner’s notes', async () => {
    await b.cookie('anime_preview_user', 'second'); await b.navigate('/anime/1');
    assert(await b.evaluate('!document.querySelector(".viewing-notes")&&!document.body.textContent.includes("swordfight choreography")'), 'Private notes leaked.');
    await b.cookie('anime_preview_user', 'viewer');
  });
  await scenario('search rows, long titles and broken covers stay within their frames at every target size', async () => {
    for (const [width,height] of [[1363,647],[390,844],[720,450]]) {
      await size(width,height); await b.navigate('/search?q=a');
      await b.wait('document.querySelectorAll(".search-entry").length>3');
      await b.evaluate(`(()=>{const rows=[...document.querySelectorAll('.search-entry')];const names=['Naruto: Shippuuden Movie 1 — A very long title with an even longer alternate subtitle','Boruto: Naruto the Movie — Special Edition'];rows.slice(0,2).forEach((row,index)=>{row.querySelector('h2 a').firstChild.textContent=names[index]});const img=rows[0].querySelector('img');if(img)img.dispatchEvent(new Event('error'));})()`);
      await pause(100);
      const geometry = await b.evaluate('({overflow:document.documentElement.scrollWidth>innerWidth,rows:[...document.querySelectorAll(".search-entry")].map(row=>{const a=row.querySelector(".search-cover").getBoundingClientRect(),c=row.querySelector(".result-copy").getBoundingClientRect(),h=row.querySelector("h2").getBoundingClientRect(),buttons=row.querySelector(".compact-library-actions").getBoundingClientRect();return a.right<=c.left&&h.bottom<=buttons.top+1})})');
      assert(!geometry.overflow && geometry.rows.every(Boolean), `Overlap at ${width}px.`);
      if (width === 720) await b.evaluate('document.querySelector(".search-entry").scrollIntoView({block:"start"})');
      await b.screenshot(`${folder}/search-${width}.png`, false, width === 720);
    }
  });
  await scenario('phone home, deck and notes have loaded art and no document overflow', async () => {
    await size(390,844); await b.navigate('/recommendations'); await b.wait('document.querySelectorAll(".watch-next-item").length>0');
    await b.screenshot(`${folder}/home-phone.png`, false);
    await b.clickText('Start swiping'); await b.wait('!!document.querySelector(".swipe-card")');
    assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Phone deck overflows.');
    await b.screenshot(`${folder}/deck-phone.png`, false, true);
    await b.navigate('/anime/1'); await b.evaluate('document.querySelector("#viewing-notes").scrollIntoView({block:"start"})');
    assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Phone notes overflow.');
    await b.screenshot(`${folder}/notes-phone.png`);
  });
  await scenario('a long recommendation reason expands the card without overlapping its controls', async () => {
    await size(1363,647); await b.navigate('/recommendations'); await b.wait('document.querySelectorAll(".watch-next-item").length>0'); await b.clickText('Start swiping');
    await b.evaluate(`document.querySelector('.deck-copy .pick-reason').textContent=${JSON.stringify('The expressive animation, carefully paced character scenes and soundtrack echo the things you enjoyed in your viewing notes. '.repeat(5))}`);
    assert(await b.evaluate('(()=>{const reason=document.querySelector(".deck-copy .pick-reason").getBoundingClientRect(),actions=document.querySelector(".deck-actions").getBoundingClientRect(),card=document.querySelector(".swipe-card").getBoundingClientRect();return reason.bottom<=actions.top&&actions.right<=card.right&&document.documentElement.scrollWidth<=innerWidth})()'), 'Long copy overlaps actions.');
    await b.screenshot(`${folder}/deck-long-copy.png`);
  });
  checks.push({ name:'no uncaught browser exceptions',pass:b.errors.length===0,errors:b.errors });
} finally {
  await writeFile(`${folder}/checks.json`,JSON.stringify({configuration:'Synthetic account/catalog/ranking fixtures with real public cover bytes when ANIME_QA_COVERS is supplied. No live login or personal-data writes.',realCoverResponses,checks},null,2));
  await b.close();
}
console.log(JSON.stringify({passed:checks.filter(check=>check.pass).length,failed:checks.filter(check=>!check.pass).length}));
if(checks.some(check=>!check.pass))process.exitCode=1;
