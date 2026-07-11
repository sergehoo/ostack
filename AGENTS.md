# Instructions aux agents OStack

- Lire `README.md`, `docs/architecture/README.md` et `.ostack/config.json` lorsqu’il existe avant toute mutation.
- Respecter les quatre niveaux définis dans `policies/security.json` ; aucune action de production sans approbation humaine explicite.
- Ne jamais journaliser de secret, token, donnée personnelle ou contenu de `.env`.
- Préserver les frontières entre `core`, adaptateurs, interfaces et plugins.
- Toute fonctionnalité comprend tests, documentation, sécurité, déploiement et rollback proportionnés au risque.
- Déclarer clairement hypothèses, preuves, risques résiduels et éléments non vérifiés.
- Ne jamais écrire directement dans le projet depuis une sortie de modèle : produire un plan conforme à `schemas/change-plan.schema.json`, afficher son diff, puis exiger la confirmation liée à son empreinte.
