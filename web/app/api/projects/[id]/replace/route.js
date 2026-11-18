// POST /api/projects/<id>/replace {category} : produit suivant de la recherche, salon reconstruit par le worker.
import { UUID, db, getProject, json, toProject, waitFor } from '@/lib/db';

const CATEGORIES = ['canape', 'fauteuil', 'table_basse', 'tapis', 'luminaire', 'peinture'];
export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;
  let category;
  try { category = (await request.json()).category; } catch (e) { category = null; }
  if (!UUID.test(id) || !CATEGORIES.includes(category)) return json({ error: 'demande invalide' }, 400);
  try {
    const project = await getProject(id);
    if (!project || project.status !== 'done') return json({ error: 'projet inconnu ou pas encore prêt' }, 404);
    const rows = await db('requests', { method: 'POST', body: { kind: 'replace', parent_id: id, payload: { category } }, prefer: 'return=representation' });
    const done = await waitFor(rows[0].id, 45);
    if (!done) return json({ error: 'Le worker ne répond pas.' }, 504);
    if (done.status === 'failed') return json({ error: done.error || 'Remplacement impossible.' }, 409);
    return json(toProject(await getProject(id)));
  } catch (e) {
    return json({ error: 'Le remplacement a échoué.' }, 502);
  }
}
