# Guide d'utilisation d'OStack — Claude Code, ChatGPT, Codex, Cursor & terminal

OStack est un **framework d'ingénierie vérifiée** qui s'installe *dans* un projet et se pilote
depuis votre assistant IA (Claude Code, Codex, Cursor) ou directement en terminal. Sa promesse :
rien n'est « terminé » sans une **preuve exécutée**. Ce guide couvre l'installation par assistant
et **toutes les commandes**, avec leur rôle.

> Principe fondateur : *toute affirmation de réussite doit être adossée à une preuve exécutée via la
> commande `ostack`.* Les sorties de modèles sont des données non fiables ; les moteurs de
> vérification sont déterministes et neutres vis-à-vis du fournisseur.

---

## 1. Installer l'outil (une fois par machine)

```bash
git clone https://github.com/sergehoo/ostack.git
cd ostack && npm install && npm run build
npm link --workspace @ostack/cli     # expose la commande `ostack` sur le PATH
```

Vérifier : `ostack --help` doit lister les commandes.

## 2. Équiper un projet (une fois par projet)

```bash
cd ~/mon-projet
ostack init "Mon projet"                    # crée .ostack/ dans CE projet
ostack install --assistant <claude|cursor|codex>
ostack doctor
```

`ostack install` dépose le framework **dans le projet**, au format de l'assistant :

| Assistant | Ce qui est déposé | Fichier d'instructions |
|---|---|---|
| **Claude Code** (`--assistant claude`) | `.claude/commands/ostack/*.md` (slash commands `/ostack:*`), `.claude/agents/*.md` (9 subagents), `.claude/skills/ostack/` | `CLAUDE.md` |
| **Cursor** (`--assistant cursor`) | `.cursor/rules/ostack/…` | `.cursorrules` |
| **Codex / ChatGPT / générique** (`--assistant codex`) | `.ostack/commands/`, `.ostack/agents/`, `.ostack/skills/` | `AGENTS.md` |

Dans tous les cas, `.ostack/standards`, `.ostack/workflows`, `.ostack/policies`, `.ostack/schemas`
et `.ostack/examples` sont aussi installés.

## 3. Utiliser selon l'assistant

### Claude Code
Après `ostack install --assistant claude`, **relancez** Claude Code dans le projet (les commandes
sont scannées au démarrage). Tapez `/` : `/ostack:intent-compile`, `/ostack:prove`,
`/ostack:challenge`… apparaissent. Les 9 agents sont invocables comme subagents `ostack-*`
(ex. `ostack-supervisor`). Le préambule de méthode est dans `CLAUDE.md`.

### Codex / ChatGPT
Ces assistants lisent `AGENTS.md` et les définitions sous `.ostack/`. Demandez à l'assistant
d'appliquer la méthode OStack ; il exécute les commandes `ostack <verbe>` en terminal et interprète
la preuve produite. (Il n'y a pas de slash-commands natifs : le contrat passe par `AGENTS.md` +
l'exécution CLI.)

### Cursor
Après `ostack install --assistant cursor`, Cursor lit `.cursorrules` et `.cursor/rules/ostack/`.
Mêmes commandes `ostack` en terminal intégré.

### Terminal (tout assistant, ou sans assistant)
Toutes les commandes fonctionnent directement : `ostack <verbe> [options] [--json]`. `--json` rend
une sortie exploitable par un script ou un agent.

> **Point clé** — Quand aucun fournisseur IA n'est configuré, **c'est l'assistant qui est le
> modèle** : pour `intent-compile`, il rédige lui-même le brouillon puis lance
> `ostack intent-compile --from <draft.json>` (compilation déterministe, sans appel externe).

---

## 4. Les commandes et leur rôle

Chaque commande accepte `--json`. Le « niveau » est le niveau de sécurité maximal par défaut
(4 = production, approbation humaine obligatoire).

### Cycle de vie du projet

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack init [nom]` | Initialise `.ostack/config.json` dans le projet courant | 2 |
| `ostack doctor` | Diagnostique l'installation, la config et valide les schémas | 1 |
| `ostack install --assistant <c>` | Dépose le framework dans le projet (Claude/Cursor/Codex) | 2 |
| `ostack discover` | Comprend le code, la documentation et le métier du projet | 1 |
| `ostack update [--check\|--rollback\|--channel <c>]` | Met à jour le framework (point de restauration, fast-forward, rollback sur échec) | 3 |

### Développement orchestré

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack list` · `ostack inspect <commande>` | Découvre et inspecte les commandes déclaratives installées | 1 |
| `ostack run <commande> [--input …] [--dry-run]` | Exécute une commande déclarative via le fournisseur commun | 3 |
| `ostack run-all --input … [--execute] [--domain …]` | Applique tous les skills projet en un cycle ; dry-run sûr par défaut, packs métier explicites | 3 |
| `ostack feature <besoin> [--provider …] [--intent <f>]` | Workflow vérifié complet : intention → spéc → conception → barrière humaine → implémentation → délibération → tests → docs → squelette de preuve | 3 |
| `ostack bug <symptôme>` | Reproduit, diagnostique, corrige et prévient la régression | 2 |
| `ostack change <plan.json> [--confirm <hash> --reason <r>]` | Prévisualise puis applique un plan de changement contrôlé (rollback sur échec qualité) | 3 |
| `ostack architecture check [--gate]` | Vérifie les frontières d'architecture contre le graphe d'imports réel | 1 |
| `ostack audit` · `ostack design` · `ostack qa` · `ostack document` · `ostack release` | Verbes de cycle de vie (workflows dédiés) | 1-3 |

### Chaîne de preuve (Proof-Carrying Software)

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack intent-compile <besoin> \| --from <draft.json>` | Compile une demande en invariants, propriétés Gherkin (dont adversariales), contrôles et preuves attendues | 2 |
| `ostack prove <evidence-input.json>` | Assemble et scelle l'Evidence Pack (persisté, audité) | 2 |
| `ostack verify <evidence-input.json> [--gate]` | Rend un verdict de release fondé uniquement sur les preuves ; `--gate` bloque en CI | 1 |
| `ostack confidence <evidence-input.json>` | Affiche le score de confiance multidimensionnel avec ses preuves | 1 |
| `ostack challenge <proposition> \| --from <f>` | Soumet une proposition aux agents critique et adversarial | 2 |
| `ostack graph [rebuild\|why\|impact\|coverage\|unverified\|nodes]` | Reconstruit et interroge le graphe de traçabilité (besoin↔fichier↔preuve) | 2 |
| `ostack drift [--gate]` | Compare le jumeau numérique au projet observé (dérive fonctionnelle/permissions/doc/archi) | 1 |
| `ostack observe [--gate]` | Sonde l'application en fonctionnement et produit des preuves (loopback par défaut) | 1 |

### Qualité, sécurité, performance

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack benchmark [suite.json]` | Exécute la suite de benchmark (N répétitions, score = stabilité) | 2 |
| `ostack performance <baseline\|compare> [--gate] [--samples N]` | Baseline p50/p95 puis détection de régression bloquante | 2 |
| `ostack root-cause <open\|check\|close> …` | Analyse de cause racine structurée sur le journal d'audit (statut `diagnosed` mérité) | 1 |

### Cyberdéfense (strictement défensive — Blue/Purple Team)

Voir aussi le [guide de cyberdéfense](cyber-defense.md) pour les limites non négociables.

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack security review` | Audit local passif : exécute les scanners réellement présents (semgrep, gitleaks, trivy), audit des dépendances et scan de secrets → Evidence Pack. Outil absent ⇒ `not_run`, jamais `passed` | 1 |
| `ostack security dependencies` | Audit des dépendances (`npm audit` si présent) | 1 |
| `ostack security threat-model <système>` | Squelette de modèle de menaces STRIDE (actifs, frontières, menaces, contrôles) | 1 |
| `ostack security catalog [critical\|high]` | Catalogue défensif des risques web (détection + contrôles + test de non-régression) | 1 |
| `ostack security permissions <matrice.json>` | Évalue une matrice Rôle × Ressource × État ; violation = constat, cellule non testée = lacune | 1 |
| `ostack security containers` | Lint des Dockerfiles / IaC (hadolint, `trivy config`) si présents | 1 |
| `ostack security evidence <f.json>` · `ostack security retest <f.json>` | Assemble / réassemble un Security Evidence Pack (constat sans preuve rejeté ; haut/critique ⇒ `BLOCKED`) | 1 |
| `ostack security-lab <validate-authorization\|check> …` | Gate d'autorisation d'un test **actif** : manifeste borné (cibles, catégories, fenêtre, limites) ; hors périmètre ⇒ refusé | 1 |
| `ostack incident <intitulé>` | Réponse à incident : détecter, contenir, éradiquer, restaurer, capitaliser — chaque étape adossée à une preuve, actions irréversibles ⇒ approbation humaine | 2 |

### Intelligence métier (Universal Domain)

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack domain create --name <id> [--sources <dir>]` | Crée un Domain Pack métier avec inventaire des sources | 2 |
| `ostack domain score <pack.json>` | Score de compréhension métier calculé + niveau de maturité (0-4) | 1 |
| `ostack domain validate <pack.json> --rule <id> --expert <n> --reason <r>` | Confirmation experte d'une règle sourcée (auditée) | 2 |
| `ostack domain check <pack.json> --action <a> --context <ctx.json>` | Évalue les règles métier sur un contexte réel (garde de juridiction) | 1 |
| `ostack domain scenarios <pack.json>` | Génère les scénarios de tests depuis les règles | 1 |
| `ostack domain cross <pack1> <pack2> …` | Analyse interdomaines (concepts partagés, règles en chevauchement) | 1 |

### Modèles, apprentissage, évolution

| Commande | Rôle | Niv. |
|---|---|---:|
| `ostack mesh [routes\|stats\|record\|settle …]` | Routage des modèles au coût par résultat vérifié ; enregistre/règle les résultats réels | 1-2 |
| `ostack learn <observe\|recall\|record>` | Enrichit la base de connaissance (faits sourcés, cross-projets, jamais inventés) | 2 |
| `ostack evolve <collect\|status\|classify\|promote\|propose\|apply\|evaluate\|pr\|merge>` | Autonomous Evolution Engine : ledger, promotion, plan Git, exécution locale, auto-merge gardé | 2-3 |
| `ostack sync <status\|pull\|push\|verify>` | Synchronise le dépôt de connaissances (pull fast-forward-only, push gardé) | 2 |

---

## 5. Parcours type (Claude Code, cas pilote)

```bash
# Dans le projet équipé, via l'assistant ou le terminal :
/ostack:intent-compile permettre au client de réserver un créneau sans double-booking
#   → l'assistant rédige le brouillon puis: ostack intent-compile --from … (invariants + preuves attendues)

ostack feature "réservation sans double-booking" --provider ollama
#   → workflow vérifié, s'arrête à chaque barrière humaine (donne la commande de reprise)

ostack prove evidence-input.json          # scelle l'Evidence Pack (rien de faux : zéros honnêtes)
ostack verify evidence-input.json --gate  # verdict de release
ostack graph rebuild && ostack graph unverified   # traçabilité : quels invariants restent sans preuve ?
ostack learn observe --global             # la connaissance s'enrichit du projet
```

## 6. Boucle d'auto-évolution (résumé)

```
tâche → artefacts → ostack evolve collect → ostack evolve evaluate → ostack evolve promote
      → ostack evolve propose → ostack evolve apply [--push] → ostack evolve pr → ostack evolve merge
```

Garde-fous non négociables : jamais de `git push --force`, jamais de push direct sur `main`,
auto-merge réservé au **risque faible** avec tous les contrôles verts, jamais sur le noyau ou la
sécurité, et **l'auto-évolution ne peut pas modifier ses propres garde-fous**. GitHub (protections
de branche + checks obligatoires) reste la barrière finale.

## 7. Règles à retenir

1. Aucun résultat sans preuve exécutée.
2. Toute connaissance a une source ; aucune règle métier inventée.
3. Toute incertitude est affichée ; aucun secret n'entre dans Git ni les logs.
4. Les actions critiques (niveau 4) exigent une approbation humaine explicite.
5. `--json` partout pour l'automatisation. `ostack doctor` en cas de doute.

---

Références : [commandes détaillées](commands.md) · [preuve logicielle](evidence.md) ·
[chaîne vérifiée](verified-engineering.md) · [intelligence métier](universal-domain.md) ·
[apprentissage](learning.md) · [évolution autonome](evolution.md) · [framework installable](framework.md).
