---
name: logistics-inventory-consistency
description: Réserver le stock de façon atomique pour ne jamais expédier plus que disponible.
scope: technology
status: extracted
---

# Cohérence du stock (pas de survente)

Réserver le stock de façon atomique pour ne jamais expédier plus que disponible.

## À appliquer

- Réservation atomique du stock à la commande ; décrément et réservation dans la même transaction.
- Aucune expédition sans stock réservé ; gérer la concurrence (deux commandes du dernier article).
- Réconcilier stock théorique et inventaire physique ; tracer les écarts.

## Preuve attendue (§OStack)

Test concurrentiel : deux commandes simultanées du dernier article — une seule réussit ; pas de stock négatif.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
