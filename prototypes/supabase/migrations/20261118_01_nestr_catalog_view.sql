-- Nester : branche le catalogue de l'équipe (table `products`, projet Supabase « Nestr. »)
-- sur le format attendu par l'application, sans modifier `products`.
-- Appliquée le 18.11.2026 sur le projet `yfwmjrrbgaqanvnlhzhp`.

-- 1. Ce que l'application ajoute à chaque fiche : style, famille de couleur, modèle 3D.
create table public.product_tags (
  product_id    bigint primary key references public.products(id) on delete cascade,
  style_tags    text[] not null default array[]::text[],   -- rempli par gpt-oss-120b
  color_family  text,                                      -- rempli par gpt-oss-120b
  off_topic     boolean not null default false,
  model_glb_url text,                                      -- modèle 3D TRELLIS
  tagged_at     timestamptz not null default now()
);
alter table public.product_tags enable row level security;
create policy "tags lisibles par tous" on public.product_tags for select to anon, authenticated using (true);

-- 2. Vue au format `catalog_products` (voir 20261117_01) : colonnes à plat, catégories Nester.
--    Périmètre : ce que Blender sait poser + la peinture. Canapés d'angle exclus
--    (leur profondeur est celle de l'assise, pas de l'angle).
--    Déplié : la largeur reste celle du canapé, la profondeur est la plus grande mesure dépliée.
create view public.catalog_products with (security_invoker = true) as
select
  p.id,
  p.source_url as url,
  case p.source_site when 'ikea.com' then 'ikea' when 'castorama.fr' then 'castorama' else p.source_site end as retailer,
  c.category,
  p.name,
  p.price as price_eur,
  p.image_url,
  d.w as width_cm, d.d as depth_cm, d.h as height_cm, d.dia as diameter_cm,
  case when (d.dia is not null and p.dimensions->>'largeur_cm' is null)
            or lower(p.attributes->>'forme') in ('rond', 'ronde') then 'rond' else 'rectangle' end as shape,
  (p.dimensions ? 'deplie') as convertible,
  case when p.dimensions ? 'deplie' then d.w end as unfolded_width_cm,
  case when p.dimensions ? 'deplie' then greatest(
    (p.dimensions->'deplie'->>'largeur_cm')::numeric, (p.dimensions->'deplie'->>'profondeur_cm')::numeric, d.d) end as unfolded_depth_cm,
  (select jsonb_agg(jsonb_build_object('width_cm', b->'largeur_cm', 'height_cm', b->'hauteur_cm',
                                       'length_cm', b->'longueur_cm', 'weight_kg', b->'poids_kg'))
     from jsonb_array_elements(p.dimensions->'colis') b) as package_dims,
  (p.attributes->>'contenance_l')::numeric as volume_l,
  (p.attributes->>'rendement_m2_l')::numeric as coverage_m2_per_l_min,
  (p.attributes->>'rendement_m2_l')::numeric as coverage_m2_per_l_max,
  p.attributes->>'couleur' as color,
  t.color_family,
  p.attributes->>'matiere' as material,
  coalesce(t.style_tags, array[]::text[]) as style_tags,
  coalesce(t.off_topic, false) as off_topic,
  null::boolean as in_stock,
  t.model_glb_url,
  null::text as source_agent,
  p.scraped_at,
  (p.price is not null and case
     when c.category in ('canape', 'fauteuil', 'table_basse') then d.w is not null and d.d is not null and d.h is not null
     when c.category = 'tapis' then d.w is not null and d.d is not null
     when c.category = 'luminaire' then d.h is not null
     when c.category = 'peinture' then p.attributes ? 'contenance_l' and p.attributes ? 'rendement_m2_l'
     else true end) as is_complete
from public.products p
cross join lateral (select case p.attributes->>'sous_categorie_nestr'
    when 'canapes-droits' then 'canape' when 'canapes-convertibles' then 'canape'
    when 'fauteuils' then 'fauteuil' when 'tables-basses' then 'table_basse'
    when 'tapis' then 'tapis' when 'lampadaires' then 'luminaire'
    when 'peinture-murale-couleur' then 'peinture' when 'peinture-blanc' then 'peinture'
    when 'peinture-boiseries' then 'peinture' when 'sous-couches' then 'peinture' end as category) c
cross join lateral (select
    coalesce((p.dimensions->>'largeur_cm')::numeric, (p.dimensions->>'diametre_cm')::numeric) as w,
    coalesce((p.dimensions->>'profondeur_cm')::numeric, (p.dimensions->>'diametre_cm')::numeric) as d,
    (p.dimensions->>'hauteur_cm')::numeric as h,
    (p.dimensions->>'diametre_cm')::numeric as dia) d
left join public.product_tags t on t.product_id = p.id
where c.category is not null and coalesce(lower(p.attributes->>'forme'), '') <> 'angle';
grant select on public.catalog_products to anon, authenticated;

-- 3. Recherche : identique à 20261117_02, elle lit maintenant la vue.
create or replace function public.search_catalog(
  p_category text,
  p_max_width_cm numeric default null,
  p_max_depth_cm numeric default null,
  p_max_price_eur numeric default null,
  p_styles text[] default array[]::text[],
  p_colors text[] default array[]::text[],
  p_door_width_cm numeric default null,
  p_max_age_days int default 7
) returns table (
  id bigint, name text, retailer text, price_eur numeric, width_cm numeric, depth_cm numeric, height_cm numeric,
  url text, image_url text, model_glb_url text, style_tags text[], color_family text, scraped_at timestamptz,
  match_score int, fresh boolean
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.retailer, p.price_eur, p.width_cm, p.depth_cm, p.height_cm,
         p.url, p.image_url, p.model_glb_url, p.style_tags, p.color_family, p.scraped_at,
         (cardinality(array(select unnest(p.style_tags) intersect select unnest(p_styles)))
          + case when p.color_family = any(p_colors) then 1 else 0 end)::int as match_score,
         p.scraped_at > now() - make_interval(days => p_max_age_days) as fresh
  from catalog_products p
  where p.category = p_category
    and p.is_complete and not p.off_topic
    and (p_max_width_cm is null or greatest(p.width_cm, coalesce(p.unfolded_width_cm, 0)) <= p_max_width_cm)
    and (p_max_depth_cm is null or greatest(p.depth_cm, coalesce(p.unfolded_depth_cm, 0)) <= p_max_depth_cm)
    and (p_max_price_eur is null or p.price_eur <= p_max_price_eur)
    and (cardinality(p_styles) = 0 or p.style_tags && p_styles or p.color_family = any(p_colors))
    and (p_door_width_cm is null or p.package_dims is null
         or not exists (select 1 from jsonb_array_elements(p.package_dims) b
                        where least((b->>'width_cm')::numeric, (b->>'height_cm')::numeric) > p_door_width_cm))
  order by match_score desc, p.price_eur asc;
$$;
grant execute on function public.search_catalog to anon, authenticated;
