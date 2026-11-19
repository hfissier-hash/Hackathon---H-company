// POST /api/inspire {images} : un modèle de vision lit les photos d'inspiration (styles, couleurs, ce qu'on y voit).
// Jusqu'à 3 photos : images réduites par le navigateur (data:image/jpeg) ou exemples Unsplash de l'écran Envies.
import { db, json, overQuota, waitFor } from '@/lib/db';

export const maxDuration = 60;
const EMPTY = { styles: [], colors: [], accent_color: null, detected: [], llm: false };
const DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  const images = (Array.isArray(body.images) ? body.images : []).filter((u) => typeof u === 'string'
    && ((u.length < 600000 && DATA.test(u)) || /^https:\/\/images\.unsplash\.com\/[\w\-./?=&%;]+$/.test(u))).slice(0, 3);
  if (!images.length) return json(EMPTY);
  try {
    if (await overQuota('understand', 400)) return json(EMPTY);
    const rows = await db('requests', { method: 'POST', body: { kind: 'understand', payload: { images } }, prefer: 'return=representation' });
    const done = await waitFor(rows[0].id, 50);
    return json(done && done.status === 'done' ? done.result : EMPTY);
  } catch (e) {
    return json(EMPTY);
  }
}
