# Domain Pack — Finance (marchés, trading, portefeuille, investissement)

Ce pack dote OStack du **vocabulaire, des acteurs, des processus, des règles techniques, des
indicateurs et des compétences d'ingénierie** du secteur financier. Il suit la méthode OStack :

- **Aucune règle inventée comme vérité.** Les règles naissent au statut `pending_validation` ; elles
  n'ont pas d'effet bloquant tant qu'un expert ne les a pas confirmées (`ostack domain validate`).
- **Aucune réglementation inventée.** Les obligations réglementaires (meilleure exécution,
  adéquation, LBC-FT, abus de marché…) sont listées en **questions ouvertes à sourcer** par un
  expert conformité, avec juridiction et date — jamais présentées comme acquises.
- **Pas de conseil d'investissement.** OStack produit et vérifie du logiciel. Il ne recommande
  aucune position, aucun instrument, aucune stratégie. Toute décision d'investissement relève d'un
  professionnel agréé.

## Contenu

- `domain-pack.json` — glossaire, acteurs, workflows (cycle de vie d'un ordre, onboarding),
  règles techniques, table de décision, KPIs, correspondances vers l'ontologie universelle,
  questions ouvertes réglementaires.
- `skills/` — compétences d'ingénierie *factuelles* : précision monétaire, soumission d'ordre
  idempotente, exactitude de valorisation, reproductibilité des backtests, audit et données
  sensibles.

## Utilisation

```bash
ostack domain score domain-packs/finance/domain-pack.json      # maturité (basse par conception)
ostack domain check domain-packs/finance/domain-pack.json \
  --action order.route --context contexte.json                 # évalue les règles techniques
ostack domain validate domain-packs/finance/domain-pack.json \
  --rule no-trading-without-kyc --expert <responsable_conformite> --reason "<source + juridiction>"
```

La maturité reste **basse** tant que les règles ne sont pas confirmées par un expert et que les
obligations réglementaires ne sont pas sourcées — c'est voulu : OStack ne prétend pas maîtriser la
finance sans preuves.
