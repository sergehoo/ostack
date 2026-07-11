// OStack Proof-Carrying Software — verification kernel contracts.
// This module is deterministic and provider-neutral: given the same observations
// it always produces the same Evidence Pack, so results are reproducible and auditable.

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type ConfidenceDimension =
  | "requirements_understanding"
  | "implementation_correctness"
  | "test_strength"
  | "security_assurance"
  | "performance_assurance"
  | "documentation_consistency"
  | "rollback_readiness";

export type EvidenceKind =
  | "lint"
  | "typecheck"
  | "build"
  | "unit_test"
  | "integration_test"
  | "contract_test"
  | "functional_test"
  | "e2e_test"
  | "permission_test"
  | "mutation_test"
  | "property_test"
  | "security_scan"
  | "performance_measurement"
  | "human_review"
  | "trace";

// An Evidence Item is a single executed or observed fact. A claim without at least
// one non-failing item that supports it is treated as unproven.
export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  dimension: ConfidenceDimension;
  status: "passed" | "failed" | "observed" | "approved" | "rejected";
  summary: string;
  uri?: string;
  metrics?: Record<string, number>;
}

export interface TestSummary {
  passed: number;
  failed: number;
}

export interface SecurityFindings {
  critical: number;
  high: number;
  medium: number;
  low?: number;
  threatModelUpdated?: boolean;
}

export interface PerformanceMeasurement {
  endpoint: string;
  beforeP95Ms?: number;
  afterP95Ms: number;
  targetP95Ms?: number;
}

// Quality Budget (§10). Absent thresholds are not enforced.
export interface QualityBudget {
  testCoverageMinimum?: number;
  criticalSecurityFindings?: number;
  highSecurityFindings?: number;
  mutationScoreMinimum?: number;
  p95ApiLatencyMs?: number;
  accessibilityScoreMinimum?: number;
  documentationDriftMaximum?: number;
  permissionTestsRequired?: boolean;
  rollbackRequired?: boolean;
}

// A derogation explicitly accepts a budget breach. It must be attributable,
// justified, time-boxed and carry a remediation plan (§10).
export interface Derogation {
  metric: string;
  owner: string;
  justification: string;
  expiresAt: string;
  acceptedRisks: string[];
  remediationPlan: string;
}

export interface BudgetBreach {
  metric: string;
  threshold: number | boolean;
  observed: number | boolean;
  blocking: boolean;
  derogatedBy?: string;
}

export interface BudgetEvaluation {
  withinBudget: boolean;
  breaches: BudgetBreach[];
  blockingBreaches: BudgetBreach[];
  activeDerogations: Derogation[];
  expiredDerogations: Derogation[];
}

export interface ConfidenceSubScore {
  dimension: ConfidenceDimension;
  claimed: number;
  effective: number;
  supported: boolean;
  supportingEvidence: string[];
  note?: string;
}

export interface ConfidenceReport {
  dimensions: ConfidenceSubScore[];
  overall: number;
  uncertainty: string[];
}

export type DefinitionOfDoneStatus =
  | "DRAFT"
  | "IMPLEMENTED"
  | "TESTED"
  | "VERIFIED"
  | "APPROVED"
  | "RELEASED"
  | "REJECTED";

export interface DefinitionOfDoneGates {
  requirementsAccepted: boolean;
  invariantsDefined: boolean;
  lintPassed: boolean;
  typecheckPassed: boolean;
  buildPassed: boolean;
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  functionalTestsPassed: boolean;
  e2eTestsPassed: boolean;
  permissionTestsPassed: boolean;
  criticalFindings: number;
  highFindings: number;
  threatModelUpdated: boolean;
  performanceWithinBudget: boolean;
  documentationUpdated: boolean;
  documentationDriftDetected: boolean;
  rollbackDefined: boolean;
  evidencePackGenerated: boolean;
  humanApproved: boolean;
  released: boolean;
}

export interface DefinitionOfDoneResult {
  status: DefinitionOfDoneStatus;
  unmet: string[];
  rejected: boolean;
  rejectionReasons: string[];
}

export type ReleaseRecommendation =
  | "APPROVE"
  | "APPROVE_WITH_OBSERVATIONS"
  | "BLOCK"
  | "REJECT";

export interface ResidualRisk {
  severity: Severity;
  description: string;
  mitigation?: string;
}

export interface Migration {
  id: string;
  reversible: boolean;
  backupTaken?: boolean;
}

export interface HumanApproval {
  approver: string;
  reason: string;
  approvedAt: string;
}

// The full input an engineering task must supply to be judged. Every downstream
// verdict is derived only from these observations — never from prose persuasion.
export interface EvidenceInput {
  taskId: string;
  feature: string;
  intentId?: string;
  request: string;
  specification: { summary: string; coverage: number };
  assumptions: string[];
  acceptanceCriteria: string[];
  plan?: string;
  changedFiles: string[];
  diffRef?: string;
  architectureDecisions?: string[];
  migrations?: Migration[];
  tests: {
    unit?: TestSummary;
    integration?: TestSummary;
    contract?: TestSummary;
    functional?: TestSummary;
    e2e?: TestSummary;
    permission?: TestSummary;
    mutationScore?: number;
  };
  security: SecurityFindings;
  performance?: PerformanceMeasurement[];
  metrics?: { testCoverage?: number; accessibility?: number; documentationDrift?: number };
  permissionMatrixVerified?: boolean;
  rollback?: { defined: boolean; tested: boolean };
  humanApprovals?: HumanApproval[];
  residualRisks?: ResidualRisk[];
  deploymentProcedure?: string;
  rollbackProcedure?: string;
  confidence: Array<{ dimension: ConfidenceDimension; score: number }>;
  evidenceItems: EvidenceItem[];
  budget?: QualityBudget;
  derogations?: Derogation[];
  released?: boolean;
}

export interface EvidencePack {
  schemaVersion: 1;
  taskId: string;
  feature: string;
  intentId?: string;
  generatedFrom: {
    request: string;
    specificationCoverage: number;
    assumptions: string[];
    acceptanceCriteria: string[];
    plan?: string;
  };
  changedFiles: string[];
  diffRef?: string;
  architectureDecisions: string[];
  migrations: Migration[];
  tests: EvidenceInput["tests"];
  security: SecurityFindings;
  performance: PerformanceMeasurement[];
  permissionMatrixVerified: boolean;
  rollback: { defined: boolean; tested: boolean };
  humanApprovals: HumanApproval[];
  residualRisks: ResidualRisk[];
  deploymentProcedure?: string;
  rollbackProcedure?: string;
  budget: BudgetEvaluation;
  confidence: ConfidenceReport;
  definitionOfDone: DefinitionOfDoneResult;
  releaseRecommendation: ReleaseRecommendation;
  verified: boolean;
  blockingReasons: string[];
  contentHash: string;
}
