# SmartChef AI

Assistant alimentaire personnel : photo du frigo → inventaire → recherche/plan de repas → liste de courses.

Voir [`docs/spec.md`](docs/spec.md) pour la spécification complète et [`CLAUDE.md`](CLAUDE.md) pour les règles de développement.

## Structure

- `app/` — Expo (React Native + React Native Web)
- `api/` — FastAPI
- `supabase/` — migrations SQL + config

## Démarrage

```bash
# Front
cd app
npm install
npm run dev

# Backend
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Supabase (local)
cd supabase
supabase start
supabase db push
```

## Phases

Voir §8 de `docs/spec.md`. **MVP complet — Phases 0 à 5 livrées :**

- **Phase 0** — Fondations : Supabase (auth ES256/JWKS, RLS), profil, suppression de compte RGPD.
- **Phase 1** — Inventaire depuis photo (F1) : photo → Storage → vision Sonnet 5 (Haiku en repli via `VISION_MODEL`) → écran de revue éditable → inventaire ; photo supprimée après validation.
- **Phase 2** — Recherche IA (F5) : `/search` → recettes cohérentes avec inventaire, régime et allergies.
- **Phase 3** — Plan de repas (F2) : `/meal-plan/generate` → semaine 7×4 persistée, budget + coût estimé.
- **Phase 4** — Liste de courses (F7) : `/shopping-list/from-plan` → liste par rayon, dédupliquée, soustraction inventaire (couche 1 stricte + Haiku conservateur), prix estimés « ~ ».
- **Phase 5** — Alertes péremption (F4) : cron `/jobs/expiry-check` (protégé par `CRON_SECRET`), fenêtre 3 jours, anti-spam avec réarmement automatique au changement de date, push Expo, deep-link vers la recherche.

### Cron à brancher au déploiement

`POST /jobs/expiry-check` doit être appelé **une fois par jour** par un planificateur externe (GitHub Actions, `pg_cron`, cron d'hôte), avec l'en-tête `Authorization: Bearer $CRON_SECRET`. Idem pour `/jobs/photo-cleanup`. Ces endpoints ne sont **jamais** appelables avec un JWT utilisateur.

## ⚠️ Secrets à régénérer avant tout déploiement

Ces secrets ont transité par un historique de conversation pendant le développement.
Ils conviennent au développement local, mais **doivent être régénérés avant toute
mise en production** — considérer les valeurs actuelles comme compromises.

| Secret | Où | Comment régénérer |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | `api/.env` | Dashboard Supabase → Settings → API → régénérer la clé `service_role`. ⚠️ Elle **contourne la RLS** — la plus critique. |
| `ANTHROPIC_API_KEY` | `api/.env` | console.anthropic.com → API Keys → révoquer et créer une nouvelle clé |
| `CRON_SECRET` | `api/.env` | Générer une nouvelle valeur, ex. `python -c "import secrets; print(secrets.token_urlsafe(32))"`, et la répercuter dans le planificateur (GitHub Actions, cron…) |

Règle de travail : ne jamais coller un secret dans une conversation ni dans un
message — le déposer directement dans `api/.env` (déjà couvert par `.gitignore`).

### Comptes de test

La confirmation email est **active** sur le projet Supabase (réglage de production
correct — ne pas le désactiver). Pour créer un compte de test utilisable
immédiatement, passer par l'API admin, qui contourne l'envoi d'email :

```python
admin.auth.admin.create_user({"email": ..., "password": ..., "email_confirm": True})
```

Les identifiants générés sont écrits dans un fichier `*.local.txt` (exclu de Git).
`@example.com` est refusé par Supabase — utiliser un domaine réel.

## Dette technique connue

- **Backend Python** : Python 3.14 (local) n'a pas de wheel `pydantic-core` et échoue à compiler. Le venv `api/.venv` est créé en **Python 3.12** via `uv` (`uv venv --python 3.12 .venv`). À normaliser (Docker/pyenv) avant CI.
- **`npm install --ignore-scripts`** : les dépendances de `app/` sont installées **sans exécuter les scripts de build natifs** (contournement d'un échec `bob build` sur `react-native-screens` + verrous EPERM sous Windows). Conséquence : **seul le bundle web est vérifié**. Le **build natif iOS/Android n'a pas été testé** et pourrait nécessiter une réinstallation `npm install` complète (sans `--ignore-scripts`) sur une machine macOS/Linux avant tout build device.
- **Warnings `EBADENGINE`** : certains paquets veulent Node ≥ 20.12/22 ; l'environnement local est en Node 20.11. Sans impact web/tests, mais à surveiller.
- **Notifications push (Phase 5) — livraison non vérifiée** : la logique (sélection fenêtre de péremption, anti-spam, réarmement, appel Expo Push API, marquage) est prouvée en test mocké + endpoint exécuté contre la vraie base. **La livraison réelle d'une notification nécessite un appareil physique + un projet EAS configuré** — non vérifiable dans cet environnement. À tester sur device avant mise en production.
