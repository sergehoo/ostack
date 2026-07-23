---
name: healthcare-safe-status-transitions
description: Empêcher les transitions cliniques invalides — la sortie exige un diagnostic renseigné.
scope: technology
status: extracted
---

# Transitions d'état sûres (ex. sortie patient)

Empêcher les transitions cliniques invalides — la sortie exige un diagnostic renseigné.

## À appliquer

- Modéliser les statuts et n'autoriser que les transitions valides (machine à états).
- Bloquer la sortie tant qu'un diagnostic n'est pas renseigné (règle métier vérifiée, pas seulement l'UI).
- Rendre les transitions idempotentes ; aucune double sortie.

## Preuve attendue (§OStack)

Test fonctionnel : sortie refusée sans diagnostic ; test de la matrice rôle × action × état. OStack ne prend AUCUNE décision médicale.

OStack produit et vérifie du logiciel ; il ne fournit aucun conseil réglementé. Toute règle métier ou obligation réglementaire doit être sourcée et validée par un expert (voir le Domain Pack du secteur).
