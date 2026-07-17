---
description: Vérifier les frontières d'architecture contre le graphe d'imports réel.
argument-hint: [--gate]
---

# /ostack:architecture-check

Vérifier les frontières d'architecture contre le graphe d'imports réel.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Toute dépendance interdite est un blocage de merge. Corrige l'import, ne désactive pas la règle.

## Invocation de référence

```bash
ostack architecture check --gate
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
