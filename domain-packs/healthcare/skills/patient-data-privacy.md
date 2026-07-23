---
name: healthcare-patient-data-privacy
description: Protéger les données de santé : consentement, minimisation, chiffrement, cloisonnement d'accès.
scope: technology
status: extracted
---

# Confidentialité des données patient

Protéger les données de santé : consentement, minimisation, chiffrement, cloisonnement d'accès.

## À appliquer

- Recueillir et tracer le consentement AVANT tout traitement de données de santé.
- Minimiser : ne collecter et n'exposer que les données strictement nécessaires à l'acte.
- Chiffrer au repos et en transit ; cloisonner l'accès au dossier par rôle ET par relation de soin.
- Ne jamais journaliser en clair une donnée de santé ou un identifiant patient ; masquer/tokeniser.

## Preuve attendue (§OStack)

Tests de permission au niveau de l'objet (un soignant sans relation de soin est refusé), analyse de secrets sur les logs, vérification que le consentement conditionne le traitement.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
