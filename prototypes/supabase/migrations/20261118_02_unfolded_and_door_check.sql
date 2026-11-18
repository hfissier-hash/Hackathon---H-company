-- Nester : corrections de la priorité 2 sur la vue du catalogue (projet « Nestr. »).
-- Appliquée le 18.11.2026.
-- 1. Déplié : les mesures de la fiche sont celles du couchage (a = petit côté, b = grand côté).
--    Vérifié sur ikea.com pour GRUNNARP, FRIHETEN et SKÖNABÄCK :
--    - le couchage tient dans la largeur du canapé  -> profondeur dépliée = a (GRUNNARP, FRIHETEN) ;
--    - couchage étroit, à peine plus long que le canapé -> banquette, largeur dépliée = b (SKÖNABÄCK) ;
--    - sinon le lit sort vers l'avant               -> profondeur dépliée = b (LYCKSELE, TORNSBORG).
-- 2. `door_verified` : faux si un colis a une mesure manquante (tapis, livrés roulés, et pots de peinture restent vrais).
--    Le produit reste proposé ; l'application affiche « passage de porte non vérifié ».
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
     when c.category = 'peinture' then p.attributes ? 'contenance_l' and p.attributes ? 'rendement_m2_l'
     else true end) as is_complete,
  (c.category in ('tapis', 'peinture') or (p.dimensions ? 'colis' and not exists (
     select 1 from jsonb_array_elements(p.dimensions->'colis') b
     where b->>'largeur_cm' is null or b->>'hauteur_cm' is null or b->>'longueur_cm' is null))) as door_verified
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
cross join lateral (select
    least((p.dimensions->'deplie'->>'largeur_cm')::numeric, (p.dimensions->'deplie'->>'profondeur_cm')::numeric) as sm,
    greatest((p.dimensions->'deplie'->>'largeur_cm')::numeric, (p.dimensions->'deplie'->>'profondeur_cm')::numeric) as lg) u
left join public.product_tags t on t.product_id = p.id
where c.category is not null and coalesce(lower(p.attributes->>'forme'), '') <> 'angle';

drop function public.search_catalog(text, numeric, numeric, numeric, text[], text[], numeric, int);
create function public.search_catalog(
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
  match_score int, fresh boolean, door_verified boolean
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.retailer, p.price_eur, p.width_cm, p.depth_cm, p.height_cm,
         p.url, p.image_url, p.model_glb_url, p.style_tags, p.color_family, p.scraped_at,
         (cardinality(array(select unnest(p.style_tags) intersect select unnest(p_styles)))
          + case when p.color_family = any(p_colors) then 1 else 0 end)::int as match_score,
         p.scraped_at > now() - make_interval(days => p_max_age_days) as fresh,
         p.door_verified
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
