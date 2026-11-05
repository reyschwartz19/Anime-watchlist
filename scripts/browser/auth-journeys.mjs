import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing auth fixtures against a non-fixture app.');
const folder = resolve('docs/design/evidence/manga-shelf'); await mkdir(folder, { recursive: true });
const b = await openBrowser(base);
const checks = []; const requests = [];
let validCode = false; let failureCode = 'INVALID_OTP'; let googleUser = 'new';
const assert = (value, message) => { if (!value) throw new Error(message); };
async function check(name, run) {
  try { await run(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, pass: false, details: { message: error.message, body: await b.evaluate('document.body.innerText').catch(() => '') } }); console.error(`FAIL ${name}: ${error.message}`); }
}
b.on('Fetch.requestPaused', async event => {
  try {
    const path = new URL(event.request.url).pathname;
    let data = {}; try { data = JSON.parse(event.request.postData ?? '{}'); } catch {}
    requests.push({ path, callbackURL: data.callbackURL, newUserCallbackURL: data.newUserCallbackURL, errorCallbackURL: data.errorCallbackURL });
    let status = 200; let body;
    if (path.endsWith('/sign-up/email')) body = { token: null, user: { id: 'fixture-new', email: 'new@example.test', emailVerified: false, name: 'Remy' } };
    else if (path.endsWith('/email-otp/verify-email')) {
      if (validCode) { await b.cookie('anime_preview_user', 'new'); body = { status: true, user: { id: 'fixture-new', email: 'new@example.test', emailVerified: true, name: 'Remy' } }; }
      else { status = 400; body = { code: failureCode, message: failureCode === 'OTP_EXPIRED' ? 'Fixture expired code' : 'Fixture invalid code' }; }
    } else if (path.endsWith('/email-otp/send-verification-otp')) body = { success: true };
    else if (path.endsWith('/sign-in/social')) { await b.cookie('anime_preview_user', googleUser); body = { redirect: true, url: data.callbackURL }; }
    else { status = 503; body = { code: 'FIXTURE_ENDPOINT_UNAVAILABLE', message: 'This authentication request is not a configured fixture.' }; }
    await b.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
  } catch (error) { console.error(error.message); }
});
try {
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${base}/api/auth/*`, requestStage: 'Request' }] });
  await b.cookie('anime_preview_user', 'anonymous');
  await check('mocked email signup automatically advances with address and resend cooldown', async () => {
    await b.navigate('/auth/sign-up'); await b.input('#auth-name', 'Remy'); await b.input('#auth-email', 'new@example.test'); await b.input('#auth-password', 'fixture-password-123');
    await b.evaluate(`(()=>{const submit=document.querySelector('button[type="submit"]');submit.click();submit.click()})()`);
    await b.wait('location.pathname==="/auth/verify-email" && !!document.querySelector("#auth-code")');
    await b.wait('/Resend in/i.test(document.body.innerText)');
    assert(await b.evaluate('document.querySelector("#auth-email").value==="new@example.test"'), 'Destination email missing.');
    assert(/Resend in/i.test(await b.evaluate('document.body.innerText')), 'Resend cooldown missing.');
    assert(requests.filter(request => request.path.endsWith('/sign-up/email')).length === 1, 'Duplicate signup requests escaped submit lock.');
  });
  await check('mocked invalid OTP keeps address and offers retry', async () => {
    await b.input('#auth-code', '111111'); await b.clickText('Verify email'); await b.wait('!!document.querySelector("[role=alert]")');
    assert((await b.evaluate('document.body.innerText')).includes('not valid'), 'Specific invalid OTP message missing.');
    assert(await b.evaluate('document.querySelector("#auth-code").autocomplete==="one-time-code"'), 'Autofill hint missing.');
  });
  await check('mocked expired OTP distinguishes expiry and retains resend recovery', async () => {
    failureCode = 'OTP_EXPIRED'; await b.input('#auth-code', '111111'); await b.clickText('Verify email');
    await b.wait('/expired/i.test(document.querySelector("[role=alert]")?.textContent ?? "")');
    assert(await b.evaluate('[...document.querySelectorAll("button")].some(button=>/Resend/i.test(button.textContent))'), 'Expired-code resend recovery missing.');
    await b.screenshot(`${folder}/verification-expired-fixture.png`);
  });
  await check('mocked valid OTP resolves actual fixture server profile to onboarding', async () => {
    validCode = true; await b.input('#auth-code', '222222'); await b.clickText('Verify email');
    await b.wait('location.pathname==="/onboarding"');
  });
  await check('mocked Google new-user response uses same-origin callback then server onboarding', async () => {
    googleUser = 'new'; await b.cookie('anime_preview_user', 'anonymous'); await b.navigate('/auth/sign-in'); await b.clickText('Continue with Google');
    await b.wait('location.pathname==="/onboarding"');
    const request = requests.filter(request => request.path.endsWith('/sign-in/social')).at(-1);
    assert(request && [request.callbackURL, request.newUserCallbackURL, request.errorCallbackURL].every(url => new URL(url).origin === new URL(base).origin), 'Google callback origin mismatched.');
    assert(request.callbackURL.includes('/auth/callback'), 'Google response bypassed session resolver.');
  });
  await check('mocked Google onboarded-user response opens Discover', async () => {
    googleUser = 'viewer'; await b.cookie('anime_preview_user', 'anonymous'); await b.navigate('/auth/sign-in'); await b.clickText('Continue with Google');
    await b.wait('location.pathname==="/recommendations"');
  });
} finally {
  await writeFile(`${folder}/auth-fixture-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Browser-intercepted synthetic Better Auth responses and isolated server fixture identities. No real signup, email delivery, OTP, OAuth exchange, or live cookie/session establishment verified.', checks, requests }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
