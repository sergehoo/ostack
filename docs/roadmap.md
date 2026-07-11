# Feuille de route

## M0 — Foundation (ce dépôt)

Contrats du noyau, CLI, sécurité quatre niveaux, audit local, événements, orchestrateur, workflow déclaratif, connaissance locale, catalogue d’agents, SDK plugins, API en lecture, dashboard et tests essentiels.

## M1 — Developer preview (en cours)

Livré : adaptateurs OpenAI/Anthropic/Ollama, stockage SQLite, checkpoints/reprise, serveur MCP en lecture seule, découverte locale, validation JSON Schema, sandbox fichiers réversible, plans confirmés, validation en copie éphémère, workflow feature avec barrières humaines, le noyau Proof-Carrying Software (Evidence Pack, Confidence Score, Quality Budget, Definition of Done), l'Intent-to-Proof Compiler, le Knowledge Graph de traçabilité, le jumeau numérique avec détection de dérive, la délibération multi-agents à arbitrage par preuves et l'Adaptive Model Mesh.

Également livré : commandes `challenge`, `observe` et `security-lab`, Functional Testing Studio minimal (scénarios depuis l'intention, matrice de permissions) et Authorized Security Lab (manifestes d'autorisation défensifs).

Également livré : workflow feature vérifié v1.1.0 — compilation d'intention (avec contrôle d'intégrité `--intent`), délibération contradictoire après implémentation et squelette d'Evidence Pack généré en fin de run ; Verification Center (§29) — endpoints `/api/verification` et `/api/evidence` testés, CORS restreint au dashboard local, et console Web alimentée uniquement par des artefacts réels (plus aucune métrique fabriquée).

Également livré : routage Model Mesh par étape dans le workflow feature (`stepProviders`, repli explicite) et commande `mesh` (routes, stats, enregistrement de résultats réels) ; packs de standards validés par schéma (typescript-node, python-django, react-frontend) ; benchmark de stabilité §33 (`ostack benchmark`, 5 tâches × 3 répétitions) ; lint ESLint ; CI GitHub Actions ; LICENSE Apache-2.0 ; auto-preuve de release (`npm run self-prove`) et [dossier de préparation production](production-readiness.md).

Reporté à M2 : génération de plans par sorties structurées, sandbox OS/conteneur durcie, branchement automatique au workflow après validation humaine.

## M2 — Team preview

PostgreSQL, workers durables, RBAC/SSO, secrets externes, artefacts, OpenTelemetry, Web temps réel, évaluations LLM, budgets/coûts et plugins signés.

## M3 — Production

Haute disponibilité, journal d’audit inviolable, reprise après incident, isolation sandbox, politiques organisationnelles, marketplace vérifiée, SBOM/SLSA, packs métier qualifiés et certification des migrations.

## Critères de passage

Chaque jalon exige menaces mises à jour, tests de migration/rollback, documentation opérateur, budget de performance, compatibilité ascendante et aucune vulnérabilité critique ouverte.
