---
description: Structurer une réponse à incident de sécurité (défensif).
argument-hint: <intitulé de l'incident> | <fichier.json>
---

# /ostack:incident

Structurer une réponse à incident de sécurité (défensif).

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

Produit le squelette de réponse à incident (détecter, contenir, éradiquer, restaurer, capitaliser). Chaque étape n'est « faite » qu'adossée à une preuve ; les actions irréversibles exigent une approbation humaine. Interdits : contre-attaque, accès à un système tiers, suppression de preuve, stockage de secret/identifiant/PII. L'incident reste ouvert tant qu'un constat critique/haut n'est pas résolu.

## Invocation de référence

```bash
ostack incident "<intitulé de l'incident>"
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
