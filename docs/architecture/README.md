# Architecture OStack

## Principes directeurs

1. **Headless-first** — le noyau ne dépend ni de la CLI, ni du Web, ni d’un fournisseur IA.
2. **Ports et adaptateurs** — modèles, stockage, outils et interfaces sont remplaçables derrière des contrats stables.
3. **Sécurité par défaut** — refus par défaut, moindre privilège et approbation humaine obligatoire en production.
4. **Traçabilité** — chaque décision, appel d’outil, approbation et artefact porte un identifiant de corrélation.
5. **Configuration déclarative** — agents, workflows, politiques et packs métier sont versionnés et validés par schéma.
6. **Local-first** — la connaissance et l’audit fonctionnent localement ; les services externes sont optionnels.

## Vue conteneurs

```mermaid
flowchart LR
  U["Développeur / Équipe"] --> CLI["CLI ostack"]
  U --> WEB["Console Web"]
  IDE["Claude Code / Codex / Cursor / IDE"] --> API["API / MCP Gateway"]
  CLI --> CORE["OStack Core"]
  WEB --> API --> CORE
  CORE --> ORCH["Agent Orchestrator"]
  CORE --> WF["Workflow Engine"]
  CORE --> POL["Policy & Permission Engine"]
  CORE --> AUDIT["Audit & Event Log"]
  ORCH --> KNOW["Local Knowledge Engine"]
  ORCH --> AI["AI Provider Port"]
  AI --> P["OpenAI · Anthropic · Google · Mistral · DeepSeek · Ollama · Azure · OpenRouter"]
  CORE --> SDK["Plugin Runtime / SDK"]
  SDK --> PACKS["Plugins · Standards · Domain Packs"]
```

## Flux d’exécution sécurisé

```mermaid
sequenceDiagram
  actor H as Humain
  participant C as Client
  participant W as Workflow Engine
  participant P as Policy Engine
  participant O as Orchestrator
  participant A as Audit Log
  C->>W: Démarrer un workflow
  W->>P: Évaluer étape + acteur + ressource
  alt Niveau 1 ou niveau 2 autorisé
    P-->>W: Autorisé
    W->>O: Exécuter avec agents sélectionnés
    O-->>W: Résultats et preuves
  else Niveau 3 ou 4
    P-->>W: Approbation requise
    W-->>H: Demande liée à l’action
    H->>W: Approbation explicite
    W->>P: Revérifier l’approbation
    P-->>W: Autorisé
  end
  W->>A: Événements, décision et résultat
```

## Frontières et décisions

| Décision | Choix | Justification |
|---|---|---|
| Runtime initial | Node.js 22 + TypeScript | Même langage pour CLI, API, SDK et Web ; distribution multiplateforme simple. |
| Couplage IA | Interface `ModelProvider` | Le fournisseur et le modèle peuvent changer sans modifier agents ni workflows. |
| Workflows | DAG déclaratif versionné | Reproductibilité, validation statique et reprise future. |
| Audit MVP | JSON Lines append-only local | Lisible, diffusable et exploitable sans service ; une base immuable sera un adaptateur production. |
| RAG MVP | Index lexical local | Démarrage sans service ni fuite de code ; embeddings et base vectorielle viendront via plugins. |
| API MVP | HTTP natif, lecture seule | Surface d’attaque et dépendances minimales pour le premier incrément. |
| Plugins | Manifestes + permissions | Capabilités visibles et contrôlables avant activation. |
| Mutations locales | Sessions sandboxées et réversibles | Aucun agent ne reçoit un accès arbitraire au système de fichiers ; chaque diff peut être inspecté puis annulé. |
| Validation des changements | Copie éphémère avant promotion | Les builds et tests n’affectent pas le projet réel ; une dérive concurrente bloque la promotion. |

## Cible production

Le stockage local est volontairement le mode développeur. Une installation d’équipe utilisera PostgreSQL pour l’état, un journal d’audit immuable, un gestionnaire de secrets externe, OpenTelemetry, une file durable pour les jobs et un stockage objet pour les artefacts. Aucun adaptateur production ne contournera le moteur de politiques.
