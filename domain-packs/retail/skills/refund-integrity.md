---
name: retail-refund-integrity
description: Un remboursement exige un retour enregistré et conforme ; opération idempotente et tracée.
scope: technology
status: extracted
---

# Intégrité des remboursements

Un remboursement exige un retour enregistré et conforme ; opération idempotente et tracée.

## À appliquer

- Lier le remboursement à un retour enregistré et contrôlé ; refuser sinon.
- Idempotence : pas de double remboursement pour un même retour.
- Journaliser montant, motif, autorisation ; jamais de suppression silencieuse.

## Preuve attendue (§OStack)

Test : remboursement sans retour refusé ; test d'idempotence ; entrée d'audit vérifiée.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
