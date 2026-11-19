// GET /api/projects/<id>/ideas : d'autres produits du catalogue qui iraient dans ce salon, avec leur photo.
// Meubles et déco : les produits que la recherche avait retenus sans les choisir (ils rentrent dans la pièce et le budget).
// Peinture : les peintures du catalogue dans les couleurs de la palette du salon.
import { UUID, db, json } from '@/lib/db';
import { canSee, currentUser } from '@/lib/auth';

const MEUBLES = ['canape', 'fauteuil', 'table_basse', 'meuble_tv', 'etagere'];
const DECO = ['tapis', 'luminaire', 'suspension', 'miroir', 'cadre', 'plante', 'rideau'];
const COLORS = /^[a-z_]{2,20}$/;

const card = (p) => ({ id: p.id, category: p.category, name: p.name, retailer: p.retailer, price_eur: Number(p.price_eur), url: p.url, image_url: p.image_url,
                       width_cm: p.width_cm, depth_cm: p.depth_cm, height_cm: p.height_cm, color: p.color_family || null });

// Deux idées par catégorie au plus, en alternant les catégories pour varier la rangée.
function mix(candidates, categories, taken, max) {
  const lists = categories.map((c) => (candidates[c] || []).filter((p) => !taken.has(String(p.id)) && p.image_url && p.url).slice(0, 2)
    .map((p) => ({ ...p, category: c })));
  const out = [];
  for (let i = 0; i < 2; i++) for (const l of lists) if (l[i]) out.push(card(l[i]));
  return out.slice(0, max);
}

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: 'projet inconnu' }, 404);
  try {
    const rows = await db(`requests?id=eq.${id}&kind=eq.project&select=status,result,user_id`);
    const row = rows[0];
    if (!row || row.status !== 'done' || !canSee(row, await currentUser())) return json({ error: 'projet inconnu' }, 404);
    const result = row.result || {}, candidates = result.candidates || {};
    const taken = new Set((result.products || []).map((p) => String(p.id)));
    const palette = [result.criteria?.accent_color, ...(result.criteria?.colors || [])].filter((c) => typeof c === 'string' && COLORS.test(c));
    let paints = [];
    if (palette.length) {
      const found = await db(`catalog_products?category=eq.peinture&color_family=in.(${[...new Set(palette)].join(',')})`
        + '&select=id,name,retailer,price_eur,url,image_url,width_cm,depth_cm,height_cm,color_family&order=price_eur.asc&limit=24');
      // la couleur du mur d'accent d'abord, puis les autres teintes de la palette
      paints = found.filter((p) => !taken.has(String(p.id)) && p.image_url)
        .sort((a, b) => palette.indexOf(a.color_family) - palette.indexOf(b.color_family))
        .slice(0, 8).map((p) => card({ ...p, category: 'peinture' }));
    }
    return json({ meubles: mix(candidates, MEUBLES, taken, 8), deco: mix(candidates, DECO, taken, 10), peinture: paints });
  } catch (e) {
    return json({ error: 'Les idées n’ont pas pu être lues.' }, 502);
  }
}
