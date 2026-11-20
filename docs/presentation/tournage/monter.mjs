// Montage du parcours filmé : remet chaque passage du tournage sur la durée voulue, rend les panneaux « Sous le capot »
// et écrit le plan image par image que composer.swift transforme en deux séquences vidéo (avant et après la scène de l'agent H).
// Usage : node monter.mjs <dossier du tournage> <dossier de travail>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [SHOOT, WORK] = process.argv.slice(2), FPS = 30;
const { frames, marks } = JSON.parse(readFileSync(join(SHOOT, 'tournage.json'), 'utf8'));
mkdirSync(join(WORK, 'panneaux'), { recursive: true });

// Panneaux « Sous le capot » : [étiquette, texte] par ligne, puis la cote jaune. Chiffres du document d'architecture V1.
const PANELS = {
  compte: { n: '1/7', title: 'Tu crées ton compte et tu mesures ton salon', lines: [['Supabase Auth', 'un compte par adresse mail ; le mot de passe n’est jamais stocké par Nestr'], ['Next.js 16 · Vercel', 'les écrans : dimensions, porte, fenêtres, style, budget'], ['route serveur', 'le logement est enregistré avec le compte, dans Supabase']], cote: 'dimensions en cm, porte comprise' },
  style: { n: '2/7', title: 'Tu choisis un style et un budget', lines: [['catalog_products', '476 produits réels, relevés par les agents H'], ['product_tags', 'style et famille de couleur de chaque produit, étiquetés par gpt-oss-120b']], cote: 'le budget borne toute la recherche' },
  envies: { n: '3/7', title: 'Tu décris ce que tu veux', lines: [['gpt-oss-120b', 'lit le texte et les critères : styles, couleurs, taille du canapé'], ['gemma-4-31B', 'lit les photos d’inspiration, les tiennes ou celles de la galerie'], ['Hugging Face', 'les deux modèles ouverts, via Inference Providers']], cote: '2,4 s · médiane · 0,0002 $' },
  recherche: { n: '4/7', title: 'La recherche dans le catalogue', lines: [['search_catalog', 'fonction Postgres : ce qui rentre dans la pièce, passe la porte et tient dans le budget'], ['catégorie par catégorie', 'canapé, tapis, rangement, luminaires, peinture…'], ['gpt-oss-120b', 'classe les produits retenus']], cote: '3,4 s · médiane' },
  salon: { n: '6/7', title: 'Ton salon en 3D, aux vraies dimensions', lines: [['Blender 5.3', 'sans interface, piloté en Python : place chaque meuble'], ['modèles 3D', '439 modèles officiels IKEA, sinon TRELLIS (20 à 37 s), sinon une forme simple'], ['Storage · three.js', 'le fichier .glb va dans Supabase, l’appli l’affiche']], cote: '2,8 s · médiane' },
  photo: { n: '6/7', title: 'Photo réaliste, meubles remplaçables', lines: [['Blender Cycles', 'photographie le même salon : les meubles sont exactement ceux de la liste'], ['aucune IA d’image', 'ne redessine les meubles'], ['remplacer', 'un autre produit du catalogue ; décrit avec tes mots, un agent H part le chercher']], cote: '18 à 20 s · la photo' },
  deco: { n: '6/7', title: 'Déco et peinture, du même catalogue', lines: [['111 peintures', 'Castorama : la teinte du mur d’accent et le nombre de pots'], ['idées', 'meubles et déco du catalogue qui rentrent dans la pièce et le budget'], ['/replace', 'une idée se met dans le salon : Blender le reconstruit']], cote: '2 couches, pots comptés' },
  liste: { n: '7/7', title: 'La liste d’achat, prix vérifiés', lines: [['5 agents H', 'en parallèle, vérifient le prix du jour des 5 produits les plus chers'], ['agent_runs', 'une ligne par session : durée, résultat, erreur'], ['si un agent échoue', 'le produit reste, sans la mention « prix vérifié »']], cote: '28 s · 80 % de réussite' },
  profil: { n: '7/7', title: 'Tes salons, gardés dans ton compte', lines: [['requests', 'chaque demande, son avancement, son résultat, rattachés au compte'], ['Storage salons', 'salon 3D et photo de chaque projet'], ['enregistrer', 'le modèle 3D se retrouve dans le profil']], cote: '2,6 à 3,7 Mo par salon' },
};
// Passages gardés : [repère de début, repère de fin, durée à l'écran en secondes, panneau]. Le reste du tournage (attentes) est coupé.
const PARTS = {
  A: [['accueil', 'compte', 2.5, 'compte'], ['compte', 'motdepasse', 3, 'compte'], ['motdepasse', 'motdepasse-fin', 1, 'compte'], ['motdepasse-fin', 'logement', 1.5, 'compte'], ['logement', 'style', 13, 'compte'],
      ['style', 'envies', 6, 'style'],
      ['envies', 'galerie', 6, 'envies'], ['galerie', 'galerie-prete', 0.6, 'envies'], ['galerie-prete', 'envies-photos', 9.5, 'envies'], ['envies-photos', 'envies-lues', 1, 'envies'], ['envies-lues', 'recherche', 3.4, 'envies'],
      ['recherche', 'salon-pret', 0.5, 'recherche'], ['salon-pret', 'rendu-clic@-0.35', 8, 'recherche']],
  B: [['rendu', 'rendu-pret', 2, 'salon'], ['rendu-pret', 'rendu-tourne', 6, 'salon'],
      ['rendu-tourne', 'photo', 0.8, 'photo'], ['photo', 'photo-prete', 0.5, 'photo'], ['photo-prete', 'photo-vue', 3.2, 'photo'], ['photo-vue', 'remplacer', 1, 'photo'], ['remplacer', 'remplace', 0.8, 'photo'],
      ['remplace', 'retour-3d', 1.7, 'photo'], ['retour-3d', 'sonde', 2, 'photo'], ['meubles', 'meubles-fin', 5, 'photo'],
      ['meubles-fin', 'deco', 1, 'deco'], ['deco', 'deco-fin', 10, 'deco'],
      ['deco-fin', 'liste', 1, 'liste'], ['liste', 'liste-fin', 7.5, 'liste'], ['enseigne', 'enseigne-fin', 3, 'liste'],
      ['profil', 'profil-fin', 8.5, 'profil']],
};
const WANT = { A: 56, B: 54 };

// ---------- panneaux : une image par état (titre seul, puis une ligne de plus à chaque fois)
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function html(p, shown) {
  const vis = (i) => (i < shown ? '' : ' style="opacity:0"');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600..800&amp;family=Figtree:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@500&amp;display=swap" rel="stylesheet">
<style>
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #14332A; color: #EEF1EC; font-family: 'Figtree', Verdana, Arial, sans-serif; }
.logo { position: absolute; left: 130px; top: 96px; font: 800 44px 'Bricolage Grotesque', Arial, sans-serif; color: #fff; letter-spacing: -0.5px; }
.texte { position: absolute; left: 130px; top: 292px; width: 1010px; }
.kicker { margin: 0; font: 500 22px 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #F2C14E; }
h1 { margin: 20px 0 0; font: 700 62px/1.1 'Bricolage Grotesque', Arial, sans-serif; letter-spacing: -1.6px; color: #fff; }
.ligne { display: flex; align-items: baseline; gap: 26px; margin-top: 30px; font-size: 29px; line-height: 1.4; }
.ligne:first-of-type { margin-top: 44px; }
.ligne code { flex-shrink: 0; padding: 7px 14px; border-radius: 6px; background: rgba(242, 193, 78, 0.14); color: #F2C14E; font: 500 22px 'JetBrains Mono', monospace; }
.cote { margin: 46px 0 0; font: 500 30px 'JetBrains Mono', monospace; color: #F2C14E; }
.tel { position: absolute; left: 1298px; top: 58px; width: 444px; height: 957px; border-radius: 34px; background: #FAFAF6; box-shadow: 0 30px 70px -20px rgba(0, 0, 0, 0.55); }
</style></head><body>
<div class="logo">nestr.</div>
<div class="texte"><p class="kicker">Démo · ${p.n} · sous le capot</p><h1>${esc(p.title)}</h1>
${p.lines.map((l, i) => `<div class="ligne"${vis(i)}><code>${esc(l[0])}</code><span>${esc(l[1])}</span></div>`).join('\n')}
<p class="cote"${vis(p.lines.length)}>|— ${esc(p.cote)} —|</p></div>
<div class="tel"></div></body></html>`;
}
for (const [id, p] of Object.entries(PANELS)) for (let k = 0; k <= p.lines.length + 1; k++) {
  const file = join(WORK, 'panneaux', `${id}-${k}`);
  writeFileSync(file + '.html', html(p, k));
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--hide-scrollbars', '--window-size=1920,1080', '--virtual-time-budget=5000', '--screenshot=' + file + '.png', 'file://' + file + '.html'], { stdio: 'ignore' });
}
console.log('panneaux rendus');

// ---------- plan image par image
const at = (t) => { let lo = 0, hi = frames.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid][1] <= t) lo = mid; else hi = mid - 1; } return frames[lo][0]; };
// Un repère peut être décalé de quelques dixièmes : 'rendu-clic@-1.2' = 1,2 s avant le repère.
const M = (name) => { const [n, off] = name.split('@'); return marks[n] + Number(off || 0); };
const plan = {};
for (const [part, segs] of Object.entries(PARTS)) {
  const total = segs.reduce((s, x) => s + x[2], 0);
  if (Math.abs(total - WANT[part]) > 1e-6) throw new Error(`séquence ${part} : ${total} s au lieu de ${WANT[part]}`);
  for (const [a, b] of segs) if (!isFinite(M(a)) || !isFinite(M(b))) throw new Error('repère manquant : ' + a + ' ou ' + b);
  // Début et durée de chaque panneau dans la séquence.
  const spans = []; let t0 = 0;
  for (const s of segs) { const last = spans[spans.length - 1]; if (last && last.id === s[3]) last.d += s[2]; else spans.push({ id: s[3], t: t0, d: s[2] }); t0 += s[2]; }
  const out = [];
  for (let f = 0; f < Math.round(total * FPS); f++) {
    const t = f / FPS; let acc = 0, seg = segs[segs.length - 1], local = 1;
    for (const s of segs) { if (t < acc + s[2]) { seg = s; local = (t - acc) / s[2]; break; } acc += s[2]; }
    const real = M(seg[0]) + local * (M(seg[1]) - M(seg[0]));
    const span = spans.find((x) => t >= x.t && t < x.t + x.d) || spans[spans.length - 1], p = PANELS[span.id], states = p.lines.length + 1;
    // Les lignes apparaissent une à une sur les 55 premiers pour cent du panneau, avec un fondu de 0,4 s.
    const step = Math.min(2.6, span.d * 0.55 / states), u = (t - span.t - 0.5) / step, k = Math.max(0, Math.min(states, Math.floor(u) + 1));
    const mix = k === 0 || k > states ? 1 : Math.max(0, Math.min(1, (u - Math.floor(u)) * step / 0.4));
    out.push([at(real), `${span.id}-${Math.max(0, k - 1)}`, `${span.id}-${k}`, +mix.toFixed(3)]);
  }
  plan[part] = out;
  console.log('séquence', part, ':', out.length, 'images,', total, 's ·', spans.map((x) => x.id + ' ' + x.d.toFixed(1) + ' s').join(', '));
}
writeFileSync(join(WORK, 'plan.json'), JSON.stringify({ fps: FPS, images: join(SHOOT, 'images'), panneaux: join(WORK, 'panneaux'), plan }));
