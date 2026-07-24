# Feuille de route

## M0 — Foundation (ce dépôt)

Contrats du noyau, CLI, sécurité quatre niveaux, audit local, événements, orchestrateur, workflow déclaratif, connaissance locale, catalogue d’agents, SDK plugins, API en lecture, dashboard et tests essentiels.

## État actuel (2026-07-24)

31 packages, 35 commandes CLI (dont la cyberdéfense `security`/`incident`), 208 tests verts, typecheck et lint propres, doctor sain (20 contrôles),
validateurs d'évolution et de secrets au vert. `npm run self-prove` : `VERIFIED · APPROVE_WITH_OBSERVATIONS`,
confiance 83. Publié sur [github.com/sergehoo/ostack](https://github.com/sergehoo/ostack).

Également livré depuis : framework installable dans les projets (`ostack install` pour Claude Code /
Cursor / Codex — commandes `/ostack:*`, agents, skill de méthode, standards, workflows) ; apprentissage
automatique cross-projets (`ostack learn`, faits sourcés jamais inventés, hook de session) ; et
l'**Autonomous Git-Native Evolution Engine** (`@ostack/evolution` + `ostack evolve`, `ostack sync`,
`ostack update`) : ledger sans secret, extraction/classification de leçons, pipeline de promotion
OBSERVED→…→PROMOTED avec matérialisation en fichier versionné, classification de risque, plan Git
(branche/commit/PR), exécution locale réelle du commit, auto-évaluation avant promotion, sync du dépôt
de connaissances et self-update avec point de restauration/rollback. Tous les garde-fous non
négociables (§35) codés et testés (pas de force push, pas de push direct sur main, auto-merge réservé
au faible risque, l'auto-évolution ne peut pas réduire ses propres garde-fous).

Seul élément d'évolution non câblé, par sûreté : l'**exécution réseau de l'auto-merge** (§7) — le
moteur de décision, le plan et `evolve apply --push` sont prêts ; les activer exige un remote autorisé,
un token à portée limitée et des protections de branche configurés côté organisation (§16).

## M1 — Developer preview

Livré : adaptateurs OpenAI/Anthropic/Ollama, stockage SQLite, checkpoints/reprise, serveur MCP en lecture seule, découverte locale, validation JSON Schema, sandbox fichiers réversible, plans confirmés, validation en copie éphémère, workflow feature avec barrières humaines, le noyau Proof-Carrying Software (Evidence Pack, Confidence Score, Quality Budget, Definition of Done), l'Intent-to-Proof Compiler, le Knowledge Graph de traçabilité, le jumeau numérique avec détection de dérive, la délibération multi-agents à arbitrage par preuves et l'Adaptive Model Mesh.

Également livré : commandes `challenge`, `observe` et `security-lab`, Functional Testing Studio minimal (scénarios depuis l'intention, matrice de permissions) et Authorized Security Lab (manifestes d'autorisation défensifs).

Également livré : workflow feature vérifié v1.1.0 — compilation d'intention (avec contrôle d'intégrité `--intent`), délibération contradictoire après implémentation et squelette d'Evidence Pack généré en fin de run ; Verification Center (§29) — endpoints `/api/verification` et `/api/evidence` testés, CORS restreint au dashboard local, et console Web alimentée uniquement par des artefacts réels (plus aucune métrique fabriquée).

Également livré : routage Model Mesh par étape dans le workflow feature (`stepProviders`, repli explicite) et commande `mesh` (routes, stats, enregistrement de résultats réels) ; packs de standards validés par schéma (typescript-node, python-django, react-frontend) ; benchmark de stabilité §33 (`ostack benchmark`, 5 tâches × 3 répétitions) ; lint ESLint ; CI GitHub Actions ; LICENSE Apache-2.0 ; auto-preuve de release (`npm run self-prove`) et [dossier de préparation production](production-readiness.md).

Également livré : couche Universal Domain Intelligence (`@ostack/domain` + commande `domain`) — ontologie universelle, Domain Packs sourcés (schéma + exemple crédit CI), score de compréhension calculé, maturité 0-4 avec blocage des actions critiques, moteur de règles (une règle non confirmée escalade vers un humain, jamais de blocage ou passage silencieux), tables de décision (conflits et cas non couverts détectés), garde de juridiction, scénarios de tests générés et analyse interdomaines.

Également livré : boucle de vérification autonome (`@ostack/loop`, budgets durs + détection répétition/oscillation), Performance Intelligence baseline/compare (`ostack performance`), Architecture Intelligence (`ostack architecture check`, appliquée à OStack lui-même), analyse de cause racine structurée (`ostack root-cause`), mémoire des décisions avec masquage de secrets (`ostack decision`), et compteur de coûts réels du Model Mesh (ledger + `ostack mesh settle`). Pilote BestÉpargne exécuté de bout en bout avec le fournisseur Ollama local (llama3.2:3b) : intention compilée, agents réels, délibération contradictoire réelle (défi bloquant détecté), squelette de preuve honnête.

Reporté à M2 : commande de correction *entièrement autonome* (exige la sandbox de mutation durcie), génération de plans par sorties structurées, sandbox OS/conteneur durcie, pipeline d'extraction métier assisté par modèle, process mining, simulation métier, Universal Domain Center Web et marketplace de Domain Packs.

## M2 — Team preview

PostgreSQL, workers durables, RBAC/SSO, secrets externes, artefacts, OpenTelemetry, Web temps réel, évaluations LLM, budgets/coûts et plugins signés.

## M3 — Production

Haute disponibilité, journal d’audit inviolable, reprise après incident, isolation sandbox, politiques organisationnelles, marketplace vérifiée, SBOM/SLSA, packs métier qualifiés et certification des migrations.

## Critères de passage

Chaque jalon exige menaces mises à jour, tests de migration/rollback, documentation opérateur, budget de performance, compatibilité ascendante et aucune vulnérabilité critique ouverte.
