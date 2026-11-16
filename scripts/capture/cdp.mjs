// A tiny Chrome DevTools Protocol client for the README media scripts: start a
// headless Chrome with its own throw-away profile, open one page, run JS in it and
// take screenshots. Node built-ins only (fetch, WebSocket, child_process).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({
  width = 1440,
  height = 900,
  // A fresh port per run: a Chrome that is still shutting down may hold the last one.
  port = 9300 + Math.floor(Math.random() * 600),
  headless = true,
} = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome or Edge not found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'agent-office-capture-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-color-profile=srgb',
    '--enable-unsafe-swiftshader',
    ...(headless ? ['--headless=new'] : []),
    'about:blank',
  ];
  const chrome = spawn(exe, args, { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 50 && !version; i++) {
    await sleep(200);
    version = await fetch(`http://127.0.0.1:${port}/json/version`)
      .then((r) => r.json())
      .catch(() => undefined);
  }
  if (!version) throw new Error('Chrome did not start');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const page = {
    send,
    /** Evaluate an expression in the page and return its value (promises are awaited). */
    async eval(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
      }
      return res.result.value;
    },
    async goto(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if ((await page.eval('document.readyState')) === 'complete') return;
      }
      throw new Error(`${url} did not load`);
    },
    /** Wait until `expression` is truthy in the page. */
    async waitFor(expression, timeoutMs = 20_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await page.eval(expression).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`timed out waiting for: ${expression}`);
    },
    /** Bounding box of the first element matching `selector`. */
    async box(selector) {
      return page.eval(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      })()`);
    },
    /** PNG as a Buffer; `clip` in CSS pixels. */
    async screenshot(clip) {
      const res = await send('Page.captureScreenshot', {
        format: 'png',
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
        captureBeyondViewport: false,
      });
      return Buffer.from(res.data, 'base64');
    },
    async close() {
      ws.close();
      chrome.kill();
      await sleep(500);
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
  return page;
}
