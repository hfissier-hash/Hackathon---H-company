// GET /api/agents : mesures des agents H Company lancés en direct (table agent_runs).
import { db, json } from '@/lib/db';

const KINDS = { search: 'Recherche d’un produit', verify: 'Vérification d’un prix' };

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function GET() {
  try {
    const runs = await db('agent_runs?select=started_at,agent,task_kind,duration_s,outcome,error&order=started_at.desc&limit=500');
    const summary = (list) => {
      const ok = list.filter((r) => r.outcome === 'success');
      return { runs: list.length, success: ok.length, rate: list.length ? Math.round((ok.length / list.length) * 100) : null,
               median_s: median(ok.map((r) => Number(r.duration_s))) };
    };
    const failures = {};
    for (const r of runs) if (r.outcome !== 'success') {
      const reason = String(r.error || 'raison inconnue').replace(/^\w+Error: /, '').slice(0, 70);
      failures[reason] = (failures[reason] || 0) + 1;
    }
    return json({
      ...summary(runs),
      agent: runs[0]?.agent || 'h/web-scraper-flash',
      by_kind: Object.entries(KINDS).map(([kind, label]) => ({ kind, label, ...summary(runs.filter((r) => r.task_kind === kind)) })),
      failures: Object.entries(failures).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
      recent: runs.slice(0, 8).map((r) => ({ at: r.started_at, label: KINDS[r.task_kind] || r.task_kind, outcome: r.outcome, seconds: Number(r.duration_s) })),
    });
  } catch (e) {
    return json({ error: 'Les mesures n’ont pas pu être lues.' }, 502);
  }
}
