# Chaîne d'ingénierie vérifiée

Cette page couvre les moteurs qui relient une intention humaine à un résultat prouvé.
La couche de preuve elle-même est décrite dans [la preuve logicielle](evidence.md).

## Intent-to-Proof Compiler (`@ostack/intent`)

Transforme une demande en éléments vérifiables. Deux étapes distinctes :

1. **Rédaction** — un fournisseur IA produit un brouillon structuré (`IntentDraft`), traité comme
   donnée non fiable : JSON extrait, contrôlé, normalisé, validé par `schemas/intent-draft.schema.json`.
   Le brouillon peut aussi être écrit à la main (`--from`), rendant la chaîne 100 % déterministe.
2. **Compilation** — déterministe. Chaque invariant (`prohibition`, `permission`, `obligation`,
   `consistency`) dérive : propriétés Gherkin (dont des propriétés **adversariales** — tentative de
   contournement, acteur non autorisé), contrôles techniques requis, types de tests exigés, et
   preuves attendues. Les `acceptanceCriteria` produits sont exactement les énoncés d'invariants,
   consommables tels quels par l'Evidence Pack.

```bash
ostack intent-compile --from examples/intent-draft.json      # déterministe
ostack intent-compile "Permettre au formateur de …" --provider ollama
```

## Engineering Knowledge Graph (`@ostack/graph`)

Graphe de traçabilité typé — pas un stockage vectoriel. Nœuds : besoins, fonctionnalités,
invariants, endpoints, permissions, tests, preuves, fichiers, releases, risques. Les relations
(`implements`, `declares`, `protected_by`, `verified_by`, `touches`, …) sont validées par kind.

Le graphe est reconstruit automatiquement depuis les artefacts persistés (`.ostack/intents/`,
`.ostack/evidence/`). Un Evidence Pack se relie à son intention par **identifiant explicite**
(`intentId`), jamais par ressemblance textuelle ; un pack non vérifié ne prouve rien.

```bash
ostack graph rebuild
ostack graph why file:backend/courses/ai_generation.py   # quel besoin justifie ce fichier ?
ostack graph coverage invariant:<id>                     # quelles preuves couvrent cette règle ?
ostack graph impact file:<path>                          # qu'affecte une modification ?
ostack graph unverified                                  # quels invariants/permissions sans preuve ?
```

## Continuous Digital Twin (`@ostack/twin`)

Le jumeau est **dérivé du graphe** (jamais maintenu à la main) puis comparé au projet observé.
Dérives classées : `functional` (fichier déclaré disparu), `permissions` (permission sans preuve),
`documentary` (invariant sans couverture), `architectural` (point d'entrée observé relié à aucun
besoin — §36.13).

```bash
ostack drift            # rapport classé, jumeau persisté dans .ostack/twin.json
ostack drift --gate     # code de sortie non nul sur dérive haute
```

## Multi-Agent Deliberation (`@ostack/deliberation`)

Protocole contradictoire : constructeur → critique → adversarial → vérificateur → arbitre.
Les agents ne s'approuvent jamais mutuellement : les défis sont enregistrés et seule une preuve
non défaillante les résout. **L'arbitre est une fonction pure du dossier** : sans preuve exécutée
il rend `insufficient_evidence` (escalade humaine) ; un défi bloquant non résolu ou une preuve en
échec disqualifie ; les désaccords sont conservés dans l'Evidence Pack.

## Adaptive Model Mesh (`@ostack/mesh`)

Routage dynamique des modèles par type de tâche. La métrique principale est le
**coût par résultat vérifié** — un modèle bon marché jamais vérifié ne gagne jamais. Stratégies :
`quality_first` (taux de première réussite), `cost_per_verified_result`, `privacy_first`
(candidats locaux uniquement, aucun repli distant), `independent_consensus` (N fournisseurs
réellement distincts — deux modèles du même fournisseur ne sont pas indépendants).

Câblage dans le workflow : déclarez `mesh.candidates` et `mesh.routes` dans
`.ostack/config.json` (types de tâche = catégories d'agents — `product`, `architecture`,
`engineering`, `quality`, `security`, … — plus `intent_drafting` et `deliberation`). Chaque étape
de `ostack feature` est alors servie par le premier candidat disponible du classement, avec le
fournisseur de session en repli explicite ; le résultat expose `stepProviders` (quel candidat a
servi quelle étape). Les statistiques ne bougent que par `ostack mesh record` avec coût et latence
**réels** — aucune statistique n'est inventée par le workflow.

```bash
ostack mesh routes
ostack mesh record engineering ollama/qwen3 --verified --cost 0.03 --latency 1200
ostack mesh stats
```

## Runtime Observation (`@ostack/observe`)

`ostack observe` sonde l'application **en fonctionnement** et convertit chaque observation en
`EvidenceItem` (statut, latence mesurée) joignable à l'entrée de `ostack prove`. Les cibles sont
restreintes au loopback ; tout autre hôte doit être allowlisté dans `.ostack/config.json`
(`observe.allowedHosts`) — jamais élargi par un agent. `--gate` échoue si le comportement observé
diverge des attentes déclarées (statut ou budget de latence).

## Functional Testing Studio (`@ostack/functional`)

Deux moteurs déterministes :

- **Scénarios** — `scenariosFromIntent` transforme les propriétés Gherkin de l'intention compilée
  en descripteurs exécutables ; `evaluateScenarios` agrège les résultats en `TestSummary` et
  signale les scénarios **jamais exécutés** (une absence d'exécution n'est jamais un succès
  silencieux).
- **Matrice de permissions** — Fonctionnalité × Rôle × État × Résultat attendu (§13).
  `evaluateMatrix` détecte les violations (contournements), les cellules non testées et les
  observations hors matrice (action non revue qui a réussi). `missingCells` exige une attente
  explicite pour chaque rôle déclaré.

## Authorized Security Lab (`@ostack/security-lab`)

Barrière d'autorisation **strictement défensive** (§15) : aucune opération de sécurité active sans
manifeste conforme à `schemas/security-authorization.schema.json` — propriétaire, environnement,
cibles autorisées/interdites, catégories permises, fenêtre temporelle (≤ 30 jours), approbateurs
nommés, contact d'urgence. Règles non négociables : les cibles interdites priment toujours ; la
production n'est jamais autorisable ; hors fenêtre, tout est refusé ; chaque décision est auditée.

```bash
ostack security-lab validate-authorization examples/security-authorization.json
ostack security-lab check examples/security-authorization.json \
  --target app-staging.internal --category input_validation
```

## Workflow feature vérifié

`ostack feature` exécute désormais la chaîne vérifiée de bout en bout (workflow
`feature-delivery` v1.1.0, 12 étapes) :

1. **`intent`** — l'intention est compilée **avant qu'aucun agent ne parle**. `--intent
   <compiled.json>` injecte une intention déjà compilée ; son empreinte est recalculée et toute
   altération manuelle est rejetée. Sans `--intent`, le fournisseur rédige le brouillon
   (en mode `mock`, un brouillon minimal déterministe clairement étiqueté `mock-draft`).
2. Agents : clarification → spécification → architecture → **barrière humaine** → implémentation.
3. **`challenge`** — la proposition d'implémentation est soumise aux agents critique et
   adversarial ; les défis (et leur caractère bloquant) sont persistés dans
   `.ostack/deliberations/`. En mode mock, l'étape est marquée `skipped` — jamais approuvée en
   silence.
4. Tests → sécurité → documentation → **barrière humaine**.
5. **`evidence-scaffold`** — le run se clôt en générant `.ostack/evidence/drafts/<run>.json` :
   une entrée d'Evidence Pack **honnête par construction** (compteurs à zéro, `threatModelUpdated:
   false`, liste `$todo` des exécutions réelles à fournir), liée à l'intention par `intentId`,
   portant les critères d'acceptation et les deux approbations humaines. `ostack prove` refusera
   le statut VERIFIED tant que les exécutions réelles n'ont pas remplacé les zéros.

## Chaîne complète sur le cas pilote

```bash
ostack intent-compile --from examples/intent-draft.json   # intention → invariants + preuves attendues
ostack prove examples/evidence-input.json                 # observations → Evidence Pack scellé
ostack graph rebuild                                      # traçabilité besoin → preuve
ostack graph unverified                                   # (aucun) — tout est prouvé
ostack drift                                              # jumeau vs réalité observée
```
