// OStack Business Rule Engine (§15) + Decision Tables (§16) + expert
// validation (§7) + jurisdiction guard (§18). Universal: the same mechanics
// apply to patient discharge and order delivery. Non-negotiables enforced in
// code: no source → no confirmation; unconfirmed rule → human review, never a
// silent automatic block or pass; foreign-jurisdiction rules are excluded,
// never silently applied.

import type { DecisionTable, KnowledgeStatus } from "./pack.js";

export type RuleKind =
  | "internal_rule"
  | "good_practice"
  | "recommendation"
  | "regulatory_obligation"
  | "contractual_requirement";

export interface RuleCondition {
  path: string;
  equals?: string | number | boolean;
  exists?: boolean;
  minimum?: number;
}

export interface ExpertValidation {
  expert: string;
  role?: string;
  reason: string;
  validatedAt: string;
}

export interface BusinessRule {
  id: string;
  statement: string;
  kind: RuleKind;
  when: { action: string };
  conditions: RuleCondition[];
  otherwise: { block: boolean; message?: string };
  status: KnowledgeStatus;
  sources: string[];
  validatedBy: ExpertValidation[];
  jurisdiction?: string;
  effectiveFrom?: string;
}

export interface RuleDecision {
  ruleId: string;
  applicable: boolean;
  conditionsMet: boolean;
  decision: "allowed" | "blocked" | "needs_human_review";
  explanation: string;
  failedConditions: RuleCondition[];
}

export function evaluateRule(rule: BusinessRule, action: string, context: unknown): RuleDecision {
  if (rule.when.action !== action || rule.status === "obsolete") {
    return { ruleId: rule.id, applicable: false, conditionsMet: true, decision: "allowed", explanation: "Règle non applicable à cette action", failedConditions: [] };
  }
  const failed = rule.conditions.filter((condition) => !conditionHolds(condition, context));
  if (failed.length === 0) {
    return { ruleId: rule.id, applicable: true, conditionsMet: true, decision: "allowed", explanation: `Conditions de « ${rule.statement} » satisfaites`, failedConditions: [] };
  }
  // Conditions violated. Only an expert-confirmed rule may block automatically;
  // an extracted or assumed rule escalates to a human (§26.5, §26.8).
  if (rule.status === "confirmed" && rule.otherwise.block) {
    return {
      ruleId: rule.id, applicable: true, conditionsMet: false, decision: "blocked",
      explanation: rule.otherwise.message ?? `Bloqué par la règle confirmée « ${rule.statement} »`,
      failedConditions: failed
    };
  }
  return {
    ruleId: rule.id, applicable: true, conditionsMet: false, decision: "needs_human_review",
    explanation: `La règle « ${rule.statement} » (statut ${rule.status}) serait violée; elle n'est pas confirmée par un expert, décision humaine requise`,
    failedConditions: failed
  };
}

export interface ActionEvaluation {
  action: string;
  decision: "allowed" | "blocked" | "needs_human_review";
  ruleDecisions: RuleDecision[];
}

export function evaluateAction(rules: BusinessRule[], action: string, context: unknown): ActionEvaluation {
  const ruleDecisions = rules.map((rule) => evaluateRule(rule, action, context)).filter((decision) => decision.applicable);
  const decision = ruleDecisions.some((entry) => entry.decision === "blocked")
    ? "blocked"
    : ruleDecisions.some((entry) => entry.decision === "needs_human_review")
      ? "needs_human_review"
      : "allowed";
  return { action, decision, ruleDecisions };
}

// §7 — confirming a rule is a human act on sourced knowledge.
export function confirmRule(rule: BusinessRule, validation: ExpertValidation): BusinessRule {
  if (rule.sources.length === 0) throw new Error(`La règle ${rule.id} ne possède aucune source; une connaissance sans source ne peut pas être confirmée (§33.2)`);
  if (!validation.expert.trim() || !validation.reason.trim()) throw new Error("Une validation exige un expert nommé et une raison");
  if (rule.kind === "regulatory_obligation" && (!rule.jurisdiction || !rule.effectiveFrom)) {
    throw new Error(`La règle réglementaire ${rule.id} doit être localisée (jurisdiction) et datée (effectiveFrom) avant confirmation (§33.6)`);
  }
  return { ...rule, status: "confirmed", validatedBy: [...rule.validatedBy, validation] };
}

// §18 — rules from another jurisdiction are excluded and reported, never
// silently applied to a different country.
export function applicableRules(rules: BusinessRule[], jurisdiction?: string): { applicable: BusinessRule[]; excluded: Array<{ id: string; jurisdiction: string }> } {
  const applicable: BusinessRule[] = [];
  const excluded: Array<{ id: string; jurisdiction: string }> = [];
  for (const rule of rules) {
    if (rule.status === "obsolete") continue;
    if (rule.jurisdiction && jurisdiction && rule.jurisdiction !== jurisdiction) excluded.push({ id: rule.id, jurisdiction: rule.jurisdiction });
    else if (rule.jurisdiction && !jurisdiction) excluded.push({ id: rule.id, jurisdiction: rule.jurisdiction });
    else applicable.push(rule);
  }
  return { applicable, excluded };
}

function conditionHolds(condition: RuleCondition, context: unknown): boolean {
  const observed = resolvePath(context, condition.path);
  let holds = true;
  if (condition.exists !== undefined) holds = holds && (observed !== undefined && observed !== null) === condition.exists;
  if (condition.equals !== undefined) holds = holds && observed === condition.equals;
  if (condition.minimum !== undefined) holds = holds && typeof observed === "number" && observed >= condition.minimum;
  return holds;
}

function resolvePath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// §16 — decision tables: conflicts and uncovered cases are surfaced, and every
// decision is explained by the row that produced it.
export interface TableDecision {
  outcome: string | undefined;
  matchedRows: number[];
  explanation: string;
}

export function evaluateDecisionTable(table: DecisionTable, input: Record<string, string>): TableDecision {
  const matchedRows = table.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => table.inputs.every((column) => {
      const condition = row.conditions[column.name];
      return condition === undefined || condition === "*" || condition === input[column.name];
    }))
    .map(({ index }) => index);
  if (matchedRows.length === 0) return { outcome: undefined, matchedRows, explanation: "Aucune ligne ne couvre ce cas; décision humaine requise" };
  const outcomes = new Set(matchedRows.map((index) => table.rows[index]!.outcome));
  if (outcomes.size > 1) return { outcome: undefined, matchedRows, explanation: `Conflit: les lignes ${matchedRows.join(", ")} donnent des résultats différents` };
  const first = matchedRows[0]!;
  return {
    outcome: table.rows[first]!.outcome,
    matchedRows,
    explanation: `Ligne ${first + 1}: ${Object.entries(table.rows[first]!.conditions).map(([key, value]) => `${key}=${value}`).join(", ")} → ${table.rows[first]!.outcome}`
  };
}

export interface TableAnalysis {
  conflicts: Array<{ input: Record<string, string>; rows: number[]; outcomes: string[] }>;
  uncovered: Array<Record<string, string>>;
}

export function analyzeDecisionTable(table: DecisionTable): TableAnalysis {
  const combos = cartesian(table.inputs.map((input) => input.values.map((value) => [input.name, value] as const)));
  const conflicts: TableAnalysis["conflicts"] = [];
  const uncovered: TableAnalysis["uncovered"] = [];
  for (const combo of combos) {
    const input = Object.fromEntries(combo);
    const decision = evaluateDecisionTable(table, input);
    if (decision.matchedRows.length === 0) uncovered.push(input);
    else {
      const outcomes = [...new Set(decision.matchedRows.map((index) => table.rows[index]!.outcome))];
      if (outcomes.length > 1) conflicts.push({ input, rows: decision.matchedRows, outcomes });
    }
  }
  return { conflicts, uncovered };
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((accumulator, list) => accumulator.flatMap((combo) => list.map((item) => [...combo, item])), [[]]);
}

// §23 — universal test scenarios generated from the rule itself.
export interface RuleScenario {
  id: string;
  kind: "nominal" | "blocked" | "missing_data";
  gherkin: string;
}

export function generateRuleScenarios(rule: BusinessRule): RuleScenario[] {
  const conditionText = rule.conditions.map((condition) => describeCondition(condition)).join(" et ");
  return [
    {
      id: `${rule.id}-nominal`, kind: "nominal",
      gherkin: `Given un contexte où ${conditionText}\nWhen l'action « ${rule.when.action} » est demandée\nThen l'action est autorisée`
    },
    {
      id: `${rule.id}-blocked`, kind: "blocked",
      gherkin: `Given un contexte où ${conditionText ? `la condition « ${conditionText} » n'est pas satisfaite` : "les conditions ne sont pas satisfaites"}\nWhen l'action « ${rule.when.action} » est demandée\nThen ${rule.otherwise.block ? "l'action est bloquée" : "une revue est exigée"}\nAnd le message explique: ${rule.otherwise.message ?? rule.statement}`
    },
    {
      id: `${rule.id}-missing-data`, kind: "missing_data",
      gherkin: `Given un contexte où les données de ${rule.conditions.map((condition) => condition.path).join(", ") || "la règle"} sont absentes\nWhen l'action « ${rule.when.action} » est demandée\nThen l'action n'est pas silencieusement autorisée`
    }
  ];
}

function describeCondition(condition: RuleCondition): string {
  if (condition.equals !== undefined) return `${condition.path} = ${JSON.stringify(condition.equals)}`;
  if (condition.minimum !== undefined) return `${condition.path} ≥ ${condition.minimum}`;
  if (condition.exists !== undefined) return condition.exists ? `${condition.path} est présent` : `${condition.path} est absent`;
  return condition.path;
}
