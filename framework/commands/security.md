---
description: Auditer la sécurité de façon strictement défensive (Blue/Purple Team).
argument-hint: review | dependencies | threat-model <système> | catalog [niveau] | permissions <f.json> | containers | evidence <f.json> | retest <f.json>
---

# /ostack:security

Auditer la sécurité de façon strictement défensive (Blue/Purple Team).

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Strictement défensif (skill `ostack-security-defense`). `review` est un audit local passif et non destructif qui exécute les scanners réels présents (semgrep, gitleaks, trivy) ; un outil absent ou expiré devient `not_run`, jamais `passed`. `permissions` évalue une matrice Rôle×Ressource×État ; `containers` lint les Dockerfiles/IaC. Un constat sans preuve est rejeté ; un constat haut/critique bloque la release. Un test ACTIF sur une cible réelle exige un manifeste `ostack security-lab` valide et autorisé — sinon, refuse. Ne produis jamais de charge offensive contre une cible réelle ou tierce.

## Invocation de référence

```bash
ostack security review ; ostack security threat-model "<système>" ; ostack security catalog [niveau]
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
