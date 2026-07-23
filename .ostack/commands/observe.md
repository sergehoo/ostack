---
description: Sonder l'application en fonctionnement et produire des preuves.
argument-hint: [--gate]
---

# /ostack:observe

Sonder l'application en fonctionnement et produire des preuves.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Confirme que le comportement réel correspond aux attentes. Cibles loopback sauf allowlist projet.

## Invocation de référence

```bash
ostack observe --gate
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
