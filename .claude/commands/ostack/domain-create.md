---
description: Créer un Domain Pack métier à partir de sources.
argument-hint: --name <id> [--sector s] [--sources <dossier>]
---

# /ostack:domain-create

Créer un Domain Pack métier à partir de sources.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Le pack naît au niveau 0 (inconnu). Renseigne glossaire, acteurs, règles depuis les sources, puis fais valider par un expert. Ne prétends jamais connaître le métier sans sources.

## Invocation de référence

```bash
ostack domain create --name <id> --sources <dossier>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
