// Accueil : un vrai salon généré par Nestr, en 3D. Il tourne doucement, les meubles se posent un par un,
// et des étiquettes en verre suivent les produits (nom, prix, « ça rentre »).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { dropIn } from './entree.js';

const view = document.getElementById('scene'), tags = document.getElementById('tags');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
function fallback() { document.getElementById('secours').hidden = false; view.classList.add('pret'); }

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Un salon meublé par Nestr, en 3D');
  view.insertBefore(renderer.domElement, tags);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = !calm;
  controls.autoRotateSpeed = 0.9;
  controls.minPolarAngle = Math.PI / 5;
  controls.maxPolarAngle = Math.PI / 2.6;
  function resize() {
    const r = view.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Murs masqués quand ils passent entre la caméra et la pièce (même règle que l'écran Rendu 3D).
  const WALL_OUT = { Mur_south: [0, 1], Mur_north: [0, -1], Mur_west: [-1, 0], Mur_east: [1, 0] };
  const walls = [], center = new THREE.Vector3();

  // Étiquettes : une par produit choisi, accrochée au sommet de l'objet.
  const WANTED = { canape: 'fit', fauteuil: 'price', etagere: 'price' };
  const labels = [];
  function label(item) {
    const kind = WANTED[item.obj.name.replace(/^P\d+_/, '')];
    if (!kind || labels.length >= 3) return;
    const d = item.obj.userData, name = String(d.nester_name || '').split(/[ ,]/)[0];
    if (!name) return;
    const el = document.createElement('div');
    el.className = 'etiquette';
    el.style.cssText = 'background: var(--surface)'; // pris en charge par la couche de verre
    const dot = document.createElement('i');
    dot.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FAFAF6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
    const text = document.createElement('span'), extra = document.createElement('b');
    text.textContent = name;
    extra.textContent = kind === 'fit' ? 'ça rentre' : Math.round(d.nester_price_eur) + ' €';
    el.append(dot, text, extra);
    tags.appendChild(el);
    labels.push({ el, at: item.top.clone() });
    requestAnimationFrame(() => el.classList.add('vue'));
  }
  const v = new THREE.Vector3();
  function placeLabels() {
    const w = view.clientWidth, h = view.clientHeight, placed = [];
    for (const l of labels) {
      v.copy(l.at).project(camera);
      const lw = l.el.offsetWidth, lh = l.el.offsetHeight;
      const x = Math.min(w - lw - 8, Math.max(8, (v.x + 1) / 2 * w - lw / 2));
      let y = Math.max(70, (1 - v.y) / 2 * h - 10 - lh);
      // deux étiquettes ne se recouvrent pas : la suivante monte d'un cran
      for (const r of placed) if (x < r.x + r.w + 6 && r.x < x + lw + 6 && y < r.y + lh + 6 && r.y < y + lh + 6) y = r.y - lh - 5;
      placed.push({ x, y, w: lw });
      l.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
  }

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
  new GLTFLoader().setDRACOLoader(draco).load('../demo/salon.glb', (gltf) => {
    const room = gltf.scene;
    scene.add(room);
    room.traverse((o) => { if (o.isMesh && WALL_OUT[o.name]) walls.push(o); });
    const box = new THREE.Box3().setFromObject(room), size = box.getSize(new THREE.Vector3());
    box.getCenter(center);
    // Cadrage : la pièce entière tient à l'écran quel que soit l'angle de la rotation, même sur un écran étroit.
    // On recule la caméra jusqu'à ce que la sphère qui englobe la pièce entre dans le champ le plus étroit.
    const radius = Math.hypot(size.x, size.y, size.z) / 2;
    const dir = new THREE.Vector3(0.7, 0.78, 0.85).normalize();
    function frame() {
      const half = THREE.MathUtils.degToRad(camera.fov) / 2;
      const narrow = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, radius / Math.sin(narrow) * 1.04);
      controls.update();
    }
    frame();
    addEventListener('resize', frame);
    const entrance = dropIn(room, THREE, { delay: 500, gap: 150, onLand: label });
    view.classList.add('pret');
    renderer.setAnimationLoop(() => {
      controls.update();
      for (const wall of walls) {
        const [nx, nz] = WALL_OUT[wall.name];
        wall.visible = (camera.position.x - center.x) * nx + (camera.position.z - center.z) * nz < 0.4;
      }
      entrance.tick();
      renderer.render(scene, camera);
      placeLabels();
    });
  }, undefined, fallback);
} catch (e) {
  fallback();
}
