# Parcours complet OStack — de la création à la mise en production

Ce playbook regroupe **toutes les commandes et instructions**, phase par phase, pour mener un
projet du besoin initial jusqu'à la production : cadrage, architecture, fonctionnalités, tests,
sécurité, performance, preuve, livraison, exploitation, amélioration continue — avec les jalons et
la roadmap.

> **Règle d'usage** — commande **et** instruction vont ensemble, sur la même ligne :
> `ostack <verbe> "<instruction>"` ou `ostack <verbe> <fichier>`. Jamais séparément.
> Ajoutez `--json` pour une sortie exploitable. Les moteurs de vérification sont déterministes ;
> rien n'est « terminé » sans preuve exécutée.

---

## Vue d'ensemble — le cycle

```
Créer → Cadrer → Compiler l'intention → Concevoir l'architecture → Implémenter (vérifié)
   → Tester / Sécuriser / Mesurer → Prouver → Décider la release → Mettre en production
   → Exploiter / Observer → Améliorer en continu → Évoluer (Git-native)
```

Chaque étape produit des **preuves** et s'arrête aux **barrières humaines** pour les actions
sensibles (niveaux de sécurité 3-4).

---

## Phase 0 — Mise en place (une fois)

| But | Commande |
|---|---|
| Rendre `ostack` disponible | (dans le dépôt OStack) `npm install && npm run build && npm link --workspace @ostack/cli` |
| Initialiser le projet | `ostack init "Mon projet"` |
| Installer le framework dans le projet | `ostack install --assistant claude` (ou `cursor` / `codex`) |
| Vérifier l'installation | `ostack doctor` |
| Comprendre le code et le métier existants | `ostack discover --save` |

Les hooks posés par `install` rendent l'apprentissage (`learn observe`) et la propagation des mises
à jour (`update --auto`) automatiques à chaque session.

---

## Phase 1 — Cadrage & besoin

| But | Commande / instruction |
|---|---|
| Cartographier le projet et le métier | `ostack discover` |
| Compiler un besoin en invariants + preuves attendues | `ostack intent-compile "permettre au client de réserver un créneau sans double-booking"` |
| (Déterministe) compiler un brouillon rédigé | `ostack intent-compile --from .ostack/tmp/intent-draft.json` |
| Voir les commandes/skills disponibles | `ostack list` · `ostack inspect intent-compile` |

**Produit** : invariants (prohibition/permission/obligation/consistency), propriétés Gherkin dont
adversariales, contrôles requis, **critères d'acceptation** réutilisés par la suite.

---

## Phase 2 — Architecture & conception

| But | Commande / instruction |
|---|---|
| Déclarer / réviser l'architecture | `ostack architecture "concevoir la frontière du module réservation"` |
| Vérifier les frontières contre le graphe d'imports réel | `ostack architecture check --gate` |
| Concevoir l'expérience / l'UI | `ostack design "parcours de réservation en 3 étapes"` |
| Analyse d'impact avant modification | `ostack graph impact <fichier-ou-noeud>` |

**Barrière** : la conception est validée par un humain dans le workflow `feature` (niveau 3).

---

## Phase 3 — Implémentation vérifiée (par fonctionnalité)

Le cœur : `ostack feature` orchestre intention → spéc → conception → **barrière humaine** →
implémentation → délibération contradictoire → tests → docs → squelette de preuve.

```bash
# 1) démarrer (s'arrête à la 1re barrière et donne la commande de reprise)
ostack feature "réservation sans double-booking" --provider ollama --intent .ostack/intents/…json

# 2) reprendre après avoir examiné la conception
ostack feature --resume <run-id> --approve <gate-id> --reason "Conception examinée" --provider ollama

# 3) reprendre après avoir examiné la livraison
ostack feature --resume <run-id> --approve <gate-id> --reason "Livraison examinée" --provider ollama
```

Appliquer un changement de code **contrôlé** (aperçu → confirmation liée à l'empreinte → rollback
sur échec qualité) :

```bash
ostack change plan.json                                              # aperçu (aucune mutation)
ostack change plan.json --confirm <empreinte> --reason "Diff et qualité vérifiés"
```

Corriger un défaut avec diagnostic structuré :

```bash
ostack bug "l'inscription échoue avec une erreur 500"
ostack root-cause open --incident INC-12 --symptom "inscription échoue"
ostack root-cause check --incident INC-12                            # que manque-t-il pour 'diagnosed' ?
ostack root-cause close --incident INC-12
```

Contester une proposition avant de la retenir :

```bash
ostack challenge --from proposition.md                               # agents critique + adversarial
```

---

## Phase 4 — Tests, sécurité, performance (les barrières qualité)

### Tests & traçabilité
```bash
ostack graph rebuild                        # traçabilité besoin ↔ fichier ↔ preuve
ostack graph unverified                     # quels invariants/permissions n'ont AUCUNE preuve ?
ostack graph coverage invariant:<id>        # quelles preuves couvrent cette règle ?
ostack drift --gate                         # dérive du jumeau numérique vs projet observé
```

### Sécurité
```bash
ostack security "revue des permissions et des surfaces exposées"
# Tests actifs UNIQUEMENT sur cible autorisée :
ostack security-lab validate-authorization authorization.json
ostack security-lab check authorization.json --target app-staging.internal --category input_validation
```
Non négociable : zéro faille critique/haute ; aucun test actif sans manifeste d'autorisation valide.

### Performance
```bash
ostack observe --gate                       # sonde l'application en fonctionnement (preuves runtime)
ostack performance baseline --samples 10    # p50/p95 de référence
ostack performance compare --gate           # bloque sur régression p95
ostack benchmark                            # stabilité sur N répétitions (le score = reproductibilité)
```

---

## Phase 5 — Preuve & décision de release

```bash
ostack prove evidence-input.json            # assemble et scelle l'Evidence Pack (audité)
ostack confidence evidence-input.json       # score de confiance multidimensionnel + preuves
ostack verify evidence-input.json --gate    # verdict : APPROVE / APPROVE_WITH_OBSERVATIONS / BLOCK / REJECT
```

**Definition of Done** (portes exécutables) : lint, typecheck, build, tests unit/intégration/
fonctionnels/e2e/permissions verts ; 0 faille critique/haute ; menaces à jour ; performance dans le
budget ; documentation à jour sans dérive ; rollback défini ; Evidence Pack généré ; **approbation
humaine** (dernière porte, jamais franchie par la machine).

---

## Phase 6 — Mise en production & exploitation

| But | Commande / instruction |
|---|---|
| Préparer une livraison contrôlée | `ostack release "release v1.0.0 avec migration et rollback"` |
| Auto-preuve de release (agrégat exécuté) | `npm run self-prove` → doit rendre `VERIFIED` |
| Vérifier le comportement réel en prod/staging | `ostack observe --gate` (hôtes hors loopback = allowlist projet) |
| Diagnostiquer un incident (mode forensic) | `ostack root-cause open --incident … --symptom "…"` |

Production = niveau 4 : **approbation humaine explicite obligatoire**, rollback testé, aucune action
critique automatique.

---

## Phase 7 — Amélioration continue

```bash
ostack improve                              # 1 cycle : backlog priorisé + patterns prouvés + prochaine étape
ostack learn recall "rollback" --global     # rappeler les faits accumulés avant de proposer
ostack decision search "N+1 orm"            # mémoire des décisions passées
ostack learn observe --global               # enrichir la base (automatique via hook de session)
```

Méthode : **mesurer → prioriser → agir → prouver → évaluer → promouvoir si gain mesuré** (jamais sur
la seule pertinence, zéro régression).

---

## Phase 8 — Évolution Git-native (capitaliser durablement)

```bash
ostack evolve collect                       # dérive des candidats des artefacts réels
ostack evolve evaluate --baseline b.json --candidate c.json   # promote seulement si gain prouvé (§22)
ostack evolve promote --event <id>          # matérialise la connaissance validée en fichier versionné
ostack evolve propose proposal.json         # plan Git (branche, commit, PR, décision de risque)
ostack evolve apply proposal.json --push    # commit local réel + push gardé
ostack evolve pr --branch <b> --title … --body-file …         # ouvre la PR
ostack evolve merge --pr <url> --branch <b> --paths … --confidence 0.94   # auto-merge faible risque
ostack sync pull                            # dépôt de connaissances partagé (fast-forward only)
ostack update --check                       # mise à jour du framework disponible ?
```

Garde-fous inviolables : pas de `--force`, pas de push direct sur `main`, auto-merge réservé au
faible risque, jamais sur le noyau/sécurité, l'auto-évolution ne modifie pas ses propres garde-fous.

---

## Métier (transversal) — Domain Packs

Pour un projet sectoriel (finance, santé, e-learning, immobilier, logistique, commerce…) :

```bash
ostack domain create --name mon-secteur --sources ./documents      # crée le pack (niveau 0)
ostack domain score domain-packs/mon-secteur/domain-pack.json      # maturité 0-4 (calculée)
ostack domain validate <pack> --rule <id> --expert <nom> --reason "<source + juridiction>"
ostack domain check <pack> --action <a> --context ctx.json         # évalue les règles métier
ostack domain scenarios <pack>                                     # scénarios de tests générés
ostack domain agents <pack> --out .claude/agents                   # 10 experts métier instanciés
```
Non négociable : aucune règle inventée (statut `pending_validation`), réglementaire à sourcer par un
expert ; une règle non confirmée escalade vers un humain.

---

## Modèles IA (transversal) — Adaptive Model Mesh

```bash
ostack mesh routes                          # quel modèle pour quel type de tâche
ostack mesh stats                           # métriques par candidat (coût par résultat vérifié)
ostack mesh settle <runId>                  # convertit le ledger de coûts réels en stats après verdict
```

---

## Jalons & Definition of Done (roadmap projet)

| Jalon | Sortie exigée | Portes OStack |
|---|---|---|
| **M0 — Cadrage** | intention compilée, invariants, critères d'acceptation | `intent-compile`, `graph rebuild` |
| **M1 — Conception** | architecture, frontières, impact | `architecture check --gate`, `graph impact` |
| **M2 — Implémentation** | code + tests, délibération passée | `feature`, `challenge`, `change` |
| **M3 — Vérification** | Evidence Pack VERIFIED, 0 faille critique/haute, perf dans le budget | `prove`, `verify --gate`, `performance compare --gate`, `security-lab` |
| **M4 — Release** | recommandation APPROVE, rollback testé, **approbation humaine** | `verify --gate`, `self-prove`, `release` |
| **M5 — Exploitation** | comportement observé conforme, incidents diagnostiqués | `observe --gate`, `root-cause` |
| **M6 — Amélioration** | gains mesurés, connaissances capitalisées | `improve`, `evolve evaluate/promote` |

**Critère de passage universel** (chaque jalon) : menaces à jour, tests + rollback vérifiés,
documentation à jour, budget de performance respecté, aucune vulnérabilité critique ouverte,
Evidence Pack généré.

---

## Aide-mémoire — quelle commande pour quel objectif

| Objectif | Commande |
|---|---|
| Démarrer un projet | `ostack init` + `ostack install` + `ostack doctor` |
| Comprendre l'existant | `ostack discover` |
| Cadrer un besoin | `ostack intent-compile "<besoin>"` |
| Développer une feature | `ostack feature "<besoin>" --provider <p>` |
| Corriger un bug | `ostack bug "<symptôme>"` + `ostack root-cause` |
| Vérifier l'architecture | `ostack architecture check --gate` |
| Prouver / décider la release | `ostack prove` + `ostack verify --gate` |
| Tracer besoin↔preuve | `ostack graph rebuild` + `ostack graph unverified` |
| Sécurité défensive | `ostack security-lab …` |
| Performance | `ostack performance compare --gate` + `ostack benchmark` |
| Métier | `ostack domain …` |
| Améliorer en continu | `ostack improve` |
| Capitaliser / évoluer | `ostack evolve …` + `ostack sync …` |
| Mettre à jour le framework | `ostack update --check` |

---

## Un exemple bout-en-bout (copiable)

```bash
# Phase 0 — mise en place
cd ~/mon-projet
ostack init "App Réservation" && ostack install --assistant claude && ostack doctor

# Phase 1 — cadrage
ostack discover --save
ostack intent-compile "réserver un créneau sans double-booking"

# Phase 2-3 — conception + implémentation vérifiée
ostack architecture check --gate
ostack feature "réservation sans double-booking" --provider ollama
#   … reprendre aux barrières avec --resume/--approve/--reason …

# Phase 4 — qualité / sécurité / perf
ostack graph rebuild && ostack graph unverified
ostack observe --gate
ostack performance baseline --samples 10 && ostack performance compare --gate

# Phase 5 — preuve & release
ostack prove evidence-input.json
ostack verify evidence-input.json --gate

# Phase 6-8 — production, amélioration, évolution
ostack observe --gate
ostack improve
ostack evolve collect && ostack evolve status
```

Voir aussi : [guide d'utilisation](guide-utilisation.md) · [commandes détaillées](commands.md) ·
[preuve logicielle](evidence.md) · [évolution autonome](evolution.md) · [intelligence métier](universal-domain.md).
