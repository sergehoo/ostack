---
name: real-estate-rent-accounting-precision
description: Loyers, charges et dépôts calculés en décimal exact, avec quittance pour chaque paiement.
scope: technology
status: extracted
---

# Précision comptable des loyers

Loyers, charges et dépôts calculés en décimal exact, avec quittance pour chaque paiement.

## À appliquer

- Jamais de float binaire pour l'argent ; décimal exact, échelle par devise.
- Toute quittance correspond à un paiement enregistré ; réconciliation périodique.
- Prorata et régularisations documentés et rejouables.

## Preuve attendue (§OStack)

Tests fondés sur les propriétés (somme exacte), test quittance⇔paiement. Voir aussi finance/monetary-precision.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
