---
description: Reconstruire et interroger le graphe de traçabilité.
argument-hint: rebuild | unverified | why <id> | impact <id>
---

# /ostack:graph

Reconstruire et interroger le graphe de traçabilité.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Sers-t'en pour savoir quel besoin justifie un fichier, quelles preuves couvrent une règle, et ce qui n'est pas prouvé.

## Invocation de référence

```bash
ostack graph rebuild ; ostack graph unverified ; ostack graph why <id>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
