// Tournage du parcours Nestr pour la vidéo de démo : pilote Chrome, enregistre l'écran du téléphone image par image
// et note un repère à chaque action. Le montage (monter.mjs) remet ces repères sur la durée voulue.
// Usage : node tourner.mjs <adresse de base> <dossier de sortie> [--repetition]
//   --repetition : Chrome invisible (visible avec --visible) et mot de passe tiré au hasard dans la page (serveur local uniquement).
//   Sans cette option, Chrome s'ouvre à l'écran et attend que la personne tape elle-même le mot de passe.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2].replace(/\/$/, '') + '/ecrans/', OUT = process.argv[3], REHEARSAL = process.argv.includes('--repetition'), VISIBLE = !REHEARSAL || process.argv.includes('--visible');
const MAIL = process.argv.find((a) => a.startsWith('--mail='))?.slice(7) || 'lea@example.com';
rmSync(OUT, { recursive: true, force: true }); mkdirSync(join(OUT, 'images'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...(VISIBLE ? ['--window-size=460,980', '--window-position=40,40'] : ['--headless=new']),
  '--remote-debugging-port=9362', '--hide-scrollbars', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(tmpdir(), 'nestr-tournage-' + Date.now()), 'about:blank'], { stdio: 'ignore' });
await sleep(3000);
const tabs = await (await fetch('http://127.0.0.1:9362/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0, recording = false, lastSaved = 0; const waiting = new Map(), frames = [], marks = {};
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d.result); waiting.delete(d.id); }
  if (d.method === 'Page.screencastFrame') {
    ws.send(JSON.stringify({ id: ++n, method: 'Page.screencastFrameAck', params: { sessionId: d.params.sessionId } }));
    const ts = d.params.metadata.timestamp;
    if (!recording || ts - lastSaved < 0.03) return;
    lastSaved = ts;
    const name = String(frames.length).padStart(6, '0') + '.jpg';
    writeFileSync(join(OUT, 'images', name), Buffer.from(d.params.data, 'base64'));
    frames.push([name, ts]);
  }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
const mark = (name) => { marks[name] = Date.now() / 1000; console.log('repère', name); };
const waitFor = async (cond, seconds, label) => {
  for (let i = 0; i < seconds * 4; i++) { if (await run(`(() => { try { return !!(${cond}); } catch (e) { return false; } })()`)) return true; await sleep(250); }
  console.log('ATTENTE DÉPASSÉE :', label || cond); return false;
};
const onPage = (name) => waitFor(`location.pathname.endsWith('${name}') && document.readyState === 'complete'`, 40, name);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: false });
// Curseur visible à l'image (anneau rouge, comme dans la vidéo d'origine) et liens externes retenus au lieu d'ouvrir un onglet.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__opened = null; window.open = (u) => { window.__opened = String(u); return null; };
  const make = () => {
    if (document.getElementById('__cur') || !document.body) return;
    const c = document.createElement('div'); c.id = '__cur';
    let p = [195, 600]; try { p = JSON.parse(sessionStorage.getItem('__cur')) || p; } catch (e) {}
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #C9432F;background:rgba(201,67,47,0.18);box-sizing:border-box;transition:left .32s cubic-bezier(.3,.7,.3,1),top .32s cubic-bezier(.3,.7,.3,1),transform .12s ease;left:' + p[0] + 'px;top:' + p[1] + 'px';
    document.body.appendChild(c);
  };
  window.__move = (x, y, fast) => { make(); const c = document.getElementById('__cur'); if (!c) return; c.style.transitionDuration = fast ? '0s' : ''; c.style.left = x + 'px'; c.style.top = y + 'px'; try { sessionStorage.setItem('__cur', JSON.stringify([x, y])); } catch (e) {} };
  window.__press = (on) => { const c = document.getElementById('__cur'); if (c) { c.style.transform = on ? 'scale(0.7)' : ''; c.style.background = on ? 'rgba(201,67,47,0.5)' : 'rgba(201,67,47,0.18)'; } };
  document.addEventListener('DOMContentLoaded', make);
})()` });
await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 585, maxHeight: 1266, everyNthFrame: 1 });

const F = { text: (sel, re) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${re}.test(e.textContent.trim()) && e.getClientRects().length)` };
const center = async (finder, scroll = true) => run(`(() => { const e = ${finder}; if (!e) return null; ${scroll ? "e.scrollIntoView({ block: 'center', inline: 'center' });" : ''} const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; })()`);
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : extra.buttons ?? 0, clickCount: 1, ...extra });
const move = async (x, y) => { await run(`__move(${x}, ${y})`); await mouse('mouseMoved', x, y); await sleep(360); };
const click = async (x, y) => { await move(x, y); await run('__press(true)'); await mouse('mousePressed', x, y, { buttons: 1 }); await sleep(110); await mouse('mouseReleased', x, y); await run('window.__press && __press(false)'); await sleep(160); };
const tap = async (finder, label) => { const c = await center(finder); if (!c) { console.log('INTROUVABLE :', label || finder); return false; } await sleep(120); const d = await center(finder, false); await click(d[0], d[1]); return true; };
const type = async (finder, text) => { await tap(finder); await run(`(() => { const e = ${finder}; e.focus(); e.select && e.select(); })()`); for (const ch of text) { await send('Input.insertText', { text: ch }); await sleep(70); } await sleep(150); };
const wheel = async (x, y, dy, steps = 24, dx = 0) => { await move(x, y); for (let i = 0; i < steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx / steps, deltaY: dy / steps }); await sleep(34); } await sleep(250); };
const drag = async (x0, y0, x1, y1, steps = 40) => {
  await move(x0, y0); await run('__press(true)'); await mouse('mousePressed', x0, y0, { buttons: 1 });
  for (let i = 1; i <= steps; i++) { const k = i / steps, e = k * k * (3 - 2 * k), x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e; await run(`__move(${x}, ${y}, true)`); await mouse('mouseMoved', x, y, { buttons: 1 }); await sleep(30); }
  await mouse('mouseReleased', x1, y1); await run('__press(false)'); await sleep(200);
};
const go = (page) => send('Page.navigate', { url: /^https?:/.test(page) ? page : BASE + page });

// ---------- 1. Connexion
await go('accueil.html'); await onPage('accueil.html'); await sleep(7000);
recording = true; mark('accueil'); await sleep(1300);
await tap(`document.getElementById('go')`, 'Commencer'); await onPage('compte.html'); await sleep(700); mark('compte');
await type(`document.querySelector('input[type=text], input:not([type])')`, 'Léa');
await type(`document.querySelector('input[type=email]')`, MAIL);
mark('motdepasse');
if (REHEARSAL) {
  await run(`(() => { const r = new Uint8Array(12); crypto.getRandomValues(r); const e = document.querySelector('input[type=password]'); e.value = [...r].map((b) => b.toString(36)).join(''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(600);
} else {
  await tap(`document.querySelector('input[type=password]')`);
  console.log('>>> À TOI : tape le mot de passe (8 caractères au moins) dans la fenêtre Chrome. Le tournage reprend tout seul.');
  let seen = 0, since = 0;
  for (;;) { const len = await run(`document.querySelector('input[type=password]').value.length`); if (len !== seen) { seen = len; since = Date.now(); } if (seen >= 8 && Date.now() - since > 2500) break; await sleep(300); }
}
mark('motdepasse-fin');
await tap(`document.getElementById('envoyer')`, 'Créer mon compte'); await onPage('pieces.html'); await sleep(1500); mark('logement');
console.log('après inscription :', await run('location.pathname + location.search'));

// ---------- 2. Dimensions
await type(`document.getElementById('f-long')`, '4,60'); await type(`document.getElementById('f-larg')`, '3,80'); await sleep(500);
await tap(F.text('button', '/vers l.extérieur/'), 'vers l’extérieur'); await sleep(900);
await tap(F.text('button', '/vers l.intérieur/'), 'vers l’intérieur'); await sleep(500);
await tap(F.text('button', '/vers l.extérieur/'), 'vers l’extérieur'); await sleep(700);
await tap(F.text('button', '/^\\+ Fenêtre/'), '+ Fenêtre'); await sleep(700);
{ const p = await center(`document.getElementById('plan')`); if (p) { await click(p[0] + p[2] * 0.345, p[1] - p[3] * 0.02); await sleep(900); } }
console.log('plan :', await run(`document.getElementById('plan').querySelectorAll('*').length + ' éléments · ' + [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Fen/.test(t)).join(', ')`));
await tap(F.text('a,button', '/^Continuer/'), 'Continuer'); await onPage('style.html'); await sleep(1100); mark('style');

// ---------- 3. Style
await tap(F.text('.style-card', '/Japandi/'), 'Japandi'); await sleep(800);
await tap(F.text('.style-card', '/Scandinave/'), 'Scandinave'); await sleep(900);
await tap(`document.querySelector('a[href="envies.html"]')`, 'Continuer'); await onPage('envies.html'); await sleep(1100); mark('envies');

// ---------- 4. Envies et galerie
await wheel(195, 520, 430); await sleep(700);
await tap(F.text('.pill.crit', '/Rangement caché/'), 'critère'); await sleep(500);
await wheel(195, 420, -260, 16); await sleep(300);
await tap(`document.getElementById('vers-galerie')`, 'galerie'); await onPage('galerie.html'); mark('galerie');
await waitFor(`[...document.querySelectorAll('.photo img')].filter((i) => i.complete && i.naturalWidth).length >= 6`, 30, 'photos de la galerie'); await sleep(900); mark('galerie-prete');
const photo = (k) => `[...document.querySelectorAll('.photo')].filter((e) => e.style.display !== 'none' && e.getAttribute('aria-pressed') !== 'true' && e.querySelector('img').complete && e.querySelector('img').naturalWidth)[${k}]`;
await tap(F.text('#themes button', '/art d[ée]co/i'), 'Art déco'); await sleep(900);
await tap(photo(0), 'photo 1'); await sleep(500);
await tap(F.text('#themes button', '/bord de mer/i'), 'Bord de mer'); await sleep(900);
await tap(photo(0), 'photo 2'); await sleep(450); await tap(photo(1), 'photo 3'); await sleep(700);
console.log('photos choisies :', await run(`document.querySelectorAll('.photo[aria-pressed="true"]').length + ' · thèmes : ' + [...document.querySelectorAll('#themes button')].map((b) => b.textContent).join(' | ')`));
await tap(`[...document.querySelectorAll('a[href="envies.html"]')].find((e) => e.getAttribute('aria-label') !== 'Retour')`, 'Utiliser ces photos'); await onPage('envies.html'); await sleep(900); mark('envies-photos');
await waitFor(`/Détecté/.test(document.body.innerText)`, 45, 'analyse des photos'); mark('envies-lues');
await center(`[...document.querySelectorAll('p,div,span')].filter((e) => /^Détecté/.test(e.textContent.trim())).pop()`); await sleep(1800);
await tap(F.text('a[href="agent.html"]', '/Lancer la recherche/'), 'Lancer la recherche'); await onPage('agent.html'); mark('recherche');

// ---------- 5. Recherche
await waitFor(`/est prêt/.test(document.body.innerText)`, 120, 'salon prêt'); mark('salon-pret'); await sleep(3200);
console.log(await run(`document.body.innerText.split('\\n').filter(Boolean).slice(0, 4).join(' / ')`));
await tap(F.text('a,button', '/Voir le rendu 3D/'), 'Voir le rendu 3D'); await onPage('rendu-3d.html'); mark('rendu-clic');

// ---------- 6. Rendu 3D
// L'écran affiche d'abord un contenu d'exemple : la prise commence quand le vrai salon est chargé.
await waitFor(`document.querySelector('canvas') && !/Canapé 3 places, lin/.test(document.body.innerText) && /€/.test(document.body.innerText)`, 40, 'salon 3D'); await sleep(250); mark('rendu'); await sleep(5200); mark('rendu-pret');
const cv = await center(`document.querySelector('canvas')`, false);
await drag(cv[0] + 50, cv[1] + 30, cv[0] - 45, cv[1] + 30, 60); await sleep(500);
await drag(cv[0] - 45, cv[1] + 30, cv[0] + 75, cv[1] + 30, 70); await sleep(400);
await drag(cv[0] + 75, cv[1] + 30, cv[0] + 35, cv[1] + 30, 35); await sleep(800); mark('rendu-tourne');

// ---------- 7. Photo
await tap(F.text('[role="group"] button', '/^Photo$/'), 'Photo'); mark('photo');
await waitFor(`[...document.images].some((i) => /Photo réaliste/.test(i.alt) && i.style.display === 'block' && i.complete && i.naturalWidth) && ![...document.querySelectorAll('[role=status]')].some((p) => p.style.display === 'flex')`, 150, 'photo Blender'); await sleep(400); mark('photo-prete');
await sleep(3200); mark('photo-vue');

// ---------- 8. Remplacer, puis les autres meubles
const BTN = `[...document.querySelectorAll('button')].find((e) => /^(Remplacer|Recherche…|Agent H en route…|Pas d'autre choix|Rien trouvé)$/.test(e.textContent.trim()))`;
const title = () => run(`(() => { const b = ${BTN}; return b ? b.parentNode.parentNode.querySelector('p').textContent.trim() : ''; })()`);
const before = await title();
await tap(F.text('button', '/^Remplacer$/'), 'Remplacer'); mark('remplacer'); await sleep(700);
await waitFor(`(() => { const b = ${BTN}; return b && b.textContent.trim() === 'Remplacer' && !b.disabled; })()`, 150, 'remplacement'); await sleep(1500); mark('remplace');
console.log('remplacement :', before, '→', await title());
await sleep(1500);
await tap(F.text('[role="group"] button', '/^3D$/'), '3D'); mark('retour-3d'); await sleep(3500);
recording = false; mark('sonde');
const hits = []; const c2 = await center(`document.querySelector('canvas')`, false);
for (const [fx, fy] of [[0, 0.02], [-0.22, 0.12], [0.2, -0.12], [0.02, 0.22], [-0.25, -0.1], [0.25, 0.14], [-0.1, 0.28], [0.12, -0.25], [-0.3, 0.25], [0.3, 0]]) {
  const x = c2[0] + fx * c2[2], y = c2[1] + fy * c2[3], t0 = await title();
  await mouse('mousePressed', x, y, { buttons: 1 }); await mouse('mouseReleased', x, y); await sleep(350);
  const t1 = await title(); if (t1 !== t0 && !hits.some((h) => h[2] === t1)) hits.push([x, y, t1]);
}
console.log('meubles cliquables :', hits.map((h) => h[2]).join(' | '));
recording = true; await sleep(300); mark('meubles');
for (const h of hits.slice(0, 3)) { await click(h[0], h[1]); await sleep(1350); }
mark('meubles-fin');

// ---------- 9. Déco
await tap(`document.querySelector('nav a[href="deco.html"]')`, 'onglet Déco'); await onPage('deco.html'); await sleep(2500); mark('deco');
const dots = await run(`(() => { const l = [...document.querySelectorAll('p')].filter((p) => /^(Blanc|Terracotta|Bois clair|Beige|Rouge|Bleu|Vert|Noir|Gris|Jaune|Moutarde|Graphite|Brique|Rose)/.test(p.textContent.trim()) || p.previousElementSibling && getComputedStyle(p.previousElementSibling).borderRadius.includes('50')).slice(0, 5); return l.map((p) => { const r = (p.previousElementSibling || p).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); })()`);
for (const d of dots || []) { await move(d[0], d[1]); await sleep(330); }
await sleep(400);
for (let i = 0; i < 4; i++) { await wheel(195, 470, 330, 26); await sleep(650); }
await wheel(195, 470, 500, 30); await sleep(900); mark('deco-fin');

// ---------- 10. Liste
await tap(`document.querySelector('nav a[href="liste.html"]')`, 'onglet Liste'); await onPage('liste.html'); await sleep(2800); mark('liste');
await wheel(195, 520, 280, 24); await sleep(900); await wheel(195, 520, -280, 20); await sleep(500);
await tap(`[...document.querySelectorAll('div')].filter((d) => d.querySelector(':scope > img') && /€/.test(d.textContent) && d.getBoundingClientRect().height < 110)[0]`, 'un produit'); await sleep(500);
const url = await run('window.__opened'); console.log('lien ouvert :', url); mark('liste-fin');
if (url && /^https:\/\/www\.(ikea\.com|castorama\.fr)\//.test(url)) {
  recording = false; await go(url); await sleep(7000);
  // Bandeau de cookies de l'enseigne : uniquement les cookies nécessaires.
  console.log('cookies :', await run(`(() => { const b = [...document.querySelectorAll('button')].find((e) => /refuser|nécessaires uniquement|uniquement les cookies nécessaires|continuer sans accepter/i.test(e.textContent)); if (b) { b.click(); return b.textContent.trim(); } return 'aucun bandeau trouvé'; })()`));
  await sleep(2000); recording = true; await sleep(300); mark('enseigne'); await sleep(1200); await wheel(195, 500, 260, 22); await sleep(1300); mark('enseigne-fin');
}

// ---------- 11. Profil (sans le logement ni les agents : ces blocs sont masqués pour la prise)
recording = false; await go('profil.html'); await onPage('profil.html');
await waitFor(`!/Chargement/.test(document.getElementById('enregistres').innerText)`, 20, 'salons du profil');
await run(`(() => { const t = [...document.querySelectorAll('.bloc')]; t.slice(1).forEach((e) => { e.style.display = 'none'; }); document.getElementById('sortir').style.display = 'none'; })()`);
await sleep(1500); recording = true; await sleep(300); mark('profil'); await sleep(2200);
await wheel(195, 520, 330, 30); await sleep(2600); mark('profil-fin');
recording = false;
writeFileSync(join(OUT, 'tournage.json'), JSON.stringify({ frames, marks }));
console.log(frames.length, 'images ·', Object.keys(marks).length, 'repères');
if (REHEARSAL) { ws.close(); chrome.kill(); } else { console.log('Tournage terminé : la fenêtre Chrome reste ouverte (session du compte).'); ws.close(); }
process.exit(0);
