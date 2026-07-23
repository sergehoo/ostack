---
name: elearning-quiz-referential-integrity
description: Chaque quiz référence une section existante de la même formation ; les réponses ne fuitent pas côté client.
scope: technology
status: extracted
---

# Intégrité référentielle des quiz

Chaque quiz référence une section existante de la même formation ; les réponses ne fuitent pas côté client.

## À appliquer

- Contrainte d'intégrité : quiz → section existante du même cours (rejet sinon).
- Ne jamais envoyer les bonnes réponses au client avant soumission.
- Idempotence de la soumission ; pas de double comptage de tentative.

## Preuve attendue (§OStack)

Test de cohérence (quiz orphelin rejeté), test de non-fuite des réponses dans la charge réseau.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
