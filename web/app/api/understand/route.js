// POST /api/understand {style, text} : ce que l'IA a compris de la demande (écran Envies).
import { db, json, overQuota, waitFor } from '@/lib/db';

export const maxDuration = 60;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'demande illisible' }, 400); }
  const payload = { style: String(body.style || '').slice(0, 30), text: String(body.text || '').slice(0, 600) };
  if (!payload.text.trim()) return json({ understood: [], llm: false });
  try {
    if (await overQuota('understand', 400)) return json({ understood: [], llm: false });
    const rows = await db('requests', { method: 'POST', body: { kind: 'understand', payload }, prefer: 'return=representation' });
    const done = await waitFor(rows[0].id, 40);
    return json(done && done.status === 'done' ? done.result : { understood: [], llm: false });
  } catch (e) {
    return json({ understood: [], llm: false });
  }
}
