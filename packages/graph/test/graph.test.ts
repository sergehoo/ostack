import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleEvidencePack, type EvidenceInput } from "@ostack/evidence";
import { compileIntent, type IntentDraft } from "@ostack/intent";
import { KnowledgeGraph, ingestCompiledIntent, ingestEvidencePack } from "../src/index.js";

const NOW = "2026-07-11T12:00:00Z";

function draft(): IntentDraft {
  return {
    schemaVersion: 1,
    id: "ai-course-generator",
    request: "Permettre au formateur de générer une formation avec l'IA sans publication automatique.",
    functionalIntent: ["Génération IA en brouillon"],
    actors: ["formateur"],
    invariants: [
      { id: "no-auto-publish", statement: "Une génération IA ne publie jamais directement", kind: "prohibition", given: "un brouillon", when: "une génération est demandée", outcome: "un statut publié est appliqué", auditRequired: true },
      { id: "owner-only", statement: "Seul le propriétaire peut générer", kind: "permission", given: "une formation possédée", when: "le propriétaire génère", outcome: "la proposition est enregistrée en brouillon" }
    ]
  };
}

function verifiedPackInput(criteria: string[]): EvidenceInput {
  return {
    taskId: "OST-1", feature: "AI course generator",
    request: "génération IA sans publication automatique",
    specification: { summary: "spec", coverage: 95 },
    assumptions: [], acceptanceCriteria: criteria,
    changedFiles: ["backend/courses/ai.py"],
    tests: { unit: { passed: 10, failed: 0 }, integration: { passed: 4, failed: 0 }, functional: { passed: 3, failed: 0 }, e2e: { passed: 2, failed: 0 }, permission: { passed: 2, failed: 0 } },
    security: { critical: 0, high: 0, medium: 0, threatModelUpdated: true },
    metrics: { documentationDrift: 0 },
    permissionMatrixVerified: true,
    rollback: { defined: true, tested: true },
    humanApprovals: [{ approver: "arbiter", reason: "ok", approvedAt: NOW }],
    confidence: [
      { dimension: "requirements_understanding", score: 90 }, { dimension: "implementation_correctness", score: 90 },
      { dimension: "test_strength", score: 90 }, { dimension: "security_assurance", score: 90 },
      { dimension: "performance_assurance", score: 90 }, { dimension: "documentation_consistency", score: 90 },
      { dimension: "rollback_readiness", score: 90 }
    ],
    evidenceItems: [
      { id: "l", kind: "lint", dimension: "implementation_correctness", status: "passed", summary: "lint" },
      { id: "t", kind: "typecheck", dimension: "implementation_correctness", status: "passed", summary: "tsc" },
      { id: "b", kind: "build", dimension: "implementation_correctness", status: "passed", summary: "build" },
      { id: "u", kind: "unit_test", dimension: "test_strength", status: "passed", summary: "unit" },
      { id: "r", kind: "trace", dimension: "requirements_understanding", status: "observed", summary: "trace" },
      { id: "s", kind: "security_scan", dimension: "security_assurance", status: "passed", summary: "scan" },
      { id: "p", kind: "performance_measurement", dimension: "performance_assurance", status: "observed", summary: "perf" },
      { id: "d", kind: "trace", dimension: "documentation_consistency", status: "observed", summary: "docs" },
      { id: "rb", kind: "human_review", dimension: "rollback_readiness", status: "approved", summary: "rollback" }
    ]
  };
}

test("relations are validated against node kinds", () => {
  const graph = new KnowledgeGraph();
  graph.upsertNode({ id: "need:x", kind: "need", label: "besoin" });
  graph.upsertNode({ id: "feature:x", kind: "feature", label: "fonctionnalité" });
  graph.upsertNode({ id: "test:x", kind: "test", label: "test" });
  graph.link("feature:x", "implements", "need:x");
  assert.throws(() => graph.link("need:x", "implements", "feature:x"), /cannot start from/);
  assert.throws(() => graph.link("feature:x", "implements", "test:x"), /cannot point to/);
  assert.throws(() => graph.link("feature:x", "touches", "missing"), /Unknown target/);
});

test("intent ingestion creates need, feature, invariants and permissions; unverified reports them", () => {
  const graph = new KnowledgeGraph();
  ingestCompiledIntent(graph, compileIntent(draft()));
  assert.equal(graph.allNodes("need").length, 1);
  assert.equal(graph.allNodes("invariant").length, 2);
  assert.equal(graph.allNodes("permission").length, 1);
  const unverified = graph.unverified().map((node) => node.id).sort();
  assert.equal(unverified.length, 3, "all invariants and permissions start unverified");
});

test("a verified evidence pack proves invariants whose statements are acceptance criteria", () => {
  const graph = new KnowledgeGraph();
  const compiled = compileIntent(draft());
  ingestCompiledIntent(graph, compiled);
  const pack = assembleEvidencePack(verifiedPackInput(compiled.acceptanceCriteria), { now: NOW });
  assert.equal(pack.verified, true);
  ingestEvidencePack(graph, pack, compiled.id);
  assert.equal(graph.unverified().length, 0, "everything proven after verified pack");
  const coverage = graph.coverage("invariant:ai-course-generator:no-auto-publish");
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0]?.kind, "evidence");
});

test("traceability queries answer why-exists and impact", () => {
  const graph = new KnowledgeGraph();
  const compiled = compileIntent(draft());
  ingestCompiledIntent(graph, compiled);
  const pack = assembleEvidencePack(verifiedPackInput(compiled.acceptanceCriteria), { now: NOW });
  ingestEvidencePack(graph, pack, compiled.id);

  // Which business need justifies this file?
  const needs = graph.whyExists("file:backend/courses/ai.py");
  assert.equal(needs.length, 1);
  assert.match(needs[0]!.label, /générer une formation/);

  // What is impacted if this file changes?
  const impacted = graph.impact("file:backend/courses/ai.py");
  assert.ok(impacted.some((node) => node.kind === "feature"));
});

test("ingestion is idempotent and serialization round-trips", () => {
  const graph = new KnowledgeGraph();
  const compiled = compileIntent(draft());
  ingestCompiledIntent(graph, compiled);
  ingestCompiledIntent(graph, compiled);
  const first = JSON.stringify(graph.toJSON());
  const restored = KnowledgeGraph.fromJSON(graph.toJSON());
  assert.equal(JSON.stringify(restored.toJSON()), first);
});

test("an unverified pack does not mark invariants as proven", () => {
  const graph = new KnowledgeGraph();
  const compiled = compileIntent(draft());
  ingestCompiledIntent(graph, compiled);
  const failing = verifiedPackInput(compiled.acceptanceCriteria);
  failing.security = { critical: 1, high: 0, medium: 0, threatModelUpdated: true };
  const pack = assembleEvidencePack(failing, { now: NOW });
  assert.equal(pack.verified, false);
  ingestEvidencePack(graph, pack, compiled.id);
  assert.equal(graph.unverified().length, 3, "rejected evidence proves nothing");
});
