# Catalogue Nester (Supabase)

Projet : « hfissier's Project » (`rqituuutedejjoyjwfzh`). Deux migrations appliquées le 17.11.2026 (noms d'origine, avant le renommage en Nester) :
`pilepoil_catalog` (tables) et `pilepoil_search_function` (recherche).

## Tables
- `catalog_products` : un produit par URL (clé anti-doublon). Champs utiles à la vérification
  (dimensions, dépliées, colis, rendement peinture), au style (`style_tags`, `color_family`,
  remplis par le LLM), à la 3D (`model_glb_url`) et à la fraîcheur (`scraped_at`).
  `is_complete` est calculé : prix + dimensions utiles selon la catégorie.
- `agent_runs` : une ligne par lancement d'agent H (durée, résultat, champs trouvés) pour les
  mesures demandées par le jury.

## Recherche
`search_catalog(catégorie, largeur_max, profondeur_max, prix_max, styles[], couleurs[], largeur_porte, âge_max_jours)`
renvoie les produits complets, non hors sujet, qui rentrent (même dépliés), dont chaque colis
passe la porte, triés par correspondance au style puis par prix. Moins de résultats que prévu
= l'application lance un agent.

## Sécurité
- Clé publique (`anon`) : lecture du catalogue et appel de `search_catalog` uniquement.
- Écriture : seulement avec la clé service, côté serveur (workers des agents).
- `agent_runs` : invisible avec la clé publique (RLS activée, aucune règle, volontairement).

## Tests du 17.11 (18 produits réels)
| Test | Résultat |
|---|---|
| Critères gpt-oss (≤ 200 × 90 cm, ≤ 800 €, scandinave, porte 83 cm) | GULLVALLA, 229 € |
| Salon plus grand : convertible GRUNNARP (200 cm déplié) exclu | OK |
| Tapis ≤ 120 cm : aucun résultat, donc agent à lancer | OK |
| Fraîcheur 0 jour : tous les produits « non frais » | OK |
| Coussin de Noël hors sujet exclu | OK |
| Même URL réinsérée : 1 seule ligne, prix mis à jour | OK |
| Écriture avec la clé publique | Refusée (RLS) |
