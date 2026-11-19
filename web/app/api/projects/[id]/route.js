// GET /api/projects/<id> : avancement puis résultat d'un projet.
// PATCH /api/projects/<id> {saved?, name?} : enregistre le salon dans le profil de son auteur, le renomme ou le retire.
import { UUID, db, getProject, json, toProject } from '@/lib/db';
import { canSee, currentUser } from '@/lib/auth';

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: 'projet inconnu' }, 404);
  try {
    const row = await getProject(id);
    if (row && !canSee(row, await currentUser())) return json({ error: 'projet inconnu' }, 404);
    return row ? json(toProject(row)) : json({ error: 'projet inconnu' }, 404);
  } catch (e) {
    return json({ error: 'Le projet n’a pas pu être lu.' }, 502);
  }
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  if (!UUID.test(id)) return json({ error: 'projet inconnu' }, 404);
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Connecte-toi pour enregistrer un salon.' }, 401);
    const row = await getProject(id);
    if (!row || row.user_id !== user.id) return json({ error: 'projet inconnu' }, 404); // seul l'auteur enregistre son salon
    if (row.status !== 'done') return json({ error: 'Le salon n’est pas encore prêt.' }, 409);
    // L'enregistrement vit dans la demande (payload), que le worker ne réécrit jamais.
    const payload = { ...row.payload };
    if (body.saved === true && !payload.saved_at) payload.saved_at = new Date().toISOString();
    if (body.saved === false) delete payload.saved_at;
    if (typeof body.name === 'string') {
      const name = body.name.replace(/\s+/g, ' ').trim().slice(0, 40);
      if (name) payload.name = name; else delete payload.name;
    }
    await db(`requests?id=eq.${id}`, { method: 'PATCH', body: { payload } });
    return json({ id, saved: Boolean(payload.saved_at), name: payload.name || null });
  } catch (e) {
    return json({ error: 'Le salon n’a pas pu être enregistré.' }, 502);
  }
}
