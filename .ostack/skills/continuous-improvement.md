---
name: ostack-continuous-improvement
description: Méthode d'amélioration continue vérifiée d'OStack — boucle Kaizen où chaque amélioration est mesurée, prouvée, et promue seulement si elle apporte un gain démontré. À suivre régulièrement sur un projet équipé.
---

# Amélioration continue vérifiée (Kaizen OStack)

OStack ne s'améliore pas « parce que ça semble mieux » : chaque évolution doit **démontrer** un
gain ou corriger un défaut prouvé, sans régression (§22). Cette méthode boucle sur les primitives
existantes ; elle ne remplace aucun garde-fou.

## Le cycle (à répéter à chaque itération)

1. **Mesurer** — `ostack improve` agrège les faits réels du projet : problèmes récurrents (défis
   bloquants, risques résiduels), patterns prouvés (ce qui a marché), candidats ouverts. En
   parallèle, `ostack learn observe --global` enrichit la base de connaissance.
2. **Prioriser** — prendre l'élément de plus fort levier du backlog rendu par `ostack improve`
   (le problème récurrent le plus fréquent non encore traité). Un seul à la fois.
3. **Rappeler** — avant de proposer une solution, `ostack learn recall "<sujet>" --global` et
   `ostack decision search "<sujet>"` : ne pas réinventer ce qui est déjà connu.
4. **Agir** — implémenter le changement minimal ; le contester (`ostack challenge`) ; établir une
   baseline de performance si pertinent (`ostack performance baseline`).
5. **Prouver** — `ostack prove` puis `ostack verify --gate` ; `ostack performance compare --gate`,
   `ostack architecture check --gate`. Rien n'est « fait » sans preuve exécutée.
6. **Évaluer** — `ostack evolve evaluate --baseline … --candidate …` : promouvoir uniquement si
   amélioration mesurée du taux de réussite vérifié OU correctif d'un défaut prouvé, **zéro
   régression**.
7. **Capitaliser** — `ostack evolve collect` puis `ostack evolve promote` matérialise la
   connaissance validée en fichier versionné ; l'évolution part en branche + PR (jamais d'auto-merge
   hors faible risque, jamais sur les garde-fous).

## Cadence

- **À chaque tâche vérifiée** : `ostack improve` en clôture, pour alimenter le backlog.
- **À chaque session** : les hooks posés par `ostack install` font déjà `learn observe` (fin) et
  `update --auto` (début) — l'amélioration et la propagation sont continues sans intervention.
- **Périodiquement** : passer en revue `ostack evolve status` (candidats à promouvoir) et
  `ostack drift` (dérive du jumeau vs réalité).

## Non négociables

- Ne jamais promouvoir une amélioration sur sa seule pertinence — exiger une mesure ou un défaut
  prouvé (§22).
- Aucune régression tolérée ; toute régression rejette l'évolution.
- Toute connaissance capitalisée a une source ; les règles réglementaires restent à valider par un
  expert. Les garde-fous d'auto-évolution ne se modifient pas eux-mêmes (§32).
