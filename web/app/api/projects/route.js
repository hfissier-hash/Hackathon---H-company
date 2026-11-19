// POST /api/projects : dépose une demande de salon dans la file d'attente, rattachée au compte connecté.
// GET /api/projects : les salons enregistrés de la personne connectée, du plus récent au plus ancien.
import { db, json, overQuota } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { number, validRoom } from '@/lib/room';

const words = (list) => (Array.isArray(list) ? list : []).filter((w) => typeof w === 'string' && /^[a-z_]{2,20}$/.test(w)).slice(0, 4);

function validate(body) {
  const wants = body.wants || {}, size = validRoom(body.room);
  return {
    room: size,
    style: String(body.style || 'Scandinave').slice(0, 30),
    budget_eur: number(body.budget_eur, 100, 20000, 'budget'),
    text: String(body.text || '').slice(0, 600),
    wants: { meubles: wants.meubles !== false, deco: wants.deco !== false, peinture: wants.peinture !== false },
    // Résultat de l'analyse des photos d'inspiration ; le worker ne garde que les valeurs de ses listes.
    inspiration: { styles: words(body.inspiration?.styles), colors: words(body.inspiration?.colors),
                   accent_color: words([body.inspiration?.accent_color])[0] || null,
                   materials: words(body.inspiration?.materials), ambiance: words([body.inspiration?.ambiance])[0] || null,
                   // phrases écrites par le modèle de vision : relues par le styliste comme des données
                   brief: String(body.inspiration?.brief || '').slice(0, 220),
                   detected: (Array.isArray(body.inspiration?.detected) ? body.inspiration.detected : []).slice(0, 4).map((d) => String(d).slice(0, 40)) },
  };
}

export async function POST(request) {
  let payload;
  try {
    payload = validate(await request.json());
  } catch (e) {
    return json({ error: e.message || 'demande illisible' }, 400);
  }
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Connecte-toi pour créer un salon.' }, 401);
    if (await overQuota('project', 40)) return json({ error: 'Trop de demandes en ce moment. Réessaie dans quelques minutes.' }, 429);
    const rows = await db('requests', { method: 'POST', body: { kind: 'project', payload, user_id: user.id }, prefer: 'return=representation' });
    return json({ id: rows[0].id }, 202);
  } catch (e) {
    return json({ error: 'La demande n’a pas pu être enregistrée.' }, 502);
  }
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'non connecté' }, 401);
    const rows = await db(`requests?user_id=eq.${user.id}&kind=eq.project&status=eq.done&select=id,created_at,payload,result&order=created_at.desc&limit=30`);
    return json({ projects: rows.map((r) => {
      const res = r.result || {}, products = res.products || [];
      return { id: r.id, created_at: r.created_at, style: r.payload?.style, budget_eur: r.payload?.budget_eur, text: String(r.payload?.text || '').slice(0, 120),
               room: { width_cm: r.payload?.room?.width_cm, length_cm: r.payload?.room?.length_cm },
               total_eur: res.total_eur, count: products.length, palette: (res.palette || []).map((c) => c.hex).slice(0, 5),
               photo: res.photo?.url || null, images: products.slice(0, 4).map((p) => p.image_url).filter(Boolean) };
    }) });
  } catch (e) {
    return json({ error: 'Les salons n’ont pas pu être lus.' }, 502);
  }
}
