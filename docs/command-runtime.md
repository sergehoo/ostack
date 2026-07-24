# Runtime de commandes indépendant des assistants

OStack peut exécuter les commandes déclaratives installées sans dépendre de l’interface de Claude Code,
Codex ou Cursor. La CLI découvre le même contenu Markdown, construit un contexte borné et l’envoie au
fournisseur IA configuré derrière le port `ModelProvider`.

## Utilisation

```bash
ostack list
ostack inspect architecture-check
ostack run architecture-check --dry-run
ostack run project-review --input "Ajouter une API d'audit"
ostack run project-review --input @request.md --provider ollama --json
ostack run-all --input "Améliorer ce projet"
ostack run-all --input @request.md --execute --provider ollama
```

`--dry-run` n’appelle aucun fournisseur. Il valide la commande et son entrée, charge les ressources
associées et retourne le contexte exact qui serait envoyé.

`--input @fichier` lit un fichier UTF-8 situé dans le projet. Les chemins extérieurs au projet, les
liens symboliques sortants et les fichiers de plus de 1 Mo sont refusés.

## Exécuter tous les skills dans un cycle unique

`ostack run-all` découvre les skills installés dans `.ostack/skills`, les assemble avec l’objectif
fourni et construit un seul contexte structuré. Sans `--execute`, la commande reste en prévisualisation
et n’appelle aucun fournisseur :

```bash
ostack run-all --input "Rendre l’API plus robuste" --json
```

Après examen du contexte, l’exécution réelle effectue **un seul appel fournisseur**. Le modèle doit
indiquer, pour chaque skill, s’il a été appliqué, jugé non pertinent ou bloqué, avec sa raison :

```bash
ostack run-all --input @examples/run-all-objective.md --execute --provider ollama
```

Les packs métier ne sont jamais injectés silencieusement. Sélectionnez un pack précis, répétable,
ou tous les packs disponibles :

```bash
ostack run-all --input "Vérifier le moteur d’ordres" --domain finance
ostack run-all --input "Audit multidomaine" --include-domains
```

Options :

- `--execute` : autorise l’appel au fournisseur ; absent = dry-run sûr ;
- `--domain <id>` : ajoute les skills d’un domaine précis ; l’option est répétable ;
- `--include-domains` : ajoute tous les packs découverts ;
- `--provider <id>` : sélectionne le fournisseur et exige `--execute` ;
- `--timeout <ms>` : borne l’appel entre 100 et 600 000 ms ;
- `--input <texte|@fichier>` : objectif obligatoire.

Les doublons strictement identiques sont dédupliqués. Deux définitions différentes portant le même
nom bloquent le cycle afin qu’aucune règle ne soit choisie arbitrairement. Les instructions combinées
sont bornées, les liens symboliques sont ignorés et le texte produit par le modèle n’est jamais
exécuté comme commande système.

## Emplacements découverts

La découverte est récursive dans les emplacements suivants :

```text
.ostack/commands/**/*.md
.ostack/domains/<domaine>/commands/**/*.md
.ostack/domain-packs/<pack>/commands/**/*.md
.ostack/packs/<pack>/commands/**/*.md
domain-packs/<pack>/commands/**/*.md
```

Les commandes du projet conservent le nom du fichier : `review.md` devient `review`. Une commande de
pack est qualifiée par son espace de noms : `finance/commands/review.md` devient `finance:review`.
Un nom court ou un alias qui désigne plusieurs commandes est signalé comme ambigu ; OStack ne choisit
jamais silencieusement.

Les formes `review`, `ostack:review`, `/ostack:review` et les chemins imbriqués sont normalisées avant
résolution.

## Contrat Markdown

Les commandes existantes sans métadonnées supplémentaires restent valides. Les clés facultatives
suivantes activent le contrat d’exécution :

```markdown
---
name: project-review
description: Examiner un objectif.
aliases: [review-project, project-check]
agents: [software-engineer]
standards: [typescript-node]
policies: [security]
workflows: [software-lifecycle]
input-required: true
input-max-chars: 20000
input-pattern: ^FEATURE-
timeout-ms: 120000
argument-hint: --input "<objectif>"
---

# Instructions

Instructions envoyées au fournisseur.
```

Les listes peuvent aussi être écrites sous forme de valeurs séparées par des virgules. Les noms,
alias, limites, expressions régulières et références de ressources sont validés avant tout appel au
fournisseur.

## Résolution des ressources

Une association `policies: [security]` cherche, dans l’ordre :

1. le dossier du domaine ou du pack qui contient la commande ;
2. `.ostack/policies/` dans le projet ;
3. `policies/` à la racine du projet.

Le même principe s’applique à `agents`, `standards` et `workflows`. Une association déclarée mais
introuvable bloque l’exécution. Les chemins absolus, les traversées `..`, les liens sortants et les
ressources de plus de 1 Mo sont refusés.

## Fournisseur et timeout

Sans `--provider`, l’ordre `ai.preferredProviders` de `.ostack/config.json` est utilisé. Les modèles
proviennent de `ai.models`. Les options facultatives suivantes configurent la couche d’exécution :

```json
{
  "execution": {
    "timeoutMs": 120000,
    "maxInputChars": 100000
  }
}
```

La priorité du timeout est : `--timeout`, `timeout-ms` de la commande, configuration projet, puis
120 secondes. La valeur doit être comprise entre 100 ms et 600 000 ms.

## Journal et confidentialité

Chaque tentative validée produit une entrée append-only dans :

```text
.ostack/runs/commands.jsonl
```

Le journal conserve le statut, les horodatages, le fournisseur, le modèle, la durée, les métriques
d’usage et les empreintes SHA-256. L’entrée et la sortie du modèle ne sont jamais persistées dans le
journal. L’audit `.ostack/audit.jsonl` reçoit uniquement les mêmes métadonnées non sensibles.

Les statuts sont `dry_run`, `succeeded`, `failed` et `timed_out`.

## Migration

Aucune migration destructive n’est requise :

1. mettre OStack à jour et reconstruire la CLI ;
2. conserver les commandes Markdown existantes telles quelles ;
3. ajouter progressivement `aliases`, les associations et le contrat d’entrée ;
4. utiliser `ostack list --json` pour détecter les alias ambigus ;
5. utiliser `ostack inspect <commande>` puis `ostack run <commande> --dry-run` avant le premier appel ;
6. prévisualiser `ostack run-all --input "<objectif>"` avant d’ajouter `--execute` ;
7. exécuter avec le fournisseur configuré.

`ostack install` conserve son comportement et sa règle de non-écrasement. Les commandes et skills installés
restent lisibles directement par les assistants et deviennent également exécutables par la CLI.
Pour Claude Code et Cursor, l’installation conserve l’emplacement propre à l’assistant et ajoute la
copie canonique dans `.ostack/commands` et `.ostack/skills`. Une définition personnalisée déjà présente n’est pas écrasée
sans `--force`.

### Rollback de l’installation canonique

La sortie JSON de `ostack install --json` contient la liste exacte `installed`. Conservez cette
sortie comme reçu de migration. Pour revenir en arrière, supprimez uniquement ces chemins, dans
l’ordre inverse, puis restaurez le fichier d’instructions (`AGENTS.md`, `CLAUDE.md` ou
`.cursorrules`) depuis sa préimage. Les chemins marqués `skipped` appartenaient déjà au projet et ne
doivent jamais être supprimés.

Ce scénario est testé dans un projet éphémère : une commande préexistante, la configuration et les
instructions initiales restent identiques après suppression des seuls fichiers du reçu.

## Performance

Le benchmark `benchmarks/command-runtime.json` exécute cinq fois l’installation, `list`, `inspect`,
la construction d’un dry-run de commande et celle d’un cycle global de skills dans des projets
éphémères. Il rapporte la médiane et le p95 de
chaque tâche :

```bash
ostack benchmark benchmarks/command-runtime.json --json
```

## Limites

Le runtime appelle un modèle et retourne son texte ; il ne transforme jamais ce texte en commande
système, en écriture de fichier ou en action de production. Une future passerelle MCP pourra exposer
ce même package headless sans dupliquer la découverte ni les règles de sécurité.
