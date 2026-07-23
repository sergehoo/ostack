---
name: finance-backtesting-reproducibility
description: Rendre un backtest de stratégie reproductible et honnête — pas de look-ahead, pas de survivorship bias.
scope: technology
status: extracted
---

# Reproductibilité et honnêteté d'un backtest

Un backtest sert à MESURER, pas à convaincre. Un backtest non reproductible ou biaisé produit une
confiance injustifiée — exactement ce qu'OStack interdit.

## À appliquer

- Aucune donnée future accessible au moment T (pas de look-ahead) ; horodatage strict des données.
- Corriger le biais du survivant (inclure les instruments disparus) et les coûts de transaction.
- Fixer la graine et versionner les données : rejouer donne le même résultat.
- Séparer conception et évaluation ; mesurer sur des données hors échantillon.

## Cadre non négociable

Un backtest N'EST PAS un conseil d'investissement et ne garantit aucun résultat futur. OStack
produit et vérifie du logiciel ; il ne recommande aucune position. Toute décision d'investissement
relève d'un professionnel agréé et du client.

## Preuve attendue

Rejouabilité (graine + données versionnées), test anti look-ahead, mesure des coûts inclus.
