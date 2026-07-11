# Contribuer à OStack

Les contributions commencent par un problème reproductible ou une proposition de décision. Une pull request reste ciblée et inclut tests, documentation, impact sécurité et compatibilité.

Avant soumission :

```bash
npm install
npm run check
npm test
```

Ne committez aucun secret, donnée client, fichier `.env` ou sortie de modèle contenant des données sensibles. Les changements de contrats publics exigent une note de migration. Les actions de production ne font jamais partie d’un test automatisé.
