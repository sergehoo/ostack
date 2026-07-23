---
description: Évaluer les règles métier d'un domaine sur un contexte réel.
argument-hint: <pack.json> --action <a> --context <ctx.json> [--jurisdiction <j>]
---

# /ostack:domain-check

Évaluer les règles métier d'un domaine sur un contexte réel.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Une règle confirmée bloque; une règle non confirmée escalade vers un humain; une règle d'une autre juridiction est exclue, jamais appliquée en silence.

## Invocation de référence

```bash
ostack domain check <pack.json> --action <action> --context <ctx.json> [--jurisdiction <j>]
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
