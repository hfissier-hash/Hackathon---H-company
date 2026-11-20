# Script de la démo technique Nestr (5 minutes)

Texte à dire sur la présentation `docs/presentation/demo-technique.html` et sa vidéo `nestr-demo-technique-v3.mp4` (5 min 00). Chaque bloc est calé sur ce qui est à l'écran. Environ 720 mots, soit un débit posé de 145 mots par minute. Chiffres relevés dans la base de l'application le 20.11.2026.

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

> Nestr, c'est une demande, et un salon complet en 3D : 13 produits réels, qui rentrent chez vous, en 12 secondes. C'est une médiane mesurée sur 42 salons, et l'appli est en ligne.

## 0:30 – La stack

> Côté technique : quatre blocs et trois services.
>
> L'application, en Next.js sur Vercel, ne parle qu'à Supabase : la base, les comptes et le stockage. Elle y dépose la demande et y lit l'avancement.
>
> Un worker Python lit ces demandes et enchaîne toutes les étapes. Lui seul appelle les services extérieurs.
>
> Les agents H Company lisent les sites des enseignes. Hugging Face fournit nos modèles ouverts : gpt-oss pour le texte, Gemma pour la vision, TRELLIS pour créer un modèle 3D depuis une photo. Et Blender, sans interface, construit le salon.
>
> Chaque envoi sur main redéploie le site.

## 1:10 – Le catalogue

> Avant la démo, il fallait un catalogue. Les enseignes n'ont pas d'API publique, donc ce sont les agents H qui ont relevé les fiches : 724 sessions, 97 % de pages exploitables.
>
> Résultat : 476 produits utilisables, avec prix, dimensions et colis, et 439 modèles 3D officiels.

## 1:30 – Démo 1/7 : le compte et les mesures

> La démo. Première étape : l'utilisateur crée son compte, puis mesure son salon sur un plan à l'échelle. Longueur, largeur, hauteur, et surtout la porte la plus étroite, parce qu'un meuble doit aussi pouvoir entrer.
>
> Le logement est enregistré une fois dans son profil, et resservi pour chaque nouveau salon.

## 1:50 – Démo 2/7 : style et budget

> Ensuite, un style et un budget. Chacun des 476 produits a été étiqueté par style et par couleur avec gpt-oss. Et le budget borne toute la recherche : ici, 1 200 euros.

## 2:05 – Démo 3/7 : les envies

> Troisième étape : il décrit ce qu'il veut, avec ses mots et avec des photos, les siennes ou celles de notre galerie d'inspiration. Gemma lit les photos : styles, couleurs, matières. gpt-oss lit le texte : ambiance, quantités, taille du canapé.
>
> Un peu moins de 4 secondes.

## 2:25 – Démo 4/7 : la recherche et le styliste

> La recherche, c'est une fonction Postgres : elle ne garde que ce qui rentre dans la pièce, passe la porte et tient dans le budget. Puis un styliste IA relit le salon entier et remplace ce qui ne va pas ensemble. Ici, il a changé six produits.

## 2:40 – Démo 5/7 : l'agent H en direct

> Et si aucune fiche ne convient ? Un agent H part en direct sur ikea.com. Il lit le prix, les dimensions, le colis, et renvoie une réponse structurée, ajoutée au catalogue.
>
> Comptez 42 secondes, et trois réussites sur nos cinq essais. C'est notre filet de sécurité, pas le chemin normal.

## 3:00 – Démo 6/7 : le salon en 3D

> Le salon est prêt : 14 produits pour 861 euros, sur 1 200.
>
> Blender, piloté en Python, place chaque meuble aux vraies dimensions. On prend le modèle 3D officiel quand il existe, sinon TRELLIS en génère un depuis la photo, sinon une forme simple.
>
> Le fichier part dans Supabase et s'affiche dans le navigateur avec three.js. Construction : 3,8 secondes. Et le salon s'enregistre dans le profil.

## 3:25 – Démo 7/7 : la liste d'achat

> Dernière étape, la liste d'achat. Cinq agents H vérifient en parallèle le prix du jour des cinq produits les plus chers. Si un agent échoue, le produit reste, simplement sans la mention « prix vérifié ».

## 3:40 – Résultats mesurés

> Tous ces chiffres sont mesurés dans l'appli en ligne, pas en laboratoire.
>
> 11,7 secondes de la demande au salon, sur 42 salons. 3,9 secondes pour lire la demande, 3,8 pour construire la pièce.
>
> Les agents H réussissent dans 76 % des cas, sur 192 sessions en direct. Quand ils échouent, c'est presque toujours une réponse qu'on n'arrive pas à lire. Et un échec ne bloque jamais le salon.

## 4:10 – Le coût

> Côté coût, un salon revient à environ 10 centimes, presque entièrement dans les agents. L'IA et la 3D ne coûtent quasiment rien. Vérifier un seul prix au lieu de cinq diviserait la facture par plus de trois.

## 4:25 – Ce qu'on a appris

> Ce qu'on retient de l'API d'agents. Une consigne directe, « prends le premier résultat conforme, ne compare pas », va deux fois plus vite. Et on cherche d'abord dans le catalogue, l'agent seulement ensuite.
>
> Ce qu'il reste à faire : sortir le worker de mon Mac vers un serveur, filtrer tous les critères, et passer du salon au logement entier.

## 4:50 – Fin

> Nestr : ton salon en 3D, avec de vrais produits qui rentrent. Merci, on prend vos questions.

---

## Conseils de diction

- **Chiffres** : marquer une courte pause après chaque chiffre clé (12 secondes, 76 %, 10 centimes). Ce sont eux que le jury retient.
- **Séquence la plus dense** : la stack (0:30). Si tu prends du retard, saute la phrase sur le redéploiement.
- **Séquences les plus courtes** : les démos 2/7, 4/7 et 7/7 ne durent que 15 secondes. Ne rien ajouter.
- **Modèles** : dire « gpt-oss » et « Gemma » sans les numéros de version, ils sont déjà à l'écran.
