import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing edge-state actions against a non-fixture app.');
const folder = resolve('docs/design/evidence/manga-shelf'); await mkdir(folder, { recursive: true });
const b = await openBrowser(base); const checks = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function scenario(name, run) { try { await run(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); } catch (error) { checks.push({ name, pass: false, details: error.message }); console.error(`FAIL ${name}: ${error.message}`); } }
try {
  await b.cookie('anime_preview_user', 'viewer');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await scenario('long catalog title wraps while its full accessible heading remains readable', async () => {
    await b.navigate('/anime/1575?from=%2Fsearch%3Fq%3DCode');
    const state = await b.evaluate('({title:document.querySelector("h1").textContent,scroll:document.documentElement.scrollWidth,width:innerWidth,height:document.querySelector("h1").getBoundingClientRect().height})');
    assert(state.title === 'Code Geass: Lelouch of the Rebellion' && state.scroll <= state.width && state.height > 50, JSON.stringify(state));
    await b.screenshot(`${folder}/details-long-title-phone.png`);
  });
  await scenario('missing poster keeps title, facts, status and Save usable', async () => {
    await b.send('Network.setBlockedURLs', { urls: ['*preview/poster.svg*'] });
    await b.navigate('/anime/52991?from=%2Fsearch%3Fq%3DFrieren');
    await b.wait('!!document.querySelector(".poster-fallback")');
    const state = await b.evaluate('({title:document.querySelector("h1").textContent,status:!!document.querySelector("#detail-status"),action:[...document.querySelectorAll("button")].some(button=>/Add to my list|Update my list/i.test(button.textContent)&&!button.disabled),scroll:document.documentElement.scrollWidth,width:innerWidth})');
    assert(state.status && state.action && state.scroll <= state.width, JSON.stringify(state));
    await b.screenshot(`${folder}/details-missing-art-phone.png`);
    await b.send('Network.setBlockedURLs', { urls: [] });
  });
  await scenario('details Back preserves list filter, query and prior scroll', async () => {
    await b.navigate('/library?status=all&q=a'); await b.evaluate('window.scrollTo(0,500)'); await pause(100);
    const prior = await b.evaluate('window.scrollY');
    await b.evaluate('document.querySelector(".anime-card a").click()');
    await b.wait('location.pathname.startsWith("/anime/") && !!document.querySelector("#detail-status")');
    const back = await b.evaluate('[...document.querySelectorAll("a")].find(link=>link.textContent.includes("Back to My List"))?.getAttribute("href")');
    assert(back === '/library?status=all&q=a', `Filter path lost: ${back}`);
    await b.evaluate('[...document.querySelectorAll("a")].find(link=>link.textContent.includes("Back to My List")).click()');
    await b.wait('location.pathname==="/library"'); await pause(500);
    const after = await b.evaluate('window.scrollY');
    assert(Math.abs(after - prior) < 50, `Scroll changed ${prior} → ${after}`);
  });
  await scenario('reduced motion disables nonessential transitions', async () => {
    const state = await b.evaluate('({prefers:matchMedia("(prefers-reduced-motion: reduce)").matches,durations:[...document.querySelectorAll("button,a")].map(element=>getComputedStyle(element).transitionDuration)})');
    assert(state.prefers && state.durations.every(duration => duration.split(',').every(value => parseFloat(value) <= 0.01)), JSON.stringify(state));
  });
  await scenario('narrow 320px layout keeps four status filters and controls reachable', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
    await b.navigate('/library');
    assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll(".status-tabs a").length===5'), 'Narrow layout overflowed or lost statuses.');
    await b.cookie('anime_preview_user', 'anonymous'); await b.navigate('/auth/sign-in');
    const art = await b.evaluate(`(()=>{const wordmark=document.querySelector('.auth-art .wordmark').getBoundingClientRect();const graphic=document.querySelector('.entrance-graphic').getBoundingClientRect();return {wordmarkRight:wordmark.right,graphicLeft:graphic.left,width:innerWidth,scroll:document.documentElement.scrollWidth}})()`);
    assert(art.wordmarkRight <= art.graphicLeft + 2 && art.scroll <= art.width, `Narrow entrance overlaps: ${JSON.stringify(art)}`);
    await b.screenshot(`${folder}/sign-in-narrow-320.png`, false);
  });
  await scenario('keyboard-only tabs reach and activate email sign-in with a visible focus ring', async () => {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await b.cookie('anime_preview_user', 'anonymous'); await b.navigate('/auth/sign-in');
    const key = async (value, code, number) => { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: number, ...(value === 'Enter' ? { text: '\r' } : {}) }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: number }); };
    let reached = false;
    for (let index = 0; index < 10; index++) {
      await key('Tab', 'Tab', 9);
      if (await b.evaluate('/Continue with email/i.test(document.activeElement.textContent)')) { reached = true; break; }
    }
    assert(reached, 'Tab order never reached email sign-in.');
    assert(await b.evaluate('parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2'), 'Email trigger lacks visible keyboard focus.');
    await key('Enter', 'Enter', 13); await b.wait('!!document.querySelector("#auth-email")');
    for (let index = 0; index < 6 && !await b.evaluate('document.activeElement.id==="auth-email"'); index++) await key('Tab', 'Tab', 9);
    assert(await b.evaluate('document.activeElement.id==="auth-email"'), 'Expanded email field was not reachable by keyboard.');
    await b.screenshot(`${folder}/sign-in-keyboard-focus-phone.png`, false);
  });
} finally {
  await writeFile(`${folder}/edge-state-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Isolated app fixtures; reduced-motion and viewport emulation, browser network blocking for missing art.', checks }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
