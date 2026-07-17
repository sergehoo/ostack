# Apprentissage automatique — OStack s'enrichit tout seul

OStack accumule progressivement une base de connaissance à partir de ce qui **s'est réellement
passé** : les commandes exécutées, les preuves produites, les délibérations, les intentions
compilées, les décisions, et les projets auxquels il participe. Fidèle à l'éthique OStack, chaque
leçon est un **fait agrégé et sourcé** (avec un compteur d'occurrences et l'ensemble des projets
où il a été vu) — jamais un conseil inventé.

## Deux bases

- **Projet** — `.ostack/knowledge/base.json` : instantané déterministe des artefacts du projet.
  Rejouer `observe` ne gonfle rien (reconstruit à zéro).
- **Globale** — `~/.ostack/knowledge/projects/<projet>.json` : chaque projet publie son instantané ;
  la base globale est leur **union vivante**. C'est ainsi qu'OStack s'enrichit d'un projet à l'autre
  sans dupliquer ni inventer (fusion par signature, somme des occurrences, union des projets).

## Commandes

```bash
ostack learn observe [--global]        # reconstruit la base depuis les artefacts réels
ostack learn recall "<sujet>" [--global]   # rappelle les faits accumulés (avant de proposer)
ostack learn record "<fait>" --source <url>  # référence sourcée (recherche, utilisateur)
```

`recall` classe par correspondance de termes puis par fréquence cross-projets, et explique chaque
résultat par les termes correspondants. `record` refuse un fait sans source (§33.2) et masque tout
secret avant enregistrement.

## Ce qui devient une leçon (factuel, sourcé)

| Type | Source | Exemple |
|---|---|---|
| `usage` | `audit.jsonl` | « Action 'intent.compile' exécutée 2 fois (0 refus) » |
| `residual_risk` | Evidence Packs | « Risque résiduel récurrent [medium]: sandbox non conteneurisée » |
| `blocking_challenge` | délibérations | « Défi bloquant récurrent: le rollback n'est pas testé » |
| `recurring_invariant` | intentions compilées | « Invariant récurrent [prohibition]: aucune publication automatique » |
| `reference` | `learn record` | fait de recherche avec son URL source |

## Déclenchement automatique

`ostack install --assistant claude` pose un hook Claude Code `Stop` :
`ostack learn observe --global --quiet`. Après chaque session, la base se met à jour toute seule —
sans écraser un hook existant, et de façon idempotente. Un `settings.json` déjà présent est fusionné,
jamais remplacé.

## Garde-fous (§26, §33)

- Aucune leçon sans source ; aucune référence sans source.
- Aucune duplication : la fusion est déterministe par signature.
- Secrets masqués avant stockage ; base locale, versionnable, supprimable.
- Les faits sont des agrégations vérifiables, pas des affirmations générées par un modèle.
