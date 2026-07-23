---
name: finance-portfolio-valuation-correctness
description: Calculer la valorisation d'un portefeuille de façon exacte, datée et traçable jusqu'aux prix sources.
scope: technology
status: extracted
---

# Exactitude de la valorisation de portefeuille

Une valorisation est un fait daté adossé à des prix sources, pas une estimation. Elle doit être
reproductible : recalculer avec les mêmes prix donne le même résultat.

## À appliquer

- Chaque valorisation référence la date/heure et la source de prix de chaque instrument.
- Positions = somme auditable des exécutions réglées ; réconcilier avec le dépositaire.
- Séparer prix de marché (mark-to-market) et prix de revient ; ne jamais les confondre.
- Gérer explicitement les corporate actions (splits, dividendes) — sinon dérive silencieuse.

## Preuve attendue

Test de reproductibilité (mêmes prix → même valorisation au centime), réconciliation avec une
source indépendante, et détection de dérive (`ostack drift`) entre positions calculées et observées.
