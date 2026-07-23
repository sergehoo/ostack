---
name: healthcare-clinical-audit-trail
description: Journaliser tout acte clinique et tout accès au dossier, de façon horodatée et attribuable.
scope: technology
status: extracted
---

# Piste d'audit clinique inviolable

Journaliser tout acte clinique et tout accès au dossier, de façon horodatée et attribuable.

## À appliquer

- Journal append-only : qui a accédé/modifié quel dossier, quand, depuis où.
- Aucune action clinique silencieuse ; l'accès en lecture au dossier est aussi tracé.
- Horodatage fiable et attribution non répudiable ; conservation selon durée documentée.

## Preuve attendue (§OStack)

Test vérifiant qu'un accès au dossier produit une entrée d'audit ; test de non-altération de l'historique.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
