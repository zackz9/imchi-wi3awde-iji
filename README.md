# Imchii wi3awde iji

Expérience typographique en deux compositions, réalisée avec HTML, SCSS, JavaScript natif, GSAP, ScrollTrigger et Vite.

Le scroll transforme la composition ivoire en affiche sombre, de façon réversible. Sur les appareils avec pointeur, survoler les lettres disperse leur mot en profondeur avant qu'il ne se recompose. Chaque chargement varie l'ordre de l'apparition et le sens du mouvement. Les appareils tactiles n'activent pas le survol ; `prefers-reduced-motion` affiche directement les compositions stables.

## Installation

```sh
npm install
```

## Développement

```sh
npm run dev
```

## Build de production

```sh
npm run build
```

Le dossier généré est `dist/`. Pour le servir localement :

```sh
npm run preview
```

## Vérifications

- `npm run build` vérifie la compilation et la génération du bundle.
- L'expérience respecte `prefers-reduced-motion` et conserve les deux compositions sans animation.
- Les performances réelles (LCP, INP, CLS) et les navigateurs mobiles devront être mesurés sur un déploiement représentatif ; un build local seul ne les valide pas.