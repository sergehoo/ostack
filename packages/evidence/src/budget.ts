import type { BudgetBreach, BudgetEvaluation, Derogation, QualityBudget } from "./types.js";

export interface BudgetObservations {
  testCoverage?: number;
  criticalFindings: number;
  highFindings: number;
  mutationScore?: number;
  p95LatencyMs?: number;
  accessibility?: number;
  documentationDrift?: number;
  permissionTestsRun: boolean;
  rollbackDefined: boolean;
}

export function evaluateBudget(
  budget: QualityBudget | undefined,
  observations: BudgetObservations,
  derogations: Derogation[] = [],
  now: string
): BudgetEvaluation {
  const nowMs = Date.parse(now);
  const active = new Map<string, Derogation>();
  const expired: Derogation[] = [];
  for (const derogation of derogations) {
    const expiresMs = Date.parse(derogation.expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs >= nowMs) active.set(derogation.metric, derogation);
    else expired.push(derogation);
  }

  const raw: Array<Omit<BudgetBreach, "blocking" | "derogatedBy">> = [];
  if (!budget) return empty(active, expired);

  const min = (metric: string, threshold: number | undefined, observed: number | undefined) => {
    if (threshold === undefined) return;
    const value = observed ?? 0;
    if (value < threshold) raw.push({ metric, threshold, observed: value });
  };
  const max = (metric: string, threshold: number | undefined, observed: number | undefined) => {
    if (threshold === undefined || observed === undefined) return;
    if (observed > threshold) raw.push({ metric, threshold, observed });
  };
  const required = (metric: string, threshold: boolean | undefined, observed: boolean) => {
    if (threshold !== true) return;
    if (!observed) raw.push({ metric, threshold: true, observed });
  };

  min("test_coverage_minimum", budget.testCoverageMinimum, observations.testCoverage);
  max("critical_security_findings", budget.criticalSecurityFindings, observations.criticalFindings);
  max("high_security_findings", budget.highSecurityFindings, observations.highFindings);
  min("mutation_score_minimum", budget.mutationScoreMinimum, observations.mutationScore);
  max("p95_api_latency_ms", budget.p95ApiLatencyMs, observations.p95LatencyMs);
  min("accessibility_score_minimum", budget.accessibilityScoreMinimum, observations.accessibility);
  max("documentation_drift", budget.documentationDriftMaximum, observations.documentationDrift);
  required("permission_tests_required", budget.permissionTestsRequired, observations.permissionTestsRun);
  required("rollback_required", budget.rollbackRequired, observations.rollbackDefined);

  const breaches: BudgetBreach[] = raw.map((breach) => {
    const derogation = active.get(breach.metric);
    const result: BudgetBreach = { ...breach, blocking: derogation === undefined };
    if (derogation !== undefined) result.derogatedBy = derogation.owner;
    return result;
  });
  const blockingBreaches = breaches.filter((breach) => breach.blocking);

  return {
    withinBudget: blockingBreaches.length === 0,
    breaches,
    blockingBreaches,
    activeDerogations: [...active.values()],
    expiredDerogations: expired
  };
}

function empty(active: Map<string, Derogation>, expired: Derogation[]): BudgetEvaluation {
  return {
    withinBudget: true,
    breaches: [],
    blockingBreaches: [],
    activeDerogations: [...active.values()],
    expiredDerogations: expired
  };
}
