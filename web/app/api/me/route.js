// GET /api/me : la personne connectée et son logement. PATCH /api/me {first_name?, room?} : met à jour le profil.
import { db, json } from '@/lib/db';
import { currentUser, profileOf } from '@/lib/auth';
import { validRoom } from '@/lib/room';

export async function GET() {
  try {
    const user = await currentUser();
    return user ? json({ user: await profileOf(user) }) : json({ error: 'non connecté' }, 401);
  } catch (e) {
    return json({ error: 'Le compte n’a pas pu être lu.' }, 502);
  }
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'non connecté' }, 401);
    const patch = { id: user.id, email: user.email, updated_at: new Date().toISOString() };
    if (body.first_name !== undefined) patch.first_name = String(body.first_name).trim().slice(0, 40);
    if (body.room !== undefined) {
      try { patch.room = validRoom(body.room); } catch (e) { return json({ error: e.message }, 400); }
    }
    await db('profiles', { method: 'POST', body: patch, prefer: 'resolution=merge-duplicates' });
    return json({ user: await profileOf(user) });
  } catch (e) {
    return json({ error: 'Le profil n’a pas pu être enregistré.' }, 502);
  }
}
