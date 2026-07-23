---
name: logistics-parcel-tracking-ordering
description: Chaque transition de colis est scannée, horodatée, ordonnée et idempotente.
scope: technology
status: extracted
---

# Ordonnancement et idempotence des scans

Chaque transition de colis est scannée, horodatée, ordonnée et idempotente.

## À appliquer

- Horodater et ordonner les événements ; rejeter une transition d'état invalide.
- Idempotence : un scan rejoué ne crée pas de doublon d'événement.
- Exiger une preuve de livraison (signature/photo) avant clôture.

## Preuve attendue (§OStack)

Test de rejeu de scan (pas de doublon), test de transition invalide rejetée, test preuve de livraison requise.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
