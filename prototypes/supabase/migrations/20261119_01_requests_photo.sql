-- Nester : nouveau type de demande « photo » (rendu photoréaliste d'un projet).
-- Appliquée le 19.11.2026 sur le projet « Nestr. ».
alter table public.requests drop constraint requests_kind_check;
alter table public.requests add constraint requests_kind_check check (kind in ('project', 'replace', 'understand', 'photo'));
