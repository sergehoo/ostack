import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleEvidencePack,
  evaluateBudget,
  evaluateDefinitionOfDone,
  scoreConfidence,
  type DefinitionOfDoneGates,
  type EvidenceInput,
  type EvidenceItem
} from "../src/index.js";

const NOW = "2026-07-11T12:00:00Z";

function verifiedGates(overrides: Partial<DefinitionOfDoneGates> = {}): DefinitionOfDoneGates {
  return {
    requirementsAccepted: true,
    invariantsDefined: true,
    lintPassed: true,
    typecheckPassed: true,
    buildPassed: true,
    unitTestsPassed: true,
    integrationTestsPassed: true,
    functionalTestsPassed: true,
    e2eTestsPassed: true,
    permissionTestsPassed: true,
    criticalFindings: 0,
    highFindings: 0,
    threatModelUpdated: true,
    performanceWithinBudget: true,
    documentationUpdated: true,
    documentationDriftDetected: false,
    rollbackDefined: true,
    evidencePackGenerated: true,
    humanApproved: true,
    released: false,
    ...overrides
  };
}

function passingInput(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  const evidenceItems: EvidenceItem[] = [
    { id: "lint-1", kind: "lint", dimension: "implementation_correctness", status: "passed", summary: "eslint clean" },
    { id: "tc-1", kind: "typecheck", dimension: "implementation_correctness", status: "passed", summary: "tsc clean" },
    { id: "build-1", kind: "build", dimension: "implementation_correctness", status: "passed", summary: "build ok" },
    { id: "unit-1", kind: "unit_test", dimension: "test_strength", status: "passed", summary: "84 unit tests" },
    { id: "spec-1", kind: "trace", dimension: "requirements_understanding", status: "observed", summary: "acceptance criteria traced" },
    { id: "sec-1", kind: "security_scan", dimension: "security_assurance", status: "passed", summary: "no critical/high" },
    { id: "perf-1", kind: "performance_measurement", dimension: "performance_assurance", status: "observed", summary: "p95 320ms" },
    { id: "doc-1", kind: "trace", dimension: "documentation_consistency", status: "observed", summary: "docs match code" },
    { id: "rb-1", kind: "human_review", dimension: "rollback_readiness", status: "approved", summary: "rollback rehearsed" }
  ];
  return {
    taskId: "OST-2026-0042",
    feature: "AI course generator",
    request: "Let instructors generate a course with AI without auto-publishing",
    specification: { summary: "Draft-only AI generation", coverage: 98 },
    assumptions: ["Provider sandbox available"],
    acceptanceCriteria: ["AI output stays draft", "only authorized instructor can generate", "audit entry created"],
    changedFiles: ["backend/courses/ai.py", "frontend/CourseGenerator.tsx"],
    architectureDecisions: ["Generation returns a proposal, never a published status"],
    migrations: [{ id: "0042_ai_drafts", reversible: true, backupTaken: true }],
    tests: {
      unit: { passed: 84, failed: 0 },
      integration: { passed: 21, failed: 0 },
      functional: { passed: 9, failed: 0 },
      e2e: { passed: 12, failed: 0 },
      permission: { passed: 6, failed: 0 },
      mutationScore: 78
    },
    security: { critical: 0, high: 0, medium: 2, threatModelUpdated: true },
    performance: [{ endpoint: "GET /api/courses", afterP95Ms: 320, targetP95Ms: 500 }],
    metrics: { testCoverage: 88, accessibility: 93, documentationDrift: 0 },
    permissionMatrixVerified: true,
    rollback: { defined: true, tested: true },
    humanApprovals: [{ approver: "release_arbiter", reason: "evidence reviewed", approvedAt: NOW }],
    residualRisks: [],
    confidence: [
      { dimension: "requirements_understanding", score: 96 },
      { dimension: "implementation_correctness", score: 92 },
      { dimension: "test_strength", score: 88 },
      { dimension: "security_assurance", score: 91 },
      { dimension: "performance_assurance", score: 84 },
      { dimension: "documentation_consistency", score: 97 },
      { dimension: "rollback_readiness", score: 90 }
    ],
    evidenceItems,
    budget: {
      testCoverageMinimum: 85,
      criticalSecurityFindings: 0,
      highSecurityFindings: 0,
      mutationScoreMinimum: 70,
      p95ApiLatencyMs: 500,
      permissionTestsRequired: true,
      rollbackRequired: true
    },
    ...overrides
  };
}

test("confidence forbids high scores without supporting evidence", () => {
  const report = scoreConfidence(
    [{ dimension: "security_assurance", score: 95 }],
    [] // no evidence at all
  );
  const security = report.dimensions.find((d) => d.dimension === "security_assurance");
  assert.equal(security?.claimed, 95);
  assert.equal(security?.effective, 60, "unsupported claim is capped");
  assert.ok(report.overall < 70, "overall confidence cannot be high without evidence");
});

test("confidence caps a dimension with a failing evidence item", () => {
  const report = scoreConfidence(
    [{ dimension: "test_strength", score: 90 }],
    [{ id: "u1", kind: "unit_test", dimension: "test_strength", status: "failed", summary: "2 failing" }]
  );
  const test_strength = report.dimensions.find((d) => d.dimension === "test_strength");
  assert.equal(test_strength?.effective, 50);
  assert.equal(test_strength?.supported, false);
});

test("definition of done reaches APPROVED only when every gate holds", () => {
  assert.equal(evaluateDefinitionOfDone(verifiedGates()).status, "APPROVED");
  assert.equal(evaluateDefinitionOfDone(verifiedGates({ humanApproved: false })).status, "VERIFIED");
  assert.equal(evaluateDefinitionOfDone(verifiedGates({ e2eTestsPassed: false })).status, "IMPLEMENTED");
  assert.equal(evaluateDefinitionOfDone(verifiedGates({ buildPassed: false })).status, "DRAFT");
});

test("definition of done rejects on zero-tolerance security escapes", () => {
  const result = evaluateDefinitionOfDone(verifiedGates({ criticalFindings: 1 }));
  assert.equal(result.status, "REJECTED");
  assert.equal(result.rejected, true);
  assert.match(result.rejectionReasons.join(" "), /critical/);
});

test("budget breach blocks unless a valid derogation covers it", () => {
  const budget = { mutationScoreMinimum: 70 };
  const blocked = evaluateBudget(budget, base({ mutationScore: 55 }), [], NOW);
  assert.equal(blocked.withinBudget, false);
  assert.equal(blocked.blockingBreaches.length, 1);

  const derogated = evaluateBudget(budget, base({ mutationScore: 55 }), [
    { metric: "mutation_score_minimum", owner: "cto", justification: "legacy module", expiresAt: "2026-07-20T00:00:00Z", acceptedRisks: ["weaker mutation coverage"], remediationPlan: "raise next sprint" }
  ], NOW);
  assert.equal(derogated.withinBudget, true);
  assert.equal(derogated.breaches[0]?.blocking, false);
});

test("expired derogation does not cover a breach", () => {
  const evaluation = evaluateBudget({ rollbackRequired: true }, base({ rollbackDefined: false }), [
    { metric: "rollback_required", owner: "cto", justification: "temporary", expiresAt: "2026-07-01T00:00:00Z", acceptedRisks: [], remediationPlan: "add rollback" }
  ], NOW);
  assert.equal(evaluation.withinBudget, false);
  assert.equal(evaluation.expiredDerogations.length, 1);
});

test("a fully proven task is VERIFIED and recommended for release", () => {
  const pack = assembleEvidencePack(passingInput(), { now: NOW });
  assert.equal(pack.definitionOfDone.status, "APPROVED");
  assert.equal(pack.budget.withinBudget, true);
  assert.equal(pack.verified, true);
  assert.equal(pack.releaseRecommendation, "APPROVE");
  assert.equal(pack.blockingReasons.length, 0);
  assert.ok(pack.confidence.overall >= 70);
});

test("failing tests block the release recommendation", () => {
  const pack = assembleEvidencePack(passingInput({ tests: { unit: { passed: 80, failed: 4 }, integration: { passed: 21, failed: 0 }, functional: { passed: 9, failed: 0 }, e2e: { passed: 12, failed: 0 }, permission: { passed: 6, failed: 0 } } }), { now: NOW });
  assert.equal(pack.releaseRecommendation, "BLOCK");
  assert.match(pack.blockingReasons.join(" "), /failing unit test/);
});

test("a critical security finding rejects the release", () => {
  const pack = assembleEvidencePack(passingInput({ security: { critical: 1, high: 0, medium: 0, threatModelUpdated: true } }), { now: NOW });
  assert.equal(pack.releaseRecommendation, "REJECT");
  assert.equal(pack.definitionOfDone.status, "REJECTED");
  assert.equal(pack.verified, false);
});

test("residual low risk yields APPROVE_WITH_OBSERVATIONS", () => {
  const pack = assembleEvidencePack(passingInput({ residualRisks: [{ severity: "low", description: "Mobile Safari not tested" }] }), { now: NOW });
  assert.equal(pack.releaseRecommendation, "APPROVE_WITH_OBSERVATIONS");
  assert.equal(pack.verified, true);
});

test("the evidence pack content hash is stable and order-independent", () => {
  const a = assembleEvidencePack(passingInput(), { now: NOW });
  const b = assembleEvidencePack(passingInput(), { now: NOW });
  assert.equal(a.contentHash, b.contentHash);
  const mutated = assembleEvidencePack(passingInput({ feature: "changed" }), { now: NOW });
  assert.notEqual(a.contentHash, mutated.contentHash);
});

function base(overrides: Partial<Parameters<typeof evaluateBudget>[1]> = {}) {
  return { criticalFindings: 0, highFindings: 0, permissionTestsRun: true, rollbackDefined: true, ...overrides };
}
