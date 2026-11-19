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
