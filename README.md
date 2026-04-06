# Codex Pokemon

Codex Pokemon est un site statique moderne qui permet d'explorer l'univers Pokemon avec :

- un catalogue complet couvrant toutes les generations
- une recherche, des filtres et un tri
- des cartes interactives animees
- une fiche detaillee au clic
- des favoris persistants
- un comparateur de Pokemon

## Lancer le site en local

Depuis le dossier du projet :

```bash
python3 -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

## Publication

Le projet est un site statique pur en `HTML`, `CSS` et `JavaScript`.

Il peut etre publie facilement sur :

- GitHub Pages
- Netlify
- Vercel

## Structure

- `index.html` : structure de l'application
- `styles.css` : design, animations et responsive
- `script.js` : logique Pokedex, filtres, details, favoris, comparateur
- `assets/` : ressources visuelles locales
- `data/` : cache local Pokemon
