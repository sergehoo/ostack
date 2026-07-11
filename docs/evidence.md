# Proof-Carrying Software — Evidence Pack

Le principe non négociable d’OStack : **aucun résultat sans preuve** (§36.1). Le package
`@ostack/evidence` est le noyau de vérification déterministe qui transforme des observations
d’ingénierie en un **Evidence Pack** scellé, reproductible et auditable.

Le noyau ne dépend d’aucun fournisseur ni d’aucune interface : pour les mêmes observations, il
produit toujours le même verdict et la même empreinte (`contentHash`). La persuasion textuelle
n’entre jamais dans la décision — seules les preuves exécutées comptent.

## Les quatre moteurs

| Moteur | Section | Rôle |
|---|---|---|
| **Confidence Score** (`scoreConfidence`) | §25 | Score multidimensionnel. Une dimension revendiquée haute sans preuve d’appui est plafonnée ; une confiance globale ≥ 70 est interdite si une dimension n’est pas prouvée. |
| **Quality Budget** (`evaluateBudget`) | §10 | Compare les métriques aux seuils. Une brèche bloque, sauf dérogation attribuable, justifiée, datée, non expirée et assortie d’un plan de correction. |
| **Definition of Done** (`evaluateDefinitionOfDone`) | §26 | Échelle d’états `DRAFT → IMPLEMENTED → TESTED → VERIFIED → APPROVED → RELEASED`. Un finding sécurité critique ou haut rejette la tâche (`REJECTED`). |
| **Evidence Pack** (`assembleEvidencePack`) | §3 | Agrège demande, spécification, diff, migrations, tests, sécurité, performance, budget, confiance et DoD, puis produit une recommandation de release et une empreinte SHA-256. |

## Dimensions de confiance

`requirements_understanding`, `implementation_correctness`, `test_strength`,
`security_assurance`, `performance_assurance`, `documentation_consistency`, `rollback_readiness`.

Chaque sous-score doit être adossé à au moins un `EvidenceItem` non défaillant de la dimension.
Sinon, le score effectif est plafonné (60 sans preuve, 50 en cas de preuve défaillante) et
l’incertitude correspondante est affichée.

## Recommandation de release

- `REJECT` — la Definition of Done est rejetée (escapes sécurité à tolérance zéro).
- `BLOCK` — tests en échec, brèches de budget bloquantes, risques hauts non atténués, ou DoD non atteinte.
- `APPROVE_WITH_OBSERVATIONS` — toutes les portes passent mais des risques résiduels ou incertitudes subsistent.
- `APPROVE` — toutes les portes passent, aucun risque résiduel ni incertitude.

## Commandes

```bash
# Assembler et sceller l'Evidence Pack (persisté dans .ostack/evidence/, audité)
ostack prove examples/evidence-input.json

# Verdict de release concis ; --gate sort en code non nul si non approuvé (utile en CI)
ostack verify examples/evidence-input.json --gate

# Score de confiance multidimensionnel seul
ostack confidence examples/evidence-input.json
```

L’entrée respecte `schemas/evidence-input.schema.json` (validée par `ostack doctor`).
`examples/evidence-input.json` correspond au cas pilote BestÉpargne (§35) : génération de
formation par l’IA restant obligatoirement en brouillon.

## Garanties vérifiées

- une confiance élevée sans preuve d’appui est impossible ;
- une brèche de budget non couverte par une dérogation valide bloque la release ;
- une dérogation expirée ne couvre plus rien ;
- un finding sécurité critique ou haut entraîne `REJECT` ;
- l’empreinte de l’Evidence Pack est stable et indépendante de l’ordre des champs.

Ces garanties sont couvertes par les tests de `packages/evidence/test/evidence.test.ts`.
