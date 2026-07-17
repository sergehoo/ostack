---
description: Soumettre une proposition aux agents critique et adversarial.
argument-hint: --from <fichier> | "<proposition>"
---

# /ostack:challenge

Soumettre une proposition aux agents critique et adversarial.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Chaque défi bloquant doit être résolu par une preuve exécutée avant de livrer, pas par un argument.

## Invocation de référence

```bash
ostack challenge --from <proposition.md>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
