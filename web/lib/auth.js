// Comptes utilisateurs, via Supabase Auth. Tout passe par le serveur : le navigateur ne reçoit que deux cookies
// illisibles par les scripts (httpOnly), jamais de clé ni de jeton.
// NESTER_VERIFY_EMAIL=1 : le compte doit être confirmé par le lien reçu par mail avant la première connexion.
// Sans ce réglage (démo), le compte est utilisable tout de suite : Supabase limite l'envoi de mails à quelques-uns par heure.
import 'server-only';
import { cookies } from 'next/headers';
import { db } from './db';

const ACCESS = 'nestr_at', REFRESH = 'nestr_rt';
export const VERIFY_EMAIL = process.env.NESTER_VERIFY_EMAIL === '1';

function config() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
  return { url, key };
}

// Appel à l'API d'authentification de Supabase ; renvoie { ok, status, data }.
export async function supabaseAuth(path, { method = 'POST', body, token } = {}) {
  const { url, key } = config();
  const res = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token || key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse vide */ }
  return { ok: res.ok, status: res.status, data };
}

const cookie = (maxAge) => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge });

export async function setSession(session) {
  const jar = await cookies();
  jar.set(ACCESS, session.access_token, cookie(Math.max(60, (session.expires_in || 3600) - 30)));
  jar.set(REFRESH, session.refresh_token, cookie(60 * 60 * 24 * 30));
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

// La personne connectée ({ id, email }) ou null. Le jeton d'accès dure une heure : il est renouvelé au besoin.
export async function currentUser() {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value, refresh = jar.get(REFRESH)?.value;
  if (access) {
    const r = await supabaseAuth('user', { method: 'GET', token: access });
    if (r.ok && r.data?.id) return { id: r.data.id, email: r.data.email };
  }
  if (refresh) {
    const r = await supabaseAuth('token?grant_type=refresh_token', { body: { refresh_token: refresh } });
    if (r.ok && r.data?.access_token) {
      try { await setSession(r.data); } catch (e) { /* hors d'une route : la session sera renouvelée au prochain appel */ }
      return { id: r.data.user.id, email: r.data.user.email };
    }
  }
  return null;
}

export async function profileOf(user) {
  const rows = await db(`profiles?id=eq.${user.id}&select=first_name,room`);
  return { email: user.email, first_name: rows[0]?.first_name || '', room: rows[0]?.room || null };
}

// Un salon rattaché à un compte n'est visible que par son auteur ; les salons sans auteur (avant les comptes, démo) restent ouverts.
export function canSee(row, user) {
  return !row.user_id || (user && user.id === row.user_id);
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
