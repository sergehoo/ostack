---
name: elearning-certificate-eligibility-determinism
description: Le certificat n'est délivré que sur des critères de réussite déterministes et vérifiables.
scope: technology
status: extracted
---

# Éligibilité au certificat déterministe

Le certificat n'est délivré que sur des critères de réussite déterministes et vérifiables.

## À appliquer

- Critères d'éligibilité explicites et versionnés ; recalcul donne le même verdict.
- Délivrance idempotente ; un même parcours réussi ne génère pas deux certificats.
- Traçabilité : le certificat référence les preuves de réussite.

## Preuve attendue (§OStack)

Test de reproductibilité de l'éligibilité ; test d'idempotence de délivrance.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
