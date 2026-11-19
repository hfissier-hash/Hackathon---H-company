// GET /api/gallery : photos de la galerie d'inspiration, rangées dans le Storage Supabase (dossier public).
// Par défaut le dossier `inspirations` du projet de l'équipe ; GALLERY_SUPABASE_URL, GALLERY_SUPABASE_KEY et
// GALLERY_BUCKET permettent de pointer vers un autre projet Supabase.
import 'server-only';

const IMAGE = /\.(jpe?g|png|webp)$/i;

async function list(url, key, bucket, prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 200, sortBy: { column: 'name', order: 'asc' } }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Storage a répondu ${res.status}`);
  return res.json();
}

export async function GET() {
  const url = process.env.GALLERY_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.GALLERY_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.GALLERY_BUCKET || 'inspirations';
  if (!url || !key) return Response.json({ photos: [], error: 'galerie non configurée' });
  try {
    const photos = [];
    const add = (prefix, o) => photos.push({ url: `${url}/storage/v1/object/public/${bucket}/${prefix}${encodeURIComponent(o.name)}`,
                                             theme: prefix.replace(/\/$/, '') });
    const root = await list(url, key, bucket, '');
    for (const o of root) {
      if (o.id && IMAGE.test(o.name)) add('', o);
      else if (!o.id && photos.length < 200) {  // un sous-dossier = un thème (ex. « scandinave »)
        for (const p of await list(url, key, bucket, o.name + '/')) if (p.id && IMAGE.test(p.name)) add(o.name + '/', p);
      }
    }
    return Response.json({ photos: photos.slice(0, 200) }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch (e) {
    return Response.json({ photos: [], error: 'galerie indisponible' });
  }
}
