---
description: Rendre un verdict de release fondé sur les preuves.
argument-hint: <chemin evidence-input.json> [--gate]
---

# /ostack:verify

Rendre un verdict de release fondé sur les preuves.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

`--gate` échoue si le budget qualité ou la Definition of Done n'est pas atteint. Ne contourne jamais un échec de gate.

## Invocation de référence

```bash
ostack verify <evidence-input.json> --gate
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
