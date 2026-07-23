---
name: finance-idempotent-order-submission
description: Soumettre un ordre de façon idempotente pour ne jamais dupliquer une exécution en cas de retry réseau.
scope: technology
status: extracted
---

# Soumission d'ordre idempotente

Un double-clic, un retry HTTP ou un rejeu de message ne doit jamais produire deux ordres. Une
exécution en double est une perte financière réelle et difficilement réversible.

## À appliquer

- Générer côté client une clé d'idempotence unique par intention d'ordre ; le serveur déduplique
  sur cette clé.
- Rendre la transition d'état de l'ordre atomique (créé → routé → exécuté) ; aucune double
  transition.
- Distinguer « ordre reçu » (accusé) de « ordre exécuté » (confirmé par le marché).
- En cas d'incertitude réseau, interroger l'état avant de renvoyer — jamais renvoyer aveuglément.

## Preuve attendue

Test d'intégration rejouant la même requête avec la même clé et vérifiant qu'un seul ordre existe ;
scénario adversarial de retry concurrent. Se rapproche de l'anti-pattern « un code de sortie nul
n'est pas une preuve » : ici, un 200 sur le retry ne prouve pas l'unicité — le compte d'ordres, si.
