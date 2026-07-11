// OStack Domain Pack (§9) — versioned, sourced, expert-validated business
// knowledge. Anti-hallucination by construction (§26): every piece of
// knowledge carries a status and sources; the confidence score is COMPUTED
// from what is sourced and validated, never declared; actions are gated by
// the derived maturity level (§30).

import type { ConceptMapping, UniversalConcept } from "./ontology.js";
import type { BusinessRule } from "./rules.js";

export type KnowledgeStatus =
  | "extracted"
  | "assumed"
  | "pending_validation"
  | "confirmed"
  | "contested"
  | "obsolete";

export interface SourceRef {
  id: string;
  title: string;
  kind: "document" | "interview" | "regulation" | "data" | "system" | "expert_statement";
  date?: string;
  uri?: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  concept?: UniversalConcept;
  status: KnowledgeStatus;
  sources: string[];
}

export interface DomainActor {
  id: string;
  name: string;
  roles: string[];
  status: KnowledgeStatus;
  sources: string[];
}

export interface WorkflowStepDef {
  id: string;
  name: string;
  actor?: string;
  requires?: string[];
  produces?: string[];
  irreversible?: boolean;
}

export interface DomainWorkflow {
  id: string;
  name: string;
  steps: WorkflowStepDef[];
  status: KnowledgeStatus;
  sources: string[];
}

export interface DomainKpi {
  name: string;
  objective: string;
  formula: string;
  dataSources: string[];
  frequency: string;
  owner: string;
  threshold?: { target: number; warning?: number };
}

export interface DomainExpert {
  name: string;
  role: string;
}

export interface DecisionTableInput {
  name: string;
  values: string[];
}

export interface DecisionTableRow {
  conditions: Record<string, string>;
  outcome: string;
}

export interface DecisionTable {
  id: string;
  name: string;
  inputs: DecisionTableInput[];
  rows: DecisionTableRow[];
  status: KnowledgeStatus;
  sources: string[];
}

export interface DomainPack {
  schemaVersion: 1;
  id: string;
  name: string;
  sector: string;
  country?: string;
  language: string;
  version: string;
  sources: SourceRef[];
  experts: DomainExpert[];
  glossary: GlossaryEntry[];
  actors: DomainActor[];
  workflows: DomainWorkflow[];
  rules: BusinessRule[];
  decisionTables: DecisionTable[];
  kpis: DomainKpi[];
  mappings: ConceptMapping[];
  openQuestions: string[];
}

// §8 — multidimensional domain understanding, derived from evidence only.
export interface DomainConfidence {
  terminology: number;
  actorsAndRoles: number;
  workflows: number;
  businessRules: number;
  regulations: number;
  expertValidation: number;
  overall: number;
  unknown: string[];
  assumed: string[];
  needsValidation: string[];
}

const KNOWN_SOURCE = (pack: DomainPack) => new Set(pack.sources.map((source) => source.id));

function sectionScore(items: Array<{ status: KnowledgeStatus; sources: string[] }>, knownSources: Set<string>): number {
  if (items.length === 0) return 0;
  const live = items.filter((item) => item.status !== "obsolete");
  if (live.length === 0) return 0;
  const sourced = live.filter((item) => item.sources.length > 0 && item.sources.every((id) => knownSources.has(id))).length;
  const confirmed = live.filter((item) => item.status === "confirmed").length;
  return Math.round(((sourced / live.length) * 60 + (confirmed / live.length) * 40));
}

export function computeDomainConfidence(pack: DomainPack): DomainConfidence {
  const known = KNOWN_SOURCE(pack);
  const regulatory = pack.rules.filter((rule) => rule.kind === "regulatory_obligation");
  const regulationScore = regulatory.length === 0
    ? 0
    : Math.round((regulatory.filter((rule) => rule.jurisdiction && rule.effectiveFrom && rule.sources.length > 0).length / regulatory.length) * 100);
  const validatable = pack.rules.filter((rule) => rule.status !== "obsolete");
  const expertScore = validatable.length === 0
    ? 0
    : Math.round((validatable.filter((rule) => rule.validatedBy.length > 0).length / validatable.length) * 100);

  const dimensions = {
    terminology: sectionScore(pack.glossary, known),
    actorsAndRoles: sectionScore(pack.actors, known),
    workflows: sectionScore(pack.workflows, known),
    businessRules: sectionScore(pack.rules, known),
    regulations: regulationScore,
    expertValidation: expertScore
  };
  const values = Object.values(dimensions);
  const assumed = [
    ...pack.glossary.filter((entry) => entry.status === "assumed").map((entry) => `glossaire: ${entry.term}`),
    ...pack.rules.filter((rule) => rule.status === "assumed").map((rule) => `règle: ${rule.id}`)
  ];
  const needsValidation = pack.rules
    .filter((rule) => rule.status === "extracted" || rule.status === "pending_validation" || rule.status === "contested")
    .map((rule) => `règle ${rule.id} (${rule.status})`);

  return {
    ...dimensions,
    overall: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    unknown: pack.openQuestions,
    assumed,
    needsValidation
  };
}

// §30 — maturity ladder. Level 5+ requires linked proof, which lives in the
// Evidence layer; a pack alone cannot claim beyond 4.
export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

export interface MaturityAssessment {
  level: MaturityLevel;
  label: string;
  missingForNext: string[];
}

export function assessMaturity(pack: DomainPack): MaturityAssessment {
  const missing: string[] = [];
  const discovered = pack.glossary.length > 0 || pack.actors.length > 0;
  if (!discovered) return { level: 0, label: "inconnu", missingForNext: ["Ajouter au moins un terme de glossaire ou un acteur sourcé"] };

  const modeled = pack.actors.length > 0 && pack.workflows.length > 0 && pack.glossary.length >= 3;
  if (!modeled) {
    if (pack.actors.length === 0) missing.push("acteurs manquants");
    if (pack.workflows.length === 0) missing.push("aucun processus modélisé");
    if (pack.glossary.length < 3) missing.push("glossaire insuffisant (< 3 termes)");
    return { level: 1, label: "découvert", missingForNext: missing };
  }

  const blockingRules = pack.rules.filter((rule) => rule.otherwise.block && rule.status !== "obsolete");
  const criticalValidated = blockingRules.length > 0 && blockingRules.every((rule) => rule.status === "confirmed");
  if (!criticalValidated) {
    if (blockingRules.length === 0) missing.push("aucune règle bloquante formalisée");
    else missing.push(`règles bloquantes non confirmées par un expert: ${blockingRules.filter((rule) => rule.status !== "confirmed").map((rule) => rule.id).join(", ")}`);
    return { level: 2, label: "modélisé", missingForNext: missing };
  }

  const operational = pack.mappings.length > 0 && pack.kpis.length > 0 && pack.experts.length > 0;
  if (!operational) {
    if (pack.mappings.length === 0) missing.push("aucune correspondance vers l'ontologie universelle");
    if (pack.kpis.length === 0) missing.push("aucun indicateur défini");
    if (pack.experts.length === 0) missing.push("aucun expert désigné");
    return { level: 3, label: "validé", missingForNext: missing };
  }

  return { level: 4, label: "opérationnel", missingForNext: ["Niveau 5 (vérifié) exige des preuves d'exécution liées via la couche Evidence"] };
}

export type ActionCriticality = "low" | "medium" | "high" | "critical";

const REQUIRED_LEVEL: Record<ActionCriticality, MaturityLevel> = { low: 1, medium: 2, high: 3, critical: 4 };

// §8/§26.9 — a critical business action is refused while understanding is
// insufficient; the error says exactly what is missing.
export function assertDomainActionAllowed(pack: DomainPack, action: string, criticality: ActionCriticality): MaturityAssessment {
  const assessment = assessMaturity(pack);
  const required = REQUIRED_LEVEL[criticality];
  if (assessment.level < required) {
    throw new Error(
      `Action '${action}' (criticité ${criticality}) refusée: le domaine '${pack.id}' est au niveau ${assessment.level} (${assessment.label}), niveau ${required} requis. Manque: ${assessment.missingForNext.join("; ")}`
    );
  }
  return assessment;
}
