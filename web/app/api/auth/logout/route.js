// POST /api/auth/logout : ferme la session.
import { json } from '@/lib/db';
import { clearSession } from '@/lib/auth';

export async function POST() {
  await clearSession();
  return json({ ok: true });
}
