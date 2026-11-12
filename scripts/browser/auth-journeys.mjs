import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openBrowser, pause } from './cdp.mjs';

const base = process.env.ANIME_QA_BASE_URL ?? 'http://localhost:3067';
const identity = await (await fetch(`${base}/api/me`)).json();
if (identity.authProviderId !== 'fixture-viewer') throw new Error('Refusing auth fixtures against a non-fixture app.');
const folder = resolve(process.env.ANIME_QA_OUTPUT_DIR ?? 'docs/design/evidence/manga-shelf'); await mkdir(folder, { recursive: true });
const b = await openBrowser(base);
const checks = []; const requests = [];
let validCode = false; let failureCode = 'INVALID_OTP'; let googleUser = 'new';
let emailUser = 'viewer'; let authUnavailable = false;
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
    else if (path.endsWith('/sign-in/email')) {
      if (authUnavailable) { status = 503; body = { code: 'AUTH_RATE_LIMIT_UNAVAILABLE', message: 'Sign-in protection is temporarily unavailable.' }; }
      else { await b.cookie('anime_preview_user', emailUser); body = { token: 'synthetic-token', user: { id: 'fixture-viewer', emailVerified: true } }; }
    } else if (path.endsWith('/email-otp/verify-email')) {
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
  await check('root resolves signed-out, new and returning users without private content or loops', async () => {
    for (const [user, path] of [['anonymous', '/auth/sign-in'], ['new', '/onboarding'], ['viewer', '/recommendations']]) {
      await b.cookie('anime_preview_user', user);
      await b.send('Page.navigate', { url: `${base}/` });
      await b.wait(`location.pathname===${JSON.stringify(path)}`);
      await pause(250);
      assert(await b.evaluate(`location.pathname===${JSON.stringify(path)}`), 'Entry route looped.');
    }
  });
  await check('anonymous private route preserves a safe return destination', async () => {
    await b.cookie('anime_preview_user', 'anonymous');
    await b.send('Page.navigate', { url: `${base}/library?status=watching` });
    await b.wait('location.pathname==="/auth/sign-in"');
    assert(await b.evaluate('new URLSearchParams(location.search).get("returnTo")==="/library?status=watching"'), 'Private return path was lost.');
  });
  await check('legacy hash search survives root handoff and authentication', async () => {
    await b.cookie('anime_preview_user', 'viewer');
    await b.send('Page.navigate', { url: `${base}/#/search?q=Frieren` });
    await b.wait('location.pathname==="/search" && new URLSearchParams(location.search).get("q")==="Frieren"');
  });
  await check('Google cancellation returns recoverable sign-in', async () => {
    await b.navigate('/auth/sign-in?error=access_denied');
    assert(/cancelled/i.test(await b.evaluate('document.body.innerText')), 'Cancellation recovery missing.');
  });
  await check('Google profile failure stays on callback and Retry resolves the server account', async () => {
    googleUser = 'profile-error';
    await b.navigate('/auth/sign-in'); await b.clickText('Continue with Google');
    await b.wait('location.pathname==="/auth/callback" && /profile could not be loaded/i.test(document.body.innerText)');
    await b.cookie('anime_preview_user', 'viewer'); await b.clickText('Retry');
    await b.wait('location.pathname==="/recommendations"');
  });
  await check('email profile retry and repeated submits do not authenticate twice', async () => {
    emailUser = 'profile-error';
    await b.navigate('/auth/sign-in?email=viewer%40example.test');
    await b.input('#auth-password', 'fixture-password-123');
    const before = requests.filter(request => request.path.endsWith('/sign-in/email')).length;
    await b.evaluate('(()=>{const f=document.querySelector("form");f.requestSubmit();f.requestSubmit()})()');
    await b.wait('/Retry account lookup/i.test(document.body.innerText)');
    assert(requests.filter(request => request.path.endsWith('/sign-in/email')).length === before + 1, 'Duplicate email request escaped lock.');
    await b.cookie('anime_preview_user', 'viewer'); await b.clickText('Retry account lookup');
    await b.wait('location.pathname==="/recommendations"');
    assert(requests.filter(request => request.path.endsWith('/sign-in/email')).length === before + 1, 'Profile retry resubmitted credentials.');
  });
  await check('operational auth 503 retains email input and differs from request throttling', async () => {
    authUnavailable = true;
    await b.navigate('/auth/sign-in?email=viewer%40example.test'); await b.input('#auth-password', 'fixture-password-123');
    await b.clickText('Sign in');
    await b.wait('/protection.*unavailable/i.test(document.querySelector("[role=alert]")?.textContent ?? "")');
    assert(await b.evaluate('document.querySelector("#auth-email").value==="viewer@example.test"'), 'Email input lost.');
    assert(!/Too many/i.test(await b.evaluate('document.body.innerText')), 'Operational failure presented as throttling.');
  });
} finally {
  await writeFile(`${folder}/auth-fixture-checks.json`, `${JSON.stringify({ testedAt: new Date().toISOString(), configuration: 'Browser-intercepted synthetic Better Auth responses and isolated server fixture identities. No real signup, email delivery, OTP, OAuth exchange, or live cookie/session establishment verified.', checks, requests }, null, 2)}\n`);
  await b.close();
}
console.log(JSON.stringify({ passed: checks.filter(check => check.pass).length, failed: checks.filter(check => !check.pass).length }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
