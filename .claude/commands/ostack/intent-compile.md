---
description: Compiler un besoin en invariants, propriétés Gherkin et preuves attendues.
argument-hint: <besoin en langage naturel>
---

# /ostack:intent-compile

Compiler un besoin en invariants, propriétés Gherkin et preuves attendues.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Utilise-la AVANT d'implémenter. Lis les invariants et propriétés adversariales produits; ils deviennent tes critères d'acceptation.

## Invocation de référence

```bash
ostack intent-compile "<besoin>"   # ou --from <draft.json> (déterministe)
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
