// Écran « Rendu 3D » : affiche le salon construit par Blender (.glb) et la fiche du produit sélectionné.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
  scene.background = new THREE.Color('#F4F3F0');
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
  const price = card.children[0].children[2], chips = card.children[1], link = card.children[2].querySelector('a');
  const chipTpl = chips.children[0].cloneNode(true);
  function select(p) {
    selected = p;
    img.removeAttribute('data-img'); img.src = p.image_url; img.alt = p.name;
    texts[0].textContent = p.name.split(',')[0];
    texts[1].textContent = Nestr.retailer(p) + ' · ' + Nestr.dims(p);
    price.textContent = Nestr.euro(p.price_eur);
    chips.textContent = '';
    for (const [label, ok] of Nestr.checks(p)) {
      const chip = chipTpl.cloneNode(true);
      chip.textContent = label;
      if (!ok) { chip.style.background = '#FBEDE8'; chip.style.color = '#B84F2C'; }
      chips.appendChild(chip);
    }
    link.href = p.url; link.target = '_blank'; link.rel = 'noopener';
  }
  const meshes = [];
  let current = null, selected = job.products[0], firstLoad = true;
  function load(project) {
    for (const k of Object.keys(byUrl)) delete byUrl[k];
    for (const p of project.products) byUrl[p.url] = p;
    header.querySelector('p').textContent = project.request.style + ' · ' + project.products.length + ' produits';
    return new Promise((resolve, reject) => new GLTFLoader().load(project.glb, (gltf) => {
      if (current) scene.remove(current);
      current = gltf.scene;
      scene.add(current);
      meshes.length = 0;
      current.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name === 'Mur_south' || o.name === 'Mur_east') o.visible = false; // murs côté caméra
        if (o.userData.nester_url && byUrl[o.userData.nester_url]) meshes.push(o);
      });
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

  // « Remplacer » : produit suivant de la recherche, le serveur reconstruit le salon.
  const replaceBtn = card.children[2].querySelector('button');
  replaceBtn.addEventListener('click', async () => {
    const label = replaceBtn.textContent;
    replaceBtn.disabled = true;
    replaceBtn.textContent = 'Recherche…';
    try {
      const r = await fetch('/api/projects/' + job.id + '/replace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                      body: JSON.stringify({ category: selected.category }) });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error);
      await load(next);
      select(next.products.find((p) => p.category === selected.category));
      replaceBtn.textContent = label;
    } catch (e) {
      replaceBtn.textContent = 'Pas d\'autre choix';
      setTimeout(() => { replaceBtn.textContent = label; }, 2500);
    }
    replaceBtn.disabled = false;
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
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
}
