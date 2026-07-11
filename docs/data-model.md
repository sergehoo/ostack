# Modèle de données

```mermaid
erDiagram
  PROJECT ||--o{ RUN : owns
  PROJECT ||--o{ KNOWLEDGE_DOCUMENT : indexes
  PROJECT ||--o{ POLICY_BINDING : configures
  WORKFLOW ||--o{ WORKFLOW_STEP : contains
  WORKFLOW ||--o{ RUN : instantiates
  RUN ||--o{ STEP_RUN : contains
  AGENT ||--o{ AGENT_ASSIGNMENT : receives
  STEP_RUN ||--o{ AGENT_ASSIGNMENT : delegates
  RUN ||--o{ APPROVAL_REQUEST : requires
  APPROVAL_REQUEST ||--o| APPROVAL : receives
  RUN ||--o{ ARTIFACT : produces
  RUN ||--o{ AUDIT_EVENT : emits
  PLUGIN ||--o{ PLUGIN_PERMISSION : requests
```

Tous les identifiants sont opaques. Les événements d’audit sont append-only. Une approbation référence exactement une demande, son empreinte de paramètres et une expiration ; elle n’est jamais une permission générale.
