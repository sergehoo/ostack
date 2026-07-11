# OStack (Ogah Stack)

OStack est un système d’exploitation open source pour l’ingénierie logicielle assistée par IA : agents spécialisés, workflows, connaissance locale, politiques, audit et fournisseurs IA interchangeables.

> État : **developer preview M1 — vérifiée par elle-même**. `npm run self-prove` exécute typecheck, lint, tests (catégories mesurées), audit de dépendances et benchmark de stabilité, puis assemble l'Evidence Pack de release : `VERIFIED · APPROVE_WITH_OBSERVATIONS`. La persistance d'équipe et l'isolation conteneur appartiennent à M2/M3 — voir [la préparation production](docs/production-readiness.md). Ne pas déployer en multi-utilisateurs.

## Démarrage

```bash
npm install
npm run build
npm run ostack -- init "Mon projet"
npm run doctor
```

Exécuter un workflow de fonctionnalité avec un fournisseur local ou distant :

```bash
npm run ostack -- feature "Ajouter le besoin métier" --provider ollama
npm run ostack -- feature "Ajouter le besoin métier" --provider openai
```

Le workflow s’arrête devant chaque barrière humaine et fournit la commande exacte de reprise. `--provider mock` permet un test déterministe sans appel externe.

Prévisualiser puis appliquer un plan de changement contrôlé :

```bash
npm run ostack -- change examples/change-plan.json
npm run ostack -- change examples/change-plan.json \
  --confirm <empreinte-affichée> \
  --reason "Diff et commandes qualité vérifiés"
```

Lancer les surfaces locales :

```bash
npm run api
npm run web
```

Le dashboard est disponible sur `http://127.0.0.1:4320` et l’API sur `http://127.0.0.1:4310/api/health`. Le Verification Center (`/api/verification`) n’affiche que des artefacts réels : Evidence Packs, intentions compilées, délibérations et nœuds non prouvés du graphe.

## Ce que contient ce premier incrément

- noyau sans dépendance fournisseur : événements, audit, permissions, agents, workflows et connaissance ;
- sécurité stricte à quatre niveaux avec approbation humaine obligatoire pour la production ;
- 28 rôles d’agents catalogués ;
- workflow logiciel complet et schémas déclaratifs ;
- CLI avec les commandes de cycle de vie et de preuve (`prove`, `verify`, `confidence`) ;
- SDK minimal de plugins à permissions explicites ;
- API locale en lecture seule et dashboard responsive ;
- tests du cœur et documentation d’architecture.
- adaptateurs OpenAI Responses API, Anthropic Messages API et Ollama Chat ;
- checkpoints SQLite et reprise des workflows sans réexécuter les étapes terminées ;
- serveur MCP stdio en lecture seule (`npm run mcp`).
- découverte locale des langages, frameworks, points d’entrée, infrastructure et état Git ;
- validation JSON Schema des agents, workflows et politiques dans `ostack doctor` ;
- sandbox de modifications locales avec chemins protégés, diff, empreintes et rollback.
- plans de changement structurés avec confirmation anti-TOCTOU et rollback automatique sur échec qualité.
- validation des changements dans une copie éphémère avant toute promotion vers le projet réel.
- **Proof-Carrying Software** : noyau de vérification déterministe (Evidence Pack, Confidence Score, Quality Budget, Definition of Done) et commandes `prove`, `verify --gate`, `confidence`. Voir [la preuve logicielle](docs/evidence.md).
- **Chaîne d'ingénierie vérifiée** : Intent-to-Proof Compiler (`intent-compile`), Knowledge Graph de traçabilité (`graph`), jumeau numérique avec détection de dérive (`drift`), délibération multi-agents à arbitrage par preuves (`challenge`), Model Mesh routé au coût par résultat vérifié, observation runtime (`observe`), Functional Testing Studio (matrice de permissions) et Authorized Security Lab défensif (`security-lab`). Voir [la chaîne vérifiée](docs/verified-engineering.md).
- **Universal Domain Intelligence** : ontologie métier universelle, Domain Packs sourcés et validés par experts, score de compréhension calculé, niveaux de maturité avec blocage des actions critiques, moteur de règles et tables de décision multisectoriels, garde de juridiction et analyse interdomaines (`domain`). OStack ne prétend connaître aucun métier : il sait en apprendre un et prouver ce qu'il a compris. Voir [l'intelligence métier universelle](docs/universal-domain.md).

## Structure

```text
apps/          API et console Web
packages/      noyau, CLI et SDK
agents/        catalogue des agents
workflows/     pipelines déclaratifs
policies/      politiques de sécurité
standards/     profils technologiques
domain-packs/  extensions métier
schemas/       contrats JSON Schema
docs/          architecture et guides
tests/         futurs tests transverses/E2E
```

Voir [l’architecture](docs/architecture/README.md), le [modèle de données](docs/data-model.md), les [commandes](docs/commands.md) et la [feuille de route](docs/roadmap.md).

## Licence

Apache-2.0 — voir [LICENSE](LICENSE).
