---
description: Compiler un besoin en invariants, propriétés Gherkin et preuves attendues.
argument-hint: <besoin en langage naturel>
---

# /ostack:intent-compile

Compiler un besoin en invariants, propriétés Gherkin et preuves attendues.

Arguments reçus : `$ARGUMENTS`

## Ce que tu fais

TU es le modèle: n'appelle pas de fournisseur externe. 1) Lis le schéma `.ostack/schemas/intent-draft.schema.json` et l'exemple `.ostack/examples/intent-draft.json`. 2) Rédige toi-même le brouillon d'intention pour `$ARGUMENTS` (invariants prohibition/permission/obligation/consistency, chaque règle de sécurité ou de permission implicite devient un invariant) et enregistre-le dans `.ostack/tmp/intent-draft.json`. 3) Lance `ostack intent-compile --from .ostack/tmp/intent-draft.json --json` — la compilation en propriétés Gherkin, contrôles et preuves attendues est DÉTERMINISTE. 4) Ces critères deviennent tes critères d'acceptation. N'utilise `--provider` que si un fournisseur est réellement configuré.

## Invocation de référence

```bash
ostack intent-compile --from .ostack/tmp/intent-draft.json
```

Exécute la commande `ostack` correspondante en y intégrant `$ARGUMENTS`, ajoute `--json` pour parser le résultat, puis présente une synthèse opérationnelle. Cette commande est adossée aux moteurs déterministes d'OStack : son résultat est une preuve, pas une opinion.
