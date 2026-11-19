// GET /api/gallery : photos de la galerie d'inspiration, rangées par thème dans un dossier du Storage Supabase.
// Le dossier peut rester privé : le serveur liste les fichiers avec sa clé et renvoie des liens signés, valables 6 h.
// Réglages : GALLERY_SUPABASE_URL, GALLERY_SUPABASE_KEY (clé secrète, jamais envoyée au navigateur), GALLERY_BUCKET.
// Sans ces réglages : dossier `inspirations` du projet de l'équipe.
import 'server-only';

const IMAGE = /\.(jpe?g|png|webp)$/i;
const PER_THEME = 12, HOURS = 6;
// Dossiers du Storage qui ne doivent pas apparaître dans la galerie (rangés là par erreur).
const HIDDEN = ['boho-chic'];

async function storage(url, key, path, body) {
  const res = await fetch(`${url}/storage/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Storage a répondu ${res.status}`);
  return res.json();
}

// « scandinave-salon » -> « Scandinave salon »
function label(folder) {
  const t = folder.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

let cached = null; // les liens sont valables 6 h : la liste est refaite toutes les 30 minutes au plus

export async function GET() {
  const url = (process.env.GALLERY_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.GALLERY_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.GALLERY_BUCKET || 'inspirations';
  if (!url || !key) return Response.json({ photos: [], themes: [], error: 'galerie non configurée' });
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return Response.json(cached.data);
  try {
    const order = { column: 'name', order: 'asc' };
    const root = await storage(url, key, `object/list/${bucket}`, { prefix: '', limit: 100, sortBy: order });
    const files = root.filter((o) => o.id && IMAGE.test(o.name)).slice(0, PER_THEME).map((o) => ({ path: o.name, theme: '' }));
    const folders = root.filter((o) => !o.id && !HIDDEN.includes(o.name)).slice(0, 24);
    const lists = await Promise.all(folders.map((f) => storage(url, key, `object/list/${bucket}`, { prefix: f.name + '/', limit: PER_THEME + 4, sortBy: order })));
    folders.forEach((f, i) => lists[i].filter((o) => o.id && IMAGE.test(o.name)).slice(0, PER_THEME)
      .forEach((o) => files.push({ path: `${f.name}/${o.name}`, theme: label(f.name) })));
    if (!files.length) return Response.json({ photos: [], themes: [] });
    const signed = await storage(url, key, `object/sign/${bucket}`, { expiresIn: HOURS * 3600, paths: files.map((f) => f.path) });
    const photos = files.map((f, i) => ({ url: signed[i] && signed[i].signedURL ? `${url}/storage/v1${signed[i].signedURL}` : null, theme: f.theme }))
      .filter((p) => p.url);
    const data = { photos, themes: [...new Set(photos.map((p) => p.theme).filter(Boolean))] };
    cached = { at: Date.now(), data };
    return Response.json(data);
  } catch (e) {
    return Response.json({ photos: [], themes: [], error: 'galerie indisponible' });
  }
}
