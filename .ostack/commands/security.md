---
description: Auditer la sécurité de façon strictement défensive (Blue/Purple Team).
argument-hint: review | dependencies | threat-model <système> | catalog [niveau] | evidence <fichier.json>
---

# /ostack:security

Auditer la sécurité de façon strictement défensive (Blue/Purple Team).

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Strictement défensif (skill `ostack-security-defense`). `review` est un audit local passif et non destructif ; un outil absent devient `not_run`, jamais `passed`. Un constat sans preuve est rejeté ; un constat haut/critique bloque la release. Un test ACTIF sur une cible réelle exige un manifeste `ostack security-lab` valide et autorisé — sinon, refuse. Ne produis jamais de charge offensive contre une cible réelle ou tierce.

## Invocation de référence

```bash
ostack security review ; ostack security threat-model "<système>" ; ostack security catalog [niveau]
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
