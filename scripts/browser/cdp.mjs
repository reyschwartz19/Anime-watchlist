import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Dependency-free Chrome driver; every run owns and removes its browser profile. */
export async function openBrowser(base) {
  const origin = new URL(base);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Browser QA only accepts a loopback HTTP app.');
  const profile = await mkdtemp(join(tmpdir(), 'manga-shelf-browser-'));
  const child = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(100); }
  }
  if (!port) { child.kill(); await rm(profile, { recursive: true, force: true }); throw new Error('Chrome failed to start.'); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  const loadedFrames = new Set();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.lifecycleEvent' && message.params.name === 'load') loadedFrames.add(message.params.loaderId);
    for (const fn of listeners.get(message.method) ?? []) fn(message.params);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id); clearTimeout(promise.timer);
    message.error ? promise.reject(new Error(JSON.stringify(message.error))) : promise.resolve(message.result);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timeout: ${method}`)); }, 30_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression, timeout = 25_000) {
    const start = Date.now();
    do { try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* Navigations replace the execution context. */ } await pause(125); } while (Date.now() - start < timeout);
    throw new Error(`Timed out waiting for ${expression}`);
  }
  async function navigate(path, ready = 'document.querySelector("h1")') {
    const targetUrl = new URL(path, base);
    const navigation = await send('Page.navigate', { url: targetUrl.href });
    if (navigation.errorText) throw new Error(navigation.errorText);
    const start = Date.now();
    while (navigation.loaderId && !loadedFrames.has(navigation.loaderId)) {
      if (Date.now() - start > 30_000) throw new Error(`Navigation did not load: ${path}`);
      await pause(100);
    }
    await wait(`location.pathname===${JSON.stringify(targetUrl.pathname)} && location.search===${JSON.stringify(targetUrl.search)} && document.readyState==='complete' && !!(${ready})`);
    await evaluate('document.fonts.ready');
    await pause(350);
  }
  async function cookie(name, value) { await send('Network.setCookie', { name, value, url: base, path: '/', sameSite: 'Lax' }); }
  async function clickText(text, selector = 'button') {
    await wait(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`, 6000);
    const found = await evaluate(`(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!node||node.disabled)return false;node.click();return true})()`);
    if (!found) throw new Error(`No enabled ${selector} with text: ${text}`);
  }
  async function input(selector, value) {
    const ok = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    if (!ok) throw new Error(`Input missing: ${selector}`);
  }
  async function screenshot(path, fullPage = true, preserveScroll = false) {
    // The development status bubble is tooling, outside the app being reviewed.
    await evaluate(`(()=>{if(!document.getElementById('qa-hide-next-tools')){const style=document.createElement('style');style.id='qa-hide-next-tools';style.textContent='nextjs-portal{display:none!important}';document.head.append(style)}})()`);
    if (!preserveScroll) await evaluate('window.scrollTo(0,0)');
    await pause(150);
    const metrics = await send('Page.getLayoutMetrics');
    const clip = fullPage ? { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } : undefined;
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
    await writeFile(path, Buffer.from(shot.data, 'base64'));
  }
  async function close() {
    socket.close(); child.kill();
    if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(2000)]);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  await send('Page.enable'); await send('Page.setLifecycleEventsEnabled', { enabled: true }); await send('Runtime.enable'); await send('Network.enable');
  return { send, evaluate, wait, navigate, cookie, clickText, input, screenshot, close, errors, on(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); } };
}
