# Imchii wi3awde iji

Expérience typographique réalisée avec HTML, SCSS, JavaScript natif, [Motion](https://motion.dev) et Vite.

« Va-t'en et reviens » : au scroll, la même phrase quitte la composition ivoire et revient, recomposée, dans l'affiche sombre. Chaque mot suit un arc, ses lettres partent avec un léger décalage, et le soleil rouge voyage avec « iji ». À mi-parcours, la nuit tombe : les mots se dissolvent, seuls le « 3 » et le soleil restent, puis tout réapparaît en ivoire. Le mouvement est lié au scroll, lissé par un ressort, et entièrement réversible.

Sur les appareils avec pointeur, les lettres proches du curseur se soulèvent et s'écartent légèrement, comme des roseaux. Les appareils tactiles n'activent pas le survol ; `prefers-reduced-motion` affiche directement les deux compositions empilées, avec un simple fondu.

## Fonctionnement

- La composition sombre reste dans le DOM, invisible : elle sert de cible. Le script mesure ses positions et interpole chaque lettre de la composition ivoire vers elle, ce qui fonctionne à toutes les tailles d'écran sans valeurs codées en dur.
- Toute l'animation passe par des `MotionValue` (`scroll`, `springValue`, `transformValue`, `styleEffect`) : un seul écrivain par élément, et uniquement des propriétés `transform`, `opacity` et `color`.
- En CSS, la position du soleil est calculée à partir de celle de « iji », pour qu'ils atterrissent ensemble quelle que soit la hauteur d'écran.

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
- L'expérience respecte `prefers-reduced-motion`, y compris si le réglage change pendant la visite.
- Les performances réelles (LCP, INP, CLS) et les navigateurs mobiles devront être mesurés sur un déploiement représentatif ; un build local seul ne les valide pas.
