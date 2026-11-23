# Crypte Néon

Jeu de labyrinthe à glissement (inspiré des jeux « arcade tombeau ») : tu fonces jusqu'au prochain mur, tu ramasses points, pièces et étoiles, et tu atteins le portail en évitant pointes, chauves-souris, pièges et lave.

- **Front** : Vite + TypeScript + SCSS (Canvas 2D, aucun framework)
- **Back** : fonctions serverless Vercel (`/api`) + base **Neon** (PostgreSQL) via `@neondatabase/serverless`
- **Admin** : éditeur de niveaux sur `/admin`
- **Contrôles** : tactile (glisser), clavier (flèches / ZQSD), **manettes** (Xbox, PlayStation, Switch Pro, génériques)

## Démarrer en local

```bash
npm install
cp .env.example .env    # puis renseigne DATABASE_URL et ADMIN_PASSWORD
npm run dev             # http://localhost:5173  et  http://localhost:5173/admin
```

Sans `DATABASE_URL`, le serveur de dev utilise une base PostgreSQL locale embarquée (PGlite, dossier `.pglite/`) et le mot de passe admin `admin` : pratique pour tester sans toucher à Neon.

## Base de données Neon

Les tables sont **créées automatiquement** au premier appel de l'API. Pour les créer à la main :

```bash
npm run db:migrate      # lit DATABASE_URL depuis l'environnement ou .env
```

Schéma : `db/schema.sql` — tables `players`, `progress`, `endless_scores`, `levels`.

La chaîne de connexion ne quitte jamais le serveur : le navigateur ne parle qu'à `/api`.

## Déploiement Vercel

1. Pousse le dépôt sur GitHub, puis importe-le dans Vercel (framework détecté : Vite).
2. Dans *Settings → Environment Variables*, ajoute :
   - `DATABASE_URL` : chaîne de connexion Neon (de préférence l'URL *pooled*)
   - `ADMIN_PASSWORD` : mot de passe de l'espace admin
   (Si tu relies Neon via l'intégration Vercel, `DATABASE_URL` est ajoutée automatiquement.)
3. Déploie. Le jeu est sur `/`, l'admin sur `/admin`.
4. Dans l'admin, clique **« Importer la campagne par défaut »** pour charger les 12 niveaux de départ, puis modifie-les ou crée les tiens.

Tant qu'aucun niveau n'est publié en base, le jeu utilise les 12 niveaux intégrés.

## Espace administration (`/admin`)

- Liste des niveaux : ordre de la campagne (▲▼), publié / brouillon
- Éditeur : peinture au clic (clic droit = mur), outils `1`–`0`, `Ctrl+Z` / `Ctrl+Y`, `Ctrl+S`, `T` pour tester
- Redimensionnement par ligne/colonne, zoom
- **Validation en direct** : niveau faisable ou non, nombre de glissades, étoiles/pièces atteignables, chauves-souris mal placées
- Calques : cases d'arrêt, zone parcourue, patrouilles, solution numérotée
- **Tester** : joue le niveau tout de suite (clavier ou manette)
- Générateur aléatoire (taille, difficulté, graine)

Un niveau ne peut pas être publié s'il est impossible à terminer.

## Légende des cartes

| Caractère | Élément |
|---|---|
| `#` | mur |
| `S` | mur à pointes (mortel si on s'arrête contre) |
| ` ` | sol (les points sont placés automatiquement) |
| `P` | départ (un seul) |
| `E` | sortie (une seule) |
| `*` | étoile |
| `o` | pièce |
| `b` / `v` | chauve-souris horizontale / verticale |
| `x` | piège à pointes périodique |

## Règle des chauves-souris

Une chauve-souris patrouille dans son couloir **sans jamais entrer sur une case où le joueur peut s'arrêter** (sa trajectoire est affichée en pointillés). Le joueur n'est donc jamais coincé : il attend le bon moment et traverse le couloir perpendiculairement. Le solveur considère qu'une glissade dans l'axe d'une patrouille est mortelle ; l'éditeur signale toute chauve-souris qui rendrait un niveau impossible.

## Manettes

Gamepad API, disposition standard (Chrome, Edge, Firefox) :

| Bouton | Action |
|---|---|
| Croix / stick gauche | déplacement et navigation dans les menus |
| A | valider |
| B / View | retour |
| Y | recommencer |
| Menu / Start | pause |

Le navigateur n'active la manette qu'après un premier appui sur un bouton une fois la page ouverte. La vibration fonctionne avec les manettes Xbox et PlayStation sous Chrome/Edge.

## API

| Route | Méthode | Rôle |
|---|---|---|
| `/api/levels` | GET | niveaux publiés |
| `/api/player?id=` | GET | sauvegarde d'un joueur |
| `/api/player` | POST | pseudo |
| `/api/progress` | POST | fin de niveau (étoiles, points, pièces) |
| `/api/endless` | GET / POST | classement / score du mode infini |
| `/api/admin/login` | POST | vérification du mot de passe (`x-admin-key`) |
| `/api/admin/levels` | GET / POST / PUT / PATCH / DELETE | gestion des niveaux |

Les joueurs n'ont pas de compte : un identifiant anonyme est généré dans le navigateur (copie locale + synchronisation Neon).

## Structure

```
api/                  fonctions Vercel (TypeScript) + _lib (db, validation)
src/shared/           format des niveaux, solveur, générateur (partagés jeu/admin)
src/game/             moteur, rendu, entrées (clavier/tactile/manette), sauvegarde, UI
src/admin/            éditeur de niveaux
src/styles/           SCSS
db/schema.sql         schéma SQL
scripts/migrate.ts    création des tables
```
