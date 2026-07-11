# Intégration MCP

OStack fournit un serveur MCP stdio compatible avec les clients MCP modernes.

```bash
npm run build
OSTACK_PROJECT_ROOT=/chemin/du/projet npm run mcp
```

Configurez votre IDE ou agent avec la commande `node`, l’argument absolu `packages/mcp/dist/server.js` et la variable `OSTACK_PROJECT_ROOT` ciblant le projet initialisé.

## Surface M1

- `ostack_doctor` — diagnostic du projet ;
- `ostack_discover` — inventaire local sécurisé du projet ;
- `ostack_list_runs` — historique des workflows ;
- `ostack_get_run` — détail d’un run et approbation en attente ;
- `ostack_explain_security_level` — explication d’une décision, sans pouvoir d’approbation ;
- ressources `ostack://agents` et `ostack://workflows/feature-delivery`.

La surface MCP M1 est volontairement en lecture seule. Les futures mutations passeront par le moteur de politiques, conserveront l’identité du client et exigeront une approbation hors bande aux niveaux 3 et 4.
