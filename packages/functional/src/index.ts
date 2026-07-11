// OStack Functional Testing Studio (§13) — minimal core.
// Two deterministic engines:
//   1. scenariosFromIntent — acceptance criteria become executable scenario
//      descriptors (Gherkin), straight from the compiled intent.
//   2. the permission matrix — Fonctionnalité × Rôle × État × Résultat attendu,
//      evaluated against observed outcomes. A cell that was never exercised is
//      a failure of coverage, not a silent pass.

import type { EvidenceItem, TestSummary } from "@ostack/evidence";
import type { CompiledIntent } from "@ostack/intent";

export interface Scenario {
  id: string;
  invariantId: string;
  title: string;
  gherkin: string;
  adversarial: boolean;
}

export interface ScenarioOutcome {
  scenarioId: string;
  status: "passed" | "failed";
  detail?: string;
}

export function scenariosFromIntent(intent: CompiledIntent): Scenario[] {
  return intent.properties.map((property) => ({
    id: `scenario:${intent.id}:${property.id}`,
    invariantId: property.invariantId,
    title: property.title,
    gherkin: property.gherkin,
    adversarial: property.adversarial
  }));
}

export interface ScenarioReport {
  summary: TestSummary;
  missing: Scenario[];
  evidenceItems: EvidenceItem[];
}

export function evaluateScenarios(scenarios: Scenario[], outcomes: ScenarioOutcome[]): ScenarioReport {
  const byId = new Map(outcomes.map((outcome) => [outcome.scenarioId, outcome]));
  const unknown = outcomes.filter((outcome) => !scenarios.some((scenario) => scenario.id === outcome.scenarioId));
  if (unknown.length > 0) throw new Error(`Outcomes reference unknown scenarios: ${unknown.map((outcome) => outcome.scenarioId).join(", ")}`);

  let passed = 0;
  let failed = 0;
  const missing: Scenario[] = [];
  const evidenceItems: EvidenceItem[] = [];
  for (const scenario of scenarios) {
    const outcome = byId.get(scenario.id);
    if (!outcome) { missing.push(scenario); continue; }
    if (outcome.status === "passed") passed++;
    else failed++;
    evidenceItems.push({
      id: scenario.id,
      kind: "functional_test",
      dimension: scenario.adversarial ? "security_assurance" : "requirements_understanding",
      status: outcome.status,
      summary: `${scenario.title}${outcome.detail ? ` — ${outcome.detail}` : ""}`
    });
  }
  return { summary: { passed, failed }, missing, evidenceItems };
}

// Fonctionnalité × Rôle × État × Résultat attendu (§13).
export type MatrixExpectation = "allowed" | "denied";

export interface MatrixRule {
  feature: string;
  role: string;
  state: string;
  expected: MatrixExpectation;
}

export interface MatrixObservation {
  feature: string;
  role: string;
  state: string;
  observed: MatrixExpectation;
}

export interface MatrixReport {
  summary: TestSummary;
  violations: Array<MatrixRule & { observed: MatrixExpectation }>;
  untested: MatrixRule[];
  unexpectedObservations: MatrixObservation[];
  evidenceItems: EvidenceItem[];
}

export function evaluateMatrix(rules: MatrixRule[], observations: MatrixObservation[]): MatrixReport {
  assertUniqueCells(rules);
  const observationByCell = new Map(observations.map((observation) => [cellKey(observation), observation]));
  const ruleCells = new Set(rules.map(cellKey));

  let passed = 0;
  const violations: MatrixReport["violations"] = [];
  const untested: MatrixRule[] = [];
  const evidenceItems: EvidenceItem[] = [];
  for (const rule of rules) {
    const observation = observationByCell.get(cellKey(rule));
    if (!observation) { untested.push(rule); continue; }
    const ok = observation.observed === rule.expected;
    if (ok) passed++;
    else violations.push({ ...rule, observed: observation.observed });
    evidenceItems.push({
      id: `matrix:${cellKey(rule)}`,
      kind: "permission_test",
      dimension: "security_assurance",
      status: ok ? "passed" : "failed",
      summary: `${rule.feature} × ${rule.role} × ${rule.state}: attendu ${rule.expected}, observé ${observation.observed}`
    });
  }
  const unexpectedObservations = observations.filter((observation) => !ruleCells.has(cellKey(observation)));

  return {
    summary: { passed, failed: violations.length },
    violations,
    untested,
    unexpectedObservations,
    evidenceItems
  };
}

// Every declared role must have an explicit expectation for every (feature, state)
// pair — an absent cell is an unreviewed permission, which is how bypasses ship.
export function missingCells(rules: MatrixRule[], roles: string[]): Array<{ feature: string; state: string; role: string }> {
  const pairs = new Map<string, Set<string>>();
  for (const rule of rules) {
    const pair = `${rule.feature}\u001f${rule.state}`;
    const set = pairs.get(pair) ?? new Set<string>();
    set.add(rule.role);
    pairs.set(pair, set);
  }
  const missing: Array<{ feature: string; state: string; role: string }> = [];
  for (const [pair, covered] of pairs) {
    const [feature, state] = pair.split("\u001f") as [string, string];
    for (const role of roles) if (!covered.has(role)) missing.push({ feature, state, role });
  }
  return missing;
}

function cellKey(cell: { feature: string; role: string; state: string }): string {
  return `${cell.feature}\u001f${cell.role}\u001f${cell.state}`;
}

function assertUniqueCells(rules: MatrixRule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    const key = cellKey(rule);
    if (seen.has(key)) throw new Error(`Duplicate matrix cell: ${rule.feature} × ${rule.role} × ${rule.state}`);
    seen.add(key);
  }
}
