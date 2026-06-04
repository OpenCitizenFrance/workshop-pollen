# Cockpit d’atelier — Cadrage IA / Tech

Application **Nuxt 3 autonome** pour animer en direct un atelier de cadrage :
capturer, qualifier et prioriser les process métier, puis décider de la réponse
(Software / Automatisation déterministe / IA dans le run).

Tout l’applicatif tient dans **`app.vue`**. Aucun backend, aucune dépendance
réseau à l’exécution, persistance locale (`localStorage`).

## Lancer

```bash
npm install      # une seule fois (nécessite Internet)
npm run dev       # → http://localhost:3000
```

Après le premier `npm install`, l’app tourne **100 % en local et hors-ligne**.
Pour la réunion : lancez `npm run dev` avant, gardez l’onglet ouvert.

## Les 5 vues

1. **Capture** — ajout ultra-rapide, liste éditable, curseurs 1→5, filtres équipe/type, compteurs en en-tête.
2. **Stack** — cartographie SVG de l'architecture de données (sources → orchestration → stockage/IA → apps & agents). Cliquez un **cas d'usage** pour tracer ses sources dans la couleur de son type ; cliquez un **bloc** pour voir quels cas d'usage en dépendent (badge de charge). Les libellés des blocs sont éditables (persistés). Chaque carte porte ainsi ses **sources de données** requises.
3. **Matrice** — Impact × Effort en SVG fait main. Bulle : taille = douleur, couleur = type. **Cliquez une bulle pour ajuster ses notes et la voir se replacer en direct.**
4. **Priorisation** — classement par `(Impact × Douleur) ÷ Effort`, pondéré par la Confiance.
5. **Séquencement** — deux modes (toggle) :
   - **Kanban** : tri rapide Maintenant / Ensuite / Plus tard (glisser-déposer ou boutons).
   - **Roadmap** : timeline mensuelle (horizon 6 / 12 / 18 mois à partir du mois courant). Chaque chantier est une barre : **glissez le corps** pour décaler, **les bords** pour la durée, ou **saisissez début/durée à la main** dans l'éditeur. Bouton « Pré-remplir depuis le Kanban » pour transformer le tri en roadmap de départ.

## Données

- Cartes : `localStorage` clé `cockpit-atelier:v1`. Architecture (blocs/arêtes/labels) : `cockpit-atelier:stack:v1`. Un refresh ne perd jamais la saisie.
- **Réinitialiser** (en-tête) restaure les 5 exemples + l’architecture de départ, après confirmation.

## Déploiement (Vercel)

Le projet est un Nuxt 3 standard : Vercel le détecte sans configuration.

1. Pousser ce repo sur GitHub (voir ci-dessous).
2. Sur [vercel.com](https://vercel.com) → **New Project** → importer le repo → **Deploy**. C’est tout.

> Aucune base de données n’est requise : les données vivent dans le navigateur (`localStorage`).
> Chaque participant qui ouvre l’URL a donc **son propre tableau**. Pour un **tableau partagé en
> temps réel** entre tous les participants, il faut brancher Supabase (voir plus bas / à activer).

Build statique alternatif (n’importe quel hébergeur) : `npm run generate` → `.output/public`.

## Pousser sur GitHub

Le repo est déjà initialisé et commité en local. Pour le publier :

```bash
# Option A — avec GitHub CLI (gh)
gh repo create cockpit-atelier --private --source=. --push

# Option B — repo créé à la main sur github.com (vide), puis :
git remote add origin git@github.com:<ton-compte>/cockpit-atelier.git
git push -u origin main
```

## Police

Pile système (SF Pro sur Mac, Segoe sur Windows) — zéro dépendance réseau.
Pour la police *Inter* exacte : `npm i @fontsource-variable/inter`, puis ajouter
`css: ['@fontsource-variable/inter']` dans `nuxt.config.ts`.
