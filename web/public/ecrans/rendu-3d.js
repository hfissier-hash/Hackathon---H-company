// Écran « Rendu 3D » : affiche le salon construit par Blender (.glb) et la fiche du produit sélectionné.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Les salons sont compressés (Draco) : le décodeur vient du même paquet three.js.
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');

const job = Nestr.live ? await Nestr.project() : null;
if (job && job.status === 'done') {
  const main = document.body.firstElementChild.children[0];
  const header = main.children[0], view = main.children[1], card = main.children[3];

  // La vue : on retire l'image et les cotes d'exemple, on garde les boutons.
  const buttons = view.lastElementChild;
  [...view.children].forEach((el) => { if (el !== buttons) el.remove(); });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Salon en 3D : ' + job.products.map((p) => p.name.split(',')[0]).join(', '));
  view.insertBefore(renderer.domElement, buttons);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#EEE7D7');
  // Sans environnement, les matériaux des modèles TRELLIS ressortent presque noirs.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  function resize() {
    const r = view.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  resize();

  // Fiche produit.
  const byUrl = {};
  const img = card.querySelector('img'), texts = card.children[0].children[1].children;
  const price = card.children[0].children[2], chips = card.children[1], link = card.querySelector('a');
  chips.style.flexWrap = 'wrap';
  const chipTpl = chips.children[0].cloneNode(true);
  function select(p) {
    selected = p;
    img.removeAttribute('data-img'); img.src = p.image_url; img.alt = p.name;
    texts[0].textContent = p.name.split(',')[0];
    Nestr.data(texts[1]).textContent = Nestr.retailer(p) + ' · ' + Nestr.dims(p);
    Nestr.data(price).textContent = Nestr.euro(p.price_eur);
    chips.textContent = '';
    for (const [label, ok] of Nestr.checks(p)) {
      const chip = chipTpl.cloneNode(true);
      chip.textContent = label;
      if (!ok) { chip.style.background = 'var(--birch)'; chip.style.color = 'var(--warn)'; }
      chips.appendChild(chip);
    }
    link.href = p.url; link.target = '_blank'; link.rel = 'noopener';
  }
  const meshes = [], walls = [];
  // Vue « maison de poupée » : on masque les murs qui se trouvent entre la caméra et la pièce, quel que soit l'angle.
  // Sens « vers l'extérieur » de chaque mur dans le repère three.js (le nord de la pièce est en -z).
  const WALL_OUT = { Mur_south: [0, 1], Mur_north: [0, -1], Mur_west: [-1, 0], Mur_east: [1, 0] };
  const roomCenter = new THREE.Vector3();
  function hideFrontWalls() {
    for (const wall of walls) {
      const [nx, nz] = WALL_OUT[wall.name];
      wall.visible = (camera.position.x - roomCenter.x) * nx + (camera.position.z - roomCenter.z) * nz < 0.4;
    }
  }
  let current = null, selected = job.products[0], firstLoad = true;
  function load(project) {
    for (const k of Object.keys(byUrl)) delete byUrl[k];
    for (const p of project.products) byUrl[p.url] = p;
    header.querySelector('p').textContent = project.request.style + ' · ' + project.products.length + ' produits';
    return new Promise((resolve, reject) => new GLTFLoader().setDRACOLoader(draco).load(project.glb, (gltf) => {
      if (current) scene.remove(current);
      current = gltf.scene;
      scene.add(current);
      meshes.length = 0;
      walls.length = 0;
      current.traverse((o) => {
        if (!o.isMesh) return;
        if (WALL_OUT[o.name]) walls.push(o); // masqués ou non selon la position de la caméra
        // Un modèle à plusieurs matières arrive en groupe : l'adresse du produit est alors sur le parent.
        const url = o.userData.nester_url || (o.parent && o.parent.userData.nester_url);
        if (url && byUrl[url]) { o.userData.nester_url = url; meshes.push(o); }
      });
      new THREE.Box3().setFromObject(current).getCenter(roomCenter);
      if (firstLoad) {
        const box = new THREE.Box3().setFromObject(current), c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const d = Math.max(size.x, size.z) * 1.25;
        camera.position.set(c.x + d * 0.75, d * 0.95, c.z + d * 0.9);
        controls.target.set(c.x, 0.5, c.z);
        controls.update();
        firstLoad = false;
      }
      window.__nester = { products: meshes.length, version: project.version };
      resolve();
    }, undefined, (e) => { window.__nester = { error: String(e.message || e) }; reject(e); }));
  }
  load(job);
  select(job.products[0]);

  // « Remplacer » : produit suivant de la recherche, ou produit décrit avec ses mots.
  // Avec une envie, le worker cherche dans le catalogue puis envoie un agent H sur le site de l'enseigne.
  const wish = document.createElement('input');
  wish.type = 'text';
  wish.maxLength = 80;
  wish.placeholder = 'Une envie ? ex. en velours vert';
  wish.setAttribute('aria-label', 'Décrire le produit souhaité');
  wish.style.cssText = "width:100%;box-sizing:border-box;height:44px;margin-top:12px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:400 14px var(--body);outline-offset:2px";
  card.insertBefore(wish, card.children[2]);
  card.children[3].style.marginTop = '8px';
  const replaceBtn = card.children[3].querySelector('button');
  wish.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') replaceBtn.click(); });
  replaceBtn.addEventListener('click', async () => {
    const label = 'Remplacer', asked = wish.value.trim();
    replaceBtn.disabled = true;
    replaceBtn.textContent = 'Recherche…';
    // Au-delà de quelques secondes, c'est qu'un agent H est parti chercher sur le site.
    const slow = asked ? setTimeout(() => { replaceBtn.textContent = 'Agent H en route…'; }, 6000) : null;
    try {
      const r = await fetch('/api/projects/' + job.id + '/replace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                      body: JSON.stringify({ category: selected.category, wish: asked }) });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error);
      version = next.version;
      mode(false);
      await load(next);
      select(next.products.find((p) => p.category === selected.category));
      wish.value = '';
      replaceBtn.textContent = label;
    } catch (e) {
      replaceBtn.textContent = asked ? 'Rien trouvé' : 'Pas d\'autre choix';
      setTimeout(() => { replaceBtn.textContent = label; }, 3000);
    }
    clearTimeout(slow);
    replaceBtn.disabled = false;
  });

  // Après la livraison, le worker génère les modèles 3D manquants et les agents vérifient les prix :
  // l'écran suit l'avancement et recharge le salon quand une nouvelle version arrive.
  let version = job.version;
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  note.style.cssText = 'position:absolute;left:12px;top:12px;margin:0;padding:6px 12px;border-radius:999px;background:var(--pine);color:var(--surface);font-size:12px;font-weight:600;display:none';
  view.appendChild(note);
  const until = Date.now() + 6 * 60 * 1000;
  async function watch() {
    const j = await Nestr.project();
    if (j && j.status === 'done') {
      const m = (j.steps || {}).models, v = (j.steps || {}).verify;
      note.style.display = m && m.status === 'running' ? 'block' : 'none';
      if (m) note.textContent = 'Modèles 3D : ' + m.detail.split(' générés')[0].replace(' modèle(s) 3D sur ', ' / ');
      if (j.version !== version && !replaceBtn.disabled) {
        version = j.version;
        mode(false); // la photo affichée ne correspond plus au salon
        await load(j);
        select(j.products.find((p) => p.url === selected.url) || j.products[0]);
      } else if (v && v.status !== 'running' && !selected.live) {
        const fresh = j.products.find((p) => p.url === selected.url);
        if (fresh && fresh.live) select(fresh); // le prix vient d'être vérifié par un agent
      }
      if (m && m.status !== 'running') return;
    }
    if (Date.now() < until) setTimeout(watch, 4000);
  }
  setTimeout(watch, 4000);

  // Bascule « 3D | Photo » : la photo est un rendu photoréaliste du même salon, fait par Blender à la demande.
  const [btn3d, btnPhoto] = header.querySelectorAll('[role="group"] button');
  btnPhoto.textContent = 'Photo';
  const shot = document.createElement('img');
  shot.alt = 'Photo réaliste du salon meublé';
  shot.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;cursor:zoom-in;background:var(--birch)';
  shot.addEventListener('click', () => window.open(shot.src, '_blank', 'noopener'));
  const wait = document.createElement('p');
  wait.setAttribute('role', 'status');
  wait.style.cssText = 'position:absolute;inset:0;margin:0;display:none;align-items:center;justify-content:center;text-align:center;padding:0 32px;background:rgba(244,243,240,0.94);font-size:15px;line-height:1.45;font-weight:500;color:var(--ink)';
  view.insertBefore(shot, buttons);
  view.insertBefore(wait, buttons);
  let photo = job.photo || null;
  function mode(isPhoto) {
    for (const [b, on] of [[btn3d, !isPhoto], [btnPhoto, isPhoto]]) {
      b.setAttribute('aria-pressed', on);
      b.style.background = on ? 'var(--surface)' : 'transparent';
      b.style.boxShadow = on ? '0 1px 4px rgba(0,0,0,0.1)' : 'none';
      b.style.color = on ? 'var(--ink)' : 'var(--ink-muted)';
      b.style.fontWeight = on ? '600' : '500';
    }
    buttons.style.display = isPhoto ? 'none' : 'flex';
    if (!isPhoto) { shot.style.display = 'none'; wait.style.display = 'none'; }
  }
  btn3d.addEventListener('click', () => mode(false));
  btnPhoto.addEventListener('click', async () => {
    mode(true);
    if (photo && photo.version === version) { shot.src = photo.url; shot.style.display = 'block'; return; }
    wait.textContent = 'Blender photographie ton salon… une quinzaine de secondes.';
    wait.style.display = 'flex';
    try {
      const r = await fetch('/api/projects/' + job.id + '/photo', { method: 'POST' });
      const next = await r.json();
      if (!r.ok || !next.photo) throw new Error(next.error || 'Le rendu a échoué.');
      photo = next.photo;
      if (btnPhoto.getAttribute('aria-pressed') !== 'true') return; // l'utilisateur est revenu à la 3D entre-temps
      shot.onload = () => { wait.style.display = 'none'; };
      shot.src = photo.url;
      shot.style.display = 'block';
    } catch (e) {
      wait.textContent = e.message + ' Reviens à la vue 3D et réessaie.';
    }
  });

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return; // glisser = tourner
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(meshes)[0];
    if (hit) select(byUrl[hit.object.userData.nester_url]);
  });
  const [turn, full] = buttons.querySelectorAll('button');
  turn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; turn.setAttribute('aria-pressed', controls.autoRotate); });
  full.addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : view.requestFullscreen(); });
  renderer.setAnimationLoop(() => { controls.update(); hideFrontWalls(); renderer.render(scene, camera); });
}
