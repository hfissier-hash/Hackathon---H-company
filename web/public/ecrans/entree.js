// Entrée en scène d'un salon : les meubles se posent un par un, avec un léger rebond.
// Utilisé par l'accueil et par l'écran « Rendu 3D ». `root` est la scène du .glb ; les produits y sont
// les objets nommés P<n>_<catégorie>. Renvoie { tick, done } : appeler tick() à chaque image.
export function dropIn(root, THREE, opts) {
  const o = Object.assign({ delay: 250, gap: 130, duration: 750, height: 1.1, onLand: null }, opts);
  const items = root.children
    .filter((c) => /^P\d+_/.test(c.name))
    .sort((a, b) => parseInt(a.name.slice(1), 10) - parseInt(b.name.slice(1), 10))
    .map((obj, i) => {
      const box = new THREE.Box3().setFromObject(obj);
      const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      return { obj, i, pivot, top: new THREE.Vector3(pivot.x, box.max.y, pivot.z), p0: obj.position.clone(), s0: obj.scale.clone(), landed: false };
    });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !items.length) {
    items.forEach((it) => o.onLand && o.onLand(it));
    return { items, tick() {}, done: Promise.resolve() };
  }
  for (const it of items) it.obj.visible = false;
  const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }; // dépasse puis revient
  const start = performance.now() + o.delay;
  let finish;
  const done = new Promise((r) => { finish = r; });
  let over = false;
  function tick() {
    if (over) return;
    const now = performance.now();
    let all = true;
    for (const it of items) {
      const t = (now - start - it.i * o.gap) / o.duration;
      if (t <= 0) { all = false; continue; }
      const k = Math.min(1, t), s = Math.max(0.001, back(k)), fall = Math.pow(1 - k, 2) * o.height;
      it.obj.visible = true;
      it.obj.scale.copy(it.s0).multiplyScalar(s);
      // la mise à l'échelle se fait autour du pied de l'objet, pas autour de l'origine de la scène
      it.obj.position.copy(it.pivot).addScaledVector(it.p0.clone().sub(it.pivot), s);
      it.obj.position.y += fall;
      if (k < 1) all = false;
      else if (!it.landed) { it.landed = true; it.obj.scale.copy(it.s0); it.obj.position.copy(it.p0); o.onLand && o.onLand(it); }
    }
    if (all) { over = true; finish(); }
  }
  return { items, tick, done };
}

// Mise en scène d'un salon : vraies ombres portées et socle d'ombre sous la pièce, pour qu'elle ne flotte pas dans le vide.
// La lumière suit la caméra (elle vient de derrière l'épaule) : les murs masqués côté caméra ne font donc jamais d'ombre sur la pièce.
// Renvoie { fit(root), follow(camera) } : fit() à chaque salon chargé, follow() à chaque image.
export function stage(THREE, renderer, scene, sun) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5;
  scene.add(sun.target);
  const center = new THREE.Vector3(), offset = new THREE.Vector3();
  let radius = 4, pad = null;
  function fit(root) {
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    box.getCenter(center);
    radius = Math.hypot(size.x, size.y, size.z) / 2;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.name !== 'Sol';
      o.receiveShadow = true;
    });
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -radius * 1.15;
    cam.right = cam.top = radius * 1.15;
    cam.near = 0.1;
    cam.far = radius * 7;
    cam.updateProjectionMatrix();
    sun.target.position.copy(center);
    // Socle : une ombre douce qui déborde de la pièce, dessinée une fois sur un disque.
    if (pad) { scene.remove(pad); pad.geometry.dispose(); pad.material.map.dispose(); pad.material.dispose(); }
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d'), grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.30)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.scale.set(size.x * 1.75, size.z * 1.75, 1);
    pad.position.set(center.x, box.min.y - 0.03, center.z);
    pad.renderOrder = -1;
    scene.add(pad);
  }
  function follow(camera) {
    offset.copy(camera.position).sub(center).setY(0);
    if (offset.lengthSq() < 1e-6) offset.set(1, 0, 1);
    offset.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.6); // un peu de côté, pour que les ombres se voient
    sun.position.copy(center).addScaledVector(offset, radius * 1.6).setY(center.y + radius * 2.4);
  }
  return { fit, follow };
}
