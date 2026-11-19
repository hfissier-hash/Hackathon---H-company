# Architecture technique — Nester V1

*Mise à jour : 19.11.2026 · CTO : Hugo Fissier*

Nester est en ligne sur https://nester-mu.vercel.app : une demande donne un salon complet de 13 produits réels, affiché en 3D,
en 12 secondes en médiane. Le document complet, avec les mesures et les coûts, est dans
[Nester-architecture-V1-et-couts.pdf](Nester-architecture-V1-et-couts.pdf) (version Word à côté).

```mermaid
flowchart TD
  Lea["Léa (navigateur)"] --> App["Application · Vercel<br/>écrans, salon 3D three.js, routes serveur"]
  App <-->|"demande déposée, avancement lu"| SB[("Supabase · projet Nestr.<br/>products, vue catalogue, requests, agent_runs<br/>Storage : modèles 3D, salons, photos")]
  SB -->|"salon 3D et photo"| Lea
  SB <-->|"demande prise, résultat rendu"| W["Worker Python · Mac du CTO"]
  W --> H["Agents H Company<br/>recherche, prix du jour, collecte"]
  W --> HF["Hugging Face<br/>gpt-oss-120b, gemma-4, TRELLIS"]
  W --> B["Blender 5.3<br/>salon 3D, photo réaliste"]
```

## Principe

- **L'application ne parle qu'à Supabase** : elle dépose une demande dans `requests` et lit son avancement.
- **Le worker est le seul à appeler les services** (agents H, Hugging Face, Blender). C'est aussi le seul point hors cloud.
- **Le catalogue passe avant les agents** : un agent ne part en direct que si rien ne rentre dans la pièce, ou si Léa décrit
  un produit que le catalogue n'a pas. Après chaque salon, cinq agents vérifient les prix du jour.
- **La clé secrète Supabase reste côté serveur** (routes Vercel et worker) ; la clé publique ne lit que le catalogue.

## Parcours d'une demande (délais médians, 22 salons)

| # | Étape | Brique | Délai |
|---|---|---|---|
| 1 | Saisie : dimensions, porte, style, budget, texte, photos | Application | — |
| 2 | Critères tirés du texte et des photos | gpt-oss-120b, gemma-4 | 2,4 s |
| 3 | Recherche par catégorie dans le budget | `search_catalog` | 3,4 s |
| 4 | Si rien ne rentre : recherche sur ikea.com | Agent H | 42 s, rare |
| 5 | Salon aux vraies dimensions, déposé dans le Storage | Blender | 2,8 s |
| 6 | Prix du jour des 5 produits les plus chers | 5 agents H | 28 s, après affichage |
| 7 | Modèle 3D des meubles qui n'en ont pas (3 au plus) | TRELLIS | 30 s par meuble |
| 8 | À la demande : photo réaliste | Blender Cycles | 18 à 20 s |

## Où est le code

| Dossier | Rôle |
|---|---|
| `web/` | Application Next.js : écrans (`public/ecrans`), routes serveur (`app/api`) |
| `worker/` | `worker.py` (file de demandes), `pipeline.py` (étapes), `agent.py` (agents H) |
| `prototypes/blender/build_salon.py` | Construction du salon et rendu photo |
| `prototypes/supabase/migrations/` | Tables, vue du catalogue, recherche |
| `prototypes/models3d/` | Génération 3D par lot et à la demande |

Mesures des agents, coûts et risques : voir le document complet.

## Comptes utilisateurs

Chaque personne crée un compte (prénom, adresse mail, mot de passe), puis renseigne son logement ; ses salons sont enregistrés et se retrouvent sur l'écran « Mes salons ».

- **Identité** : Supabase Auth (`auth.users`). Le mot de passe n'est jamais stocké dans une table de Nestr.
- **Profil** : table `profiles` (prénom, logement en JSON), une ligne par compte.
- **Salons** : colonne `requests.user_id`. Un salon rattaché à un compte n'est lisible que par son auteur ; les salons créés avant les comptes restent ouverts par leur lien.
- **Session** : deux cookies `httpOnly` posés par le serveur (`nestr_at`, `nestr_rt`). Le navigateur ne reçoit ni clé ni jeton lisible ; toutes les routes passent par `web/lib/auth.js`.
- **Routes** : `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET` et `PATCH /api/me`, `GET /api/projects` (mes salons).
- **Vérification de l'adresse mail** : réglage `NESTER_VERIFY_EMAIL=1`. Activé, le compte doit être confirmé par le lien reçu par mail avant la première connexion. Désactivé (réglage de la démonstration), le compte est utilisable tout de suite, car Supabase limite l'envoi de mails à quelques-uns par heure.
- **Écrans** : `compte.html` (création ou connexion), `pieces.html` (logement, enregistré dans le profil), `salons.html` (salons enregistrés). Tous les écrans sauf l'accueil et « Ton compte » renvoient vers la connexion si la session manque.
