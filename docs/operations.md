# Exploitation, déploiement et rollback

## Foundation locale

1. Installer avec une version Node.js supportée et un lockfile vérifié.
2. Compiler puis exécuter les tests.
3. Démarrer API et interface uniquement sur loopback.
4. Vérifier `/api/health` avant exposition à un proxy.

## Déploiement cible

La version alpha ne doit pas être exposée à Internet. La cible production exigera image non-root, système de fichiers en lecture seule, secrets externes, TLS au proxy, authentification, PostgreSQL sauvegardé, journal d’audit immuable, télémétrie et limites de ressources.

## Rollback

Conserver l’artefact N-1 et sa configuration, arrêter les nouveaux runs, laisser finir ou annuler proprement les runs en cours, restaurer l’application N-1 puis vérifier santé et lecture des données. Toute migration de données devra fournir un `down` testé ou une stratégie forward-only avec restauration vérifiée. Les événements d’audit ne sont jamais supprimés pendant un rollback.
