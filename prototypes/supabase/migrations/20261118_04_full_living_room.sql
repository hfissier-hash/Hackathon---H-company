-- Nester : la vue du catalogue s'ouvre à la déco et aux rangements, pour meubler un salon complet.
-- Appliquée le 18.11.2026 sur le projet « Nestr. ».
-- Nouvelles catégories : meuble_tv, etagere, miroir, cadre, plante, rideau, suspension.
create or replace view public.catalog_products with (security_invoker = true) as
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
  case when not p.dimensions ? 'deplie' then null
       when u.lg <= d.w + 5 then d.w
       when u.sm <= d.d + 5 and u.lg <= d.w + 35 then greatest(d.w, u.lg)
       else d.w end as unfolded_width_cm,
  case when not p.dimensions ? 'deplie' then null
       when u.lg <= d.w + 5 then greatest(d.d, u.sm)
       when u.sm <= d.d + 5 and u.lg <= d.w + 35 then d.d
       else greatest(d.d, u.lg) end as unfolded_depth_cm,
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
     when c.category in ('meuble_tv', 'etagere') then d.w is not null and d.d is not null and d.h is not null
     when c.category in ('miroir', 'cadre') then d.w is not null and (d.h is not null or d.dia is not null)
     when c.category = 'rideau' then d.w is not null and d.h is not null
     when c.category = 'plante' then d.h is not null
     when c.category = 'suspension' then d.w is not null
     when c.category = 'peinture' then p.attributes ? 'contenance_l' and p.attributes ? 'rendement_m2_l'
     else true end) as is_complete,
  (c.category in ('tapis', 'peinture', 'rideau') or (p.dimensions ? 'colis' and not exists (
     select 1 from jsonb_array_elements(p.dimensions->'colis') b
     where b->>'largeur_cm' is null or b->>'hauteur_cm' is null or b->>'longueur_cm' is null))) as door_verified
from public.products p
cross join lateral (select case p.attributes->>'sous_categorie_nestr'
    when 'canapes-droits' then 'canape' when 'canapes-convertibles' then 'canape'
    when 'fauteuils' then 'fauteuil' when 'tables-basses' then 'table_basse'
    when 'tapis' then 'tapis' when 'lampadaires' then 'luminaire'
    when 'meubles-tv' then 'meuble_tv' when 'etageres-bibliotheques' then 'etagere'
    when 'miroirs' then 'miroir' when 'cadres-tableaux' then 'cadre' when 'plantes-cache-pots' then 'plante'
    when 'rideaux' then 'rideau' when 'suspensions' then 'suspension'
    when 'peinture-murale-couleur' then 'peinture' when 'peinture-blanc' then 'peinture'
    when 'peinture-boiseries' then 'peinture' when 'sous-couches' then 'peinture' end as category) c
cross join lateral (select
    coalesce((p.dimensions->>'largeur_cm')::numeric, (p.dimensions->>'diametre_cm')::numeric) as w,
    coalesce((p.dimensions->>'profondeur_cm')::numeric, (p.dimensions->>'diametre_cm')::numeric) as d,
    (p.dimensions->>'hauteur_cm')::numeric as h,
    (p.dimensions->>'diametre_cm')::numeric as dia) d
cross join lateral (select
    least((p.dimensions->'deplie'->>'largeur_cm')::numeric, (p.dimensions->'deplie'->>'profondeur_cm')::numeric) as sm,
    greatest((p.dimensions->'deplie'->>'largeur_cm')::numeric, (p.dimensions->'deplie'->>'profondeur_cm')::numeric) as lg) u
left join public.product_tags t on t.product_id = p.id
where c.category is not null and coalesce(lower(p.attributes->>'forme'), '') <> 'angle';
