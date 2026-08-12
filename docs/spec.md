# SmartChef AI — Spécification MVP (v1)

> Document de référence pour le développement. À déposer dans `docs/spec.md`.
> Claude Code doit lire ce fichier avant de proposer une architecture ou d'écrire du code.
> **Ne pas coder tout le brief d'un coup.** Suivre le découpage en phases (§8).

---

## 1. Vision

SmartChef AI est un assistant alimentaire personnel. La boucle de valeur centrale (« l'aha ») est :

> **photo du frigo → inventaire intelligent → « qu'est-ce que je cuisine ? » → plan de repas + recettes → liste de courses.**

Tout le reste du brief (assistant vocal, scan de ticket, mode famille, Nutri-Score, dashboard, impact environnemental) gravite autour de cette boucle et arrive **après** que la boucle fonctionne bien.

## 2. Décision de périmètre — ce qui entre dans le MVP

Le brief contient 12 fonctionnalités. Les livrer toutes en v1 garantit un produit médiocre partout. Le MVP se concentre sur la boucle de valeur et rien d'autre.

### Dans le MVP (v1)
| # brief | Fonctionnalité | Pourquoi en v1 |
|---|---|---|
| F1 | Photo frigo → inventaire | Différenciateur, alimente tout le reste |
| F5 | Recherche IA en langage naturel | Point d'entrée le plus simple à la valeur |
| F2 | Planification de repas (semaine) | Cœur de la proposition de valeur |
| F7 | Liste de courses intelligente | Ferme la boucle, forte rétention |
| F4 | Alertes de péremption | Crochet de rétention, réutilise l'inventaire |
| — | Auth + profil (allergies, budget, objectifs) | Prérequis technique de tout le reste |

### Reporté (v2 et au-delà) — à ne PAS coder maintenant
F3 scan de ticket (OCR fragile, gros effort) · F6 assistant vocal · F8 dashboard/stats · F9 IA nutritionnelle détaillée · F10 mode famille · F11 scan produit/Nutri-Score · F12 impact anti-gaspillage.

> **Règle pour Claude Code :** si une tâche concerne une fonctionnalité reportée, l'ignorer et le signaler, sauf instruction explicite contraire.

## 3. Stack technique recommandée

Choix orientés « solo builder / petite équipe, cross-platform, compétences Python ».

| Couche | Choix | Justification |
|---|---|---|
| Front (iOS + Android + Web) | **Expo (React Native + React Native Web)** | Une seule base de code pour les 3 plateformes |
| Backend API | **Python — FastAPI** | Correspond à tes compétences Python ; typé, rapide, async |
| Base de données + Auth + Storage | **Supabase (PostgreSQL managé)** | Fournit d'un coup : Postgres, auth, stockage des photos, Row-Level Security. Réduit énormément le périmètre |
| Vision (détection aliments) | **Claude Sonnet 5** (vision) via API, sortie JSON structurée | Voir §7.1 pour la consigne de modèle |
| Génération recettes / plan / recherche | LLM via API (sortie JSON structurée) | Voir §7 |
| Notifications push | **Expo Notifications** (+ table de tokens) | Intégré à Expo |
| Paiement | **RevenueCat** (mobile) + **Stripe** (web) | ⚠️ voir §9 — Stripe seul est refusé par l'App Store pour les abonnements |
| Analytics / monitoring | PostHog + Sentry | Léger, self-hostable |

> Si tu préfères un backend tout-en-un et sauter FastAPI, Supabase Edge Functions peut suffire au début. Mais séparer une API FastAPI est plus propre dès que la logique IA se complexifie.

## 4. Architecture (vue d'ensemble)

```
┌─────────────────────────────┐
│  App Expo (iOS/Android/Web) │
│  - UI premium, offline cache│
└──────────────┬──────────────┘
               │ HTTPS (JWT Supabase)
     ┌─────────┴──────────┐
     │                    │
┌────▼─────┐        ┌──────▼──────────┐
│ Supabase │        │  API FastAPI     │
│  - Auth  │        │  - orchestration │
│  - DB    │◄───────┤    des tâches IA │
│  - Storage(photos)│  - endpoints métier│
│  - RLS   │        └──────┬──────────┘
└──────────┘               │ appels API
                    ┌──────▼──────────┐
                    │  Fournisseurs IA │
                    │  vision + LLM    │
                    └─────────────────┘
```

Principe : le front parle à Supabase pour l'auth/données simples (CRUD via RLS), et à FastAPI pour tout ce qui déclenche de l'IA (analyse photo, génération de plan). Les photos sont uploadées dans Supabase Storage ; FastAPI reçoit l'URL/le fichier, appelle le modèle vision, écrit l'inventaire en base.

## 5. Modèle de données (tables principales)

```
profiles            (1-1 avec auth.users)
  id (uuid, PK)  ·  display_name  ·  budget_weekly (numeric)
  time_per_meal_min (int)  ·  diet_type (text)  ·  goals (text[])

allergies
  id  ·  profile_id (FK)  ·  label

inventory_items
  id  ·  profile_id (FK)  ·  name  ·  quantity  ·  unit
  brand (nullable)  ·  expiry_date (nullable)  ·  source (enum: photo|manual)
  created_at

recipes
  id  ·  title  ·  instructions (text)  ·  prep_time_min (int)
  servings (int)  ·  macros (jsonb)  ·  generated_by_ai (bool)

recipe_ingredients
  id  ·  recipe_id (FK)  ·  name  ·  quantity  ·  unit

meal_plans
  id  ·  profile_id (FK)  ·  week_start (date)  ·  budget_target (numeric)

meal_plan_entries
  id  ·  meal_plan_id (FK)  ·  day (date)
  slot (enum: breakfast|lunch|dinner|snack)  ·  recipe_id (FK)

shopping_lists
  id  ·  profile_id (FK)  ·  meal_plan_id (FK, nullable)  ·  status

shopping_list_items
  id  ·  shopping_list_id (FK)  ·  name  ·  quantity  ·  unit
  aisle (text)  ·  estimated_price (numeric)  ·  checked (bool)
```

> Le champ `household_id` (mode famille F10) n'est PAS ajouté maintenant, mais garde `profile_id` isolé pour pouvoir migrer facilement plus tard.

## 6. Contrats d'API (endpoints FastAPI du MVP)

```
POST /inventory/from-photo      body: { photo_url }        → renvoie items détectés (§7.1)
GET  /inventory                                            → liste inventaire
PATCH /inventory/{id}                                      → corriger un item
DELETE /inventory/{id}

POST /search                    body: { query }            → recettes correspondantes (F5)
POST /meal-plan/generate        body: { week_start, budget, constraints } → plan complet (F2)
GET  /meal-plan/{id}
POST /shopping-list/from-plan   body: { meal_plan_id }     → liste dédupliquée vs inventaire (F7)

# jobs internes (cron)
POST /jobs/expiry-check                                    → génère notifications (F4)
```

Auth : tous les endpoints exigent le JWT Supabase. FastAPI valide le token et lit `profile_id` dessus.

## 7. Tâches IA & formats de sortie

Toutes les sorties IA destinées à alimenter l'UI ou la base **doivent être du JSON structuré** (schéma imposé dans le prompt système, réponse parsée côté serveur). Jamais de texte libre pour ces tâches.

### 7.1 Vision — inventaire depuis photo (F1)
Entrée : image du frigo. Sortie attendue :
```json
{
  "items": [
    { "name": "lait", "quantity": 1, "unit": "L", "brand": null,
      "expiry_date": null, "confidence": 0.0 }
  ]
}
```
Note : l'estimation de quantité et la lecture des dates sont peu fiables → toujours laisser l'utilisateur corriger l'inventaire après détection (§UI). Le `confidence` sert à surligner les items douteux.

**Consigne de modèle (prototype vision) :** Utilise **Claude Sonnet 5** pour le prototype vision, avec **sortie JSON structurée** et **prompt caching** sur le système/schéma. Mesure le **coût réel par scan sur 10 photos de frigo test**, et évalue si **Claude Haiku 4.5** tient la même qualité — si oui, bascule dessus pour réduire le coût. **Ne pars pas sur Opus.**

**Décision (mesure 2026-08, 12 photos).** Défaut = **Sonnet 5**. La mesure a montré que Haiku 4.5 est ~4,5× moins cher mais rate ~23 % d'items et calibre mal le `confidence` — ça dégrade l'inventaire, cœur du produit, et l'économie (~6 cts/utilisateur/mois) ne le justifie pas. **Haiku 4.5 reste un repli documenté** via la variable d'env `VISION_MODEL` (défaut `claude-sonnet-5` dans `api/app/core/config.py`).
La sonde a montré un écart constant **name_confidence (0,57) vs quantity_confidence (0,36)**. **Décision assumée : on garde un seul champ `confidence`** (pas de séparation), la quantité étant de toute façon à confirmer par l'utilisateur.

### 7.2 Génération de plan de repas (F2)
Entrée : profil (budget, temps, régime, allergies, objectifs) + inventaire courant. Sortie : structure `meal_plan` complète (7 jours × 4 créneaux) référençant des recettes, avec macros et coût estimé, priorisant les aliments déjà présents et bientôt périmés.

### 7.3 Recherche langage naturel (F5)
Entrée : requête utilisateur libre (« italien ce soir », « moins de 20 min », « j'ai œufs/riz/tomates »). Sortie : liste de recettes filtrées, cohérentes avec l'inventaire quand pertinent.

> **Prompt caching** obligatoire sur le prompt système + schémas (contexte stable) pour réduire le coût d'entrée d'environ 90 %.

## 8. Découpage en phases (le plan pour Claude Code)

Une phase = une tranche verticale fonctionnelle, testée et commitée avant la suivante.

- **Phase 0 — Fondations.** Repo Expo + FastAPI + Supabase. Auth. Écran profil (budget, régime, allergies, objectifs). CLAUDE.md, lint, tests, CI de base.
- **Phase 1 — Inventaire (F1).** Upload photo → Storage → endpoint vision → écran inventaire éditable. C'est la brique la plus structurante.
- **Phase 2 — Recherche IA (F5).** Barre de recherche → `/search` → écran résultats recettes. Valeur rapide, peu de dépendances.
- **Phase 3 — Plan de repas (F2).** `/meal-plan/generate` → écran semaine. S'appuie sur inventaire + profil.
- **Phase 4 — Liste de courses (F7).** `/shopping-list/from-plan` → écran liste par rayon, dédupliquée vs inventaire.
- **Phase 5 — Alertes péremption (F4).** Cron + push Expo + deep-link vers recettes utilisant l'aliment.

Après la Phase 5, le MVP est complet et bouclé. On ouvre alors la discussion v2 (dashboard, vocal, ticket, etc.).

## 9. Points de vigilance (à lire avant de coder)

- **Paiement in-app.** Apple et Google **imposent** leur système d'achat intégré pour les abonnements numériques ; Stripe seul fait rejeter l'app à la review. Utiliser **RevenueCat** (qui encapsule StoreKit / Play Billing) sur mobile, et réserver Stripe au web. Ne pas construire la facturation avant que le produit ait de la valeur — la mettre en dernier.
- **RGPD (tu es à Bruxelles, UE).** Les photos de frigo et les tickets sont des données personnelles. Prévoir dès le départ : consentement, minimisation (ne pas stocker les photos plus longtemps que nécessaire), possibilité d'export et de suppression du compte. À intégrer dans le modèle, pas à rajouter après.
- **Coût IA.** Chaque analyse photo + génération de plan consomme des tokens. Mettre un modèle rapide/éco par défaut, réserver les modèles premium aux tâches dures, activer le prompt caching, et poser un quota côté freemium (§Monétisation du brief).
- **Fiabilité vision.** La détection d'inventaire ne sera jamais parfaite. Le design doit assumer la correction manuelle comme étape normale, pas comme cas d'erreur.

## 10. Première instruction à donner à Claude Code

> « Lis `docs/spec.md`. Ne code rien pour l'instant. Propose-moi : (1) l'arborescence du dépôt pour la stack décrite, (2) le contenu d'un `CLAUDE.md`, (3) un plan détaillé pour la Phase 0. J'validerai avant que tu écrives du code. »
