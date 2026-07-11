import { createHash } from "node:crypto";
import { evaluateBudget, type BudgetObservations } from "./budget.js";
import { scoreConfidence } from "./confidence.js";
import { evaluateDefinitionOfDone } from "./dod.js";
import type {
  DefinitionOfDoneGates,
  EvidenceInput,
  EvidenceItem,
  EvidencePack,
  ReleaseRecommendation,
  TestSummary
} from "./types.js";

export interface AssembleOptions {
  now?: string;
}

export function assembleEvidencePack(input: EvidenceInput, options: AssembleOptions = {}): EvidencePack {
  const now = options.now ?? new Date().toISOString();
  const performance = input.performance ?? [];
  const worstP95 = performance.reduce<number | undefined>(
    (worst, measurement) => (worst === undefined ? measurement.afterP95Ms : Math.max(worst, measurement.afterP95Ms)),
    undefined
  );
  const perfWithinTargets = performance.every(
    (measurement) => measurement.targetP95Ms === undefined || measurement.afterP95Ms <= measurement.targetP95Ms
  );
  const rollbackDefined = input.rollback?.defined === true;
  const permissionTestsRun = testRan(input.tests.permission) || input.permissionMatrixVerified === true;

  const observations: BudgetObservations = {
    criticalFindings: input.security.critical,
    highFindings: input.security.high,
    permissionTestsRun,
    rollbackDefined
  };
  if (input.metrics?.testCoverage !== undefined) observations.testCoverage = input.metrics.testCoverage;
  if (input.tests.mutationScore !== undefined) observations.mutationScore = input.tests.mutationScore;
  if (worstP95 !== undefined) observations.p95LatencyMs = worstP95;
  if (input.metrics?.accessibility !== undefined) observations.accessibility = input.metrics.accessibility;
  if (input.metrics?.documentationDrift !== undefined) observations.documentationDrift = input.metrics.documentationDrift;

  const budget = evaluateBudget(input.budget, observations, input.derogations ?? [], now);
  const confidence = scoreConfidence(input.confidence, input.evidenceItems);

  const p95Blocking = budget.blockingBreaches.some((breach) => breach.metric === "p95_api_latency_ms");
  const performanceWithinBudget = perfWithinTargets && !p95Blocking;
  const documentationMeasured = input.metrics?.documentationDrift !== undefined;

  const gates: DefinitionOfDoneGates = {
    requirementsAccepted: input.specification.coverage >= 50 && input.acceptanceCriteria.length > 0,
    invariantsDefined: input.acceptanceCriteria.length > 0,
    lintPassed: kindPassed(input.evidenceItems, "lint"),
    typecheckPassed: kindPassed(input.evidenceItems, "typecheck"),
    buildPassed: kindPassed(input.evidenceItems, "build"),
    unitTestsPassed: testPassed(input.tests.unit),
    integrationTestsPassed: testPassed(input.tests.integration),
    functionalTestsPassed: testPassed(input.tests.functional),
    e2eTestsPassed: testPassed(input.tests.e2e),
    permissionTestsPassed: testPassed(input.tests.permission),
    criticalFindings: input.security.critical,
    highFindings: input.security.high,
    threatModelUpdated: input.security.threatModelUpdated === true,
    performanceWithinBudget,
    documentationUpdated: documentationMeasured,
    documentationDriftDetected: (input.metrics?.documentationDrift ?? 1) > 0,
    rollbackDefined,
    evidencePackGenerated: true,
    humanApproved: (input.humanApprovals?.length ?? 0) > 0,
    released: input.released === true
  };
  const definitionOfDone = evaluateDefinitionOfDone(gates);

  const residualRisks = input.residualRisks ?? [];
  const blockingReasons: string[] = [];
  const failingTests = describeFailingTests(input.tests);
  if (failingTests.length > 0) blockingReasons.push(...failingTests);
  if (input.security.critical > 0) blockingReasons.push(`${input.security.critical} critical security finding(s)`);
  if (input.security.high > 0) blockingReasons.push(`${input.security.high} high security finding(s)`);
  for (const breach of budget.blockingBreaches) {
    blockingReasons.push(`quality budget breach: ${breach.metric} (observed ${String(breach.observed)}, threshold ${String(breach.threshold)})`);
  }
  const blockingRisks = residualRisks.filter((risk) => risk.severity === "high" || risk.severity === "critical");
  for (const risk of blockingRisks) blockingReasons.push(`unmitigated ${risk.severity} risk: ${risk.description}`);

  const gatesVerified = ["VERIFIED", "APPROVED", "RELEASED"].includes(definitionOfDone.status);
  const releaseRecommendation = recommend(definitionOfDone.rejected, blockingReasons.length, gatesVerified, residualRisks.length + confidence.uncertainty.length);
  if (!definitionOfDone.rejected && !gatesVerified && blockingReasons.length === 0) {
    blockingReasons.push(`definition of done not reached (status ${definitionOfDone.status}); unmet: ${definitionOfDone.unmet.join(", ")}`);
  }
  if (definitionOfDone.rejected) blockingReasons.unshift(...definitionOfDone.rejectionReasons);
  const dedupedReasons = [...new Set(blockingReasons)];

  const verified = gatesVerified && (releaseRecommendation === "APPROVE" || releaseRecommendation === "APPROVE_WITH_OBSERVATIONS");

  const pack: Omit<EvidencePack, "contentHash"> = {
    schemaVersion: 1,
    taskId: input.taskId,
    feature: input.feature,
    ...(input.intentId !== undefined ? { intentId: input.intentId } : {}),
    generatedFrom: {
      request: input.request,
      specificationCoverage: input.specification.coverage,
      assumptions: input.assumptions,
      acceptanceCriteria: input.acceptanceCriteria,
      ...(input.plan !== undefined ? { plan: input.plan } : {})
    },
    changedFiles: input.changedFiles,
    ...(input.diffRef !== undefined ? { diffRef: input.diffRef } : {}),
    architectureDecisions: input.architectureDecisions ?? [],
    migrations: input.migrations ?? [],
    tests: input.tests,
    security: input.security,
    performance,
    permissionMatrixVerified: input.permissionMatrixVerified === true,
    rollback: input.rollback ?? { defined: false, tested: false },
    humanApprovals: input.humanApprovals ?? [],
    residualRisks,
    ...(input.deploymentProcedure !== undefined ? { deploymentProcedure: input.deploymentProcedure } : {}),
    ...(input.rollbackProcedure !== undefined ? { rollbackProcedure: input.rollbackProcedure } : {}),
    budget,
    confidence,
    definitionOfDone,
    releaseRecommendation,
    verified,
    blockingReasons: dedupedReasons
  };

  return { ...pack, contentHash: hashPack(pack) };
}

export function hashPack(pack: Omit<EvidencePack, "contentHash">): string {
  return createHash("sha256").update(stableStringify(pack)).digest("hex");
}

function recommend(rejected: boolean, blocks: number, gatesVerified: boolean, observations: number): ReleaseRecommendation {
  if (rejected) return "REJECT";
  if (blocks > 0) return "BLOCK";
  if (!gatesVerified) return "BLOCK";
  return observations > 0 ? "APPROVE_WITH_OBSERVATIONS" : "APPROVE";
}

function kindPassed(items: EvidenceItem[], kind: EvidenceItem["kind"]): boolean {
  const relevant = items.filter((item) => item.kind === kind);
  return relevant.length > 0 && relevant.every((item) => item.status !== "failed" && item.status !== "rejected");
}

function testPassed(summary: TestSummary | undefined): boolean {
  return summary !== undefined && summary.failed === 0 && summary.passed > 0;
}

function testRan(summary: TestSummary | undefined): boolean {
  return summary !== undefined && summary.passed + summary.failed > 0;
}

function describeFailingTests(tests: EvidenceInput["tests"]): string[] {
  const reasons: string[] = [];
  const check = (name: string, summary: TestSummary | undefined) => {
    if (summary !== undefined && summary.failed > 0) reasons.push(`${summary.failed} failing ${name} test(s)`);
  };
  check("unit", tests.unit);
  check("integration", tests.integration);
  check("contract", tests.contract);
  check("functional", tests.functional);
  check("e2e", tests.e2e);
  check("permission", tests.permission);
  return reasons;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
