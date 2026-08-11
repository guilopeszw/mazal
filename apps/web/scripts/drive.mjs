// ─── apps/web/scripts/drive.mjs ───────────────────────────────────────────
// Drive the running app in a real browser and measure it.
//
// Why this exists: almost every wrong call made against this UI was made by
// reading the source instead of running it. A scroll option "fixed" a bug it
// could not reach, because nobody checked that the document was not scrollable.
// A pre-flight button shipped that could never succeed, because the test called
// the function underneath it. Reading is how you form the theory; this is how
// you find out it was wrong before a seller does.
//
// Chrome over CDP, no dependencies — Node 24 has a global WebSocket and Chrome
// is already on the machine. Evaluates whatever expression you hand it, in the
// page, after load, and can screenshot what it saw.
//
//   node scripts/drive.mjs --url http://localhost:3117 \
//     --eval 'document.title' --shot /tmp/a.png
//
// `--eval` may await. The last expression is what gets printed. Click something
// and wait for the answer to stream like this:
//
//   --eval '(async () => {
//     [...document.querySelectorAll("button")].find(b => b.textContent.includes("ROAS")).click();
//     await new Promise(r => setTimeout(r, 4000));
//     return document.body.innerText.slice(0, 200);
//   })()'

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const url = arg('url', 'http://localhost:3117');
const expression = arg('eval', 'document.title');
const shot = arg('shot');
const width = Number(arg('width', '1200'));
const height = Number(arg('height', '900'));
/** Chrome's own dark preference, so a theme bug reproduces rather than hiding. */
const scheme = arg('scheme', 'dark');

const profile = await mkdtemp(join(tmpdir(), 'mazal-drive-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  // Port 0, not 9222. On a fixed port a second run's Chrome cannot bind, attaches
  // to the first one's browser and navigates its page — and the first run then
  // prints `undefined` for a measurement it never made. Both exit 0.
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

/** Chrome needs a moment before its debugging port answers, and it writes the port it chose. */
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome never opened its debugging port');
}

const ws = new WebSocket(await target());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    // A CDP-level error carries the id like any reply. Resolving it would hand the
    // caller an envelope with no `result`, print `undefined`, and exit 0.
    if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else resolve(msg);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  const loaded = new Promise((resolve) => {
    const onLoad = (event) => {
      if (JSON.parse(event.data).method === 'Page.loadEventFired') {
        ws.removeEventListener('message', onLoad);
        resolve();
      }
    };
    ws.addEventListener('message', onLoad);
  });
  // Chrome fires `Page.loadEventFired` for its own "site can't be reached" page, so
  // the load wait alone cannot tell a running app from a refused connection — and a
  // driver that reports on Chrome's error page is worse than no driver, because its
  // output looks like a measurement. `errorText` is the only thing that knows.
  const navigated = await send('Page.navigate', { url });
  if (navigated.result?.errorText) {
    throw new Error(`${url} — ${navigated.result.errorText}`);
  }
  await loaded;

  // Settle rather than race the framework: the app streams its answers in, so
  // an immediate read sees a skeleton and calls it the finished screen.
  await new Promise((r) => setTimeout(r, 2500));

  // CDP nests it: the envelope's `result` holds Runtime.evaluate's own `result`.
  const reply = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = reply.result?.result;

  if (reply.result?.exceptionDetails) {
    console.error(reply.result.exceptionDetails.exception?.description ?? 'threw');
    process.exitCode = 1;
  } else {
    console.log(typeof value?.value === 'string' ? value.value : JSON.stringify(value?.value, null, 2));
  }

  if (shot) {
    // `--frames N` spreads N shots over `--span` ms, because the thing worth
    // seeing is usually mid-animation and gone by the time one shot lands.
    const frames = Number(arg('frames', '1'));
    const span = Number(arg('span', '6000'));
    for (let i = 0; i < frames; i++) {
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const path = frames === 1 ? shot : shot.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`);
      await writeFile(path, Buffer.from(png.result.data, 'base64'));
      if (i < frames - 1) await new Promise((r) => setTimeout(r, span / frames));
    }
    console.error(`shot → ${shot} (${frames})`);
  }
} finally {
  ws.close();
  chrome.kill();
  // Chrome writes to its profile as it exits, so a removal that races it throws
  // ENOTEMPTY and takes down a run whose measurement already succeeded.
  await new Promise((r) => setTimeout(r, 300));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
