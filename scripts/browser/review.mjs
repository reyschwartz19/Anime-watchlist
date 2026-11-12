import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const folder = resolve('docs/design/evidence/manga-shelf');
await mkdir(folder, { recursive: true });
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing browser actions against a non-fixture app. Start ANIME_PREVIEW_FIXTURES=1 in development.');
const browser = await openBrowser(base);
const checks = [];
function check(name, pass, details) { checks.push({ name, pass: !!pass, details }); if (!pass) console.error(`FAIL ${name}: ${JSON.stringify(details)}`); }
const capture = async (name, view) => {
  await browser.wait('document.fonts.status === "loaded"');
  await browser.evaluate(`Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode().catch(()=>{})}))`);
  const state = await browser.evaluate(`({ title:document.querySelector('h1')?.textContent, width:innerWidth, height:innerHeight, scroll:document.documentElement.scrollWidth, text:document.body.innerText.slice(0,500), inputs:[...document.querySelectorAll('input:not([type=hidden])')].map(e=>({id:e.id,label:e.labels?.length||e.getAttribute('aria-label')})) })`);
  check(`${name} ${view.name}: no horizontal overflow`, state.scroll <= state.width, state);
  check(`${name} ${view.name}: inputs labeled`, state.inputs.every(input => input.label), state.inputs);
  await browser.screenshot(`${folder}/${name}-${view.name}.png`);
  await browser.screenshot(`${folder}/${name}-${view.name}-viewport.png`, false);
};
try {
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const view of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }, { name: 'compact', width: 1363, height: 647 }]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.name === 'phone' });
    await browser.cookie('anime_preview_user', 'anonymous');
    await browser.navigate('/auth/sign-in'); await capture('sign-in', view);
    await browser.navigate('/auth/verify-email?email=remy%40example.test'); await capture('verification', view);
    await browser.cookie('anime_preview_user', 'new');
    await browser.navigate('/onboarding');
    await browser.evaluate(`localStorage.setItem('manga-shelf:onboarding:v1:00000000-0000-4000-8000-000000000002',JSON.stringify({displayName:'Remy',interests:['Adventure'],favorites:[],step:1}))`);
    await browser.navigate('/onboarding');
    await browser.wait('document.querySelectorAll(".favorite-tile").length>0');
    await capture('favorites', view);
    if (view.name === 'compact') {
      const visible = await browser.evaluate(`(()=>{const tile=document.querySelector('.favorite-tile');return {top:tile.getBoundingClientRect().top,bottom:tile.getBoundingClientRect().bottom,height:innerHeight}})()`);
      check('favorites recognizable in compact first viewport', visible.bottom < visible.height, visible);
    }
    await browser.cookie('anime_preview_user', 'viewer');
    await browser.navigate('/recommendations');
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await browser.evaluate('!!document.querySelector(".featured-pick")')) break;
      await browser.evaluate(`(()=>{const b=document.querySelector('.discover-controls button[type="submit"]');if(b&&!b.disabled)b.click()})()`);
      await pause(500);
    }
    await browser.wait('document.querySelector(".featured-pick")');
    await capture('discover', view);
    await browser.navigate('/library'); await capture('my-list', view);
    await browser.navigate('/search?q=Samurai'); await capture('search', view);
    await browser.navigate('/anime/205?from=%2Fsearch%3Fq%3DSamurai'); await capture('details', view);
    await browser.navigate('/profile'); await capture('profile', view);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focus = await browser.evaluate(`({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineWidth})`);
    check(`keyboard focus visible ${view.name}`, parseFloat(focus.outline) > 0, focus);
  }
  check('browser has no uncaught runtime exceptions', browser.errors.length === 0, browser.errors);
} catch (error) { check('capture run completed', false, { message: error.message, body: await browser.evaluate('document.body.innerText') }); await browser.screenshot(`${folder}/capture-failure.png`); }
finally {
  await writeFile(`${folder}/browser-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Isolated in-memory fixtures; local typed artwork placeholders. No live email, OAuth, Groq, catalog, or personal import verified.', checks }, null, 2)}\n`);
  await browser.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length, folder }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
