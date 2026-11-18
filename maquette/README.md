# Nestr — maquette de l'application

Maquette cliquable de **Nestr**, réalisée pour le hackathon « Build The Future » avec H Company (Eugenia, novembre 2026).

## Voir la maquette

Ouvrez `index.html` dans un navigateur : les 8 écrans s'affichent côte à côte et sont cliquables (les boutons mènent à l'écran suivant). Chaque écran existe aussi seul dans `ecrans/`.

| # | Écran | Fichier |
|---|-------|---------|
| 01 | Accueil | `ecrans/accueil.html` |
| 02 | Vos pièces (dimensions, porte la plus étroite) | `ecrans/pieces.html` |
| 03 | Style & budget | `ecrans/style.html` |
| 04 | Vos envies (recherche intelligente, inspirations, critères) | `ecrans/envies.html` |
| 05 | L'agent cherche | `ecrans/agent.html` |
| 06 | Rendu 3D | `ecrans/rendu-3d.html` |
| 07 | Déco & peinture | `ecrans/deco.html` |
| 08 | Liste d'achat | `ecrans/liste.html` |

Sur l'écran Style, le choix du style et le curseur de budget fonctionnent ; sur l'écran Vos envies, les critères s'activent au clic.

## Contenu du dossier

- `index.html` — vue d'ensemble des 8 écrans.
- `ecrans/` — les écrans en HTML autonome (police Inter chargée depuis Google Fonts).
- Images : les photos sont chargées depuis Unsplash ([licence Unsplash](https://unsplash.com/license) : usage libre, y compris commercial, sans attribution obligatoire) ; les rendus 3D du salon et des produits (générés avec Three.js) sont intégrés dans `ecrans/images.js`.

## À savoir

Les produits, prix et dimensions de la maquette sont des **exemples** : ils sont à remplacer par les résultats réels de l'agent (fiches IKEA, Maisons du Monde, Castorama).
