import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  assembleSecurityEvidence,
  type SecurityFinding,
  webRiskCatalog,
  webRisksByLevel,
  findWebRisk,
  detectTools,
  toolCoverage,
  isProtectedSecurityPath,
  classifyUntrusted,
  requiresHumanApproval,
  scaffoldThreatModel,
} from "../src/index.js";

const finding = (over: Partial<SecurityFinding> = {}): SecurityFinding => ({
  id: "f1",
  title: "IDOR sur /orders/:id",
  severity: "high",
  evidence: "GET /orders/42 renvoie la commande d'un autre utilisateur (capture de réponse).",
  remediation: "Vérifier la propriété de la ressource côté serveur.",
  status: "open",
  ...over,
});

test("evidence: clean scope yields APPROVE with integrity hash", () => {
  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: "staging", production: false } });
  assert.equal(pack.recommendation, "APPROVE");
  assert.equal(pack.blockers.length, 0);
  assert.match(pack.contentHash, /^[0-9a-f]{64}$/);
});

test("evidence: a high finding BLOCKS the release", () => {
  const pack = assembleSecurityEvidence({ scope: { authorized: true, environment: "staging", production: false }, findings: [finding()] });
  assert.equal(pack.recommendation, "BLOCKED");
  assert.deepEqual(pack.blockers, ["IDOR sur /orders/:id"]);
  assert.equal(pack.counts.high, 1);
});

test("evidence: only medium/low findings warn but do not block", () => {
  const pack = assembleSecurityEvidence({
    scope: { authorized: true, environment: "staging", production: false },
    findings: [finding({ id: "f2", severity: "medium", title: "En-tête manquant" })],
  });
  assert.equal(pack.recommendation, "APPROVE_WITH_OBSERVATIONS");
});

test("evidence: a fixed finding is not counted or blocking", () => {
  const pack = assembleSecurityEvidence({
    scope: { authorized: true, environment: "staging", production: false },
    findings: [finding({ status: "fixed" })],
  });
  assert.equal(pack.recommendation, "APPROVE");
  assert.equal(pack.counts.high, 0);
});

test("evidence: a finding without evidence is rejected (§20)", () => {
  assert.throws(
    () => assembleSecurityEvidence({ scope: { authorized: true, environment: "staging", production: false }, findings: [finding({ evidence: "  " })] }),
    /aucune preuve/,
  );
});

test("evidence: a finding without remediation is rejected", () => {
  assert.throws(
    () => assembleSecurityEvidence({ scope: { authorized: true, environment: "staging", production: false }, findings: [finding({ remediation: "" })] }),
    /remédiation/,
  );
});

test("evidence: active testing in production is refused (§2)", () => {
  assert.throws(
    () => assembleSecurityEvidence({ scope: { authorized: true, environment: "prod", production: true, activeTesting: true } }),
    /Test actif refusé/,
  );
});

test("evidence: a failed check blocks even with no findings", () => {
  const pack = assembleSecurityEvidence({
    scope: { authorized: true, environment: "staging", production: false },
    checks: [{ name: "secret-scan", status: "failed" }],
  });
  assert.equal(pack.recommendation, "BLOCKED");
});

test("evidence hash is stable regardless of key order", () => {
  const scope = { authorized: true, environment: "staging", production: false };
  const a = assembleSecurityEvidence({ scope, findings: [finding()] });
  const b = assembleSecurityEvidence({ findings: [finding()], scope });
  assert.equal(a.contentHash, b.contentHash);
});

test("web-risk catalog is non-empty and every risk carries a non-regression test", () => {
  const catalog = webRiskCatalog();
  assert.ok(catalog.length >= 10);
  for (const risk of catalog) {
    assert.ok(risk.detection.length > 0, `${risk.id} needs detection signals`);
    assert.ok(risk.controls.length > 0, `${risk.id} needs controls`);
    assert.ok(risk.nonRegressionTest.trim().length > 0, `${risk.id} needs a non-regression test`);
  }
});

test("web-risk catalog exposes critical risks and lookup", () => {
  assert.ok(webRisksByLevel("critical").length > 0);
  assert.equal(findWebRisk("injection-sql")?.riskLevel, "critical");
  assert.equal(findWebRisk("does-not-exist"), undefined);
});

test("tool detection reports only present tools, never fabricates (§14)", () => {
  const detections = detectTools(["npm"]);
  assert.equal(detections.find((d) => d.name === "npm")?.present, true);
  assert.equal(detections.find((d) => d.name === "semgrep")?.present, false);
});

test("tool coverage lists uncovered categories honestly", () => {
  const coverage = toolCoverage(["npm"]);
  assert.deepEqual(coverage.present, ["npm"]);
  assert.ok(coverage.uncoveredCategories.includes("sast"));
  assert.ok(coverage.uncoveredCategories.includes("secrets"));
  assert.ok(!coverage.uncoveredCategories.includes("audit"));
});

test("self-defense: protected security paths are recognized", () => {
  assert.equal(isProtectedSecurityPath("policies/self-defense.json"), true);
  assert.equal(isProtectedSecurityPath("packages/security/src/evidence.ts"), true);
  assert.equal(isProtectedSecurityPath("scripts/scan-secrets.mjs"), true);
  assert.equal(isProtectedSecurityPath("src/app/home.ts"), false);
});

test("self-defense: observed content is data, never instructions (§13)", () => {
  const decision = classifyUntrusted("scan_output");
  assert.equal(decision.mayIssueInstructions, false);
  assert.equal(decision.treatAs, "data");
});

test("self-defense: guardrail reduction requires human approval (§35)", () => {
  assert.equal(requiresHumanApproval({ path: "README.md", reducesGuardrail: true }), true);
  assert.equal(requiresHumanApproval({ path: "policies/self-defense.json", reducesGuardrail: false }), true);
  assert.equal(requiresHumanApproval({ path: "src/app/home.ts", reducesGuardrail: false }), false);
});

test("threat-model scaffold covers all STRIDE categories", () => {
  const model = scaffoldThreatModel({ system: "API de paiement" });
  assert.equal(model.system, "API de paiement");
  assert.equal(model.threats.length, 6);
  assert.ok(model.residualRisksToConfirm.length > 0);
});

test("threat-model requires a system name", () => {
  assert.throws(() => scaffoldThreatModel({ system: "" }), /requis/);
});
