# SmartChef AI — CLAUDE.md

Assistant alimentaire : photo frigo → inventaire → recherche/plan de repas → liste de courses.
Spec complète : `docs/spec.md`. Lire avant toute décision d'architecture.

Sous-projet isolé du monorepo `cryptoiq` : aucun code, dépendance ou CI partagés avec `freshtrack/` ou `socialai/`.

## Périmètre MVP — STRICT
Seules F1, F5, F2, F7, F4 + auth/profil sont dans le MVP.
NE PAS implémenter : scan de ticket (F3), assistant vocal (F6), dashboard (F8),
IA nutritionnelle détaillée (F9), mode famille (F10), Nutri-Score (F11), impact (F12).
Si une tâche touche l'une de ces fonctionnalités : signaler et s'arrêter, sauf instruction explicite.

## Structure
```
smartchef/
├── app/          # Expo (React Native + RN Web)
├── api/          # FastAPI
├── supabase/     # migrations + config
├── docs/spec.md
└── README.md
```

## Stack
- Front : Expo (React Native + RN Web) — `smartchef/app/`
- Backend : FastAPI (Python, async) — `smartchef/api/`
- Données/Auth/Storage : Supabase (Postgres + RLS) — `smartchef/supabase/`
- IA : vision + LLM via API, sortie JSON structurée uniquement (jamais de texte libre parsé à la main)
- Paiement : RevenueCat (mobile), Stripe (web) — PAS avant que le produit ait de la valeur (dernière phase)

## Répartition front / backend
- Le front lit et écrit les données simples (profil, allergies, inventaire, listes) **directement via Supabase**, protégé par RLS.
- FastAPI est réservé aux tâches qui déclenchent de l'IA (vision, génération de plan, recherche) — pas un proxy CRUD généraliste.

## Règles
- Toute sortie IA (vision, recettes, plan) doit respecter un schéma JSON strict, validé côté serveur (Pydantic).
- L'inventaire détecté par photo est TOUJOURS éditable par l'utilisateur — ne jamais traiter la détection comme fiable à 100%.
- `profile_id` isolé partout (pas de `household_id` pour l'instant, mais garder la porte ouverte pour le mode famille v2).
- RGPD : minimisation des photos, consentement, export/suppression de compte — dès la Phase 0, pas ajouté après coup.
- Prompt caching obligatoire sur les prompts système/schémas IA (coût ~-90%).
- Choix de modèle : ne jamais défaulter sur le tier le plus cher. Extraction/classification → Haiku ou Sonnet. Réserver Opus au raisonnement complexe. Le modèle précis par tâche est spécifié dans la spec.
- Une phase = tranche verticale testée et commitée avant la suivante (voir §8 de la spec).

## Commandes
```bash
# Front
cd smartchef/app && npm run dev

# Backend
cd smartchef/api && uvicorn app.main:app --reload --port 8000

# Migrations Supabase
cd smartchef/supabase && supabase db push
```

## Env requis
- `smartchef/app/.env` : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`
- `smartchef/api/.env` : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWKS_URL` (JWT asymétriques ES256), clé(s) API vision/LLM
