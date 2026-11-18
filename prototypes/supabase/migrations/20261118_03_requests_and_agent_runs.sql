-- Nester V1 : file d'attente des demandes et mesures des agents (projet Supabase « Nestr. »).
-- Appliquée le 18.11.2026.
-- L'application dépose une demande ; le worker la traite et écrit l'avancement puis le résultat.
-- Aucune règle RLS : seules les routes serveur de l'application et le worker (clé secrète) y accèdent.
create table public.requests (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'project' check (kind in ('project', 'replace', 'understand')),
  parent_id  uuid references public.requests(id) on delete cascade,   -- projet visé par un remplacement
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  payload    jsonb not null default '{}'::jsonb,                      -- la demande
  steps      jsonb not null default '{}'::jsonb,                      -- avancement affiché à l'écran
  result     jsonb,                                                   -- produits, total, URL du salon 3D
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_queue on public.requests (created_at) where status = 'queued';
alter table public.requests enable row level security;

-- Une ligne par lancement d'agent H : les mesures demandées par le jury.
create table public.agent_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null default now(),
  request_id      uuid references public.requests(id) on delete set null,
  retailer        text not null,
  agent           text not null,
  task_kind       text not null,
  query           text,
  duration_s      numeric(7,1),
  outcome         text not null check (outcome in ('success', 'partial', 'failed', 'blocked')),
  products_found  int not null default 0,
  error           text
);
alter table public.agent_runs enable row level security;
