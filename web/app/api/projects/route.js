// POST /api/projects : dépose une demande de salon dans la file d'attente.
import { db, json, overQuota } from '@/lib/db';

function number(v, lo, hi, name) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} : valeur attendue entre ${lo} et ${hi}`);
  return n;
}

const words = (list) => (Array.isArray(list) ? list : []).filter((w) => typeof w === 'string' && /^[a-z_]{2,20}$/.test(w)).slice(0, 4);

const WALLS = ['north', 'south', 'east', 'west'];

// Une ouverture (porte ou fenêtre) : un mur, une position le long du mur, une largeur, ramenées dans le mur.
function opening(o, room, minWidth, maxWidth, name) {
  if (!o || !WALLS.includes(o.wall)) throw new Error(`${name} : mur inconnu`);
  const run = o.wall === 'north' || o.wall === 'south' ? room.width_cm : room.length_cm;
  const width = Math.min(number(o.width_cm, minWidth, maxWidth, name), run - 20);
  const offset = Math.min(Math.max(Number(o.offset_cm) || 0, 5), run - width - 5);
  return { wall: o.wall, offset_cm: Math.round(offset), width_cm: Math.round(width) };
}

function validate(body) {
  const room = body.room || {}, wants = body.wants || {};
  const size = { width_cm: number(room.width_cm, 200, 1000, 'largeur'), length_cm: number(room.length_cm, 200, 1000, 'longueur'),
                 height_cm: number(room.height_cm, 200, 400, 'hauteur'), door_cm: number(room.door_cm, 60, 200, 'porte') };
  // Porte et fenêtres placées sur le plan ; absentes, le worker prend une disposition par défaut.
  if (room.door) {
    size.door = { ...opening({ ...room.door, width_cm: room.door.width_cm || size.door_cm }, size, 60, 200, 'porte'),
                  opens: room.door.opens === 'out' ? 'out' : 'in', hinge: room.door.hinge === 'end' ? 'end' : 'start' };
    size.door_cm = size.door.width_cm;
  }
  if (Array.isArray(room.windows)) size.windows = room.windows.slice(0, 4).map((w) => opening(w, size, 40, 300, 'fenêtre'));
  return {
    room: size,
    style: String(body.style || 'Scandinave').slice(0, 30),
    budget_eur: number(body.budget_eur, 100, 20000, 'budget'),
    text: String(body.text || '').slice(0, 600),
    wants: { meubles: wants.meubles !== false, deco: wants.deco !== false, peinture: wants.peinture !== false },
    // Résultat de l'analyse des photos d'inspiration ; le worker ne garde que les valeurs de ses listes.
    inspiration: { styles: words(body.inspiration?.styles), colors: words(body.inspiration?.colors),
                   accent_color: words([body.inspiration?.accent_color])[0] || null,
                   materials: words(body.inspiration?.materials), ambiance: words([body.inspiration?.ambiance])[0] || null,
                   // phrases écrites par le modèle de vision : relues par le styliste comme des données
                   brief: String(body.inspiration?.brief || '').slice(0, 220),
                   detected: (Array.isArray(body.inspiration?.detected) ? body.inspiration.detected : []).slice(0, 4).map((d) => String(d).slice(0, 40)) },
  };
}

export async function POST(request) {
  let payload;
  try {
    payload = validate(await request.json());
  } catch (e) {
    return json({ error: e.message || 'demande illisible' }, 400);
  }
  try {
    if (await overQuota('project', 40)) return json({ error: 'Trop de demandes en ce moment. Réessaie dans quelques minutes.' }, 429);
    const rows = await db('requests', { method: 'POST', body: { kind: 'project', payload }, prefer: 'return=representation' });
    return json({ id: rows[0].id }, 202);
  } catch (e) {
    return json({ error: 'La demande n’a pas pu être enregistrée.' }, 502);
  }
}
