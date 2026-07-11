# Universal Domain Intelligence

OStack ne prétend connaître aucun métier. Il possède une **méthode** pour découvrir, modéliser,
valider et prouver n'importe quel domaine — et pour signaler précisément ses limites. Cette page
couvre les livrables de conception exigés par l'extension, et ce qui est implémenté dans
`@ostack/domain` (MVP).

## 1. Ontologie universelle (implémenté)

38 concepts fondamentaux (`UNIVERSAL_CONCEPTS`) : organisation, acteur, rôle, client, produit,
actif, dossier, contrat, document, transaction, workflow, validation, décision, échéance, risque,
contrôle, indicateur, règle métier, exception, statut, autorisation, donnée sensible… Chaque
domaine les **spécialise** via la couche d'adaptation (§11) : `customer` ↔ patient, assuré,
étudiant, emprunteur. Les capacités générales sont réutilisées sans effacer le vocabulaire local.

## 2. Format des Domain Packs (implémenté)

Un pack (`schemas/domain-pack.schema.json`) est versionné et contient : manifeste (secteur, pays,
langue, version), **sources référencées**, experts désignés, glossaire, acteurs, workflows
(étapes, acteurs, irréversibilité), règles métier, tables de décision, KPIs, correspondances
ontologiques et **questions ouvertes**. Chaque élément de connaissance porte un statut :
`extracted · assumed · pending_validation · confirmed · contested · obsolete` et ses sources.
Exemple complet : [examples/domain-pack-credit.json](../examples/domain-pack-credit.json).
Le format cible en arborescence (§9) viendra quand les sections dépasseront le fichier unique.

## 3. Découverte métier (implémenté en scaffold honnête)

`ostack domain create --name X --sources ./docs` inventorie les sources et crée un pack **niveau
0** portant les 11 questions essentielles (§3). Il ne prétend jamais avoir extrait une
connaissance qu'il n'a pas : l'extraction assistée par modèle (pipeline §6) viendra comme étape
optionnelle dont chaque sortie naît au statut `extracted`, jamais `confirmed`.

## 4. Validation par experts (implémenté)

`ostack domain validate <pack> --rule <id> --expert <nom> --reason "<raison>"` — acte humain
audité. Garde-fous codés : **une règle sans source ne peut pas être confirmée** ; une obligation
réglementaire doit être **localisée et datée** avant confirmation ; la validation exige un expert
nommé et une raison.

## 5. Score de compréhension (implémenté)

`ostack domain score` — multidimensionnel et **calculé** depuis le pack (part des éléments
sourcés, part confirmée, règles réglementaires localisées/datées, règles validées par expert) :
terminologie, acteurs et rôles, workflows, règles, réglementations, validation experte. Le score
liste ce qui est supposé (`assumed`), ce qui attend validation, et les questions ouvertes.

## 6. Niveaux de maturité et blocage (implémenté)

Échelle §30 dérivée du contenu : 0 inconnu → 1 découvert → 2 modélisé → 3 validé (toutes les
règles bloquantes confirmées) → 4 opérationnel (ontologie mappée, KPIs, experts). Les niveaux 5-6
exigent des preuves d'exécution liées via la couche Evidence. `assertDomainActionAllowed` refuse
une action critique sous le niveau requis **avec la liste exacte de ce qui manque**.

## 7. Moteur de règles (implémenté)

Règles universelles when/conditions/otherwise — la même mécanique bloque une sortie patient sans
diagnostic et une livraison sans paiement. Décisions : `allowed · blocked · needs_human_review`.
Point non négociable codé : **une règle non confirmée ne bloque ni ne laisse passer en silence** —
elle escalade vers un humain (§26.5, §26.8).

## 8. Tables de décision (implémenté)

Évaluation expliquée (« Ligne 3 : montant=élevé, profil=sensible → comité »), détection des
**conflits** (jamais résolus silencieusement) et des **cas non couverts** (énumérés). L'exemple
§16 (montant × profil → niveau de validation) est le cas de test.

## 9. Localisation (implémenté)

Les règles portent `jurisdiction` et `effectiveFrom`. `applicableRules` exclut les règles d'une
autre juridiction et **les liste** — une règle CI ne s'applique jamais en silence à la France.
Variantes de packs par pays : un pack par juridiction (`finance-ci`, `finance-fr`).

## 10. Raisonnement interdomaines (implémenté)

`ostack domain cross <pack1> <pack2> …` détecte : concepts universels partagés (avec les
vocabulaires locaux de chaque domaine), acteurs communs, et **chevauchements de règles** sur une
même action — tout chevauchement bloquant exige une validation croisée humaine.

## 11. Tests métier universels (implémenté)

`ostack domain scenarios` génère depuis chaque règle : cas nominal, cas bloqué (avec le message
attendu), cas de donnée manquante (« l'action n'est pas silencieusement autorisée »). La matrice
Rôle × Action × État s'appuie sur le Functional Testing Studio (§13 de la spec initiale).

## 12. Garde-fous anti-hallucination (§26 — codés, pas déclarés)

| Garde-fou | Mécanisme |
|---|---|
| Ne jamais inventer une règle | statut + sources obligatoires; sans source, pas de confirmation |
| Ne jamais confondre pratique et obligation | `kind`: internal_rule / good_practice / recommendation / regulatory_obligation / contractual_requirement |
| Ne jamais présenter une hypothèse comme un fait | statut `assumed` listé dans le score, jamais bloquant |
| Toujours citer source et date réglementaire | confirmation refusée sans jurisdiction + effectiveFrom |
| Bloquer les actions critiques si compréhension insuffisante | `assertDomainActionAllowed` par niveau de maturité |
| Conserver la trace des décisions humaines | validations expertes horodatées + audit JSONL |

## 13. Commandes

```bash
ostack domain create --name gestion-portuaire --sector transport --sources ./documents-port
ostack domain score examples/domain-pack-credit.json
ostack domain validate <pack.json> --rule br-credit-042 --expert responsable_credit --reason "Procédure v4 §3.2"
ostack domain check <pack.json> --action dossier.decaissement --context contexte.json [--jurisdiction CI]
ostack domain scenarios <pack.json> [--rule <id>]
ostack domain cross finance.json commercial.json
```

## 14. Reporté (documenté, pas oublié)

- Pipeline d'extraction assisté par modèle (§6) — sorties au statut `extracted`, jamais confirmées automatiquement ;
- Process mining sur journaux (§14), moteur de simulation (§24), marketplace (§25) ;
- Universal Domain Center dans la console Web (§29) — les données existent déjà côté packs ;
- Agents métier dynamiques instanciés depuis un pack (§12) — s'appuieront sur le mesh et les rôles génériques du catalogue.
