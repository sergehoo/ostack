# Commandes

Toutes les commandes acceptent `--json` pour l’automatisation. Les alias `/ostack:<commande>` des assistants appellent le même contrat que `ostack <commande>`.

| Commande | Finalité | Niveau maximal par défaut |
|---|---|---:|
| `ostack init [nom]` | Initialise `.ostack/config.json` | 2 |
| `ostack discover` | Indexe et comprend projet et métier | 1 |
| `ostack feature <besoin> [--provider …] [--intent <compiled.json>]` | Orchestre intention, spécification, conception, délibération, tests, docs et squelette de preuve | 3 |
| `ostack bug <symptôme>` | Reproduit, diagnostique, corrige et prévient la régression | 2 |
| `ostack audit` | Audit architecture, qualité, sécurité et opérations | 1 |
| `ostack architecture` | Propose ADR, composants et compromis | 1 |
| `ostack design` | Produit parcours, interface et contrôle accessibilité | 2 |
| `ostack security` | Analyse menaces, dépendances, code et configuration | 1 |
| `ostack qa` | Exécute stratégie et barrières qualité | 2 |
| `ostack document` | Génère la documentation traçable | 2 |
| `ostack release` | Prépare version, migration, déploiement et rollback | 3 |
| `ostack doctor` | Vérifie l’installation et le projet | 1 |
| `ostack update [--check\|--rollback\|--channel <c>]` | Met à jour le framework (point de restauration, fast-forward, rollback sur échec) | 3 |
| `ostack change <plan.json>` | Prévisualise un plan sans modifier le projet | 1 |
| `ostack change <plan.json> --confirm <hash> --reason <raison>` | Applique le plan, contrôle la qualité et rollback si nécessaire | 3 |
| `ostack intent-compile <besoin> [--provider …] \| --from <draft.json>` | Compile une demande en invariants, propriétés Gherkin et preuves attendues | 2 |
| `ostack prove <evidence-input.json>` | Assemble et scelle l’Evidence Pack (persisté, audité) | 2 |
| `ostack verify <evidence-input.json> [--gate]` | Rend un verdict de release fondé sur les preuves | 1 |
| `ostack confidence <evidence-input.json>` | Affiche le score de confiance multidimensionnel | 1 |
| `ostack graph [rebuild\|why\|impact\|coverage\|unverified\|nodes]` | Reconstruit et interroge le graphe de traçabilité | 2 |
| `ostack drift [--gate]` | Compare le jumeau numérique au projet observé | 1 |
| `ostack challenge <proposition> [--provider …] \| --from <fichier>` | Soumet une proposition aux agents critique et adversarial | 2 |
| `ostack observe [--gate]` | Sonde l’application en fonctionnement et produit des preuves | 1 |
| `ostack security-lab validate-authorization <manifeste.json>` | Valide un manifeste d’autorisation de test défensif | 1 |
| `ostack security-lab check <manifeste.json> --target <hôte> --category <cat>` | Vérifie qu’une opération est couverte par l’autorisation | 1 |
| `ostack mesh [routes\|stats]` | Affiche le routage des modèles et les métriques par candidat | 1 |
| `ostack mesh record <tâche> <candidat> --verified\|--failed --cost <usd> --latency <ms>` | Enregistre un résultat réel (coût et latence obligatoires) | 2 |
| `ostack benchmark [suite.json]` | Exécute la suite de benchmark (N répétitions, score = stabilité) | 2 |
| `ostack domain create --name <id> [--sources <dir>]` | Crée un Domain Pack vierge avec inventaire des sources | 2 |
| `ostack domain score <pack.json>` | Score de compréhension métier calculé + niveau de maturité | 1 |
| `ostack domain validate <pack.json> --rule <id> --expert <nom> --reason <r>` | Confirmation experte d’une règle sourcée (auditée) | 2 |
| `ostack domain check <pack.json> --action <a> --context <ctx.json>` | Évalue les règles métier sur un contexte réel | 1 |
| `ostack domain scenarios <pack.json>` | Génère les scénarios de tests depuis les règles | 1 |
| `ostack domain cross <pack1> <pack2> …` | Analyse interdomaines (concepts partagés, règles en chevauchement) | 1 |
| `ostack architecture check [--gate]` | Vérifie les frontières d’architecture contre le graphe d’imports réel | 1 |
| `ostack performance baseline [--samples N]` | Établit une baseline p50/p95 par sonde | 2 |
| `ostack performance compare [--samples N] [--gate]` | Compare à la baseline et bloque sur régression | 2 |
| `ostack root-cause <open\|check\|close> …` | Analyse de cause racine structurée sur le journal d’audit | 1 |
| `ostack decision <record\|search> …` | Mémoire des décisions d’ingénierie (secrets masqués) | 2 |
| `ostack learn <observe\|recall\|record>` | Apprentissage: enrichit la base de connaissance (faits sourcés, cross-projets) | 2 |
| `ostack evolve <collect\|status\|record\|classify\|propose\|apply\|evaluate>` | Évolution Git-native: ledger, risque et plan de branche/commit/PR (auto-merge faible risque) | 2 |
| `ostack sync <status\|pull\|push\|verify>` | Synchronise le dépôt de connaissances (pull fast-forward-only, push gardé) | 2 |
| `ostack mesh settle <runId> [--verified\|--failed]` | Convertit le ledger de coûts réels en statistiques après verdict | 2 |

Une commande ne change jamais de niveau parce qu’un agent le demande. Une action de production issue de `release` reste de niveau 4 et exige une approbation humaine explicite.

`ostack discover` ne modifie rien par défaut. Ajoutez `--save` pour enregistrer le rapport dans `.ostack/discovery.json`; cette écriture locale est auditée.

## Reprendre une fonctionnalité

```bash
ostack feature --resume <run-id> \
  --approve <approval-request-id> \
  --reason "Décision et preuves examinées" \
  --provider ollama
```

L’identifiant d’approbation doit correspondre exactement à la demande en attente. La raison est obligatoire. Les étapes déjà terminées sont relues depuis SQLite et ne sont pas rejouées.

## Preuve et release

`prove`, `verify` et `confidence` consomment un fichier conforme à `schemas/evidence-input.schema.json` et produisent un verdict déterministe (voir [la preuve logicielle](evidence.md)). `verify --gate` sort en code non nul lorsque la recommandation n’est ni `APPROVE` ni `APPROVE_WITH_OBSERVATIONS`, ce qui en fait une barrière de release exploitable en CI. Aucune de ces commandes n’appelle un fournisseur IA : le verdict ne dépend que des preuves fournies.
