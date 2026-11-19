// GET /api/projects/<id> : avancement puis résultat d'un projet.
import { UUID, getProject, json, toProject } from '@/lib/db';
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
