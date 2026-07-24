// OStack Security Evidence Pack (§20) — a defensive audit's result. Every
// finding MUST carry real evidence (§Evidence Verifier): a finding without
// evidence is rejected, never counted. The release recommendation is a
// deterministic function of the findings and checks — never persuasion.

import { createHash } from "node:crypto";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  title: string;
  severity: Severity;
  file?: string;
  component?: string;
  evidence: string;            // required: what was observed (a real artifact/line)
  impact?: string;
  reproduction?: string;       // defensive reproduction, never an exploit against a real target
  remediation: string;
  nonRegressionTest?: string;
  status: "open" | "fixed" | "accepted";
}

export interface SecurityCheck {
  name: string;
  status: "passed" | "failed" | "warning" | "not_run";
  detail?: string;
}

export interface SecurityScope {
  authorized: boolean;
  environment: string;
  production: boolean;
  activeTesting?: boolean;     // true only inside an authorized, isolated env
}

export type SecurityRecommendation = "APPROVE" | "APPROVE_WITH_OBSERVATIONS" | "BLOCKED";

export interface SecurityEvidencePack {
  schemaVersion: 1;
  scope: SecurityScope;
  checks: SecurityCheck[];
  findings: SecurityFinding[];
  counts: Record<Severity, number>;
  tests: { executed: number; passed: number; failed: number };
  blockers: string[];
  recommendation: SecurityRecommendation;
  contentHash: string;
}

export interface SecurityEvidenceInput {
  scope: SecurityScope;
  checks?: SecurityCheck[];
  findings?: SecurityFinding[];
  tests?: { executed: number; passed: number; failed: number };
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export function assembleSecurityEvidence(input: SecurityEvidenceInput): SecurityEvidencePack {
  // §36.3 / §2: active testing is only ever valid in an authorized environment.
  if (input.scope.activeTesting && (!input.scope.authorized || input.scope.production)) {
    throw new Error("Test actif refusé: exige un environnement autorisé et non-production (§2, §5).");
  }
  const findings = input.findings ?? [];
  for (const finding of findings) {
    if (!finding.evidence?.trim()) throw new Error(`Le constat '${finding.id}' n'a aucune preuve; un constat sans preuve est refusé (§20).`);
    if (!finding.remediation?.trim()) throw new Error(`Le constat '${finding.id}' n'a aucune remédiation; le rapport privilégie la remédiation (§2.15).`);
  }

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const finding of findings) if (finding.status !== "fixed") counts[finding.severity]++;

  const checks = input.checks ?? [];
  const failedCheck = checks.some((check) => check.status === "failed");
  const tests = input.tests ?? { executed: 0, passed: 0, failed: 0 };

  const blockers = findings
    .filter((finding) => (finding.severity === "critical" || finding.severity === "high") && finding.status === "open")
    .map((finding) => finding.title);

  let recommendation: SecurityRecommendation;
  if (blockers.length > 0 || failedCheck || tests.failed > 0) recommendation = "BLOCKED";
  else if (counts.medium > 0 || counts.low > 0) recommendation = "APPROVE_WITH_OBSERVATIONS";
  else recommendation = "APPROVE";

  const body = { schemaVersion: 1 as const, scope: input.scope, checks, findings, counts, tests, blockers, recommendation };
  return { ...body, contentHash: createHash("sha256").update(stableStringify(body)).digest("hex") };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
