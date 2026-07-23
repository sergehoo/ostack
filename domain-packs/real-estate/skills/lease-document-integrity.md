---
name: real-estate-lease-document-integrity
description: Baux et états des lieux versionnés et infalsifiables, avec preuve de signature.
scope: technology
status: extracted
---

# Intégrité des documents de bail

Baux et états des lieux versionnés et infalsifiables, avec preuve de signature.

## À appliquer

- Versionner chaque document ; conserver l'historique, jamais d'écrasement silencieux.
- Empreinte de contenu (hash) pour détecter toute altération après signature.
- Lier signature, état des lieux et bail ; aucune remise des clés sans les trois.

## Preuve attendue (§OStack)

Test : remise des clés refusée sans bail signé + état des lieux ; vérification d'empreinte du document.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
