-- Comptes utilisateurs : l'identité et le mot de passe sont gérés par Supabase Auth (auth.users).
-- `profiles` garde ce que Nestr sait de la personne (prénom, logement) ; `requests.user_id` rattache chaque salon à son auteur.
-- Aucune règle RLS : ces tables ne sont lues et écrites que par le serveur (clé secrète), jamais depuis le navigateur.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  room jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.requests add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists requests_user_id_idx on public.requests (user_id, created_at desc);
