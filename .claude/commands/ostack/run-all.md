---
description: Appliquer tous les skills OStack sélectionnés au projet dans un cycle coordonné.
argument-hint: <objectif> [--domain <id>] [--include-domains] [--execute] [--provider <id>]
---

# /ostack:run-all

Appliquer tous les skills OStack sélectionnés au projet dans un cycle coordonné.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Prévisualise d'abord le contexte global sans appel fournisseur. Présente les skills sélectionnés et les packs disponibles. N'ajoute `--execute` que si l'utilisateur demande explicitement l'exécution IA ; sélectionne les packs métier avec `--domain <id>` ou `--include-domains`, jamais implicitement.

## Invocation de référence

```bash
ostack run-all --input "<objectif>" [--domain <id>] [--include-domains] [--execute] [--provider <id>]
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. La sortie du fournisseur reste une proposition non fiable : seules les commandes déterministes et preuves réellement exécutées peuvent confirmer un résultat.
