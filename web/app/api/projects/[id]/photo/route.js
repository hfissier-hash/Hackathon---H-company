// POST /api/projects/<id>/photo : rendu photoréaliste du salon (Blender, moteur Cycles) fait par le worker.
import { UUID, db, getProject, json, toProject, waitFor } from '@/lib/db';

export const maxDuration = 300;

export async function POST(_request, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: 'demande invalide' }, 400);
  try {
    const project = await getProject(id);
    if (!project || project.status !== 'done') return json({ error: 'projet inconnu ou pas encore prêt' }, 404);
    const current = project.result || {};
    if (current.photo && current.photo.version === current.version) return json(toProject(project)); // déjà à jour
    const rows = await db('requests', { method: 'POST', body: { kind: 'photo', parent_id: id }, prefer: 'return=representation' });
    const done = await waitFor(rows[0].id, 280); // la toute première photo compile le moteur : plusieurs minutes
    if (!done) return json({ error: 'Le worker ne répond pas.' }, 504);
    if (done.status === 'failed') return json({ error: done.error || 'Le rendu a échoué.' }, 502);
    return json(toProject(await getProject(id)));
  } catch (e) {
    return json({ error: 'Le rendu a échoué.' }, 502);
  }
}
