# OStack comme framework installable

OStack est un **framework léger posé dans un projet** — commandes, agents, skill de méthode,
standards, workflows et politiques — consommé par Claude Code, Codex, Cursor ou un terminal. Ce
n'est pas une application qu'on lance de l'extérieur.

## Deux couches, un contrat

1. **Définitions installées dans le projet** (légères, en markdown/JSON) — l'interface que
   l'assistant lit : slash commands `/ostack:*`, définitions d'agents, skill `ostack-method`,
   standards, workflows, politiques.
2. **Moteurs déterministes derrière la commande `ostack`** — la partie *vérifiable* : Evidence
   Pack, graphe de traçabilité, moteur de règles métier, performance, architecture. C'est ce qui
   fait qu'OStack repose sur des preuves, pas sur des prompts.

Chaque définition de commande installée dit à l'assistant quel verbe `ostack` appeler et comment
interpréter la preuve produite. Léger dans le projet, vérifiable derrière.

## Installation

```bash
ostack init "<nom>"                 # initialise .ostack/ dans le projet
ostack install --assistant <claude|cursor|codex> [--force]
```

Ce qui est déposé (cible `claude`) :

```text
.claude/commands/ostack/*.md   13 commandes (intent-compile, prove, verify, challenge, graph,
                               observe, feature, domain-create, domain-check, root-cause,
                               decision, architecture-check, performance)
.claude/agents/*.md            9 agents du MVP (supervisor, requirements-engineer,
                               solution-architect, software-engineer, test-engineer,
                               security-engineer, adversarial-reviewer, evidence-verifier,
                               release-arbiter)
.claude/skills/ostack/         skill ostack-method (la boucle et les règles non négociables)
.ostack/standards/*.json       profils technologiques
.ostack/workflows/*.json       workflows déclaratifs
.ostack/policies/*.json        sécurité 4 niveaux + frontières d'architecture
CLAUDE.md                      préambule OStack (ajouté une seule fois, idempotent)
```

`cursor` installe sous `.cursor/rules/` et complète `.cursorrules` ; `codex` installe sous
`.ostack/` et complète `AGENTS.md`. La réinstallation est idempotente (fichiers existants
préservés sauf `--force` ; préambule jamais dupliqué). Un `AGENTS.md`/`CLAUDE.md` existant est
conservé, le préambule est simplement ajouté.

## Source de vérité

Les définitions vivent dans `framework/` (`commands/`, `agents/`, `skills/`, `manifest.json`) et
sont générées de façon reproductible par `framework/generate.mjs`. Le manifeste déclare, par
assistant, où chaque groupe de fichiers est déposé. Ajouter une commande = ajouter une entrée dans
le générateur ; elle sera installée partout au prochain `ostack install`.

## Utilisation depuis l'assistant

Une fois installé, dans Claude Code : `/ostack:intent-compile`, `/ostack:prove`, `/ostack:challenge`…
apparaissent comme slash commands, et les 9 agents comme subagents. Dans Codex/Cursor, l'assistant
lit `AGENTS.md`/`.cursorrules` et les définitions `.ostack/` ou `.cursor/`. Dans tous les cas, la
méthode reste la même : rien n'est « terminé » sans une preuve exécutée par `ostack`.
