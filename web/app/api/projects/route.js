// POST /api/projects : dépose une demande de salon dans la file d'attente.
import { db, json } from '@/lib/db';

function number(v, lo, hi, name) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} : valeur attendue entre ${lo} et ${hi}`);
  return n;
}

function validate(body) {
  const room = body.room || {}, wants = body.wants || {};
  return {
    room: { width_cm: number(room.width_cm, 200, 1000, 'largeur'), length_cm: number(room.length_cm, 200, 1000, 'longueur'),
            height_cm: number(room.height_cm, 200, 400, 'hauteur'), door_cm: number(room.door_cm, 60, 200, 'porte') },
    style: String(body.style || 'Scandinave').slice(0, 30),
    budget_eur: number(body.budget_eur, 100, 20000, 'budget'),
    text: String(body.text || '').slice(0, 600),
    wants: { meubles: wants.meubles !== false, deco: wants.deco !== false, peinture: wants.peinture !== false },
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
    const rows = await db('requests', { method: 'POST', body: { kind: 'project', payload }, prefer: 'return=representation' });
    return json({ id: rows[0].id }, 202);
  } catch (e) {
    return json({ error: 'La demande n’a pas pu être enregistrée.' }, 502);
  }
}
