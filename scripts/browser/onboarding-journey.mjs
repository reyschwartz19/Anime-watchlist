import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const profile = await (await fetch(`${base}/api/me`, { headers: { Cookie: 'anime_preview_user=new' } })).json();
if (profile.authProviderId !== 'fixture-new' || profile.onboarded !== false) throw new Error('This browser fixture requires a freshly started fixture server with its unonboarded new user.');
const folder = resolve('docs/design/evidence/manga-shelf'); await mkdir(folder, { recursive: true });
const b = await openBrowser(base);
const checks = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const draftKey = 'manga-shelf:onboarding:v1:00000000-0000-4000-8000-000000000002';
try {
  await b.cookie('anime_preview_user', 'new');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await b.navigate('/onboarding');
  await b.evaluate(`localStorage.removeItem(${JSON.stringify(draftKey)})`); await b.navigate('/onboarding');
  assert(await b.evaluate('document.querySelector("#display-name").value==="Remy"'), 'Identity was not prefilled.');
  await b.clickText('Continue');
  await b.wait('!!document.querySelector("#favorite-search")');
  for (const [query, title] of [['Samurai', 'Samurai Champloo'], ['Death', 'Death Note']]) {
    await b.input('#favorite-search', query);
    await b.wait(`document.querySelectorAll('.favorite-tile').length===1 && document.querySelector('.favorite-tile').textContent.includes(${JSON.stringify(title)})`);
    await b.evaluate('document.querySelector(".favorite-tile").click()');
  }
  await b.wait('/2 selected/.test(document.body.innerText)');
  await b.cookie('anime_preview_failure', 'catalog'); await b.input('#favorite-search', 'Mushi');
  await b.wait('!!document.querySelector("[role=alert]")');
  assert((await b.evaluate('document.querySelector(".selected-favorites").textContent')).includes('Death Note'), 'Selection lost on recoverable catalog failure.');
  await b.cookie('anime_preview_failure', ''); await b.clickText('Retry search');
  await b.wait('!document.querySelector("[role=alert]")');
  await b.clickText('Back'); await b.wait('!!document.querySelector("#display-name")'); await b.clickText('Continue');
  await b.wait('/2 selected/.test(document.body.innerText)');
  await b.navigate('/onboarding'); await b.wait('/2 selected/.test(document.body.innerText)');
  checks.push({ name: 'two title-ID favorites survive searches, catalog failure, Back and refresh', pass: true });
  await b.clickText('Continue'); await b.wait('!!document.querySelector(".genre-options")'); await b.clickText('Adventure');
  await b.evaluate(`(()=>{const button=document.querySelector('button[type="submit"]');button.click();button.click()})()`);
  await b.wait('location.pathname==="/recommendations"');
  assert(await b.evaluate(`localStorage.getItem(${JSON.stringify(draftKey)})===null`), 'Completed onboarding draft not cleared.');
  const saved = await b.evaluate('fetch("/api/me").then(response=>response.json())');
  assert(saved.onboarded === true, 'Finish did not persist actual fixture server profile.');
  checks.push({ name: 'finish is retry-safe, persists profile and opens Discover', pass: true });
} catch (error) { checks.push({ name: 'onboarding journey completed', pass: false, details: { message: error.message, body: await b.evaluate('document.body.innerText').catch(() => '') } }); }
finally {
  await writeFile(`${folder}/onboarding-fixture-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Real app UI and server actions against isolated in-memory fixture profile/catalog. No live providers or personal data.', checks }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify(checks)); if (checks.some(check => !check.pass)) process.exitCode = 1;
