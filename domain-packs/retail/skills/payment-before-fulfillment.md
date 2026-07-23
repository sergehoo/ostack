---
name: retail-payment-before-fulfillment
description: Aucune remise ni livraison sans paiement validé ; l'UI n'est jamais la seule barrière.
scope: technology
status: extracted
---

# Paiement avant exécution

Aucune remise ni livraison sans paiement validé ; l'UI n'est jamais la seule barrière.

## À appliquer

- Vérifier l'état de paiement côté serveur avant toute exécution ; refuser sinon.
- Idempotence du paiement : un retry ne débite ni ne livre deux fois.
- Séparer 'paiement autorisé' de 'paiement capturé' ; livrer sur capture confirmée.

## Preuve attendue (§OStack)

Test : livraison refusée sans paiement validé ; test d'idempotence du paiement. Voir aussi finance/idempotent-order-submission.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
