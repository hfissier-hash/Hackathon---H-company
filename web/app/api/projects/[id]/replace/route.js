// POST /api/projects/<id>/replace {category, wish?} : produit suivant de la recherche, ou produit correspondant à une envie
// (« plutôt en velours vert ») que le worker cherche dans le catalogue puis, à défaut, avec un agent H en direct.
import { UUID, db, getProject, json, overQuota, toProject, waitFor } from '@/lib/db';

const CATEGORIES = ['canape', 'fauteuil', 'table_basse', 'meuble_tv', 'etagere', 'tapis', 'luminaire', 'suspension', 'miroir', 'cadre',
  'plante', 'rideau', 'peinture'];
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { id } = await params;
  let category, wish = '';
  try {
    const body = await request.json();
    category = body.category;
    wish = String(body.wish || '').slice(0, 80);
  } catch (e) { category = null; }
  if (!UUID.test(id) || !CATEGORIES.includes(category)) return json({ error: 'demande invalide' }, 400);
  try {
    const project = await getProject(id);
    if (!project || project.status !== 'done') return json({ error: 'projet inconnu ou pas encore prêt' }, 404);
    if (await overQuota('replace', 60)) return json({ error: 'Trop de demandes en ce moment. Réessaie dans quelques minutes.' }, 429);
    const rows = await db('requests', { method: 'POST', body: { kind: 'replace', parent_id: id, payload: { category, wish } }, prefer: 'return=representation' });
    const done = await waitFor(rows[0].id, wish ? 280 : 45); // un agent en direct peut prendre plusieurs minutes
    if (!done) return json({ error: 'Le worker ne répond pas.' }, 504);
    if (done.status === 'failed') return json({ error: done.error || 'Remplacement impossible.' }, 409);
    return json(toProject(await getProject(id)));
  } catch (e) {
    return json({ error: 'Le remplacement a échoué.' }, 502);
  }
}
