---
description: Établir une baseline et détecter les régressions de performance.
argument-hint: baseline | compare [--gate] [--samples N]
---

# /ostack:performance

Établir une baseline et détecter les régressions de performance.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Une régression p95 au-delà du budget bloque la release. Mesure sur l'application réellement lancée.

## Invocation de référence

```bash
ostack performance baseline --samples 10 ; ostack performance compare --gate
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
