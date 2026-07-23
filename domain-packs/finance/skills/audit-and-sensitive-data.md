---
name: finance-audit-and-sensitive-data
description: Journaliser les actions financières de façon inviolable et protéger les données personnelles et financières sensibles.
scope: technology
status: extracted
---

# Auditabilité et protection des données sensibles

En finance, l'audit trail et la protection des données ne sont pas optionnels : ils sont la
condition de la confiance et, souvent, de la conformité (à faire sourcer par juridiction).

## À appliquer

- Journaliser qui, quoi, quand, depuis où, pour chaque action sur ordres, comptes et paiements —
  journal append-only, horodaté, attribuable.
- Ne jamais journaliser en clair : identifiants bancaires, numéros de compte complets, secrets,
  tokens, données personnelles. Masquer/tokeniser.
- Chiffrer au repos et en transit ; cloisonner l'accès par rôle (RBAC/ABAC) et par objet.
- Conserver selon une durée documentée ; toute suppression est tracée, jamais silencieuse.

## Preuve attendue

Tests de permission (un rôle non autorisé est refusé au niveau de l'objet, pas seulement de l'UI),
analyse de secrets sur le dépôt (`security:secrets`), et vérification que les logs ne contiennent
aucune donnée sensible.
