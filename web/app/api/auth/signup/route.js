// POST /api/auth/signup {email, password, first_name} : crée un compte.
// Les dimensions du logement sont saisies juste après, sur l'écran « Ton logement » (PATCH /api/me).
import { db, json } from '@/lib/db';
import { EMAIL, VERIFY_EMAIL, setSession, supabaseAuth } from '@/lib/auth';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
  const first_name = String(body.first_name || '').trim().slice(0, 40);
  if (!EMAIL.test(email)) return json({ error: 'Cette adresse mail ne semble pas valide.' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'Le mot de passe doit faire entre 8 et 72 caractères.' }, 400);
  if (!first_name) return json({ error: 'Indique ton prénom.' }, 400);
  try {
    // Avec vérification : Supabase envoie le lien de confirmation. Sans (démo) : compte confirmé d'office.
    const created = VERIFY_EMAIL
      ? await supabaseAuth('signup', { body: { email, password, data: { first_name } } })
      : await supabaseAuth('admin/users', { body: { email, password, email_confirm: true, user_metadata: { first_name } } });
    const id = created.data?.id || created.data?.user?.id;
    // Supabase ne dit pas toujours qu'une adresse existe déjà (pour ne pas la révéler) : identities vide = déjà inscrite.
    const taken = created.status === 422 || created.status === 409 || /already|exist/i.test(created.data?.msg || created.data?.error_code || '')
      || (VERIFY_EMAIL && created.ok && Array.isArray(created.data?.identities) && created.data.identities.length === 0);
    if (taken) return json({ error: 'Un compte existe déjà avec cette adresse. Connecte-toi.' }, 409);
    if (created.status === 429) return json({ error: 'Trop d’inscriptions en ce moment. Réessaie dans quelques minutes.' }, 429);
    if (!created.ok || !id) return json({ error: 'Le compte n’a pas pu être créé.' }, 502);
    await db('profiles', { method: 'POST', body: { id, email, first_name }, prefer: 'resolution=merge-duplicates' });
    if (VERIFY_EMAIL) return json({ ok: true, confirm: true }, 201);
    const login = await supabaseAuth('token?grant_type=password', { body: { email, password } });
    if (!login.ok) return json({ ok: true, confirm: false, login: true }, 201); // compte créé : la personne se connectera
    await setSession(login.data);
    return json({ ok: true, confirm: false }, 201);
  } catch (e) {
    return json({ error: 'Le compte n’a pas pu être créé.' }, 502);
  }
}
