# Domain Pack — Santé — parcours patient et établissement de soins

OStack ne pose aucun diagnostic et ne prend aucune décision médicale. Il modélise le processus et aide à construire le logiciel ; toute décision clinique relève d'un professionnel de santé.

Méthode OStack : règles au statut `pending_validation` (aucun effet bloquant tant qu'un expert ne les a pas confirmées) ; obligations réglementaires en **questions ouvertes à sourcer** (jamais inventées). Maturité basse par conception jusqu'à validation experte.

```bash
ostack domain score domain-packs/healthcare/domain-pack.json
ostack domain agents domain-packs/healthcare/domain-pack.json --json   # 10 experts
```
