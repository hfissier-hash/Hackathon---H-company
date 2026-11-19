# Charte graphique Nestr

Pour un humain : ouvrir `index.html` dans un navigateur.
Pour un agent (Claude ou autre) : lire ce fichier, puis utiliser `tokens.css` (pages HTML) ou `tokens.json` (tout le reste).

## Fichiers

| Fichier | Rôle |
|---|---|
| `README.md` | Règles à appliquer (ce fichier) |
| `tokens.css` | Variables CSS : couleurs, polices, rayons + classes du logo |
| `tokens.json` | Les mêmes valeurs en JSON, avec usages, contrastes et règles |
| `index.html` | Charte visuelle (logo, couleurs, typo, motifs, ton) |
| `logos/*.svg` | 10 variantes : `logo-*` (« nestr. ») et `monogramme-*` (« (n.)™ ») |
| `gen-logos.py` | Régénère les SVG : `python gen-logos.py logos` |

## Logo

- Logotype **« nestr. »** : tout en minuscules, le « n » initial et le point final en couleur d'accent, le reste en encre.
- Monogramme **« (n.)™ »** : pour les petits formats (coin de page, icône, favicon).
- Le « n » et le point ont **toujours la même couleur** : lingon (orange) par défaut, pin (vert) pour une version sobre, blanc sur fond sombre en petit. Jamais de jaune dans le logo.
- Dans une phrase, le nom s'écrit **Nestr** (majuscule, sans point).

En HTML, écrire le logo en texte plutôt qu'en image (net à toute taille) :

```html
<link rel="stylesheet" href="tokens.css">
<span class="nestr-logo" style="font-size:80px"><span class="nestr-accent">n</span>estr<span class="nestr-accent">.</span></span>
<span class="nestr-logo">(<span class="nestr-accent">n.</span>)<sup style="font-size:.3em">™</sup></span>
```

Variantes de couleur (le fond d'abord, puis la couleur du « n » et du point) :

| Variante | Fond | Accent | Quand |
|---|---|---|---|
| principal | surface `#FAFAF6` | lingon `#C9432F` | par défaut |
| principal-fond-sombre | pin profond `#14332A` | lingon | grands formats seulement |
| pin | surface | pin `#1F4D3F` | version sobre |
| mono-encre | surface | encre `#14231F` | impression noir et blanc |
| mono-blanc | pin profond | surface | petits formats sur fond sombre, sur photo |

## Couleurs

- **Pin** `#1F4D3F` porte la marque. **Lingon** `#C9432F` attire l'œil, avec parcimonie. **Soleil** `#F2C14E` seulement sur fond sombre, jamais dans le logo.
- Fonds : surface `#FAFAF6`, bouleau `#EEE7D7` ; fond sombre : pin profond `#14332A`.
- Texte : encre `#14231F`, encre douce `#4A5A55` ; sur fond sombre `#EEF1EC`.
- États : bleu `#2F6FA3` = « ça rentre » ; ambre `#A65A12` = trop grand.

## Polices

Charger depuis Google Fonts (licence OFL, gratuites) :

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600..800&family=Figtree:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap">
```

- Titres et logo : Bricolage Grotesque 700–800. Texte : Figtree. Mesures et prix : JetBrains Mono 500.
- Slides 1920 × 1080 : 120 / 72 / 44 / 32 / 24 px. Appli : texte 16–17 px, interligne 1,5.

## Motifs

- **La cote** : ligne de cote d'architecte (trait vertical, trait horizontal, mesure en mono au centre), ex. « 210 cm · ça rentre ».
- **Cadre de téléphone** pour les captures de l'appli : rayon 28 px, bordure `#D5D8CE` 2 px.

## Ton

- Tutoiement, phrases courtes, chiffres concrets (« 230 cm », pas « un grand canapé »).
- « Ça rentre » seulement quand c'est mesuré.

## Interdits

- « n » et point de deux couleurs différentes ; logo déformé, ombré ou détouré.
- Lingon en petit sur pin profond (contraste 2,8) ; soleil en texte sur fond clair (1,6).
- Inventer une nouvelle couleur : partir des tokens.

## Limite connue

Les SVG de `logos/` contiennent du texte : ils chargent Bricolage Grotesque depuis Google Fonts.
Hors ligne, ou dans un outil sans la police installée (Figma, Canva, PowerPoint), le logo change de police : installer la police, ou écrire le logo en HTML comme ci-dessus.
