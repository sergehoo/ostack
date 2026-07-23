---
description: Assembler et sceller l'Evidence Pack d'une tâche.
argument-hint: <chemin evidence-input.json>
---

# /ostack:prove

Assembler et sceller l'Evidence Pack d'une tâche.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Renseigne uniquement des observations RÉELLEMENT exécutées (tests, sécurité, perf). Le statut VERIFIED est refusé si une preuve manque.

## Invocation de référence

```bash
ostack prove <evidence-input.json>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
