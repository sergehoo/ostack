---
description: Analyse de cause racine structurée sur le journal d'audit.
argument-hint: open --incident <id> --symptom "<symptôme>"
---

# /ostack:root-cause

Analyse de cause racine structurée sur le journal d'audit.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Distingue symptôme, cause directe, cause racine, correction, prévention. Le statut 'diagnosed' exige une expérience concluante ET un test de non-régression.

## Invocation de référence

```bash
ostack root-cause open --incident <id> --symptom "<symptôme>"
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
