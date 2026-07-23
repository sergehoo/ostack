---
name: finance-monetary-precision
description: Manipuler correctement les montants monétaires et les quantités d'instruments — jamais de float binaire pour l'argent.
scope: technology
status: extracted
---

# Précision monétaire et des quantités

Les montants et prix ne doivent JAMAIS être stockés ni calculés en flottant binaire (`float`/`double`) :
0,1 + 0,2 ≠ 0,3 en IEEE-754, et une erreur d'un centième sur des millions d'opérations est un
incident comptable.

## À appliquer

- Utiliser un type décimal exact (entiers en plus petite unité — centimes, ou `Decimal`/`BigDecimal`)
  pour montants, prix et frais.
- Définir explicitement l'échelle (nombre de décimales) par devise et par instrument.
- Arrondir selon une règle documentée (半, banker's rounding…) au dernier moment, jamais en cours de calcul.
- Toute conversion de devise conserve le taux, la date et la source du taux.

## Preuve attendue (§OStack)

Tests fondés sur les propriétés vérifiant qu'une suite d'opérations conserve la somme exacte ;
tests de non-régression sur l'arrondi. Aucune valorisation « vérifiée » sans ces tests exécutés.
