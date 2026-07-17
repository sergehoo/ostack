---
description: Mémoire des décisions d'ingénierie.
argument-hint: search "<sujet>" | record <record.json>
---

# /ostack:decision

Mémoire des décisions d'ingénierie.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Cherche TOUJOURS les décisions passées avant de proposer une solution. Les secrets sont masqués à l'enregistrement.

## Invocation de référence

```bash
ostack decision search "<sujet>" ; ostack decision record <record.json>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
