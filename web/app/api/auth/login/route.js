// POST /api/auth/login {email, password} : ouvre une session (cookies httpOnly).
import { json } from '@/lib/db';
import { EMAIL, setSession, supabaseAuth } from '@/lib/auth';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
  if (!EMAIL.test(email) || !password || password.length > 72) return json({ error: 'Adresse mail ou mot de passe incorrect.' }, 401);
  try {
    const r = await supabaseAuth('token?grant_type=password', { body: { email, password } });
    if (r.ok && r.data?.access_token) { await setSession(r.data); return json({ ok: true }); }
    if (/not confirmed/i.test(r.data?.msg || r.data?.error_description || '') || r.data?.error_code === 'email_not_confirmed') {
      return json({ error: 'Ton adresse n’est pas encore vérifiée : clique sur le lien reçu par mail.' }, 403);
    }
    if (r.status === 429) return json({ error: 'Trop d’essais. Réessaie dans quelques minutes.' }, 429);
    return json({ error: 'Adresse mail ou mot de passe incorrect.' }, 401);
  } catch (e) {
    return json({ error: 'La connexion a échoué. Réessaie.' }, 502);
  }
}
