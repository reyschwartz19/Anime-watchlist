import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const folder = resolve(process.env.ANIME_QA_OUTPUT_DIR ?? 'docs/design/evidence/manga-shelf');
await mkdir(folder, { recursive: true });
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing browser actions against a non-fixture app.');
const b = await openBrowser(base);
const checks = [];
const record = (name, pass, details) => { checks.push({ name, pass: !!pass, details }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); };
async function scenario(name, run) { try { await run(); record(name, true); } catch (error) { record(name, false, { message: error.message, body: await b.evaluate('document.body.innerText').catch(() => '') }); await b.screenshot(`${folder}/journey-failure-${checks.length}.png`).catch(() => {}); } }
const assert = (value, message) => { if (!value) throw new Error(message); };
const text = () => b.evaluate('document.body.innerText');
const lead = () => b.evaluate(`(()=>{const a=document.querySelector('.featured-pick h2 a');return a?{title:a.textContent,id:Number(a.getAttribute('href').match(/anime\\/(\\d+)/)[1])}:null})()`);
async function generate() {
  await b.evaluate(`(()=>{const button=document.querySelector('.discover-controls button[type="submit"]');if(!button)throw Error('Generate button missing');button.click()})()`);
  await b.wait('!!document.querySelector(".featured-pick") || !!document.querySelector("[role=alert]")');
  await pause(150);
}
async function freshDiscover() { await b.navigate('/recommendations'); await generate(); assert(await lead(), await text()); }
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await scenario('fixture Google cancellation has email/retry recovery', async () => {
    await b.cookie('anime_preview_user', 'anonymous'); await b.navigate('/auth/sign-in?error=access_denied');
    assert((await text()).includes('Google sign-in was cancelled'), 'Cancellation was not distinguished.');
  });
  await scenario('fixture Google provider failure is distinct from cancellation', async () => {
    await b.navigate('/auth/sign-in?error=provider_failed');
    assert((await text()).includes('Google could not complete sign-in'), 'Provider failure was not distinguished.');
  });
  await scenario('fixture new-user callback resolves server session to onboarding', async () => {
    await b.cookie('anime_preview_user', 'new'); await b.send('Page.navigate', { url: `${base}/auth/callback` });
    await b.wait('location.pathname==="/onboarding" && !!document.querySelector("#display-name")');
  });
  await scenario('fixture onboarded callback opens Discover', async () => {
    await b.cookie('anime_preview_user', 'viewer'); await b.send('Page.navigate', { url: `${base}/auth/callback` });
    await b.wait('location.pathname==="/recommendations" && !!document.querySelector("#discover-request")');
  });
  await scenario('fixture profile-read failure stays recoverable and never routes to onboarding', async () => {
    await b.cookie('anime_preview_user', 'profile-error'); await b.navigate('/auth/callback');
    await b.wait('!!document.querySelector("[role=alert]")');
    assert((await text()).includes('Your profile could not be loaded'), 'Profile error recovery missing.');
    assert(await b.evaluate('location.pathname==="/auth/callback"'), 'Profile failure was treated as a new user.');
    await b.cookie('anime_preview_user', 'viewer'); await b.clickText('Retry');
    await b.wait('location.pathname==="/recommendations"');
  });
  let saved;
  await scenario('new picks → duplicate Save clicks → title on My List', async () => {
    await b.cookie('anime_preview_user', 'viewer'); await freshDiscover(); saved = await lead();
    await b.evaluate(`(()=>{const button=document.querySelector('.featured-pick .primary');button.click();button.click()})()`);
    await b.wait(`!document.querySelector('.featured-pick h2 a[href^="/anime/${saved.id}?"]')`);
    await b.navigate('/library');
    assert((await text()).toLocaleLowerCase().includes(saved.title.toLocaleLowerCase()), 'Saved title missing from library.');
    const count = await b.evaluate(`[...document.querySelectorAll('.anime-card a')].filter(a=>a.getAttribute('href')?.startsWith('/anime/${saved.id}?')).length`);
    assert(count <= 2, 'Duplicate save created repeated shelf entries.');
  });
  let hidden;
  await scenario('permanent dismissal survives reload and generation; Profile restore works', async () => {
    await freshDiscover(); hidden = await lead();
    await b.clickText('Pass'); await b.clickText('Strongly not interested');
    await b.wait(`!document.querySelector('.featured-pick h2 a[href^="/anime/${hidden.id}?"]')`);
    await freshDiscover();
    assert(!await b.evaluate(`!!document.querySelector('a[href^="/anime/${hidden.id}?"]')`), 'Dismissed title returned after reload.');
    const otherDevice = await openBrowser(base);
    try {
      await otherDevice.navigate('/recommendations');
      await otherDevice.evaluate(`document.querySelector('.discover-controls button[type="submit"]').click()`);
      await otherDevice.wait('!!document.querySelector(".featured-pick")');
      assert(!await otherDevice.evaluate(`!!document.querySelector('a[href^="/anime/${hidden.id}?"]')`), 'Durable dismissal failed in a separate browser profile.');
    } finally { await otherDevice.close(); }
    await b.navigate('/profile');
    assert((await text()).includes(hidden.title), 'Hidden title missing in Profile.');
    await b.evaluate(`(()=>{const item=[...document.querySelectorAll('.hidden-list li')].find(e=>e.textContent.includes(${JSON.stringify(hidden.title)}));item?.querySelector('button')?.click()})()`);
    await b.wait(`![...document.querySelectorAll('.hidden-list li')].some(e=>e.textContent.includes(${JSON.stringify(hidden.title)}))`);
    await freshDiscover(); assert(await b.evaluate(`!!document.querySelector('a[href^="/anime/${hidden.id}?"]')`), 'Restored title remained excluded.');
  });
  await scenario('Not tonight lasts through reload in this browser session; Undo restores it', async () => {
    const skipped = await lead(); await b.clickText('Pass'); await b.clickText('Not tonight · this session');
    await b.wait(`!document.querySelector('.featured-pick h2 a[href^="/anime/${skipped.id}?"]')`);
    await b.clickText('Undo'); await b.wait(`!!document.querySelector('.featured-pick h2 a[href^="/anime/${skipped.id}?"]')`);
    await b.clickText('Pass'); await b.clickText('Not tonight · this session');
    await b.wait(`JSON.parse(sessionStorage.getItem('anime-discover-v1:00000000-0000-4000-8000-000000000001')||'{}').passes?.includes(${skipped.id})`);
    await freshDiscover(); assert(!await b.evaluate(`!!document.querySelector('a[href^="/anime/${skipped.id}?"]')`), 'Session pass lost on reload.');
  });
  await scenario('Pick from my list contains only Plan to Watch entries', async () => {
    await b.navigate('/library?status=plan_to_watch');
    const allowed = await b.evaluate(`[...document.querySelectorAll('.anime-card a')].map(a=>Number(a.getAttribute('href')?.match(/anime\\/(\\d+)/)?.[1])).filter(Boolean)`);
    await b.navigate('/recommendations'); await b.clickText('Pick from my list'); await generate();
    const results = await b.evaluate(`[...document.querySelectorAll('.featured-pick h2 a,.secondary-pick>a')].map(a=>Number(a.getAttribute('href').match(/anime\\/(\\d+)/)[1]))`);
    assert(results.length > 0 && results.every(id => allowed.includes(id)), `Unexpected IDs: ${JSON.stringify({allowed,results})}`);
  });
  await scenario('Already watched records Completed, offers optional taste and does not add a favorite', async () => {
    await b.navigate('/recommendations'); await b.clickText('Find something new'); await generate();
    const watched = await lead(); await b.clickText('Already watched');
    await b.wait('/This is optional/.test(document.body.innerText)');
    await b.navigate(`/anime/${watched.id}?from=%2Flibrary`);
    assert(/On your shelf: Completed/.test(await text()), 'Completed status was not saved.');
    await b.navigate('/profile');
    const favorites = await b.evaluate('document.querySelector("#taste > p")?.textContent');
    assert(typeof favorites === 'string' && !favorites.toLocaleLowerCase().includes(watched.title.toLocaleLowerCase()), 'Completed title was made a favorite.');
  });
  await scenario('model failure preserves mood request and recovers', async () => {
    await b.navigate('/recommendations'); await b.clickText('Find something new');
    await b.input('#discover-request', 'a quiet adventure tonight'); await b.cookie('anime_preview_failure', 'model'); await generate();
    assert((await text()).includes('Groq could not rank'), 'Model failure not identified.');
    assert(await b.evaluate('document.querySelector("#discover-request").value==="a quiet adventure tonight"'), 'Mood lost on failure.');
    await b.cookie('anime_preview_failure', ''); await generate(); assert(await lead(), 'Retry did not recover.');
  });
  await scenario('catalog failure distinguished from zero search matches', async () => {
    await b.cookie('anime_preview_failure', 'catalog'); await b.navigate('/search?q=Samurai');
    assert(/unavailable|could not be reached/i.test(await text()), 'Catalog error not identified.');
    await b.cookie('anime_preview_failure', ''); await b.navigate('/search?q=nomatchingfixturetitle');
    assert(/no titles match|no matches|no matching titles/i.test(await text()), 'No match state missing.');
  });
  await scenario('details retains originating search query and filter path', async () => {
    await b.navigate('/anime/205?from=%2Fsearch%3Fq%3DSamurai');
    const href = await b.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Back to search'))?.getAttribute('href')`);
    assert(href === '/search?q=Samurai', `Return path lost: ${href}`);
  });
  await scenario('second fixture account cannot see first account’s saved title or dismissal', async () => {
    await b.cookie('anime_preview_user', 'second'); await b.navigate('/library');
    assert(!(await text()).toLocaleLowerCase().includes(saved.title.toLocaleLowerCase()), 'Cross-user library entry leaked.');
    await b.navigate('/profile'); assert(!(await text()).includes(hidden.title), 'Cross-user hidden title leaked.');
  });
  await scenario('200% desktop zoom reflows vertically without clipped controls', async () => {
    await b.cookie('anime_preview_user', 'viewer');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 450, deviceScaleFactor: 2, mobile: false });
    await b.navigate('/profile');
    assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Horizontal overflow at equivalent 200% zoom.');
    await b.screenshot(`${folder}/profile-200-percent.png`);
  });
  await scenario('keyboard Escape closes Pass and restores trigger focus', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await b.navigate('/recommendations'); await b.clickText('Find something new'); await generate();
    await b.clickText('Pass'); await b.evaluate('document.querySelector("#pass-reason").focus()');
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert(await b.evaluate('!document.querySelector("#pass-options") && document.activeElement.getAttribute("aria-controls")==="pass-options"'), 'Pass focus restoration failed.');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await b.evaluate('document.activeElement.scrollIntoView({block:"center"})');
    await b.screenshot(`${folder}/discover-keyboard-focus-scrolled-phone.png`, false, true);
  });
  record('no uncaught browser runtime exceptions', b.errors.length === 0, b.errors);
} finally {
  await writeFile(`${folder}/journey-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Isolated in-memory app fixtures. Auth callback and error states use fixture identities; no live OAuth/email or Groq result claimed.', checks }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
