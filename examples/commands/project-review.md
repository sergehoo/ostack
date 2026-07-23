---
name: project-review
description: Examiner un objectif de changement contre les règles du projet.
aliases: [review-project, project-check]
agents: [software-engineer, security-engineer]
standards: [typescript-node]
policies: [architecture, security]
workflows: [software-lifecycle]
input-required: true
input-max-chars: 20000
timeout-ms: 120000
argument-hint: --input "<objectif>" [--dry-run]
---

# Project review

Examine l’objectif fourni contre les agents, standards, politiques et workflow chargés.

Produis :

1. les invariants concernés ;
2. les risques et barrières humaines ;
3. un plan minimal et rétrocompatible ;
4. les preuves exécutables attendues ;
5. les incertitudes restantes.

Ne prétends jamais qu’un changement a été appliqué ou vérifié sans preuve exécutée.
