# Préparation à la mise en production

Ce document dit ce qui est **prouvé**, ce qui est **limité**, et ce qui reste **interdit** en
l'état. Il suit le principe §36.11 : toute incertitude est affichée.

## Statut : developer preview vérifiée — pas une production multi-utilisateurs

Le verdict est rendu par OStack lui-même : `npm run self-prove` exécute réellement typecheck,
lint, la suite de tests (avec catégories intégration/e2e/permission **mesurées** par re-exécution
des fichiers concernés), `npm audit`, la suite de benchmark (3 répétitions), puis assemble
l'Evidence Pack de release dans `.ostack/evidence/`.

Dernier verdict : `VERIFIED` · `APPROVE_WITH_OBSERVATIONS` · confiance 83/100 · porte restante :
`human_approved` — l'approbation humaine ne peut pas être produite par le système (§36.5).

## Ce qui est prouvé à chaque exécution

| Contrôle | Preuve |
|---|---|
| Compilation stricte de tous les packages | `npm run check` (tsc -b) |
| Lint sans violation | `npm run lint` (typescript-eslint recommended) |
| Suite de tests complète | `npm test` — comptage réel des pass/fail |
| Tests d'intégration / e2e / permissions | re-exécution mesurée des groupes de fichiers correspondants |
| Dépendances sans vulnérabilité critique/haute | `npm audit --json` |
| Reproductibilité de la plateforme | `ostack benchmark` — 5 tâches × 3 répétitions, la stabilité est le score |
| Cohérence schémas ↔ artefacts | `ostack doctor` — chaque paire schéma/exemple validée |

La CI (`.github/workflows/ci.yml`) rejoue l'intégralité de ces contrôles sur chaque push.

## Approuver la release

L'approbation est un acte humain enregistré dans la preuve :

1. Lire l'Evidence Pack généré (`.ostack/evidence/OSTACK-RELEASE-<version>-*.json`) — en
   particulier `residualRisks` et `confidence.uncertainty`.
2. Ajouter dans `.ostack/self-evidence-input.json` votre entrée `humanApprovals`
   (`approver`, `reason`, `approvedAt`).
3. Relancer `ostack prove .ostack/self-evidence-input.json` — le statut passe à `APPROVED`.

## Procédures

- **Déploiement** : `npm ci && npm run build && npm test`. Distribution locale (`npm pack` par
  package). Node ≥ 22. Aucun service externe requis ; les fournisseurs IA sont optionnels.
- **Rollback** : retour au tag Git précédent puis `npm ci && npm run build`. Les états locaux
  `.ostack/` (schemaVersion 1) sont rétrocompatibles ; les artefacts de preuve sont immuables
  (empreintes de contenu).
- **Surfaces réseau** : API et Web liées à `127.0.0.1` uniquement ; CORS restreint au dashboard
  local ; sondes `observe` loopback sauf allowlist projet.

## Limites connues (risques résiduels assumés)

Ces limites sont inscrites dans l'Evidence Pack de release ; les corriger est le contenu de
M2/M3 ([roadmap](roadmap.md)) :

1. **Isolation processus, pas conteneur** *(medium)* — le QualityRunner n'exécute que des
   commandes allowlistées sans shell, mais il n'y a pas encore de sandbox OS/conteneur durcie.
   Mitigation : niveaux 3/4 avec approbation humaine obligatoire.
2. **Persistance locale mono-utilisateur** *(medium)* — SQLite + JSONL append-only ; pas de
   journal d'audit inviolable ni de RBAC/SSO d'équipe. Ne pas partager une instance entre
   utilisateurs non confiants.
3. **Qualité dépendante du fournisseur configuré** *(low)* — drafting d'intention et délibération
   suivent le modèle choisi ; toutes les sorties de modèles restent des données non fiables
   validées par schéma, et l'arbitre est purement mécanique.

## Interdits en l'état

- Déploiement multi-tenant ou exposé à Internet (API/Web sont locales par conception).
- Toute opération de sécurité active sans manifeste d'autorisation valide (`security-lab`).
- Toute action de niveau 4 (production) sans approbation humaine explicite — c'est un refus
  par défaut du moteur de politiques, pas une convention.
