// Export vidéo de demo-technique.html : dix images par seconde (seek), puis assemblage en .mp4 par assemble.swift.
// Usage : node export/video.mjs   (depuis docs/presentation, sur un Mac avec Google Chrome et Xcode Command Line Tools)
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), FPS = 10, TOTAL = 300;
const frames = join(tmpdir(), 'nestr-demo-images'), out = join(here, '..', 'nestr-demo-technique-v3.mp4');
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9351', '--hide-scrollbars',
  '--allow-file-access-from-files', '--user-data-dir=' + join(tmpdir(), 'nestr-demo-chrome-' + Date.now()), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch('http://127.0.0.1:9351/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const waiting = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (waiting.has(d.id)) { waiting.get(d.id)(d.result); waiting.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file://' + join(here, '..', 'demo-technique.html') + '?fixe' });
await sleep(4000);
await send('Runtime.evaluate', { expression: 'Promise.all([document.fonts.ready].concat([].map.call(document.images, (i) => i.decode().catch(() => 0))))', awaitPromise: true });
// Instants où quelque chose bouge (début de séquence, apparition d'un élément, changement d'écran) : seules ces images sont rendues,
// les autres reprennent la précédente.
const moves = (await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify([[1.2, 2.9]].concat([].flatMap.call(document.querySelectorAll('section'), (s) => {
  const t0 = +s.dataset.start;
  return [[t0, t0 + 0.7]].concat([].map.call(s.querySelectorAll('[data-at]'), (e) => [t0 + +e.dataset.at, t0 + +e.dataset.at + 0.7]),
    [].map.call(s.querySelectorAll('img[data-from]'), (e) => [t0 + +e.dataset.from, t0 + +e.dataset.from + 0.6])); })))` })).result.value;
const windows = JSON.parse(moves);
let last = null, drawn = 0, still = true;
for (let f = 0; f < TOTAL * FPS; f++) {
  const t = f / FPS, moving = windows.some(([a, b]) => t >= a - 0.05 && t <= b);
  if (moving || still || !last) {
    await send('Runtime.evaluate', { expression: `seek(${t}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`, awaitPromise: true });
    last = Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 93 })).data, 'base64'); drawn++;
  }
  still = moving; // la première image après un mouvement est rendue une fois, à l'état final
  writeFileSync(join(frames, String(f).padStart(5, '0') + '.jpg'), last);
  if (f % 300 === 0) console.log('image', f, '/', TOTAL * FPS, '·', drawn, 'rendues');
}
ws.close(); chrome.kill();
execFileSync('swift', [join(here, 'assemble.swift'), frames, out, String(FPS)], { stdio: 'inherit' });
rmSync(frames, { recursive: true, force: true });
console.log('vidéo :', out);
