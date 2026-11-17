-- Nester : catalogue de produits (cache des agents H) + mesures des lancements d'agents.
-- Appliquée le 17.11.2026 sur le projet Supabase « hfissier's Project ».
create table public.catalog_products (
  id               bigint generated always as identity primary key,
  url              text not null unique,                 -- clé anti-doublon
  retailer         text not null check (retailer in ('ikea','maisonsdumonde','castorama')),
  category         text not null check (category in ('canape','fauteuil','table_basse','tapis','luminaire','coussin','rangement','deco','peinture')),
  name             text not null,
  price_eur        numeric(10,2),
  image_url        text,
  width_cm         numeric(7,1),
  depth_cm         numeric(7,1),
  height_cm        numeric(7,1),
  diameter_cm      numeric(7,1),
  shape            text not null default 'rectangle' check (shape in ('rectangle','L','rond')),
  convertible      boolean not null default false,
  unfolded_width_cm numeric(7,1),
  unfolded_depth_cm numeric(7,1),
  package_dims     jsonb,                                -- [{width_cm,height_cm,length_cm,weight_kg}]
  volume_l         numeric(6,2),                         -- peinture
  coverage_m2_per_l_min numeric(5,2),                    -- peinture : calcul sur le minimum
  coverage_m2_per_l_max numeric(5,2),
  color            text,                                 -- tel qu'écrit par l'enseigne
  color_family     text,                                 -- normalisé par le LLM
  material         text,
  style_tags       text[] not null default '{}',         -- normalisé par le LLM
  off_topic        boolean not null default false,       -- produit hors sujet (ex. coussin de Noël)
  in_stock         boolean,
  model_glb_url    text,                                 -- modèle 3D généré (TRELLIS…)
  source_agent     text,                                 -- ex. h/web-scraper-flash
  scraped_at       timestamptz not null default now(),
  -- un produit est « complet » si les cotes utiles à sa catégorie sont présentes
  is_complete      boolean generated always as (
    price_eur is not null and case
      when category in ('canape','fauteuil','table_basse','rangement') then width_cm is not null and depth_cm is not null and height_cm is not null
      when category = 'tapis' then width_cm is not null and depth_cm is not null
      when category = 'luminaire' then height_cm is not null
      when category = 'peinture' then volume_l is not null and coverage_m2_per_l_min is not null
      else true end) stored
);
create index catalog_products_search on public.catalog_products (category, price_eur, width_cm) where not off_topic;
create index catalog_products_styles on public.catalog_products using gin (style_tags);

create table public.agent_runs (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  retailer       text not null,
  agent          text not null,                          -- h/web-scraper-flash, h/web-surfer-flash…
  task_kind      text not null,                          -- search, product_page, image, model_3d…
  query          text,
  duration_s     numeric(7,1),
  outcome        text not null check (outcome in ('success','partial','failed','blocked')),
  products_found int not null default 0,
  fields_found   int,
  fields_expected int,
  error          text
);

-- Sécurité : lecture publique du catalogue (l'appli l'affiche), aucune écriture
-- possible avec la clé publique ; seuls les workers (clé service) écrivent.
alter table public.catalog_products enable row level security;
alter table public.agent_runs enable row level security;
create policy "catalogue lisible par tous" on public.catalog_products for select to anon, authenticated using (true);
-- agent_runs : aucune policy = invisible et non modifiable avec la clé publique.
