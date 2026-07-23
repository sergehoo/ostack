---
name: retail-price-change-audit
description: Toute modification de prix ou promotion est journalisée et résiste aux mises à jour concurrentes.
scope: technology
status: extracted
---

# Audit et concurrence des changements de prix

Toute modification de prix ou promotion est journalisée et résiste aux mises à jour concurrentes.

## À appliquer

- Journaliser qui/quand/quoi pour chaque changement de prix ou promotion.
- Gérer la concurrence (verrou optimiste) ; pas de perte de mise à jour.
- Un prix affiché au panier est celui appliqué au paiement (cohérence temporelle).

## Preuve attendue (§OStack)

Test d'audit du changement de prix, test de mise à jour concurrente sans perte, test de cohérence panier↔paiement.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
