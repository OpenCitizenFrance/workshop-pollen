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

> Sans configuration, les données vivent dans le navigateur (`localStorage`) : chaque
> participant a **son propre tableau**, et l’app marche hors-ligne. Pour un **tableau
> partagé en temps réel** entre tous (recommandé pour l’atelier), branche Supabase ci-dessous.

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

## Board partagé en temps réel (Supabase)

Optionnel mais recommandé pour l’atelier : tout le monde édite le **même tableau**, synchronisé en direct.
Tant que les clés ne sont pas là, l’app reste en mode local (aucun changement, aucune panne possible).

1. **Crée un projet** sur [supabase.com](https://supabase.com) (le plan gratuit suffit).
2. **SQL Editor** → colle et exécute le contenu de [`supabase.sql`](./supabase.sql) (crée la table `boards`, active Realtime, ouvre l’accès).
3. **Settings → API** → copie l’**URL du projet** et la clé **anon public**.
4. Renseigne-les comme variables d’environnement :
   - **En local** : `cp .env.example .env` puis remplis les valeurs.
   - **Sur Vercel** : Project → Settings → Environment Variables → ajoute
     `NUXT_PUBLIC_SUPABASE_URL` et `NUXT_PUBLIC_SUPABASE_ANON_KEY` → **Redeploy**.
5. Recharge : un badge **« ● Partagé »** apparaît dans l’en-tête quand la synchro est active.

**Bon à savoir**
- Le board est **ouvert** : quiconque a l’URL peut éditer (c’est le but en atelier). N’y mets pas de données sensibles.
- Modèle de synchro : un document JSONB partagé, *dernier écrit gagne* sur l’ensemble — parfait pour un atelier piloté. Pour de l’édition concurrente fine (une ligne par carte), c’est une évolution simple à demander.
- Plusieurs ateliers en parallèle : donne un `NUXT_PUBLIC_BOARD_ID` différent à chacun.

## Police

Pile système (SF Pro sur Mac, Segoe sur Windows) — zéro dépendance réseau.
Pour la police *Inter* exacte : `npm i @fontsource-variable/inter`, puis ajouter
`css: ['@fontsource-variable/inter']` dans `nuxt.config.ts`.
