// GET /api/projects/<id> : avancement puis résultat d'un projet.
import { UUID, getProject, json, toProject } from '@/lib/db';

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: 'projet inconnu' }, 404);
  try {
    const row = await getProject(id);
    return row ? json(toProject(row)) : json({ error: 'projet inconnu' }, 404);
  } catch (e) {
    return json({ error: 'Le projet n’a pas pu être lu.' }, 502);
  }
}
