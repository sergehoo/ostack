---
description: Dérouler le workflow vérifié complet d'une fonctionnalité.
argument-hint: "<besoin>" --provider <ollama|openai|anthropic|mock>
---

# /ostack:feature

Dérouler le workflow vérifié complet d'une fonctionnalité.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Le workflow s'arrête à chaque barrière humaine et donne la commande de reprise. Utilise --provider mock pour un essai déterministe.

## Invocation de référence

```bash
ostack feature "<besoin>" --provider <ollama|openai|anthropic>
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
