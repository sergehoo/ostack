# Autonomous Git-Native Evolution Engine

OStack évolue comme un projet logiciel versionné, pas comme une mémoire opaque. Chaque
apprentissage vérifié devient une **évolution Git** : branche dédiée, commit structuré, Pull
Request, et fusion automatique **uniquement** pour les changements à faible risque respectant
toutes les politiques. L'automatisation ne peut jamais contourner ses propres garde-fous.

## Cœur déterministe (`@ostack/evolution`)

- **Evolution Ledger** (§5) — registre append-only `.ostack/evolution/ledger.jsonl`, **sans
  secret** (toute entrée est nettoyée avant écriture ; une entrée dont un secret survivrait est
  refusée).
- **Pipeline de promotion** (§8) — OBSERVED → CANDIDATE → REPRODUCED → VALIDATED → PROMOTED →
  DEPRECATED. La promotion dépend du nombre d'observations, de la diversité des projets, de la
  reproduction, de la confiance, de l'absence de contradiction. Une observation unique ne devient
  jamais une règle globale.
- **Portée** (§9) — project / organization / domain / technology / universal. Une pratique de
  projet ne peut pas devenir universelle sans revalidation ; une règle métier ne migre pas vers
  les standards techniques.
- **Classification de risque** (§15) — faible (docs, tests, skills, leçons), moyen (commande,
  workflow, agent, domain pack, installeur), élevé (noyau, policies, sécurité, hooks, dépendances),
  critique (garde-fous d'évolution, secrets, production).
- **Plan Git** (§10-11) — nom de branche `ostack/evolution/<id>`, commit Conventional Commits avec
  trailers (`OStack-Evolution-ID`, `OStack-Task-ID`, `Evidence-Pack`, `Confidence`), corps de PR.

## Garde-fous non négociables (codés et testés)

| Règle | Mécanisme |
|---|---|
| Aucun `git push --force` | `assertGitOperationAllowed` lève une erreur |
| Aucun push direct sur `main`/`develop`/`release` | idem, branches protégées |
| Auto-merge réservé au risque **faible** + tous contrôles verts | `decideMerge` |
| Jamais d'auto-merge sur le noyau ou la sécurité | risque high/critical → REQUIRE_HUMAN |
| **L'auto-évolution ne peut pas réduire ses propres garde-fous** (§32) | toute modification de `policies/evolution.json`, `packages/evolution/`, la CI d'évolution, les scripts git → critique + validation humaine |
| Aucun secret dans Git | ledger nettoyé ; `security:secrets` en CI |

## Commandes

```bash
ostack evolve status                       # ledger, autonomie, candidats
ostack evolve record <event.json>          # ajoute un événement (secrets masqués)
ostack evolve classify --paths a,b,c        # risque d'un ensemble de chemins
ostack evolve propose <proposal.json>       # plan Git déterministe + décision (AUTO_MERGE|PULL_REQUEST|REQUIRE_HUMAN)
ostack evolve apply <proposal.json> [--push]  # exécute le commit LOCAL (git réel), push gardé
```

`apply` exécute réellement la partie **locale et réversible** : crée la branche
`ostack/evolution/<id>`, stage **uniquement** les chemins explicites (jamais `git add .`, §11),
commit avec l'identité bot appliquée par-commit (§26, n'écrase pas l'identité git de l'utilisateur).
`--push` n'est autorisé qu'à l'autonomie `pull-request`+ et passe par `assertGitOperationAllowed`
(jamais force, jamais branche protégée). Sans autonomie suffisante ou hors dépôt git, `apply`
refuse proprement.

`propose` **planifie et décide** ; il n'exécute aucune opération Git réseau. Il rend la branche, le
message de commit, le titre/corps de PR, la décision de fusion et **les commandes git/gh exactes** à
exécuter — laissées à un humain ou à un runner d'autonomie supérieure, toujours sous le contrôle des
protections de branche et de la CI.

## Niveaux d'autonomie (§14)

`observe` (collecte seulement) · `local-commit` (branche + commit locaux) · **`pull-request`**
(défaut : pousse une branche + ouvre une PR) · `controlled-auto-merge` (fusionne le faible risque
si tous les contrôles passent). Configuré dans `policies/evolution.json`.

## Vérification CI

`.github/workflows/ostack-evolution.yml` rejoue sur chaque PR touchant les ressources évolutives :
build, lint, tests, `validate:evolution` (ledger sans secret + garde-fous en place) et
`security:secrets`. Les protections de branche GitHub + ces checks obligatoires garantissent que
l'automatisation ne contourne pas les validations.

## Ce qui reste à M2 (documenté, pas caché)

L'exécution réseau (push réel, création de PR via `gh`, auto-merge) est **planifiée** par le moteur
mais volontairement non câblée en exécution automatique tant que : credentials sécurisés,
identité Git bot signée, et protections de branche vérifiées ne sont pas configurés par
l'organisation. Le moteur de décision, les garde-fous et le plan sont livrés et testés ; brancher
l'exécution se fait en connectant un runner autorisé aux commandes que `propose` émet déjà.

## Synchronisation des ressources (§19-20)

Un **dépôt de connaissances dédié** (`ostack-knowledge`) porte les ressources évolutives, séparé du
dépôt moteur. Configuré dans `.ostack/config.json` :

```json
"knowledgeRepository": {
  "remote": "git@github.com:org/ostack-knowledge.git",
  "branch": "main", "localPath": ".ostack/knowledge-repository",
  "syncOnStart": true, "pushOnVerifiedLearning": true
}
```

```bash
ostack sync status   # branche, propreté, avance/retard
ostack sync pull     # fast-forward ONLY (une branche divergée n'est jamais fusionnée en silence)
ostack sync push     # exige pushOnVerifiedLearning; jamais de force push
ostack sync verify   # clone propre et à jour ?
```

`pull` est fast-forward-only et refuse un arbre non propre plutôt que d'écraser des changements
locaux. `push` ne force jamais ; la protection de la branche partagée est assurée côté GitHub
(branch protection / PR obligatoires, §16). Testé de bout en bout avec un remote bare local.
