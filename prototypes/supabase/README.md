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

## Catalogue de l'équipe (18.11)

Le catalogue de démo vit maintenant dans le projet Supabase « Nestr. » (`yfwmjrrbgaqanvnlhzhp`) :
633 fiches collectées par les agents H dans la table `products` (522 IKEA, 111 peintures Castorama).
La migration `20261118_01_nestr_catalog_view.sql` y ajoute, sans modifier `products` :

- `product_tags` : style, famille de couleur, hors sujet (gpt-oss-120b, `prototypes/ai/tag_catalog.py`) et, plus tard, l'URL du modèle 3D ;
- la vue `catalog_products`, au même format que la table du 17.11, limitée à ce que Blender sait poser
  (canapés droits et convertibles, fauteuils, tables basses, tapis, lampadaires) plus la peinture : 303 produits ;
- `search_catalog`, inchangée, qui lit cette vue.

Règles de la vue : canapés d'angle exclus (profondeur d'assise, pas d'angle) ; déplié = largeur du canapé,
profondeur = plus grande mesure dépliée ; rendement peinture min = max = valeur de la fiche.

| Test du 18.11 (clé publique) | Résultat |
|---|---|
| Canapé ≤ 200 × 90 cm, ≤ 800 €, scandinave/beige, porte 83 cm | 10 résultats, 0,17 s |
| Profondeur max 150 cm : convertibles exclus (dépliés ≥ 188 cm) | OK |
| Tapis ≤ 120 × 120 cm | 3 résultats |
| Fraîcheur 0 jour : aucun produit « frais » | OK |
| Peinture verte | 9 résultats |
| Écriture dans `product_tags` avec la clé publique | Refusée (RLS) |
| Modification de `products` avec la clé publique | Sans effet (prix inchangé) |

## Corrections du 18.11 (migration `20261118_02_unfolded_and_door_check.sql`)

- **Déplié** : les mesures de la fiche sont celles du couchage. Vérifié sur ikea.com (GRUNNARP, FRIHETEN, SKÖNABÄCK).
  Couchage qui tient dans la largeur du canapé : profondeur dépliée = petit côté (GRUNNARP 232 × 142).
  Couchage étroit un peu plus long que le canapé : banquette, la largeur s'allonge (SKÖNABÄCK 190 × 75).
  Sinon le lit sort vers l'avant (LYCKSELE 142 × 188, TORNSBORG 154 × 195).
- **`door_verified`** (vue et `search_catalog`) : faux pour 6 meubles dont un colis a une mesure manquante
  (LYCKSELE LÖVÅS ×4, POÄNG id 61, KVISTBRO id 140). Ils restent proposés, avec la mention « passage de porte non vérifié ».
  Tapis (roulés) et peinture sont toujours vrais.
- **Classement** : 303 produits sur 303 classés.
- **Blender** (`build_salon.py`) : retire la plaque que TRELLIS crée à partir de l'ombre de la photo, redresse le modèle,
  met le dossier contre le mur, et remplace le modèle par un volume simple si l'ajuster aux vraies dimensions
  demande plus de 35 % de déformation (TRELLIS se trompe couramment de 30 % sur les proportions).

## Reste à corriger à la source (collecte)

- 6 meubles aux colis incomplets : relancer l'agent visuel sur ces fiches.
- 9 peintures sans rendement : exclues de la recherche tant que la valeur manque.
- Homonymes : « LYCKSELE LÖVÅS Canapé 2 places convertible » ×2 dans la vue (gris foncé, jaune) ; BILLY, LACK, HYLLIS,
  SANDSBERG hors de la vue. Ajouter la couleur ou la taille au nom.
- Marques erronées (« FEJKA », « STOCKHOLM », « CAFR », une vide) : sans effet sur l'application.
- `scraped_at` = date d'insertion ; enregistrer la date de lecture de la page aux prochaines collectes.
- Modèles 3D : 3 sur 22 générés (quota GPU gratuit Hugging Face), pas encore dans Storage.
