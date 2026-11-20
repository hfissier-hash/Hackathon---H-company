# Script du commentaire — démo technique Nestr (5 minutes)

Texte à dire sur la vidéo `nestr-demo-technique-v1.mp4` (5 min 00, sans son). Chaque bloc est calé sur ce qui est à l'écran. Environ 730 mots, soit un débit posé de 145 mots par minute.

La vidéo affiche des chiffres relevés le 19.11. Le commentaire donne les chiffres mesurés dans la base de l'application le 20.11 (42 salons, 192 sessions d'agents). Là où la voix et l'écran diffèrent, la voix le dit.

| Repère | À l'écran | Durée |
|---|---|---|
| 0:00 | Le problème | 15 s |
| 0:15 | Titre Nestr | 15 s |
| 0:30 | La stack | 40 s |
| 1:10 | Le catalogue | 20 s |
| 1:30 | Démo 1/7 à 7/7 | 2 min 10 |
| 3:40 | Résultats mesurés | 30 s |
| 4:10 | Coût | 15 s |
| 4:25 | Appris et à faire | 25 s |
| 4:50 | Fin | 10 s |

---

## 0:00 – Le problème

> Un canapé de 2 mètres 30. Un espace de 2 mètres 10 entre les murs. Résultat : retour au magasin. Acheter un meuble sans savoir s'il rentre, c'est le problème que Nestr règle.

## 0:15 – Nestr

> Nestr, c'est une demande, et un salon complet en 3D : 13 produits réels, qui rentrent chez vous, en 12 secondes. Depuis ce montage, on a presque doublé les mesures : c'est une médiane sur 42 salons, et l'appli est en ligne.

## 0:30 – La stack

> Côté technique : quatre blocs et trois services.
>
> L'application, en Next.js sur Vercel, ne parle qu'à Supabase : la base, les comptes et le stockage. Elle y dépose la demande et y lit l'avancement.
>
> Un worker Python lit ces demandes et enchaîne toutes les étapes. Lui seul appelle les services extérieurs.
>
> Les agents H Company lisent les sites des enseignes. Hugging Face fournit nos modèles ouverts : gpt-oss pour le texte, Gemma pour la vision, TRELLIS pour créer un modèle 3D depuis une photo. Et Blender, sans interface, construit le salon.

## 1:10 – Le catalogue

> Avant la démo, il fallait un catalogue. Les enseignes n'ont pas d'API publique, donc ce sont les agents H qui ont relevé les fiches : 724 sessions, 97 % de pages exploitables.
>
> Résultat : 476 produits utilisables, avec prix, dimensions et colis, et 439 modèles 3D officiels.

## 1:30 – Démo 1/7 : les mesures

> La démo. Un mot d'abord : l'interface a été refaite depuis cet enregistrement, mais le parcours est le même.
>
> L'utilisateur mesure son salon : longueur, largeur, hauteur, et surtout la porte la plus étroite, parce qu'un meuble doit aussi pouvoir entrer. Aujourd'hui, il le fait une fois, à la création de son compte.

## 1:50 – Démo 2/7 : style et budget

> Ensuite, un style et un budget. Chacun des 476 produits a été étiqueté par style et par couleur avec gpt-oss. Et le budget borne toute la recherche : ici, 1 200 euros.

## 2:05 – Démo 3/7 : les envies

> Troisième étape : il décrit ce qu'il veut, avec ses mots et avec des photos, les siennes ou celles de notre galerie d'inspiration. gpt-oss lit le texte, Gemma lit les photos.
>
> Comptez un peu moins de 4 secondes aujourd'hui, pour deux centièmes de centime.

## 2:25 – Démo 4/7 : la recherche

> La recherche, c'est une fonction Postgres : elle ne garde que ce qui rentre dans la pièce, passe la porte et tient dans le budget. Depuis, on a ajouté un styliste IA, qui relit le salon entier et remplace ce qui ne va pas ensemble.

## 2:40 – Démo 5/7 : l'agent H en direct

> Et si aucune fiche ne convient ? Un agent H part en direct sur ikea.com. Il lit le prix, les dimensions, le colis, et renvoie une réponse structurée, ajoutée au catalogue.
>
> Comptez 42 secondes, et trois réussites sur nos cinq essais. C'est notre filet de sécurité, pas le chemin normal.

## 3:00 – Démo 6/7 : le salon en 3D

> Le salon est prêt : 13 produits pour 797 euros, sur 1 200.
>
> Blender, piloté en Python, place chaque meuble aux vraies dimensions. On prend le modèle 3D officiel quand il existe, sinon TRELLIS en génère un depuis la photo, sinon une forme simple.
>
> Le fichier part dans Supabase et s'affiche dans le navigateur avec three.js. Construction : un peu moins de 4 secondes aujourd'hui. Et le salon s'enregistre dans le profil.

## 3:25 – Démo 7/7 : la liste d'achat

> Dernière étape, la liste d'achat. Cinq agents H vérifient en parallèle le prix du jour des cinq produits les plus chers. Si un agent échoue, le produit reste, simplement sans la mention « prix vérifié ».

## 3:40 – Résultats mesurés

> Ces chiffres sont mesurés dans l'appli en ligne, pas en laboratoire. Je vous donne ceux de ce matin, sur deux fois plus de données qu'à l'écran.
>
> 11,7 secondes de la demande au salon, sur 42 salons. Les agents H réussissent dans 76 % des cas, sur 192 sessions en direct. Vérifier cinq prix prend 38 secondes, après l'affichage du salon.
>
> Quand un agent échoue, c'est presque toujours une réponse qu'on n'arrive pas à lire. Et un échec ne bloque jamais le salon.

## 4:10 – Le coût

> Côté coût, un salon revient à environ 10 centimes, presque entièrement dans les agents. L'IA et la 3D ne coûtent quasiment rien. Vérifier un seul prix au lieu de cinq diviserait la facture par plus de trois.

## 4:25 – Ce qu'on a appris

> Ce qu'on retient de l'API d'agents. Une consigne directe, « prends le premier résultat conforme, ne compare pas », va deux fois plus vite. Et on cherche d'abord dans le catalogue, l'agent seulement ensuite.
>
> Ce qu'il reste à faire : sortir le worker de mon Mac vers un serveur, filtrer tous les critères, et passer du salon au logement entier.

## 4:50 – Fin

> Nestr : ton salon en 3D, avec de vrais produits qui rentrent. Merci, on prend vos questions.

---

## Écarts entre l'écran et la voix

| Repère | À l'écran | Ce que dit la voix | Mesure du 20.11 |
|---|---|---|---|
| 0:15 | médiane sur 22 salons | 42 salons | 42 salons, médiane 11,7 s |
| 1:50 | 14 catégories | n'en parle pas | 13 catégories |
| 2:05 | 2,4 s | un peu moins de 4 secondes | 3,9 s, sur 93 lectures |
| 2:25 | 3,4 s | ne donne pas de durée | 4,7 s, plus 1,8 s de styliste |
| 2:40 | « schéma · capture réelle à ajouter » | n'en parle pas | mention oubliée au montage |
| 3:00 | 2,8 s | un peu moins de 4 secondes | 3,8 s |
| 3:25 | 28 s · 80 % | ne donne pas de chiffre, ils viennent à 3:40 | 38 s · 76 % |
| 3:40 | 11,8 s · 79 % sur 89 sessions · 28 s | 11,7 s · 76 % sur 192 sessions · 38 s | 146 sessions réussies sur 192 |
| 3:40 | échecs : prix illisible (15), temps (2), réponse (2) | « presque toujours une réponse qu'on n'arrive pas à lire » | 46 échecs : réponse illisible (44), recherche incomplète (2) |

Restent justes à l'écran : la stack, les 636 fiches, les 476 produits utilisables, les 439 modèles 3D, les 42 s de recherche en direct. Les 724 sessions de collecte, leurs 97 % et le coût de 0,10 $ par salon sont repris du document d'architecture ; ils ne se vérifient pas dans la base.

## Conseils de diction

- **Chiffres** : marquer une courte pause après chaque chiffre clé (12 secondes, 76 %, 10 centimes). Ce sont eux que le jury retient.
- **Écarts** : les annoncer une seule fois, à 0:15 et à 3:40. Inutile de s'excuser à chaque étape.
- **Séquences les plus denses** : la stack (0:30) et les résultats (3:40). Si tu prends du retard, saute la phrase sur les agents qui échouent.
- **Séquences les plus courtes** : les démos 2/7, 4/7 et 7/7 ne durent que 15 secondes. Ne rien ajouter.
- **Modèles** : dire « gpt-oss » et « Gemma » sans les numéros de version, ils sont déjà à l'écran.
