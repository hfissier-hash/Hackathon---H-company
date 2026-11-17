# Nester

**Votre salon en 3D, meublé, décoré et peint avec de vrais produits qui rentrent.**

Hackathon *Build The Future* 2026 (Eugenia × H Company × Hugging Face × Vercel) · Team 12

![Rendu d'un salon avec le canapé EKTORP généré en 3D depuis sa photo](docs/rendu-salon-trellis.png)

## Le problème

Meubler un logement prend des heures : chaque enseigne a son format, il faut noter les cotes à la main,
et le canapé finit par ne pas rentrer.

## La solution

L'utilisateur décrit son salon (dimensions, porte, style, budget). Des **agents H Company** lisent les
fiches produit des enseignes comme un humain, une **IA open source de Hugging Face** choisit et classe les
produits, et l'application vérifie que tout rentre avant d'afficher le salon **en 3D avec les vrais produits**.

Pourquoi un agent *computer-use* : les enseignes n'ont pas d'API publique et affichent dimensions et prix
chacune à leur façon.

## Architecture

![Schéma d'architecture](docs/architecture.png)

Détails : [docs/architecture.md](docs/architecture.md)

| Brique | Outil |
|---|---|
| Interface | Next.js sur Vercel + three.js |
| Agents | H Company Agents API (`web-scraper`, `web-surfer`) |
| IA texte | `openai/gpt-oss-120b` via Hugging Face Inference Providers |
| IA 3D | TRELLIS (Space Hugging Face) : photo du produit → modèle 3D |
| Modélisation | Blender 5.3 sans interface, piloté en Python |
| Données | Supabase : catalogue, demandes, mesures, fichiers 3D |

## Contenu du dépôt

```
docs/                     architecture, schéma, review, mises à jour de la présentation
prototypes/
  blender/build_salon.py  JSON du salon -> salon 3D (.glb) + image
  viewer/index.html       visionneuse three.js
  models3d/image_to_3d.py photo produit -> modèle 3D (TRELLIS, Hunyuan3D-2)
  ai/tag_products.py      style et couleur des produits (gpt-oss-120b)
  supabase/               migrations SQL du catalogue + tests
```

## Lancer les prototypes

Prérequis : macOS, Python 3, [Blender 5.3](https://www.blender.org/download/), un jeton Hugging Face
(`hf auth login`). Les clés ne sont jamais commitées : voir `.env.example`.

Construire un salon (le chemin de Blender est à adapter) :

```bash
cd prototypes/blender
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python build_salon.py -- scene_ektorp_trellis.json out/salon_trellis.glb out/rendu.png
```

Afficher le salon dans le navigateur :

```bash
python3 -m http.server 8765 --directory prototypes
```

Puis ouvrir `http://localhost:8765/viewer/index.html?salon=salon_trellis`.

Générer un modèle 3D depuis une photo :

```bash
cd prototypes && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python models3d/image_to_3d.py chemin/photo.jpg models3d/out trellis
```

Classer des produits (style, couleur, hors sujet) :

```bash
python3 prototypes/ai/tag_products.py prototypes/ai/sample_products.json
```

## État au 17.11.2026

| Hypothèse | Verdict |
|---|---|
| Blender construit le salon depuis un JSON | Validée (< 1 s) |
| three.js l'affiche | Validée (< 0,1 s) |
| Photo → vrai produit en 3D (TRELLIS) | Validée (32 s par produit) |
| gpt-oss-120b classe les produits | Validée (9/9) |
| Catalogue Supabase comme cache | Validée (18 produits réels) |
| Agents sur Maisons du Monde | Fragile : prix absents, blocages anti-robot |

Prochaines étapes : interface Next.js, table `requests` et Storage dans Supabase, workers branchés de bout en bout.

## Équipe

| Rôle | Nom |
|---|---|
| CEO | Lili Sheppard |
| CTO | Hugo Fissier |
| CPO | Arquam El Mezouari |
| CDO | Victor Bella |
| CAO | Apolline Bouquet |
| CAIO | à attribuer |

Les photos et données produits appartiennent à leurs enseignes ; elles ne servent ici qu'au prototype de
démonstration.
