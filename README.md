# OStack (Ogah Stack)

OStack est un système d’exploitation open source pour l’ingénierie logicielle assistée par IA : agents spécialisés, workflows, connaissance locale, politiques, audit et fournisseurs IA interchangeables.

> État : **developer preview M1 — vérifiée par elle-même**. `npm run self-prove` exécute typecheck, lint, tests (catégories mesurées), audit de dépendances et benchmark de stabilité, puis assemble l'Evidence Pack de release : `VERIFIED · APPROVE_WITH_OBSERVATIONS`. La persistance d'équipe et l'isolation conteneur appartiennent à M2/M3 — voir [la préparation production](docs/production-readiness.md). Ne pas déployer en multi-utilisateurs.

## Installation (outil global)

OStack est un **outil en ligne de commande** : installez-le une fois, puis lancez `ostack`
depuis n'importe quel projet — il agit sur le répertoire courant, pas sur lui-même.

```bash
git clone https://github.com/sergehoo/ostack.git
cd ostack && npm install && npm run build
npm link --workspace @ostack/cli    # expose la commande `ostack` sur le PATH
```

Ensuite, dans **n'importe quel** projet, installez le framework OStack dans le dépôt :

```bash
cd ~/mon-projet
ostack init "Mon projet"                 # crée .ostack/ dans CE projet
ostack install --assistant claude        # dépose commandes, agents, skill, standards, workflows
ostack doctor
```

`ostack install` pose le framework **dans le projet** au format de votre assistant :
`--assistant claude` (slash commands `/ostack:*` + subagents sous `.claude/`), `cursor`
(règles sous `.cursor/`) ou `codex` (`AGENTS.md` + `.ostack/`). Claude Code, Codex ou Cursor lisent
alors ces définitions ; une copie canonique des commandes sous `.ostack/commands` alimente le runtime
indépendant, et la commande `ostack` fournit les preuves déterministes derrière chaque verbe.
`ostack --help` liste les commandes ; `npm run ostack -- <cmd>` reste équivalent en mode développement.

Les mêmes commandes Markdown peuvent aussi être découvertes et exécutées sans interface
d’assistant :

```bash
ostack list
ostack inspect architecture-check
ostack run architecture-check --dry-run
ostack run architecture-check --input "Vérifier la nouvelle frontière" --provider ollama
```

Voir [le runtime de commandes indépendant](docs/command-runtime.md) pour les alias, les Domain Packs,
les ressources associées, la validation des entrées et la migration.

## Workflow de fonctionnalité

```bash
cd ~/mon-projet
ostack feature "Ajouter le besoin métier" --provider ollama
```

Le workflow s’arrête devant chaque barrière humaine et fournit la commande exacte de reprise. `--provider mock` permet un test déterministe sans appel externe.

Prévisualiser puis appliquer un plan de changement contrôlé :

```bash
ostack change change-plan.json
ostack change change-plan.json --confirm <empreinte-affichée> --reason "Diff et commandes qualité vérifiés"
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
- **Évolution Git-native** : chaque apprentissage vérifié devient une évolution versionnée (ledger, branche, commit, PR), fusionnée automatiquement seulement à faible risque ; l'auto-évolution ne peut pas réduire ses propres garde-fous (`ostack evolve`). Voir [l'évolution autonome](docs/evolution.md).
- **Apprentissage automatique** : la base de connaissance s'enrichit toute seule des commandes, preuves, délibérations et projets (`ostack learn`), en faits sourcés cross-projets, jamais inventés. Voir [l'apprentissage](docs/learning.md).
- **Framework installable** : `ostack install` dépose commandes `/ostack:*`, agents, skill de méthode, standards et workflows directement dans le projet, au format Claude Code / Cursor / Codex. Léger dans le projet, vérifiable via la commande `ostack`. Voir [le framework](docs/framework.md).
- **Runtime de commandes indépendant** : `ostack list`, `ostack inspect` et `ostack run` découvrent et exécutent les commandes installées et celles des Domain Packs via le fournisseur configuré, avec dry-run, validation, timeout et journal non sensible.
- **Proof-Carrying Software** : noyau de vérification déterministe (Evidence Pack, Confidence Score, Quality Budget, Definition of Done) et commandes `prove`, `verify --gate`, `confidence`. Voir [la preuve logicielle](docs/evidence.md).
- **Chaîne d'ingénierie vérifiée** : Intent-to-Proof Compiler (`intent-compile`), Knowledge Graph de traçabilité (`graph`), jumeau numérique avec détection de dérive (`drift`), délibération multi-agents à arbitrage par preuves (`challenge`), Model Mesh routé au coût par résultat vérifié, observation runtime (`observe`), Functional Testing Studio (matrice de permissions) et Authorized Security Lab défensif (`security-lab`). Voir [la chaîne vérifiée](docs/verified-engineering.md).
- **Intelligence d'ingénierie** : boucle de vérification autonome à budgets durs, Performance Intelligence (baseline/régression), Architecture Intelligence (frontières vérifiées, appliquées à OStack lui-même), analyse de cause racine et mémoire des décisions. Voir [l'intelligence d'ingénierie](docs/engineering-intelligence.md).
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

## Documentation

- **[Guide d'utilisation (Claude, ChatGPT, Codex, Cursor, terminal)](docs/guide-utilisation.md)** — installation par assistant et les 33 commandes
- [Architecture](docs/architecture/README.md) · [Modèle de données](docs/data-model.md) · [Commandes](docs/commands.md) · [Feuille de route](docs/roadmap.md)
- [Preuve logicielle](docs/evidence.md) · [Chaîne d'ingénierie vérifiée](docs/verified-engineering.md) · [Intelligence d'ingénierie](docs/engineering-intelligence.md)
- [Intelligence métier universelle](docs/universal-domain.md) · [Apprentissage automatique](docs/learning.md) · [Évolution autonome Git-native](docs/evolution.md)
- [Framework installable](docs/framework.md) · [Préparation production](docs/production-readiness.md) · [Fournisseurs](docs/providers.md) · [Isolation](docs/isolation.md)

## Licence

Apache-2.0 — voir [LICENSE](LICENSE).
