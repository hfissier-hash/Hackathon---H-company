-- Recherche dans le catalogue à partir des critères produits par le LLM.
-- Renvoie les produits complets, frais, dans le style, qui rentrent (y compris dépliés)
-- et dont chaque colis passe la porte. L'appli lance un agent si moins de `min_results`.
create or replace function public.search_catalog(
  p_category text,
  p_max_width_cm numeric default null,
  p_max_depth_cm numeric default null,
  p_max_price_eur numeric default null,
  p_styles text[] default '{}',
  p_colors text[] default '{}',
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
