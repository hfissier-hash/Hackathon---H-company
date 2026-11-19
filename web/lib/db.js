// Accès serveur à Supabase (table `requests`). La clé secrète ne quitte jamais le serveur.
import 'server-only';

function config() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
  return { url, key };
}

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Garde-fou pour une application publique : chaque demande lance des agents H, du GPU et le worker.
// Au-delà du plafond horaire, les nouvelles demandes sont refusées (réglable : NESTER_MAX_PER_HOUR).
export async function overQuota(kind, fallback) {
  const max = Number(process.env.NESTER_MAX_PER_HOUR || fallback);
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const rows = await db(`requests?select=id&kind=eq.${kind}&created_at=gte.${since}&limit=${max + 1}`);
  return rows.length >= max;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Forme attendue par les écrans : la demande, l'avancement, puis le résultat (sans la liste des candidats).
export function toProject(row) {
  const { candidates, ...result } = row.result || {};
  return { id: row.id, status: row.status, request: row.payload, steps: row.steps, error: row.error, ...result };
}

export async function getProject(id) {
  const rows = await db(`requests?id=eq.${id}&kind=eq.project&select=id,status,payload,steps,result,error`);
  return rows[0] || null;
}

// Attend qu'une demande courte (remplacement, compréhension) soit traitée par le worker.
export async function waitFor(id, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const rows = await db(`requests?id=eq.${id}&select=status,result,error`);
    if (rows[0] && (rows[0].status === 'done' || rows[0].status === 'failed')) return rows[0];
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}
